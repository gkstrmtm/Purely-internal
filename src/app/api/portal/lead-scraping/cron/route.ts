import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { addCredits, consumeCredits } from "@/lib/credits";
import { resolveEntitlements } from "@/lib/entitlements";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";
import { baseUrlFromRequest, renderTemplate, sendEmail, sendSms, stripHtml } from "@/lib/leadOutbound";
import { createPortalLeadCompat } from "@/lib/portalLeadCompat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

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
    rec.sentAtByLeadId && typeof rec.sentAtByLeadId === "object" ? (rec.sentAtByLeadId as Record<string, unknown>) : {};

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
    email: { ...defaultOutbound.email, ...outbound.email },
    sms: { ...defaultOutbound.sms, ...outbound.sms },
    resources: outbound.resources ?? defaultOutbound.resources,
  };

  if (legacyVersion === 1) {
    mergedOutbound.enabled = false;
  }

  const toInt = (n: unknown, def: number, max: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return def;
    return Math.min(max, Math.max(1, Math.floor(n)));
  };
  const toStr = (s: unknown, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");

  return {
    version: 3,
    b2b: {
      niche: toStr(b2b.niche),
      location: toStr(b2b.location),
      count: toInt(b2b.count, 25, 500),
      requireEmail: Boolean((b2b as any).requireEmail),
      requirePhone: Boolean(b2b.requirePhone),
      requireWebsite: Boolean(b2b.requireWebsite),
      excludeNameContains: normalizeStringList(b2b.excludeNameContains),
      excludeDomains: normalizeStringList(b2b.excludeDomains, { lower: true }),
      excludePhones: normalizeStringList(b2b.excludePhones),
      scheduleEnabled: Boolean(b2b.scheduleEnabled),
      frequencyDays: toInt(b2b.frequencyDays, 7, 60),
      lastRunAtIso: normalizeIsoString(b2b.lastRunAtIso),
    },
    b2c: {
      scheduleEnabled: Boolean(b2c.scheduleEnabled),
      frequencyDays: toInt(b2c.frequencyDays, 7, 60),
      lastRunAtIso: normalizeIsoString(b2c.lastRunAtIso),
    },
    outbound: mergedOutbound,
    outboundState,
  };
}

function shouldRun(lastRunAtIso: string | null, frequencyDays: number, now: Date) {
  if (!lastRunAtIso) return true;
  const last = new Date(lastRunAtIso);
  if (Number.isNaN(last.getTime())) return true;
  const ms = frequencyDays * 24 * 60 * 60 * 1000;
  return now.getTime() - last.getTime() >= ms;
}

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

function matchesNameExclusion(businessName: string, excludeNameContains: string[]) {
  const name = businessName.toLowerCase();
  return excludeNameContains.some((term) => {
    const t = term.toLowerCase().trim();
    return t ? name.includes(t) : false;
  });
}

