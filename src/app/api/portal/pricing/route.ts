import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { CREDIT_USD_VALUE } from "@/lib/pricing.shared";
import { isStripeConfigured } from "@/lib/stripeFetch";
import { moduleByKey, usdToCents } from "@/lib/portalModulesCatalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function modulePricing(key: Parameters<typeof moduleByKey>[0]) {
  const m = moduleByKey(key);
  return {
    monthlyCents: usdToCents(m.monthlyUsd),
    setupCents: usdToCents(m.setupUsd),
    currency: "usd",
    usageBased: Boolean(m.usageBased),
    title: m.title,
    description: m.description,
  };
}

export async function GET() {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const blog = modulePricing("blog");
  const booking = modulePricing("booking");
  const automations = modulePricing("automations");
  const reviews = modulePricing("reviews");
  const newsletter = modulePricing("newsletter");
  const nurture = modulePricing("nurture");
  const aiReceptionist = modulePricing("aiReceptionist");
  const crm = modulePricing("crm");
  const leadOutbound = modulePricing("leadOutbound");

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
      automations,
      reviews,
      newsletter,
      nurture,
      aiReceptionist,
      crm,
      leadOutbound,
    },
  });
}
