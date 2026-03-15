import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";
import { isStripeConfigured, stripePost } from "@/lib/stripeFetch";
import { usdToCents } from "@/lib/portalModulesCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const placementSchema = z.enum([
  "SIDEBAR_BANNER",
  "TOP_BANNER",
  "BILLING_SPONSORED",
  "FULLSCREEN_REWARD",
  "POPUP_CARD",
  "HOSTED_BLOG_PAGE",
  "HOSTED_REVIEWS_PAGE",
]);

const campaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  placement: placementSchema,
  startAtIso: z.string().datetime().optional().nullable(),
  endAtIso: z.string().datetime().optional().nullable(),
  targetJson: z.record(z.string(), z.unknown()).optional().nullable(),
  creativeJson: z.record(z.string(), z.unknown()),
  rewardJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

const campaignUpdateSchema = campaignCreateSchema.extend({ id: z.string().trim().min(1).max(64) });

type DiscountType = "percent" | "amount" | "free_month";
type DiscountDuration = "once" | "repeating" | "forever";

function normalizeDiscountType(v: unknown): DiscountType {
  const s = String(v || "").trim();
  if (s === "amount") return "amount";
  if (s === "free_month") return "free_month";
  return "percent";
}

function normalizeDiscountDuration(v: unknown): DiscountDuration {
  const s = String(v || "").trim();
  if (s === "forever") return "forever";
  if (s === "repeating") return "repeating";
  return "once";
}

function clampPercentOff(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function clampAmountOffUsd(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 25;
  return Math.max(0.5, Math.min(10000, Math.round(n * 100) / 100));
}

function clampDurationMonths(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

function promoCodeForCampaign(campaignId: string, idx: number) {
  const base = String(campaignId || "").replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase();
  const n = Number.isFinite(Number(idx)) ? Math.max(0, Math.floor(Number(idx))) : 0;
  // Stripe promo codes accept uppercase/lowercase letters and digits; keep it simple.
  return `PA${base}${n + 1}`.slice(0, 64);
}

function normalizeRewardJsonAndCollectDiscounts(rewardJson: unknown, campaignId: string): {
  rewardJson: unknown;
  changed: boolean;
  discounts: Array<{
    promoCode: string;
    discountType: DiscountType;
    percentOff?: number;
    amountOffUsd?: number;
    duration: DiscountDuration;
    durationMonths?: number;
  }>;
} {
  if (!rewardJson || typeof rewardJson !== "object" || Array.isArray(rewardJson)) {
    return { rewardJson, changed: false, discounts: [] };
  }

  const r: any = rewardJson as any;
  const offersRaw = Array.isArray(r.offers) ? r.offers : [];
  if (!offersRaw.length) return { rewardJson, changed: false, discounts: [] };

  let changed = false;
  const discounts: Array<{
    promoCode: string;
    discountType: DiscountType;
    percentOff?: number;
    amountOffUsd?: number;
    duration: DiscountDuration;
    durationMonths?: number;
  }> = [];

  const offers = offersRaw.map((o: any, idx: number) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return o;
    if (String(o.kind || "") !== "discount") return o;

    const discountType = normalizeDiscountType(o.discountType);
    let duration = normalizeDiscountDuration(o.duration);
    let durationMonths = duration === "repeating" ? clampDurationMonths(o.durationMonths) : undefined;
    let percentOff = discountType === "percent" ? clampPercentOff(o.percentOff) : undefined;
    let amountOffUsd = discountType === "amount" ? clampAmountOffUsd(o.amountOffUsd) : undefined;

    if (discountType === "free_month") {
      duration = "repeating";
      durationMonths = 1;
      percentOff = 100;
      amountOffUsd = undefined;
    }

    const existing = String(o.promoCode || "").trim();
    const promoCode = existing || promoCodeForCampaign(campaignId, idx);
    if (!existing) changed = true;

    discounts.push({ promoCode, discountType, percentOff, amountOffUsd, duration, durationMonths });

    const next = {
      ...o,
      promoCode,
      discountType,
      duration,
      durationMonths,
      percentOff,
      amountOffUsd,
    };

    // Keep JSON stable.
    if (String(o.promoCode || "") !== promoCode) changed = true;
    return next;
  });

  if (!changed) return { rewardJson, changed: false, discounts };
  return { rewardJson: { ...r, offers }, changed: true, discounts };
}

async function ensureStripeDiscountArtifacts(opts: {
  campaignId: string;
  discounts: Array<{
    promoCode: string;
    discountType: DiscountType;
    percentOff?: number;
    amountOffUsd?: number;
    duration: DiscountDuration;
    durationMonths?: number;
  }>;
}) {
  if (!isStripeConfigured()) return;

  for (let idx = 0; idx < opts.discounts.length; idx += 1) {
    const d = opts.discounts[idx]!;

    const duration = d.duration;
    const couponParams: Record<string, unknown> = {
      duration,
      "metadata[campaignId]": opts.campaignId,
      "metadata[idx]": String(idx),
      "metadata[discountType]": d.discountType,
      "metadata[promoCode]": d.promoCode,
    };

    if (duration === "repeating") couponParams.duration_in_months = d.durationMonths ?? 1;

    if (d.discountType === "amount") {
      const cents = usdToCents(d.amountOffUsd ?? 0);
      if (!cents || cents <= 0) continue;
      couponParams.amount_off = cents;
      couponParams.currency = "usd";
    } else {
      const pct = Number(d.percentOff ?? 0);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
      couponParams.percent_off = pct;
    }

    const couponKey = [
      "portal_campaign_coupon",
      opts.campaignId,
      String(idx),
      d.discountType,
      duration,
      String(d.durationMonths ?? ""),
      String(d.percentOff ?? ""),
      String(d.amountOffUsd ?? ""),
    ].join(":");

    const coupon = await stripePost<{ id?: string }>("/v1/coupons", couponParams, { idempotencyKey: couponKey }).catch(() => null);
    const couponId = String(coupon?.id || "").trim();
    if (!couponId) continue;

    const promoKey = ["portal_campaign_promo", opts.campaignId, d.promoCode].join(":");
    await stripePost(
      "/v1/promotion_codes",
      {
        coupon: couponId,
        code: d.promoCode,
        active: true,
        "metadata[campaignId]": opts.campaignId,
        "metadata[idx]": String(idx),
      },
      { idempotencyKey: promoKey },
    ).catch(() => null);
  }
}

function describeWriteError(err: unknown): string {
  // Helpful context for the most common prod failure:
  // schema/migrations not applied (e.g. adding a new enum value).
  try {
    const msg = String((err as any)?.message || "");
    const code = String((err as any)?.code || "");

    if (msg.includes("PortalAdPlacement") && (msg.includes("invalid input value for enum") || code === "22P02")) {
      return "Database enum PortalAdPlacement is out of date (missing a value). Apply the latest Prisma migrations, then try again.";
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2021" || err.code === "P2022") {
        return "Campaigns database schema is missing or out of date. Apply the latest Prisma migrations.";
      }
    } else if (code === "42P01") {
      return "Campaigns database table is missing. Apply the latest Prisma migrations.";
    }
  } catch {
    // ignore
  }

  return "Unable to create campaign.";
}

