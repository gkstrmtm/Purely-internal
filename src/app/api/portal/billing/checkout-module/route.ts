import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { prisma } from "@/lib/db";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";
import { moduleByKey, usdToCents } from "@/lib/portalModulesCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  module: z.enum([
    "blog",
    "booking",
    "automations",
    "reviews",
    "newsletter",
    "nurture",
    "aiReceptionist",
    "leadScraping",
    "crm",
    "leadOutbound",
  ]),
  successPath: z.string().min(1).optional(),
  cancelPath: z.string().min(1).optional(),
  promoCode: z.string().min(1).max(64).optional(),
  campaignId: z.string().trim().min(1).max(64).optional(),
  serviceSlug: z.string().trim().min(1).max(64).optional(),
});

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

type CampaignDiscount = {
  promoCode: string;
  appliesToServiceSlugs: string[];
  discountType: DiscountType;
  percentOff?: number;
  amountOffUsd?: number;
  duration: DiscountDuration;
  durationMonths?: number;
};

function readCampaignDiscount(rewardJson: unknown, serviceSlug: string | null): CampaignDiscount | null {
  if (!rewardJson || typeof rewardJson !== "object" || Array.isArray(rewardJson)) return null;
  const offers = (rewardJson as any).offers;
  if (!Array.isArray(offers)) return null;

  const slug = String(serviceSlug || "").trim();

  for (const o of offers) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    if (String((o as any).kind || "") !== "discount") continue;

    const appliesToServiceSlugs = Array.isArray((o as any).appliesToServiceSlugs)
      ? (o as any).appliesToServiceSlugs.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 50)
      : [];

    if (slug && appliesToServiceSlugs.length && !appliesToServiceSlugs.includes(slug)) continue;

    const discountType = normalizeDiscountType((o as any).discountType);
    let duration = normalizeDiscountDuration((o as any).duration);
    let durationMonths = duration === "repeating" ? clampDurationMonths((o as any).durationMonths) : undefined;
    let percentOff = discountType === "percent" ? clampPercentOff((o as any).percentOff) : undefined;
    let amountOffUsd = discountType === "amount" ? clampAmountOffUsd((o as any).amountOffUsd) : undefined;

    if (discountType === "free_month") {
      duration = "repeating";
      durationMonths = 1;
      percentOff = 100;
      amountOffUsd = undefined;
    }

    return {
      promoCode: String((o as any).promoCode || "").trim().slice(0, 64),
      appliesToServiceSlugs,
      discountType,
      percentOff,
      amountOffUsd,
      duration,
      durationMonths,
    };
  }

  return null;
}

async function stripeCouponIdForCampaignDiscount(opts: {
  campaignId: string;
  module: string;
  serviceSlug: string | null;
  discount: CampaignDiscount;
}): Promise<string | null> {
  const discount = opts.discount;

  const duration = discount.duration;
  const params: Record<string, unknown> = {
    duration,
    "metadata[campaignId]": opts.campaignId,
    "metadata[module]": opts.module,
    "metadata[serviceSlug]": String(opts.serviceSlug || ""),
    "metadata[discountType]": discount.discountType,
  };

  if (duration === "repeating") {
    params.duration_in_months = discount.durationMonths ?? 1;
  }

  if (discount.discountType === "amount") {
    const cents = usdToCents(discount.amountOffUsd ?? 0);
    if (!cents || cents <= 0) return null;
    params.amount_off = cents;
    params.currency = "usd";
  } else {
    const pct = Number(discount.percentOff ?? 0);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
    params.percent_off = pct;
  }

  // Idempotency avoids creating a new coupon per checkout attempt.
  const idempotencyKey = [
    "portal_campaign_coupon",
    opts.campaignId,
    opts.module,
    discount.discountType,
    duration,
    String(discount.durationMonths ?? ""),
    String(discount.percentOff ?? ""),
    String(discount.amountOffUsd ?? ""),
  ].join(":");

  try {
    const created = await stripePost<{ id: string }>("/v1/coupons", params, { idempotencyKey });
    const id = String(created?.id || "").trim();
    return id || null;
  } catch {
    return null;
  }
}

async function promotionCodeIdForCode(code: string): Promise<string | null> {
  const c = String(code || "").trim();
  if (!c) return null;
  try {
    const list = await stripeGet<{ data?: Array<{ id?: string }> }>("/v1/promotion_codes", {
      code: c,
      active: true,
      limit: 1,
    });
    const id = String(list?.data?.[0]?.id || "").trim();
    return id || null;
  } catch {
    return null;
  }
}

