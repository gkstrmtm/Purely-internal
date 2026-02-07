import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { addCredits, consumeCredits } from "@/lib/credits";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

function normalizeSettings(value: unknown): {
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
  b2c: { scheduleEnabled: boolean; frequencyDays: number; lastRunAtIso: string | null };
} {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

  const toInt = (n: unknown, def: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return def;
    return Math.min(60, Math.max(1, Math.floor(n)));
  };

  const toIso = (s: unknown) => {
    if (typeof s !== "string") return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const toStr = (s: unknown, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");
  const toBool = (b: unknown) => Boolean(b);
  const toList = (xs: unknown, { lower }: { lower?: boolean } = {}) => {
    const arr = Array.isArray(xs) ? xs : [];
    return arr
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .map((x) => (lower ? x.toLowerCase() : x))
      .slice(0, 200);
  };

  return {
    b2b: {
      niche: toStr(b2b.niche),
      location: toStr(b2b.location),
      count: toInt(b2b.count, 25),
      requirePhone: toBool(b2b.requirePhone),
      requireWebsite: toBool(b2b.requireWebsite),
      excludeNameContains: toList(b2b.excludeNameContains),
      excludeDomains: toList(b2b.excludeDomains, { lower: true }),
      excludePhones: toList(b2b.excludePhones),
      scheduleEnabled: Boolean(b2b.scheduleEnabled),
      frequencyDays: toInt(b2b.frequencyDays, 7),
      lastRunAtIso: toIso(b2b.lastRunAtIso),
    },
    b2c: {
      scheduleEnabled: Boolean(b2c.scheduleEnabled),
      frequencyDays: toInt(b2c.frequencyDays, 7),
      lastRunAtIso: toIso(b2c.lastRunAtIso),
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

async function runB2BForOwner(ownerId: string, settingsJson: unknown) {
  const settings = normalizeSettings(settingsJson);
  const niche = settings.b2b.niche.trim();
  const location = settings.b2b.location.trim();
  const requestedCount = settings.b2b.count;

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
        await prisma.portalLead.create({
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
          select: { id: true },
        });
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
  const updatedSettings = {
    ...(settingsJson && typeof settingsJson === "object" ? (settingsJson as Record<string, unknown>) : {}),
    b2b: {
      ...(settingsJson && typeof settingsJson === "object" && (settingsJson as any).b2b
        ? (settingsJson as any).b2b
        : {}),
      lastRunAtIso: nowIso,
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
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: updatedSettings },
      update: { dataJson: updatedSettings, status: "IN_PROGRESS" },
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
    results.push(await runB2BForOwner(item.ownerId, item.dataJson));
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
