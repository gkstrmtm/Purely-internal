import crypto from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/leadOutbound";

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
    },
  });

  if (!form) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as any;
  const payload = safeJson(body?.data ?? body ?? {}, 50_000);

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

  // Notifications are best-effort; never block submission success.
  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: form.ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const settingsObj =
    settings?.dataJson && typeof settings.dataJson === "object" && !Array.isArray(settings.dataJson)
      ? (settings.dataJson as any)
      : null;
  const notifyEmails: string[] = Array.isArray(settingsObj?.notifyEmails) ? settingsObj.notifyEmails : [];
  const webhookUrl: string | null = typeof settingsObj?.webhookUrl === "string" ? settingsObj.webhookUrl : null;
  const webhookSecret: string | null = typeof settingsObj?.webhookSecret === "string" ? settingsObj.webhookSecret : null;

  if (Array.isArray(notifyEmails) && notifyEmails.length) {
    for (const to of notifyEmails.slice(0, 10)) {
      if (typeof to !== "string" || !to) continue;
      sendEmail({
        to,
        subject: `New credit form submission: ${form.name || form.slug}`,
        text: `Form: ${form.name || form.slug}\nSubmission ID: ${submission.id}\nCreated: ${submission.createdAt.toISOString()}\n\nData:\n${JSON.stringify(payload, null, 2)}`,
      }).catch(() => null);
    }
  }

  if (webhookUrl && typeof webhookUrl === "string" && webhookSecret && typeof webhookSecret === "string") {
    bestEffortPostWebhook(
      webhookUrl,
      {
        event: "credit.form.submitted",
        form: { id: form.id, slug: form.slug, name: form.name },
        submission: { id: submission.id, createdAt: submission.createdAt.toISOString() },
        payload,
      },
      webhookSecret,
    );
  }

  return NextResponse.json({ ok: true, submission });
}
