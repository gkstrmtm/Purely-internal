import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { addCredits, consumeCredits } from "@/lib/credits";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";

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
  version: 1;
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
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
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

function normalizeSettings(value: unknown): Settings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

  return {
    version: 1,
    b2b: {
      niche: typeof b2b.niche === "string" ? b2b.niche.slice(0, 200) : "",
      location: typeof b2b.location === "string" ? b2b.location.slice(0, 200) : "",
      count:
        typeof b2b.count === "number" && Number.isFinite(b2b.count)
          ? Math.min(50, Math.max(1, Math.floor(b2b.count)))
          : 25,
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

  try {
    const query = `${niche} in ${location}`;
    const results = await placesTextSearch(query, Math.min(60, Math.max(1, requestedCount * 4)));

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

      const phoneCandidate =
        details.international_phone_number || details.formatted_phone_number || null;
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
        // Dedupe: ignore unique violations.
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
  const updatedSettings: Settings = {
    ...settings,
    b2b: {
      ...settings.b2b,
      lastRunAtIso: nowIso,
    },
  };

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
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    chargedCredits: reservedCredits,
    refundedCredits,
    createdCount,
  });
}
