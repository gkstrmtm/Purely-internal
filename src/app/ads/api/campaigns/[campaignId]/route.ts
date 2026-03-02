import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const placementSchema = z.enum(["SIDEBAR_BANNER", "TOP_BANNER", "POPUP_CARD"]);

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

function getDefaultCostPerClickCents(placement: z.infer<typeof placementSchema>, dailyBudgetCents: number) {
  const envRaw = Number(process.env.PORTAL_AD_DEFAULT_CPC_CENTS ?? "");
  const env = Number.isFinite(envRaw) ? Math.max(1, Math.floor(envRaw)) : null;

  const byPlacement =
    placement === "POPUP_CARD" ? 150 : placement === "TOP_BANNER" ? 125 : placement === "SIDEBAR_BANNER" ? 100 : 100;

  const base = env ?? byPlacement;

  if (dailyBudgetCents > 0) return Math.max(1, Math.min(50_000, Math.min(base, dailyBudgetCents)));
  return Math.max(1, Math.min(50_000, base));
}

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    requestReview: z.boolean().optional(),
    name: z.string().min(3).max(80).optional(),
    startAtIso: z.string().datetime().nullable().optional(),
    endAtIso: z.string().datetime().nullable().optional(),
    targeting: z
      .object({
        industries: z.array(z.string().min(1).max(80)).max(50).optional(),
        businessModels: z.array(z.string().min(1).max(80)).max(50).optional(),
      })
      .optional(),
    budget: z
      .object({
        dailyBudgetCents: z.number().int().min(0).max(1_000_000_00),
      })
      .optional(),
    creative: z
      .object({
        headline: z.string().min(1).max(160).optional(),
        body: z.string().max(800).optional().nullable(),
        ctaText: z.string().max(80).optional().nullable(),
        linkUrl: z.string().max(500).optional().nullable(),
        mediaUrl: z.string().max(500).optional().nullable(),
        mediaKind: z.enum(["image", "video"]).optional().nullable(),
        mediaFit: z.enum(["cover", "contain"]).optional().nullable(),
        mediaPosition: z.string().max(40).optional().nullable(),
        sidebarImageHeight: z.number().int().min(60).max(240).optional().nullable(),
        topBannerImageSize: z.number().int().min(40).max(160).optional().nullable(),
      })
      .optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const user = await requireAdsUser();
  const { campaignId } = await ctx.params;

  const row = await prisma.portalAdCampaign.findFirst({
    where: { id: campaignId, createdById: user.id },
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

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, campaign: row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const user = await requireAdsUser();
  const { campaignId } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const wantsEdit =
    parsed.data.name !== undefined ||
    parsed.data.startAtIso !== undefined ||
    parsed.data.endAtIso !== undefined ||
    parsed.data.targeting !== undefined ||
    parsed.data.budget !== undefined ||
    parsed.data.creative !== undefined;

  if (parsed.data.enabled === undefined && !parsed.data.requestReview && !wantsEdit) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  if (wantsEdit) {
    const row = await prisma.portalAdCampaign
      .findFirst({
        where: { id: campaignId, createdById: user.id },
        select: {
          id: true,
          name: true,
          placement: true,
          startAt: true,
          endAt: true,
          targetJson: true,
          creativeJson: true,
        },
      })
      .catch(() => null);
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const existingTarget = (row.targetJson ?? {}) as any;
    const existingCreative = (row.creativeJson ?? {}) as any;

    const nextName = parsed.data.name ?? row.name;
    const existingPlacement = placementSchema.safeParse(row.placement).success
      ? (row.placement as z.infer<typeof placementSchema>)
      : "POPUP_CARD";

    const nextStartAt =
      parsed.data.startAtIso === undefined ? row.startAt : parsed.data.startAtIso ? new Date(parsed.data.startAtIso) : null;
    const nextEndAt = parsed.data.endAtIso === undefined ? row.endAt : parsed.data.endAtIso ? new Date(parsed.data.endAtIso) : null;

    const existingDailyBudgetCents = Number(existingTarget?.billing?.dailyBudgetCents || 0);
    const dailyBudgetCents = parsed.data.budget?.dailyBudgetCents ?? existingDailyBudgetCents;
    const costPerClickCents = getDefaultCostPerClickCents(existingPlacement, dailyBudgetCents);

    const industries =
      parsed.data.targeting?.industries === undefined
        ? uniqStrings(existingTarget?.industries).slice(0, 50)
        : uniqStrings(parsed.data.targeting.industries).slice(0, 50);
    const businessModels =
      parsed.data.targeting?.businessModels === undefined
        ? uniqStrings(existingTarget?.businessModels).slice(0, 50)
        : uniqStrings(parsed.data.targeting.businessModels).slice(0, 50);

    const targetJson = omitUndefinedDeep({
      industries: industries.length ? industries : undefined,
      businessModels: businessModels.length ? businessModels : undefined,
      paths: undefined,
      includeOwnerIds: undefined,
      excludeOwnerIds: undefined,
      portalVariant: undefined,
      billingModel: undefined,
      billing: {
        model: "cpc",
        dailyBudgetCents,
        costPerClickCents,
      },
    }) as Prisma.InputJsonValue;

    const nextHeadline =
      parsed.data.creative?.headline === undefined
        ? String(existingCreative?.headline || "").trim()
        : String(parsed.data.creative.headline || "").trim();
    if (!nextHeadline) return NextResponse.json({ ok: false, error: "Headline is required" }, { status: 400 });

    const readMaybe = (key: string, maxLen: number) => {
      if (!parsed.data.creative) return undefined;
      if (!(key in parsed.data.creative)) return undefined;
      const raw = (parsed.data.creative as any)[key];
      const s = String(raw || "").trim();
      return s ? s.slice(0, maxLen) : null;
    };

    const bodyNext = readMaybe("body", 800);
    const ctaNext = readMaybe("ctaText", 80);
    const linkNext = readMaybe("linkUrl", 500);
    const mediaUrlNext = readMaybe("mediaUrl", 500);
    const mediaPositionNext = readMaybe("mediaPosition", 40);

    const creativeJson = omitUndefinedDeep({
      headline: nextHeadline,
      body:
        bodyNext === undefined
          ? String(existingCreative?.body || "").trim() || undefined
          : bodyNext === null
            ? undefined
            : bodyNext,
      ctaText:
        ctaNext === undefined
          ? String(existingCreative?.ctaText || "").trim() || undefined
          : ctaNext === null
            ? undefined
            : ctaNext,
      linkUrl:
        linkNext === undefined
          ? safeLinkUrl(existingCreative?.linkUrl) || undefined
          : safeLinkUrl(linkNext) || undefined,
      mediaUrl:
        mediaUrlNext === undefined
          ? String(existingCreative?.mediaUrl || "").trim() || undefined
          : mediaUrlNext === null
            ? undefined
            : mediaUrlNext,
      mediaKind: parsed.data.creative?.mediaKind === undefined ? existingCreative?.mediaKind || undefined : parsed.data.creative.mediaKind || undefined,
      mediaFit: parsed.data.creative?.mediaFit === undefined ? existingCreative?.mediaFit || undefined : parsed.data.creative.mediaFit || undefined,
      mediaPosition:
        mediaPositionNext === undefined
          ? String(existingCreative?.mediaPosition || "").trim().slice(0, 40) || undefined
          : mediaPositionNext === null
            ? undefined
            : mediaPositionNext,
      sidebarImageHeight:
        parsed.data.creative?.sidebarImageHeight === undefined
          ? existingCreative?.sidebarImageHeight ?? undefined
          : parsed.data.creative.sidebarImageHeight ?? undefined,
      topBannerImageSize:
        parsed.data.creative?.topBannerImageSize === undefined
          ? existingCreative?.topBannerImageSize ?? undefined
          : parsed.data.creative.topBannerImageSize ?? undefined,
    }) as Prisma.InputJsonValue;

    const priority = Math.max(1, Math.min(10_000, Math.floor(dailyBudgetCents / 100)));

    const updated = await prisma.portalAdCampaign.updateMany({
      where: { id: campaignId, createdById: user.id },
      data: {
        name: nextName,
        startAt: nextStartAt,
        endAt: nextEndAt,
        priority,
        targetJson,
        creativeJson,
        enabled: false,
        reviewStatus: "PENDING",
        reviewedAt: null,
        reviewedById: null,
        reviewNotes: null,
        updatedById: user.id,
      },
    });

    if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.enabled === true) {
    const status = await prisma.portalAdCampaign
      .findFirst({ where: { id: campaignId, createdById: user.id }, select: { reviewStatus: true } })
      .catch(() => null);
    if (!status) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (status.reviewStatus !== "APPROVED") {
      return NextResponse.json({ ok: false, error: "Campaign is pending approval." }, { status: 400 });
    }
  }

  if (parsed.data.requestReview) {
    const updated = await prisma.portalAdCampaign.updateMany({
      where: { id: campaignId, createdById: user.id },
      data: {
        reviewStatus: "PENDING",
        reviewedAt: null,
        reviewedById: null,
        reviewNotes: null,
        updatedById: user.id,
      },
    });

    if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.portalAdCampaign.updateMany({
    where: { id: campaignId, createdById: user.id },
    data: {
      enabled: parsed.data.enabled,
      updatedById: user.id,
    },
  });

  if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
