import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { resolveEntitlements } from "@/lib/entitlements";
import { baseUrlFromRequest, renderTemplate, sendEmail, sendSms, stripHtml } from "@/lib/leadOutbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const bodySchema = z.object({
  leadId: z.string().trim().min(1).max(64),
});

type SettingsV2 = {
  version: 2;
  outbound: {
    enabled: boolean;
    trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
    sendEmail: boolean;
    sendSms: boolean;
    toEmailDefault: string;
    emailSubject: string;
    emailHtml: string;
    emailText: string;
    smsText: string;
    resources: Array<{ label: string; url: string }>;
  };
  outboundState: {
    approvedAtByLeadId: Record<string, string>;
    sentAtByLeadId: Record<string, string>;
  };
};

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

function normalizeSettings(value: unknown): SettingsV2 {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = rec.version === 1 ? 1 : 2;

  const defaultOutbound: SettingsV2["outbound"] = {
    enabled: false,
    trigger: "MANUAL",
    sendEmail: true,
    sendSms: false,
    toEmailDefault: "",
    emailSubject: "Quick question — {businessName}",
    emailHtml: "<p>Hi {businessName},</p><p>Quick question — are you taking on new work right now?</p><p>—</p>",
    emailText: "Hi {businessName},\n\nQuick question — are you taking on new work right now?\n\n—",
    smsText: "Hi {businessName} — quick question. Are you taking on new work right now?",
    resources: [],
  };

  const outboundRaw = rec.outbound && typeof rec.outbound === "object" ? (rec.outbound as Record<string, unknown>) : {};
  const resourcesRaw = Array.isArray(outboundRaw.resources) ? outboundRaw.resources : [];
  const resources = resourcesRaw
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .map((r) => ({
      label: (typeof r.label === "string" ? r.label.trim() : "").slice(0, 120) || "Resource",
      url: normalizeUrl(r.url),
    }))
    .filter((r) => Boolean(r.url))
    .slice(0, 30);

  const triggerRaw = typeof outboundRaw.trigger === "string" ? outboundRaw.trigger.trim() : "MANUAL";
  const trigger = triggerRaw === "ON_SCRAPE" || triggerRaw === "ON_APPROVE" ? triggerRaw : "MANUAL";

  const outbound: SettingsV2["outbound"] = {
    ...defaultOutbound,
    enabled: version === 1 ? false : Boolean(outboundRaw.enabled),
    trigger,
    sendEmail: outboundRaw.sendEmail === undefined ? true : Boolean(outboundRaw.sendEmail),
    sendSms: Boolean(outboundRaw.sendSms),
    toEmailDefault: (typeof outboundRaw.toEmailDefault === "string" ? outboundRaw.toEmailDefault.trim() : "").slice(0, 200),
    emailSubject: (typeof outboundRaw.emailSubject === "string" ? outboundRaw.emailSubject : "").slice(0, 120),
    emailHtml: (typeof outboundRaw.emailHtml === "string" ? outboundRaw.emailHtml : "").slice(0, 20000),
    emailText: (typeof outboundRaw.emailText === "string" ? outboundRaw.emailText : "").slice(0, 20000),
    smsText: (typeof outboundRaw.smsText === "string" ? outboundRaw.smsText : "").slice(0, 900),
    resources,
  };

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
    version: 2,
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

  const lead = await prisma.portalLead.findFirst({
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

  const subject = renderTemplate(settings.outbound.emailSubject, lead).slice(0, 120);

  const htmlBase = renderTemplate(settings.outbound.emailHtml, lead);
  const htmlResources = resources.length
    ? `<hr/><p><strong>Resources</strong></p><ul>${resources
        .map((r) => `<li><a href=\"${r.url}\">${r.label}</a></li>`)
        .join("")}</ul>`
    : "";
  const html = (htmlBase + htmlResources).slice(0, 20000);

  const textBase = renderTemplate(settings.outbound.emailText, lead) || stripHtml(htmlBase);
  const textResources = resources.length
    ? `\n\nResources:\n${resources.map((r) => `- ${r.label}: ${r.url}`).join("\n")}`
    : "";
  const text = (textBase + textResources).slice(0, 20000);

  const sent = { email: false, sms: false };
  const skipped: string[] = [];

  try {
    if (settings.outbound.sendEmail) {
      const to = settings.outbound.toEmailDefault.trim();
      if (!to) {
        skipped.push("Email skipped: no default To email configured.");
      } else {
        await sendEmail({
          to,
          subject: subject || `Follow-up: ${lead.businessName}`,
          text,
          html,
          fromName,
        });
        sent.email = true;
      }
    }

    if (settings.outbound.sendSms) {
      if (!lead.phone) {
        skipped.push("Text skipped: lead has no phone.");
      } else {
        const smsBody = renderTemplate(settings.outbound.smsText, lead).slice(0, 900);
        if (!smsBody.trim()) {
          skipped.push("Text skipped: SMS template is empty.");
        } else {
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

  const nextSettings: SettingsV2 = {
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
