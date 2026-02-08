import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { resolveEntitlements } from "@/lib/entitlements";
import { baseUrlFromRequest, renderTemplate, sendEmail, sendSms } from "@/lib/leadOutbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const bodySchema = z.object({
  leadId: z.string().trim().min(1).max(64),
});

type SettingsV3 = {
  version: 3;
  outbound: {
    enabled: boolean;
    email: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      subject: string;
      text: string;
    };
    sms: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      text: string;
    };
    resources: Array<{ label: string; url: string }>;
  };
  outboundState: {
    approvedAtByLeadId: Record<string, string>;
    sentAtByLeadId: Record<string, string>;
  };
};

function isMissingColumnError(e: unknown) {
  const anyErr = e as any;
  if (anyErr && typeof anyErr === "object" && typeof anyErr.code === "string") {
    if (anyErr.code === "P2022") return true;
  }
  const msg = e instanceof Error ? e.message : "";
  return msg.includes("does not exist") && msg.includes("column");
}

function normalizeUrl(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s.slice(0, 500);
  return "";
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSettings(value: unknown): SettingsV3 {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = rec.version === 1 ? 1 : rec.version === 2 ? 2 : 3;

  const defaultOutbound: SettingsV3["outbound"] = {
    enabled: false,
    email: {
      enabled: true,
      trigger: "MANUAL",
      subject: "Quick question — {businessName}",
      text: "Hi {businessName},\n\nQuick question — are you taking on new work right now?\n\n—",
    },
    sms: {
      enabled: false,
      trigger: "MANUAL",
      text: "Hi {businessName} — quick question. Are you taking on new work right now?",
    },
    resources: [],
  };

  const outboundRaw = rec.outbound && typeof rec.outbound === "object" ? (rec.outbound as Record<string, unknown>) : {};
  const resourcesRaw = Array.isArray((outboundRaw as any).resources) ? ((outboundRaw as any).resources as unknown[]) : [];
  const resources = resourcesRaw
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .map((r) => ({
      label: (typeof r.label === "string" ? r.label.trim() : "").slice(0, 120) || "Resource",
      url: normalizeUrl(r.url),
    }))
    .filter((r) => Boolean(r.url))
    .slice(0, 30);

  const parseTrigger = (t: unknown) => {
    const raw = typeof t === "string" ? t.trim() : "MANUAL";
    return raw === "ON_SCRAPE" || raw === "ON_APPROVE" ? raw : "MANUAL";
  };

  const isV2 =
    typeof (outboundRaw as any).sendEmail === "boolean" ||
    typeof (outboundRaw as any).sendSms === "boolean" ||
    typeof (outboundRaw as any).emailHtml === "string" ||
    typeof (outboundRaw as any).emailText === "string";

  const outbound: SettingsV3["outbound"] = (() => {
    if (isV2) {
      const enabled = version === 1 ? false : Boolean((outboundRaw as any).enabled);
      const trigger = parseTrigger((outboundRaw as any).trigger);
      const sendEmail = (outboundRaw as any).sendEmail === undefined ? true : Boolean((outboundRaw as any).sendEmail);
      const sendSms = Boolean((outboundRaw as any).sendSms);
      const emailHtml = typeof (outboundRaw as any).emailHtml === "string" ? ((outboundRaw as any).emailHtml as string) : "";
      const emailTextRaw = typeof (outboundRaw as any).emailText === "string" ? ((outboundRaw as any).emailText as string) : "";
      const emailText = (emailTextRaw || stripHtml(emailHtml)).slice(0, 20000);

      return {
        ...defaultOutbound,
        enabled,
        email: {
          enabled: enabled && sendEmail,
          trigger,
          subject: (typeof (outboundRaw as any).emailSubject === "string" ? ((outboundRaw as any).emailSubject as string) : "").slice(0, 120),
          text: emailText,
        },
        sms: {
          enabled: enabled && sendSms,
          trigger,
          text: (typeof (outboundRaw as any).smsText === "string" ? ((outboundRaw as any).smsText as string) : "").slice(0, 900),
        },
        resources,
      };
    }

    const emailRec = (outboundRaw as any).email && typeof (outboundRaw as any).email === "object" ? ((outboundRaw as any).email as Record<string, unknown>) : {};
    const smsRec = (outboundRaw as any).sms && typeof (outboundRaw as any).sms === "object" ? ((outboundRaw as any).sms as Record<string, unknown>) : {};

    return {
      ...defaultOutbound,
      enabled: Boolean((outboundRaw as any).enabled),
      email: {
        enabled: Boolean((emailRec as any).enabled),
        trigger: parseTrigger((emailRec as any).trigger),
        subject: (typeof (emailRec as any).subject === "string" ? ((emailRec as any).subject as string) : "").slice(0, 120),
        text: (typeof (emailRec as any).text === "string" ? ((emailRec as any).text as string) : "").slice(0, 20000),
      },
      sms: {
        enabled: Boolean((smsRec as any).enabled),
        trigger: parseTrigger((smsRec as any).trigger),
        text: (typeof (smsRec as any).text === "string" ? ((smsRec as any).text as string) : "").slice(0, 900),
      },
      resources,
    };
  })();

  const outboundStateRaw = rec.outboundState && typeof rec.outboundState === "object" ? (rec.outboundState as Record<string, unknown>) : {};
  const approvedRaw =
    outboundStateRaw.approvedAtByLeadId && typeof outboundStateRaw.approvedAtByLeadId === "object"
      ? (outboundStateRaw.approvedAtByLeadId as Record<string, unknown>)
      : {};
  const sentRaw =
    outboundStateRaw.sentAtByLeadId && typeof outboundStateRaw.sentAtByLeadId === "object"
      ? (outboundStateRaw.sentAtByLeadId as Record<string, unknown>)
      : {};

  const approvedAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(approvedRaw)) {
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    approvedAtByLeadId[k] = iso;
  }

  const sentAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(sentRaw)) {
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    sentAtByLeadId[k] = iso;
  }

  return {
    version: 3,
    outbound,
    outboundState: {
      approvedAtByLeadId: Object.fromEntries(Object.entries(approvedAtByLeadId).slice(0, 5000)),
      sentAtByLeadId: Object.fromEntries(Object.entries(sentAtByLeadId).slice(0, 5000)),
    },
  };
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const entitlements = await resolveEntitlements(auth.session.user.email);
  if (!entitlements.leadOutbound) {
    return NextResponse.json({ error: "Outbound is not enabled on your account." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const lead = await (async () => {
    try {
      return await prisma.portalLead.findFirst({
        where: { id: parsed.data.leadId, ownerId },
        select: {
          id: true,
          businessName: true,
          email: true,
          phone: true,
          website: true,
          address: true,
          niche: true,
        },
      });
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;
      const legacy = await prisma.portalLead.findFirst({
        where: { id: parsed.data.leadId, ownerId },
        select: {
          id: true,
          businessName: true,
          phone: true,
          website: true,
          address: true,
          niche: true,
        },
      });
      return legacy ? ({ ...legacy, email: null } as any) : null;
    }
  })();
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const settings = normalizeSettings(setup?.dataJson);
  if (!settings.outbound.enabled) {
    return NextResponse.json({ error: "Outbound is disabled in settings." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const base = baseUrlFromRequest(req);

  const resources = settings.outbound.resources
    .map((r) => ({
      label: r.label,
      url: r.url.startsWith("/") ? `${base}${r.url}` : r.url,
    }))
    .filter((r) => Boolean(r.url));

  const subject = renderTemplate(settings.outbound.email.subject, lead).slice(0, 120);

  const textBase = renderTemplate(settings.outbound.email.text, lead);
  const textResources = resources.length
    ? `\n\nResources:\n${resources.map((r) => `- ${r.label}: ${r.url}`).join("\n")}`
    : "";
  const text = (textBase + textResources).slice(0, 20000);

  const sent = { email: false, sms: false };
  const skipped: string[] = [];

  try {
    if (settings.outbound.email.enabled) {
      const to = (lead.email || "").trim();
      if (!to) {
        skipped.push("Email skipped: lead has no email.");
      } else {
        await sendEmail({
          to,
          cc: auth.session.user.email,
          subject: subject || `Follow-up: ${lead.businessName}`,
          text,
          fromName,
          ownerId,
        });
        sent.email = true;
      }
    }

    if (settings.outbound.sms.enabled) {
      if (!lead.phone) {
        skipped.push("Text skipped: lead has no phone.");
      } else {
        const smsBodyBase = renderTemplate(settings.outbound.sms.text, lead).slice(0, 900);
        if (!smsBodyBase.trim()) {
          skipped.push("Text skipped: SMS template is empty.");
        } else {
          let smsBody = smsBodyBase;

          if (resources.length) {
            const prefix = "\n\nResources:\n";
            const remaining = 900 - smsBody.length;
            if (remaining > prefix.length + 10) {
              let suffix = prefix;
              for (const r of resources) {
                const line = `- ${r.label}: ${r.url}`;
                if (suffix.length + line.length + 1 > remaining) break;
                suffix += line + "\n";
              }
              if (suffix !== prefix) {
                smsBody = (smsBody + suffix.trimEnd()).slice(0, 900);
              }
            }
          }

          await sendSms({ ownerId, to: lead.phone, body: smsBody });
          sent.sms = true;
        }
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send" },
      { status: 500 },
    );
  }

  const nextSettings: SettingsV3 = {
    ...settings,
    outboundState: {
      ...settings.outboundState,
      sentAtByLeadId: {
        ...settings.outboundState.sentAtByLeadId,
        [lead.id]: nowIso,
      },
    },
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: nextSettings as any },
    update: { dataJson: nextSettings as any, status: "IN_PROGRESS" },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, sent, skipped, sentAtIso: nowIso });
}