function originFromReq(req: Request) {
  return (
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const billingModel = await getPortalBillingModelForOwner({
    ownerId: auth.session.user.id,
    portalVariant: (auth.session.user as any).portalVariant ?? "portal",
  });
  if (isCreditsOnlyBilling(billingModel)) {
    return NextResponse.json({ error: "This portal uses credits-only billing. Subscriptions are disabled." }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const moduleItem = moduleByKey(parsed.data.module);
  const monthlyCents = usdToCents(moduleItem.monthlyUsd);
  const setupCents = usdToCents(moduleItem.setupUsd);
  if (!monthlyCents || monthlyCents <= 0) {
    return NextResponse.json({ error: "Invalid module pricing" }, { status: 400 });
  }

  const email = auth.session.user.email;
  if (!email) {
    return NextResponse.json({ error: "Missing user email" }, { status: 400 });
  }

  const origin = originFromReq(req);
  const successUrl = new URL(parsed.data.successPath ?? "/portal/app/billing?checkout=success", origin).toString();
  const cancelUrl = new URL(parsed.data.cancelPath ?? "/portal/app/billing?checkout=cancel", origin).toString();

  try {
    const customer = await getOrCreateStripeCustomerId(email);

    const params: Record<string, unknown> = {
      mode: "subscription",
      customer,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      "subscription_data[metadata][ownerId]": auth.session.user.id,
      "subscription_data[metadata][source]": "portal_billing_addon",
      "subscription_data[metadata][module]": parsed.data.module,
    };

    const promoCode = String(parsed.data.promoCode || "").trim();
    const campaignId = String(parsed.data.campaignId || "").trim();
    const serviceSlug = String(parsed.data.serviceSlug || "").trim() || null;

    let appliedDiscount = false;
    if (promoCode) {
      const promoId = await promotionCodeIdForCode(promoCode);
      if (promoId) {
        params["discounts[0][promotion_code]"] = promoId;
        params["subscription_data[metadata][promoCode]"] = promoCode;
        appliedDiscount = true;
      } else {
        // If code isn't found, keep allow_promotion_codes so the user can still enter it.
        params["subscription_data[metadata][promoCodeMissing]"] = promoCode;
      }
    }

    if (!appliedDiscount && campaignId) {
      const row = await prisma.portalAdCampaign
        .findUnique({ where: { id: campaignId }, select: { id: true, enabled: true, startAt: true, endAt: true, rewardJson: true } })
        .catch(() => null);

      const now = Date.now();
      const inWindow =
        Boolean(row?.enabled) &&
        (!row?.startAt || row.startAt.getTime() <= now) &&
        (!row?.endAt || row.endAt.getTime() >= now);

      if (row && inWindow) {
        const discount = readCampaignDiscount(row.rewardJson, serviceSlug);
        if (discount) {
          const couponId = await stripeCouponIdForCampaignDiscount({ campaignId, module: parsed.data.module, serviceSlug, discount });
          if (couponId) {
            params["discounts[0][coupon]"] = couponId;
            params["subscription_data[metadata][campaignId]"] = campaignId;
            params["subscription_data[metadata][discountType]"] = discount.discountType;
            if (discount.discountType === "amount") params["subscription_data[metadata][amountOffUsd]"] = String(discount.amountOffUsd ?? "");
            if (discount.discountType !== "amount") params["subscription_data[metadata][percentOff]"] = String(discount.percentOff ?? "");
            params["subscription_data[metadata][discountDuration]"] = discount.duration;
            if (discount.duration === "repeating") params["subscription_data[metadata][discountDurationMonths]"] = String(discount.durationMonths ?? "");
            appliedDiscount = true;
          }
        }
      }
    }

    let idx = 0;
    if (setupCents && setupCents > 0) {
      params[`line_items[${idx}][quantity]`] = 1;
      params[`line_items[${idx}][price_data][currency]`] = "usd";
      params[`line_items[${idx}][price_data][unit_amount]`] = setupCents;
      params[`line_items[${idx}][price_data][product_data][name]`] = `${moduleItem.title} setup`;
      params[`line_items[${idx}][price_data][product_data][description]`] = moduleItem.description.slice(0, 450);
      params[`line_items[${idx}][price_data][product_data][metadata][module]`] = parsed.data.module;
      params[`line_items[${idx}][price_data][product_data][metadata][kind]`] = "setup";
      idx += 1;
    }

    params[`line_items[${idx}][quantity]`] = 1;
    params[`line_items[${idx}][price_data][currency]`] = "usd";
    params[`line_items[${idx}][price_data][unit_amount]`] = monthlyCents;
    params[`line_items[${idx}][price_data][recurring][interval]`] = "month";
    params[`line_items[${idx}][price_data][product_data][name]`] = moduleItem.title;
    params[`line_items[${idx}][price_data][product_data][description]`] = moduleItem.description.slice(0, 450);
    params[`line_items[${idx}][price_data][product_data][metadata][module]`] = parsed.data.module;

    const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
