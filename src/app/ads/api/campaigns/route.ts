import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const placementSchema = z.enum(["SIDEBAR_BANNER", "TOP_BANNER", "POPUP_CARD"]);

const DEFAULT_PLACEMENT: z.infer<typeof placementSchema> = "POPUP_CARD";

function getDefaultCostPerClickCents(placement: z.infer<typeof placementSchema>, dailyBudgetCents: number) {
  const envRaw = Number(process.env.PORTAL_AD_DEFAULT_CPC_CENTS ?? "");
  const env = Number.isFinite(envRaw) ? Math.max(1, Math.floor(envRaw)) : null;

  const byPlacement =
    placement === "POPUP_CARD" ? 150 : placement === "TOP_BANNER" ? 125 : placement === "SIDEBAR_BANNER" ? 100 : 100;

  const base = env ?? byPlacement;

  if (dailyBudgetCents > 0) return Math.max(1, Math.min(50_000, Math.min(base, dailyBudgetCents)));
  return Math.max(1, Math.min(50_000, base));
}

const createSchema = z.object({
  name: z.string().min(3).max(80),
  placement: placementSchema.optional().default(DEFAULT_PLACEMENT),
  enabled: z.boolean().optional(),

  startAtIso: z.string().datetime().nullable().optional(),
  endAtIso: z.string().datetime().nullable().optional(),

  targeting: z
    .object({
      industries: z.array(z.string().min(1).max(80)).max(50).optional(),
      businessModels: z.array(z.string().min(1).max(80)).max(50).optional(),
      locations: z.array(z.string().min(1).max(80)).max(50).optional(),
    })
    .optional(),

  budget: z.object({
    dailyBudgetCents: z.number().int().min(0).max(1_000_000_00),
  }),

  creative: z.object({
    headline: z.string().min(1).max(160),
    body: z.string().max(800).optional().nullable(),
    ctaText: z.string().max(80).optional().nullable(),
    linkUrl: z.string().max(500).optional().nullable(),
    mediaUrl: z.string().max(500).optional().nullable(),
    mediaKind: z.enum(["image", "video"]).optional().nullable(),
    mediaFit: z.enum(["cover", "contain"]).optional().nullable(),
    mediaPosition: z.string().max(40).optional().nullable(),
    sidebarImageHeight: z.number().int().min(60).max(240).optional().nullable(),
    topBannerImageSize: z.number().int().min(40).max(160).optional().nullable(),
  }),
});

function safeLinkUrl(raw: string | null | undefined): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  if (v.startsWith("/")) return v;
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return u.toString();
  } catch {
    // ignore
  }
  return null;
}

function uniqStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

function omitUndefinedDeep(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(omitUndefinedDeep);

  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue;
    out[k] = omitUndefinedDeep(v);
  }
  return out;
}

export async function GET() {
  const user = await requireAdsUser();

  const rows = await prisma.portalAdCampaign.findMany({
    where: { createdById: user.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      enabled: true,
      reviewStatus: true,
      reviewedAt: true,
      reviewNotes: true,
      placement: true,
      startAt: true,
      endAt: true,
      targetJson: true,
      creativeJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, campaigns: rows });
}

export async function POST(req: Request) {
  const user = await requireAdsUser();

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const startAt = parsed.data.startAtIso ? new Date(parsed.data.startAtIso) : null;
  const endAt = parsed.data.endAtIso ? new Date(parsed.data.endAtIso) : null;

  const industries = uniqStrings(parsed.data.targeting?.industries).slice(0, 50);
  const businessModels = uniqStrings(parsed.data.targeting?.businessModels).slice(0, 50);
  const locations = uniqStrings(parsed.data.targeting?.locations).slice(0, 50);

  // Placement is internal; advertisers do not choose it.
  const placement = DEFAULT_PLACEMENT;

  const costPerClickCents = getDefaultCostPerClickCents(placement, parsed.data.budget.dailyBudgetCents);

  const targetJson = omitUndefinedDeep({
    industries: industries.length ? industries : undefined,
    businessModels: businessModels.length ? businessModels : undefined,
    locations: locations.length ? locations : undefined,
    // Customer surface does not expose internal knobs.
    paths: undefined,
    includeOwnerIds: undefined,
    excludeOwnerIds: undefined,
    portalVariant: undefined,
    billingModel: undefined,
    billing: {
      model: "cpc",
      dailyBudgetCents: parsed.data.budget.dailyBudgetCents,
      costPerClickCents,
    },
  }) as Prisma.InputJsonValue;

  const creative = parsed.data.creative;
  const creativeJson = omitUndefinedDeep({
    headline: creative.headline,
    body: String(creative.body || "").trim() || undefined,
    ctaText: String(creative.ctaText || "").trim() || undefined,
    linkUrl: safeLinkUrl(creative.linkUrl) || undefined,
    mediaUrl: String(creative.mediaUrl || "").trim() || undefined,
    mediaKind: creative.mediaKind || undefined,
    mediaFit: creative.mediaFit || undefined,
    mediaPosition: String(creative.mediaPosition || "").trim().slice(0, 40) || undefined,
    sidebarImageHeight: creative.sidebarImageHeight ?? undefined,
    topBannerImageSize: creative.topBannerImageSize ?? undefined,
  }) as Prisma.InputJsonValue;

  const enabled = parsed.data.enabled ?? true;
  const dailyBudgetCents = parsed.data.budget.dailyBudgetCents;
  const priority = Math.max(1, Math.min(10_000, Math.floor(dailyBudgetCents / 100)));

  const row = await prisma.portalAdCampaign.create({
    data: {
      name: parsed.data.name,
      enabled,
      priority,
      reviewStatus: "PENDING",
      reviewedAt: null,
      reviewedById: null,
      reviewNotes: null,
      placement,
      startAt,
      endAt,
      targetJson,
      creativeJson,
      createdById: user.id,
      updatedById: user.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: row.id });
}
