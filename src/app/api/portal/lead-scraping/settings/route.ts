import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getCreditsState } from "@/lib/credits";
import { hasPlacesKey } from "@/lib/googlePlaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const stringList = z.array(z.string()).max(500);

const settingsSchema = z.object({
  version: z.literal(1),
  b2b: z.object({
    niche: z.string().max(200),
    location: z.string().max(200),
    count: z.number().int().min(1).max(50),
    requirePhone: z.boolean(),
    requireWebsite: z.boolean(),
    excludeNameContains: stringList,
    excludeDomains: stringList,
    excludePhones: stringList,
    scheduleEnabled: z.boolean(),
    frequencyDays: z.number().int().min(1).max(60),
    lastRunAtIso: z.string().nullable(),
  }),
  b2c: z.object({
    notes: z.string().max(5000),
    scheduleEnabled: z.boolean(),
    frequencyDays: z.number().int().min(1).max(60),
    lastRunAtIso: z.string().nullable(),
  }),
});

type LeadScrapingSettings = z.infer<typeof settingsSchema>;

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

function normalizeSettings(value: unknown): LeadScrapingSettings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

  const settings: LeadScrapingSettings = {
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

  return settings;
}

async function loadSettings(ownerId: string): Promise<LeadScrapingSettings> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return normalizeSettings(row?.dataJson);
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const [settings, credits] = await Promise.all([
    loadSettings(ownerId),
    getCreditsState(ownerId),
  ]);

  return NextResponse.json({
    ok: true,
    settings,
    credits: credits.balance,
    placesConfigured: hasPlacesKey(),
  });
}

const putSchema = z.object({
  settings: settingsSchema,
});

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const normalized = normalizeSettings(parsed.data.settings);

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: normalized },
    update: { dataJson: normalized, status: "IN_PROGRESS" },
    select: { id: true },
  });

  const credits = await getCreditsState(ownerId);

  return NextResponse.json({
    ok: true,
    settings: normalized,
    credits: credits.balance,
    placesConfigured: hasPlacesKey(),
  });
}
