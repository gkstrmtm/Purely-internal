import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { addCredits, consumeCredits } from "@/lib/credits";
import { resolveEntitlements } from "@/lib/entitlements";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";
import { baseUrlFromRequest, renderTemplate, sendEmail, sendSms, stripHtml } from "@/lib/leadOutbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

type SettingsV2 = {
  version: 2;
  b2b: {
    niche: string;
    location: string;
    count: number;
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

function normalizeSettings(value: unknown): SettingsV2 {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = rec.version === 1 ? 1 : 2;
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

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

  const toInt = (n: unknown, def: number, max: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return def;
    return Math.min(max, Math.max(1, Math.floor(n)));
  };

  const toStr = (s: unknown, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");

  return {
    version: 2,
    b2b: {
      niche: toStr(b2b.niche),
      location: toStr(b2b.location),
      count: toInt(b2b.count, 25, 50),
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
    outbound,
    outboundState: {
      approvedAtByLeadId: Object.fromEntries(Object.entries(approvedAtByLeadId).slice(0, 5000)),
      sentAtByLeadId: Object.fromEntries(Object.entries(sentAtByLeadId).slice(0, 5000)),
    },
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
  const createdLeads: Array<{
    id: string;
    businessName: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    niche: string | null;
  }> = [];

  try {
    const results = await placesTextSearch(`${niche} in ${location}`, Math.min(60, Math.max(1, requestedCount * 4)));

    const excludedPhones = new Set(
      settings.b2b.excludePhones
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p)),
    );

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

      try {
        const created = await prisma.portalLead.create({
          data: {
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
          },
          select: {
            id: true,
            businessName: true,
            phone: true,
            website: true,
            address: true,
            niche: true,
          },
        });
        createdLeads.push(created);
        createdCount++;
      } catch (e: any) {
        const msg = typeof e?.message === "string" ? e.message : "";
        const isUnique =
          msg.includes("Unique constraint") ||
          msg.includes("unique constraint") ||
          msg.includes("P2002");
        if (!isUnique) throw e;
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

  if (
    outboundUnlocked &&
    settings.outbound.enabled &&
    settings.outbound.trigger === "ON_SCRAPE" &&
    (settings.outbound.sendEmail || settings.outbound.sendSms) &&
    createdLeads.length
  ) {
    for (const lead of createdLeads) {
      try {
        const resources = settings.outbound.resources
          .map((r) => ({
            label: r.label,
            url: r.url.startsWith("/") ? `${baseUrl}${r.url}` : r.url,
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

        if (settings.outbound.sendEmail) {
          const to = settings.outbound.toEmailDefault.trim();
          if (to) {
            await sendEmail({
              to,
              subject: subject || `Follow-up: ${lead.businessName}`,
              text,
              html,
              fromName,
            });
          }
        }

        if (settings.outbound.sendSms && lead.phone) {
          const smsBody = renderTemplate(settings.outbound.smsText, lead).slice(0, 900);
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

  const updatedSettings: SettingsV2 = {
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