async function runB2BForOwner(ownerId: string, settingsJson: unknown, baseUrl: string) {
  const settings = normalizeSettings(settingsJson);
  const niche = settings.b2b.niche.trim();
  const location = settings.b2b.location.trim();
  const requestedCount = settings.b2b.count;

  const [owner, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }),
  ]);
  const entitlements = await resolveEntitlements(owner?.email);
  const outboundUnlocked = Boolean(entitlements.leadOutbound);
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  if (!niche || !location) {
    return { ownerId, ok: false as const, code: "MISSING_REQUIRED" as const, createdCount: 0 };
  }
  if (!hasPlacesKey()) {
    return { ownerId, ok: false as const, code: "PLACES_NOT_CONFIGURED" as const, createdCount: 0 };
  }

  const reservedCredits = requestedCount;
  const consumed = await consumeCredits(ownerId, reservedCredits);
  if (!consumed.ok) {
    return { ownerId, ok: false as const, code: "INSUFFICIENT_CREDITS" as const, createdCount: 0 };
  }

  const run = await prisma.portalLeadScrapeRun.create({
    data: {
      ownerId,
      kind: "B2B",
      requestedCount,
      chargedCredits: reservedCredits,
      settingsJson: settings as any,
    },
    select: { id: true },
  });

  let createdCount = 0;
  let error: string | null = null;
  const maxPerPlacesBatch = 60;
  const baseBatches = Math.max(1, Math.ceil(requestedCount / maxPerPlacesBatch));
  const plannedBatches = Math.min(10, baseBatches + (requestedCount >= 50 ? 1 : 0));
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
    const excludedPhones = new Set(
      settings.b2b.excludePhones
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p)),
    );
    const queryVariants = Array.from(
      new Set(
        [
          `${niche} in ${location}`,
          `${niche} near ${location}`,
          `${niche} services in ${location}`,
          `${niche} company in ${location}`,
        ]
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );

    const seenPlaceIds = new Set<string>();

    for (let batchIndex = 0; batchIndex < plannedBatches; batchIndex++) {
      if (createdCount >= requestedCount) break;

      const remaining = requestedCount - createdCount;
      const targetThisBatch = Math.min(maxPerPlacesBatch, Math.max(1, remaining));
      const query = queryVariants[batchIndex % queryVariants.length] || `${niche} in ${location}`;
      const results = await placesTextSearch(query, Math.max(1, targetThisBatch * 4));

      for (const place of results) {
        if (createdCount >= requestedCount) break;

        const businessName = place.name?.trim() || "";
        if (!businessName) continue;
        if (matchesNameExclusion(businessName, settings.b2b.excludeNameContains)) continue;

        const placeId = place.place_id;
        if (seenPlaceIds.has(placeId)) continue;
        seenPlaceIds.add(placeId);
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
    }
  } catch (e: any) {
    error = typeof e?.message === "string" ? e.message : "Unknown error";
  }

  const refundedCredits = Math.max(0, reservedCredits - createdCount);
  if (refundedCredits > 0) {
    await addCredits(ownerId, refundedCredits);
  }

  const nowIso = new Date().toISOString();

  const nextSentAtByLeadId: Record<string, string> = { ...settings.outboundState.sentAtByLeadId };

  const shouldSendEmail =
    outboundUnlocked &&
    settings.outbound.enabled &&
    settings.outbound.email.enabled &&
    settings.outbound.email.trigger === "ON_SCRAPE";
  const shouldSendSms =
    outboundUnlocked &&
    settings.outbound.enabled &&
    settings.outbound.sms.enabled &&
    settings.outbound.sms.trigger === "ON_SCRAPE";

  if ((shouldSendEmail || shouldSendSms) && createdLeads.length) {
    for (const lead of createdLeads) {
      try {
        const resources = settings.outbound.resources
          .map((r) => ({
            label: r.label,
            url: r.url.startsWith("/") ? `${baseUrl}${r.url}` : r.url,
          }))
          .filter((r) => Boolean(r.url));

        if (shouldSendEmail && lead.email) {
          const subject = renderTemplate(settings.outbound.email.subject, lead).slice(0, 120);
          const textBase = renderTemplate(settings.outbound.email.text, lead);
          const textResources = resources.length
            ? `\n\nResources:\n${resources.map((r) => `- ${r.label}: ${r.url}`).join("\n")}`
            : "";
          const text = (textBase + textResources).slice(0, 20000);

          await sendEmail({
            to: lead.email,
            cc: owner?.email,
            subject: subject || `Follow-up: ${lead.businessName}`,
            text,
            fromName,
          });
        }

        if (shouldSendSms && lead.phone) {
          const smsBody = renderTemplate(settings.outbound.sms.text, lead).slice(0, 900);
          if (smsBody.trim()) {
            await sendSms({ ownerId, to: lead.phone, body: smsBody });
          }
        }

        nextSentAtByLeadId[lead.id] = nowIso;
      } catch {
        // Non-fatal for cron.
      }
    }
  }

  const updatedSettings: Settings = {
    ...settings,
    b2b: {
      ...settings.b2b,
      lastRunAtIso: nowIso,
    },
    outboundState: {
      ...settings.outboundState,
      sentAtByLeadId: nextSentAtByLeadId,
    },
  };

  await prisma.$transaction([
    prisma.portalLeadScrapeRun.update({
      where: { id: run.id },
      data: { createdCount, refundedCredits, error },
      select: { id: true },
    }),
    prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: updatedSettings as any },
      update: { dataJson: updatedSettings as any, status: "IN_PROGRESS" },
      select: { id: true },
    }),
  ]);

  if (error) {
    return {
      ownerId,
      ok: false as const,
      code: "RUN_FAILED" as const,
      error,
      createdCount,
      chargedCredits: reservedCredits,
      refundedCredits,
    };
  }

  return {
    ownerId,
    ok: true as const,
    createdCount,
    chargedCredits: reservedCredits,
    refundedCredits,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const expected = process.env.CRON_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const setups = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
    take: 500,
  });

  const now = new Date();
  const baseUrl = baseUrlFromRequest(req);

  const due = setups
    .map((s) => {
      const settings = normalizeSettings(s.dataJson);
      const b2bDue =
        settings.b2b.scheduleEnabled &&
        Boolean(settings.b2b.niche.trim()) &&
        Boolean(settings.b2b.location.trim()) &&
        shouldRun(settings.b2b.lastRunAtIso, settings.b2b.frequencyDays, now);
      const b2cDue = settings.b2c.scheduleEnabled && shouldRun(settings.b2c.lastRunAtIso, settings.b2c.frequencyDays, now);
      return { ownerId: s.ownerId, dataJson: s.dataJson, b2bDue, b2cDue };
    })
    .filter((x) => x.b2bDue || x.b2cDue);

  // Limit work per cron tick to avoid timeouts.
  const maxRuns = 25;
  const b2bToRun = due.filter((d) => d.b2bDue).slice(0, maxRuns);

  const results = [] as any[];
  for (const item of b2bToRun) {
    // B2C is intentionally not executed until a provider is integrated.
    results.push(await runB2BForOwner(item.ownerId, item.dataJson, baseUrl));
  }

  return NextResponse.json({
    ok: true,
    dueCount: due.length,
    b2bDueCount: b2bToRun.length,
    b2cDueCount: due.filter((d) => d.b2cDue).length,
    ranCount: results.length,
    results,
  });
}
