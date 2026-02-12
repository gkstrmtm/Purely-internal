import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { CREDIT_USD_VALUE } from "@/lib/pricing.shared";
import { isStripeConfigured, stripeGet } from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StripePrice = {
  unit_amount?: number | null;
  currency?: string | null;
  recurring?: { interval?: string | null } | null;
};

async function loadMonthlyPrice(priceId: string | null) {
  if (!priceId) return null;
  if (!isStripeConfigured()) return null;

  try {
    const p = await stripeGet<StripePrice>(`/v1/prices/${encodeURIComponent(priceId)}`);
    const unit = typeof p.unit_amount === "number" ? p.unit_amount : null;
    const currency = typeof p.currency === "string" && p.currency ? p.currency.toLowerCase() : "usd";
    const interval = p.recurring?.interval ?? null;
    if (!unit) return null;
    if (interval && interval !== "month") return null;
    return { monthlyCents: unit, currency };
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const blog = await loadMonthlyPrice((process.env.STRIPE_PRICE_BLOG_AUTOMATION ?? "").trim() || null);
  const booking = await loadMonthlyPrice((process.env.STRIPE_PRICE_BOOKING_AUTOMATION ?? "").trim() || null);
  const crm = await loadMonthlyPrice((process.env.STRIPE_PRICE_CRM_AUTOMATION ?? "").trim() || null);
  const leadOutbound = await loadMonthlyPrice((process.env.STRIPE_PRICE_LEAD_OUTBOUND ?? "").trim() || null);

  return NextResponse.json({
    ok: true,
    stripeConfigured: isStripeConfigured(),
    credits: {
      usdValue: CREDIT_USD_VALUE,
      rollOver: true,
      topup: {
        creditsPerPackage: creditsPerTopUpPackage(),
      },
    },
    modules: {
      blog,
      booking,
      crm,
      leadOutbound,
    },
  });
}