export async function GET() {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    const rows = await prisma.portalAdCampaign.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        enabled: true,
        priority: true,
        placement: true,
        startAt: true,
        endAt: true,
        targetJson: true,
        creativeJson: true,
        rewardJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, campaigns: rows });
  } catch (err) {
    let msg = "Unable to load campaigns.";

    // Common production failure mode: migrations not applied, so the table/columns don't exist.
    try {
      const code = (err as any)?.code;
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2021" || err.code === "P2022") {
          msg = "Campaigns database schema is missing or out of date. Apply the latest Prisma migrations.";
        }
      } else if (typeof code === "string" && code.trim()) {
        // Postgres: undefined_table
        if (code === "42P01") {
          msg = "Campaigns database table is missing. Apply the latest Prisma migrations.";
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const startAt = parsed.data.startAtIso ? new Date(parsed.data.startAtIso) : null;
    const endAt = parsed.data.endAtIso ? new Date(parsed.data.endAtIso) : null;

    const row = await prisma.portalAdCampaign.create({
      data: {
        name: parsed.data.name,
        enabled: parsed.data.enabled ?? true,
        priority: parsed.data.priority ?? 0,

        // Staff-created campaigns are pre-approved.
        // This avoids production drift where the database default might be PENDING.
        reviewStatus: "APPROVED" as any,
        reviewedAt: new Date(),
        reviewedById: auth.session.user.id,

        placement: parsed.data.placement as any,
        startAt,
        endAt,
        targetJson: parsed.data.targetJson == null ? Prisma.DbNull : (parsed.data.targetJson as Prisma.InputJsonValue),
        creativeJson: parsed.data.creativeJson as Prisma.InputJsonValue,
        rewardJson: parsed.data.rewardJson == null ? Prisma.DbNull : (parsed.data.rewardJson as Prisma.InputJsonValue),
        createdById: auth.session.user.id,
        updatedById: auth.session.user.id,
      },
      select: { id: true },
    });

    // Now that we have a campaign id, ensure promo codes exist and persist them.
    const normalized2 = normalizeRewardJsonAndCollectDiscounts(parsed.data.rewardJson, row.id);
    if (normalized2.changed) {
      await prisma.portalAdCampaign
        .update({
          where: { id: row.id },
          data: {
            rewardJson: normalized2.rewardJson == null ? Prisma.DbNull : (normalized2.rewardJson as Prisma.InputJsonValue),
            updatedById: auth.session.user.id,
          },
          select: { id: true },
        })
        .catch(() => null);
    }

    await ensureStripeDiscountArtifacts({ campaignId: row.id, discounts: normalized2.discounts }).catch(() => null);

    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: describeWriteError(err) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const startAt = parsed.data.startAtIso ? new Date(parsed.data.startAtIso) : null;
    const endAt = parsed.data.endAtIso ? new Date(parsed.data.endAtIso) : null;

    const normalized = normalizeRewardJsonAndCollectDiscounts(parsed.data.rewardJson, parsed.data.id);

    await prisma.portalAdCampaign.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        enabled: parsed.data.enabled ?? true,
        priority: parsed.data.priority ?? 0,
        placement: parsed.data.placement as any,
        startAt,
        endAt,
        targetJson: parsed.data.targetJson == null ? Prisma.DbNull : (parsed.data.targetJson as Prisma.InputJsonValue),
        creativeJson: parsed.data.creativeJson as Prisma.InputJsonValue,
        rewardJson: normalized.rewardJson == null ? Prisma.DbNull : (normalized.rewardJson as Prisma.InputJsonValue),
        updatedById: auth.session.user.id,
      },
      select: { id: true },
    });

    await ensureStripeDiscountArtifacts({ campaignId: parsed.data.id, discounts: normalized.discounts }).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = describeWriteError(err);
    return NextResponse.json({ ok: false, error: msg === "Unable to create campaign." ? "Unable to update campaign." : msg }, { status: 500 });
  }
}
