import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  currency?: string;
  items?: {
    data?: Array<{
      quantity?: number;
      price?: {
        id?: string;
        nickname?: string | null;
        unit_amount?: number | null;
        currency?: string | null;
        recurring?: { interval?: string | null } | null;
        product?: any;
      };
    }>;
  };
};

function normalizeId(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function priceEnv(key: string) {
  const v = process.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function titleForSubscription(opts: {
  sub: StripeSubscription;
  nurtureBySubId: Map<string, string>;
}): string {
  const bySub = opts.nurtureBySubId.get(opts.sub.id);
  if (bySub) return `Nurture Campaign: ${bySub}`;

  const map = new Map<string, string>();
  map.set(priceEnv("STRIPE_PRICE_BLOG_AUTOMATION"), "Automated Blogs");
  map.set(priceEnv("STRIPE_PRICE_BOOKING_AUTOMATION"), "Booking Automation");
  map.set(priceEnv("STRIPE_PRICE_CRM_AUTOMATION"), "Follow-up Automation");
  map.set(priceEnv("STRIPE_PRICE_LEAD_OUTBOUND"), "AI Outbound");
  map.set(priceEnv("STRIPE_PRICE_NURTURE_CAMPAIGN_MONTHLY"), "Nurture Campaigns");

  for (const item of opts.sub.items?.data ?? []) {
    const priceId = normalizeId(item.price?.id);
    if (priceId && map.has(priceId)) return map.get(priceId)!;
  }

  const productName =
    opts.sub.items?.data?.[0]?.price?.product && typeof opts.sub.items.data[0].price?.product?.name === "string"
      ? String(opts.sub.items.data[0].price?.product?.name)
      : "";
  if (productName) return productName;

  const nickname = typeof opts.sub.items?.data?.[0]?.price?.nickname === "string" ? opts.sub.items.data[0].price?.nickname : "";
  if (nickname) return nickname;

  return "Subscription";
}

export async function GET() {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const email = auth.session.user.email;
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: true, configured: false, subscriptions: [] as any[] });
  }

  if (!email) {
    return NextResponse.json({ ok: true, configured: true, subscriptions: [] as any[] });
  }

  const ownerId = auth.session.user.id;

  const nurtureCampaigns = await prisma.portalNurtureCampaign
    .findMany({ where: { ownerId }, select: { id: true, name: true, stripeSubscriptionId: true } })
    .catch(() => [] as Array<{ id: string; name: string; stripeSubscriptionId: string | null }>);

  const nurtureBySubId = new Map<string, string>();
  for (const c of nurtureCampaigns) {
    const id = normalizeId(c.stripeSubscriptionId);
    if (id) nurtureBySubId.set(id, String(c.name || "Campaign"));
  }

  const customer = await getOrCreateStripeCustomerId(email);

  const subs = await stripeGet<{ data: StripeSubscription[] }>("/v1/subscriptions", {
    customer,
    status: "all",
    limit: 100,
    "expand[]": ["data.items.data.price", "data.items.data.price.product"],
  });

  const active = subs.data.filter((s) => ["active", "trialing", "past_due"].includes(String(s.status)));

  return NextResponse.json({
    ok: true,
    configured: true,
    subscriptions: active.map((s) => {
      const currency = String(s.currency || (s.items?.data?.[0]?.price?.currency ?? "usd")).toLowerCase();
      return {
        id: s.id,
        title: titleForSubscription({ sub: s, nurtureBySubId }),
        status: String(s.status),
        cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
        currentPeriodEnd: typeof s.current_period_end === "number" ? s.current_period_end : null,
        currency,
        items:
          (s.items?.data ?? []).map((it) => ({
            quantity: typeof it.quantity === "number" ? it.quantity : 1,
            priceId: normalizeId(it.price?.id),
            unitAmount: typeof it.price?.unit_amount === "number" ? it.price.unit_amount : null,
            interval: typeof it.price?.recurring?.interval === "string" ? it.price.recurring.interval : null,
          })) ?? [],
      };
    }),
  });
}
