import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { addCredits, consumeCredits } from "@/lib/credits";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";
import { resolveEntitlements } from "@/lib/entitlements";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { createPortalLeadCompat } from "@/lib/portalLeadCompat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const runSchema = z.object({
  kind: z.enum(["B2B", "B2C"]),
});

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length < 8) return digits;
  return digits;
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

type Settings = {
  version: 3;
  b2b: {
    niche: string;
    location: string;
    count: number;
    requireEmail: boolean;
    requirePhone: boolean;
    requireWebsite: boolean;
    excludeNameContains: string[];
    excludeDomains: string[];
    excludePhones: string[];
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  b2c: {
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
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

function normalizeStringList(xs: unknown, { lower }: { lower?: boolean } = {}) {
  const arr = Array.isArray(xs) ? xs : [];
  return arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((x) => (lower ? x.toLowerCase() : x))
    .slice(0, 200);
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeUrl(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s.slice(0, 500);
  return "";
}

function normalizeOutbound(value: unknown): Settings["outbound"] {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const isV2 =
    typeof (rec as any).sendEmail === "boolean" ||
    typeof (rec as any).sendSms === "boolean" ||
    typeof (rec as any).emailHtml === "string" ||
    typeof (rec as any).emailText === "string";

  const resourcesRaw = Array.isArray(rec.resources) ? rec.resources : [];
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

  if (isV2) {
    const enabled = Boolean((rec as any).enabled);
    const trigger = parseTrigger((rec as any).trigger);
    const sendEmail = (rec as any).sendEmail === undefined ? true : Boolean((rec as any).sendEmail);
    const sendSms = Boolean((rec as any).sendSms);

    const html = typeof (rec as any).emailHtml === "string" ? ((rec as any).emailHtml as string) : "";
    const textRaw = typeof (rec as any).emailText === "string" ? ((rec as any).emailText as string) : "";
    const text = (textRaw || stripHtml(html)).slice(0, 20000);

    return {
      enabled,
      email: {
        enabled: enabled && sendEmail,
        trigger,
        subject: (typeof (rec as any).emailSubject === "string" ? ((rec as any).emailSubject as string) : "").slice(0, 120),
        text,
      },
      sms: {
        enabled: enabled && sendSms,
        trigger,
        text: (typeof (rec as any).smsText === "string" ? ((rec as any).smsText as string) : "").slice(0, 900),
      },
      resources,
    };
  }

  const emailRec = (rec as any).email && typeof (rec as any).email === "object" ? ((rec as any).email as Record<string, unknown>) : {};
  const smsRec = (rec as any).sms && typeof (rec as any).sms === "object" ? ((rec as any).sms as Record<string, unknown>) : {};

  return {
    enabled: Boolean((rec as any).enabled),
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
}

function normalizeOutboundState(value: unknown): Settings["outboundState"] {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const approved =
    rec.approvedAtByLeadId && typeof rec.approvedAtByLeadId === "object"
      ? (rec.approvedAtByLeadId as Record<string, unknown>)
      : {};
  const sent =
    rec.sentAtByLeadId && typeof rec.sentAtByLeadId === "object"
      ? (rec.sentAtByLeadId as Record<string, unknown>)
      : {};

  const approvedAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(approved)) {
    if (k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    approvedAtByLeadId[k] = iso;
  }

  const sentAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(sent)) {
    if (k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    sentAtByLeadId[k] = iso;
  }

  return {
    approvedAtByLeadId: Object.fromEntries(Object.entries(approvedAtByLeadId).slice(0, 5000)),
    sentAtByLeadId: Object.fromEntries(Object.entries(sentAtByLeadId).slice(0, 5000)),
  };
}

function renderTemplate(raw: string, lead: { businessName: string; phone: string | null; website: string | null; address: string | null; niche: string | null }) {
  const map: Record<string, string> = {
    businessName: lead.businessName,
    phone: lead.phone ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    niche: lead.niche ?? "",
  };
  return raw.replace(/\{(businessName|phone|website|address|niche)\}/g, (_, k: string) => map[k] ?? "");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseUrlFromEnv(): string {
  const env = process.env.NEXTAUTH_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");
  return "http://localhost:3000";
}

async function sendEmail({
  to,
  cc,
  subject,
  text,
  fromName,
}: {
  to: string;
  cc?: string | null;
  subject: string;
  text: string;
  fromName?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw new Error("Email is not configured yet.");

  const safeText = (text || "").trim() || " ";
  const ccEmail = (cc || "").trim();
  const personalizations: any = {
    to: [{ email: to }],
    ...(ccEmail ? { cc: [{ email: ccEmail }] } : {}),
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [personalizations],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: safeText }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SendGrid failed (${res.status}): ${t.slice(0, 400)}`);
  }
}

async function sendSms({ ownerId, to, body }: { ownerId: string; to: string; body: string }) {
  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) throw new Error("Texting is not configured yet.");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", twilio.fromNumberE164);
  form.set("Body", body.slice(0, 900));

  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Twilio failed (${res.status}): ${t.slice(0, 400)}`);
  }
}

function normalizeSettings(value: unknown): Settings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const legacyVersion = rec.version === 1 ? 1 : rec.version === 3 ? 3 : 2;
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

  const defaultOutbound: Settings["outbound"] = {
    enabled: false,
    email: {
      enabled: false,
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

  const outbound = normalizeOutbound(rec.outbound);
  const outboundState = normalizeOutboundState(rec.outboundState);

  const mergedOutbound: Settings["outbound"] = {
    ...defaultOutbound,
    ...outbound,
    email: {
      ...defaultOutbound.email,
      ...outbound.email,
    },
    sms: {
      ...defaultOutbound.sms,
      ...outbound.sms,
    },
    resources: outbound.resources ?? defaultOutbound.resources,
  };

  if (legacyVersion === 1) {
    mergedOutbound.enabled = false;
  }

  return {
    version: 3,
    b2b: {
      niche: typeof b2b.niche === "string" ? b2b.niche.slice(0, 200) : "",
      location: typeof b2b.location === "string" ? b2b.location.slice(0, 200) : "",
      count:
        typeof b2b.count === "number" && Number.isFinite(b2b.count)
          ? Math.min(500, Math.max(1, Math.floor(b2b.count)))
          : 25,
      requireEmail: Boolean((b2b as any).requireEmail),
      requirePhone: Boolean(b2b.requirePhone),
      requireWebsite: Boolean(b2b.requireWebsite),
      excludeNameContains: normalizeStringList(b2b.excludeNameContains),
      excludeDomains: normalizeStringList(b2b.excludeDomains, { lower: true }),
      excludePhones: normalizeStringList(b2b.excludePhones),
      scheduleEnabled: Boolean(b2b.scheduleEnabled),
      frequencyDays:
        typeof b2b.frequencyDays === "number" && Number.isFinite(b2b.frequencyDays)
          ? Math.min(60, Math.max(1, Math.floor(b2b.frequencyDays)))
          : 7,
      lastRunAtIso: normalizeIsoString(b2b.lastRunAtIso),
    },
    b2c: {
      notes: typeof b2c.notes === "string" ? b2c.notes.slice(0, 5000) : "",
      scheduleEnabled: Boolean(b2c.scheduleEnabled),
      frequencyDays:
        typeof b2c.frequencyDays === "number" && Number.isFinite(b2c.frequencyDays)
          ? Math.min(60, Math.max(1, Math.floor(b2c.frequencyDays)))
          : 7,
      lastRunAtIso: normalizeIsoString(b2c.lastRunAtIso),
    },
    outbound: mergedOutbound,
    outboundState,
  };
}

function matchesNameExclusion(businessName: string, excludeNameContains: string[]) {
  const name = businessName.toLowerCase();
  return excludeNameContains.some((term) => {
    const t = term.toLowerCase().trim();
    return t ? name.includes(t) : false;
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const entitlements = await resolveEntitlements(auth.session.user.email);
  const outboundUnlocked = Boolean(entitlements.leadOutbound);
  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.kind === "B2C") {
    return NextResponse.json(
      {
        ok: false,
        error: "B2C is not configured yet.",
        code: "B2C_NOT_CONFIGURED",
      },
      { status: 409 },
    );
  }

  if (!hasPlacesKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Google Places is not configured.",
        code: "PLACES_NOT_CONFIGURED",
      },
      { status: 409 },
    );
  }

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const settings = normalizeSettings(setup?.dataJson);

  const niche = settings.b2b.niche.trim();
  const location = settings.b2b.location.trim();
  const requestedCount = settings.b2b.count;

  if (!niche || !location) {
    return NextResponse.json(
      {
        ok: false,
        error: "Niche and location are required.",
        code: "MISSING_REQUIRED",
      },
      { status: 400 },
    );
  }

  // Billing: reserve up to requestedCount, then refund unused.
  const reservedCredits = requestedCount;
  const consumed = await consumeCredits(ownerId, reservedCredits);

  if (!consumed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits.",
        code: "INSUFFICIENT_CREDITS",
      },
      { status: 402 },
    );
  }

  const run = await prisma.portalLeadScrapeRun.create({
    data: {
      ownerId,
      kind: "B2B",
      requestedCount,
      chargedCredits: reservedCredits,
      settingsJson: settings,
    },
    select: { id: true },
  });

  let createdCount = 0;
  let error: string | null = null;
  const maxPerPlacesBatch = 60;
  const plannedBatches = Math.max(1, Math.ceil(requestedCount / maxPerPlacesBatch));
  let batchesRan = 0;
  const createdLeads: Array<{
    id: string;
    businessName: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    niche: string | null;
  }> = [];

  try {
    const query = `${niche} in ${location}`;
    const excludedPhones = new Set(
      settings.b2b.excludePhones
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p)),
    );

    for (let batchIndex = 0; batchIndex < plannedBatches; batchIndex++) {
      if (createdCount >= requestedCount) break;
      batchesRan++;

      const remaining = requestedCount - createdCount;
      const targetThisBatch = Math.min(maxPerPlacesBatch, Math.max(1, remaining));
      const results = await placesTextSearch(query, Math.max(1, targetThisBatch * 4));

      for (const place of results) {
        if (createdCount >= requestedCount) break;

        const businessName = place.name?.trim() || "";
        if (!businessName) continue;

        if (matchesNameExclusion(businessName, settings.b2b.excludeNameContains)) continue;

        const placeId = place.place_id;
        const details = await placeDetails(placeId);

        const phoneCandidate = details.international_phone_number || details.formatted_phone_number || null;
        const phoneNorm = normalizePhone(phoneCandidate);
        if (phoneNorm && excludedPhones.has(phoneNorm)) continue;

        const website = details.website || null;
        const domain = website ? extractDomain(website) : null;
        if (domain && settings.b2b.excludeDomains.includes(domain)) continue;

        if (settings.b2b.requirePhone && !phoneNorm) continue;
        if (settings.b2b.requireWebsite && !website) continue;

        const created = await createPortalLeadCompat({
          ownerId,
          kind: "B2B",
          source: "GOOGLE_PLACES",
          businessName,
          phone: phoneNorm,
          website,
          address: details.formatted_address || place.formatted_address || null,
          niche,
          placeId,
          dataJson: {
            googlePlaces: {
              placeId,
              details,
            },
          },
        });

        if (created) {
          createdLeads.push({
            ...created,
            email: null,
          });
          createdCount++;
        }
      }

      // Best-effort progress update so the UI can poll run history if needed.
      await prisma.portalLeadScrapeRun.update({
        where: { id: run.id },
        data: { createdCount },
        select: { id: true },
      });
    }
  } catch (e: any) {
    error = typeof e?.message === "string" ? e.message : "Unknown error";
  }

  const refundedCredits = Math.max(0, reservedCredits - createdCount);
  if (refundedCredits > 0) {
    await addCredits(ownerId, refundedCredits);
  }

  const nowIso = new Date().toISOString();
  const updatedSettings: Settings = {
    ...settings,
    b2b: {
      ...settings.b2b,
      lastRunAtIso: nowIso,
    },
  };

  // Optional outbound: auto-send immediately after new leads are created.
  const shouldSendEmail =
    outboundUnlocked &&
    updatedSettings.outbound.enabled &&
    updatedSettings.outbound.email.enabled &&
    updatedSettings.outbound.email.trigger === "ON_SCRAPE";
  const shouldSendSms =
    outboundUnlocked &&
    updatedSettings.outbound.enabled &&
    updatedSettings.outbound.sms.enabled &&
    updatedSettings.outbound.sms.trigger === "ON_SCRAPE";

  if ((shouldSendEmail || shouldSendSms) && createdLeads.length) {
    const base = baseUrlFromEnv();
    const nextSent = { ...updatedSettings.outboundState.sentAtByLeadId };

    for (const lead of createdLeads) {
      try {
        const resources = updatedSettings.outbound.resources
          .map((r) => ({
            label: r.label,
            url: r.url.startsWith("/") ? `${base}${r.url}` : r.url,
          }))
          .filter((r) => Boolean(r.url));

        if (shouldSendEmail && lead.email) {
          const subject = renderTemplate(updatedSettings.outbound.email.subject, lead).slice(0, 120);
          const textBase = renderTemplate(updatedSettings.outbound.email.text, lead);
          const textResources = resources.length
            ? `\n\nResources:\n${resources.map((r) => `- ${r.label}: ${r.url}`).join("\n")}`
            : "";
          const text = (textBase + textResources).slice(0, 20000);

          await sendEmail({
            to: lead.email,
            cc: auth.session.user.email,
            subject: subject || `Follow-up: ${lead.businessName}`,
            text,
            fromName,
          });
        }

        if (shouldSendSms && lead.phone) {
          const smsBody = renderTemplate(updatedSettings.outbound.sms.text, lead).slice(0, 900);
          if (smsBody.trim()) {
            await sendSms({ ownerId, to: lead.phone, body: smsBody });
          }
        }

        nextSent[lead.id] = nowIso;
      } catch {
        // Non-fatal: scraping should still succeed even if outbound fails.
      }
    }

    updatedSettings.outboundState = {
      ...updatedSettings.outboundState,
      sentAtByLeadId: nextSent,
    };
  }

  await prisma.$transaction([
    prisma.portalLeadScrapeRun.update({
      where: { id: run.id },
      data: {
        createdCount,
        refundedCredits,
        error,
      },
      select: { id: true },
    }),
    prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: updatedSettings },
      update: { dataJson: updatedSettings, status: "IN_PROGRESS" },
      select: { id: true },
    }),
  ]);

  // Refunds are not implemented (we didn't build a credit refund primitive).
  // We still surface charged vs created in run history so billing can be audited.

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error,
        code: "RUN_FAILED",
        chargedCredits: reservedCredits,
        refundedCredits,
        createdCount,
        plannedBatches,
        batchesRan,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    chargedCredits: reservedCredits,
    refundedCredits,
    createdCount,
    plannedBatches,
    batchesRan,
  });
}
