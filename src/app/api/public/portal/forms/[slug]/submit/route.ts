import crypto from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  buildCreditFormSubmissionNotificationHtml,
  buildCreditFormSubmissionNotificationText,
  normalizeCreditFormSubmissionPayload,
  validateCreditFormSubmissionPayload,
  shortSubmissionId,
} from "@/lib/creditFormSchema";
import { tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { findOrCreatePortalContact } from "@/lib/portalContacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeJson(obj: unknown, maxBytes: number): any {
  const str = JSON.stringify(obj ?? {});
  if (Buffer.byteLength(str, "utf8") <= maxBytes) return obj;
  return { _truncated: true };
}

function getClientIp(req: Request): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || null;
  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

async function readRequestBodyBestEffort(req: Request): Promise<any> {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return (await req.json().catch(() => null)) as any;
  }

  // Support standard HTML form posts.
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return null;
    const data: Record<string, string | string[]> = {};
    for (const key of Array.from(new Set(Array.from(fd.keys())))) {
      const values = fd.getAll(key);
      const asStrings = values
        .map((v) => {
          if (typeof v === "string") return v;
          // File uploads should be handled via Vercel Blob and submitted as JSON refs.
          return v?.name ? v.name : "";
        })
        .filter((v) => typeof v === "string");

      if (asStrings.length > 1) data[key] = asStrings;
      else data[key] = asStrings[0] ?? "";
    }
    return { data };
  }

  // Last-ditch: try to parse as JSON string.
  const text = await req.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function bestEffortPostWebhook(url: string, payload: unknown, secret: string) {
  try {
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pa-signature": sig,
      },
      body,
      cache: "no-store",
    });
  } catch {
    // swallow
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: slugRaw } = await ctx.params;
  const slug = slugRaw.trim().toLowerCase();
  if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });

  const form = await prisma.creditForm.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      createdAt: true,
      schemaJson: true,
    },
  });

  if (!form) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = await readRequestBodyBestEffort(req);
  const normalizedPayload = normalizeCreditFormSubmissionPayload(body?.data ?? body ?? {}, form.schemaJson);
  const validationError = validateCreditFormSubmissionPayload(normalizedPayload, form.schemaJson);
  if (validationError) return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  const payload = safeJson(normalizedPayload, 5_000_000);

  const firstString = (v: any): string | null => {
    if (typeof v === "string") {
      const s = v.trim();
      return s ? s.slice(0, 500) : null;
    }
    if (Array.isArray(v) && typeof v[0] === "string") {
      const s = String(v[0]).trim();
      return s ? s.slice(0, 500) : null;
    }
    return null;
  };

  const userAgent = req.headers.get("user-agent") || null;
  const ip = getClientIp(req);

  const submission = await prisma.creditFormSubmission.create({
    data: {
      formId: form.id,
      dataJson: payload as any,
      ip,
      userAgent,
    },
    select: { id: true, createdAt: true },
  });

  // Best-effort automation trigger.
  const payloadObj = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const contactEmail = firstString((payloadObj as any).email);
  const contactPhone = firstString((payloadObj as any).phone);
  const contactName = firstString((payloadObj as any).fullName) || firstString((payloadObj as any).name);

  const signatureDataUrl = (() => {
    const raw = (payloadObj as any)?.signature;
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;
    if (!s.toLowerCase().startsWith("data:image/")) return null;
    return s.slice(0, 250_000);
  })();
  const contactCustomVariables = signatureDataUrl ? ({ signature: signatureDataUrl } as Record<string, string>) : null;

  let contactId: string | null = null;
  try {
    const canCreateContact = Boolean(contactName || contactEmail || contactPhone);
    if (canCreateContact) {
      const candidateName = (contactName || contactEmail || contactPhone || "").slice(0, 80);
      if (candidateName) {
        contactId = await findOrCreatePortalContact({
          ownerId: form.ownerId,
          name: candidateName,
          email: contactEmail,
          phone: contactPhone,
          customVariables: contactCustomVariables,
        });

        // If phone normalization failed (or phone was invalid), still try to create a contact from name/email.
        if (!contactId && (contactEmail || contactName)) {
          contactId = await findOrCreatePortalContact({
            ownerId: form.ownerId,
            name: (contactName || contactEmail || "").slice(0, 80),
            email: contactEmail,
            phone: null,
            customVariables: contactCustomVariables,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  runOwnerAutomationsForEvent({
    ownerId: form.ownerId,
    triggerKind: "form_submitted",
    contact: { id: contactId, name: contactName, email: contactEmail, phone: contactPhone },
    event: {
      formId: form.id,
      formSlug: form.slug,
      formName: form.name,
      submissionId: submission.id,
      formData: payloadObj,
    },
  }).catch(() => null);

  // Notifications are best-effort; never block submission success.
  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: form.ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const settingsObj =
    settings?.dataJson && typeof settings.dataJson === "object" && !Array.isArray(settings.dataJson)
      ? (settings.dataJson as any)
      : null;
  const webhookUrl: string | null = typeof settingsObj?.webhookUrl === "string" ? settingsObj.webhookUrl : null;
  const webhookSecret: string | null = typeof settingsObj?.webhookSecret === "string" ? settingsObj.webhookSecret : null;

  tryNotifyPortalAccountUsers({
    ownerId: form.ownerId,
    kind: "form_submitted",
    subject: `New form submission: ${form.name || form.slug} (#${shortSubmissionId(submission.id)})`,
    text: buildCreditFormSubmissionNotificationText({
      formName: form.name || form.slug,
      submissionId: submission.id,
      createdAtIso: submission.createdAt.toISOString(),
      schemaJson: form.schemaJson,
      dataJson: payload,
    }),
    html: buildCreditFormSubmissionNotificationHtml({
      formName: form.name || form.slug,
      submissionId: submission.id,
      createdAtIso: submission.createdAt.toISOString(),
      schemaJson: form.schemaJson,
      dataJson: payload,
    }),
    smsMirror: true,
  }).catch(() => null);

  if (webhookUrl && typeof webhookUrl === "string" && webhookSecret && typeof webhookSecret === "string") {
    bestEffortPostWebhook(
      webhookUrl,
      {
        event: "form.submitted",
        form: { id: form.id, slug: form.slug, name: form.name },
        submission: { id: submission.id, createdAt: submission.createdAt.toISOString() },
        payload,
      },
      webhookSecret,
    );
  }

  return NextResponse.json({ ok: true, submission });
}
