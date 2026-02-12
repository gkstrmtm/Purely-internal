import { NextResponse } from "next/server";

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
        recurring?: { interval?: string | null } | null;
        product?: any;
      };
    }>;
  };
};

type StripeInvoice = {
  id: string;
  status?: string;
  paid?: boolean;
  currency?: string;
  amount_paid?: number;
  created?: number;
};

type StripePaymentIntent = {
  id: string;
  status?: string;
  currency?: string;
  amount?: number;
  created?: number;
  invoice?: string | null;
};

function startOfMonthUnix(now = new Date()): number {
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime() / 1000);
}

function normalizeId(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function titleForSubscription(sub: StripeSubscription): string {
  const productName =
    sub.items?.data?.[0]?.price?.product && typeof sub.items.data[0].price?.product?.name === "string"
      ? String(sub.items.data[0].price.product.name)
      : "";
  if (productName) return productName;

  const nickname = typeof sub.items?.data?.[0]?.price?.nickname === "string" ? String(sub.items.data[0].price.nickname) : "";
  if (nickname) return nickname;

  const priceId = normalizeId(sub.items?.data?.[0]?.price?.id);
  if (priceId) return `Subscription (${priceId})`;

  return "Subscription";
}

export async function GET() {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const email = auth.session.user.email;

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  if (!email) {
    return NextResponse.json({
      ok: true,
      configured: true,
      monthlyCents: 0,
      currency: "usd",
      spentThisMonthCents: 0,
      spentThisMonthCurrency: "usd",
      monthlyBreakdown: [] as Array<{ subscriptionId: string; title: string; monthlyCents: number; currency: string }>,
    });
  }

  try {
    const customer = await getOrCreateStripeCustomerId(email);

    const subs = await stripeGet<{ data: StripeSubscription[] }>("/v1/subscriptions", {
      customer,
      status: "all",
      limit: 25,
      "expand[]": "data.items.data.price",
    });

    const active = subs.data.filter((s) => ["active", "trialing", "past_due"].includes(String(s.status)));

    let monthlyCents = 0;
    const monthlyBreakdown: Array<{ subscriptionId: string; title: string; monthlyCents: number; currency: string }> = [];

    for (const sub of active) {
      const currency = (sub.currency || "usd").toLowerCase();
      let subMonthly = 0;

      for (const item of sub.items?.data ?? []) {
        const qty = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1;
        const unit = item.price?.unit_amount;
        const interval = item.price?.recurring?.interval;
        if (typeof unit !== "number") continue;
        if (interval && interval !== "month") continue;
        subMonthly += unit * qty;
      }

      monthlyCents += subMonthly;
      monthlyBreakdown.push({
        subscriptionId: sub.id,
        title: titleForSubscription(sub),
        monthlyCents: subMonthly,
        currency,
      });
    }

    const currency = (monthlyBreakdown[0]?.currency || "usd").toLowerCase();

    const monthStart = startOfMonthUnix();

    const invoices = await stripeGet<{ data: StripeInvoice[] }>("/v1/invoices", {
      customer,
      limit: 100,
      "created[gte]": String(monthStart),
    }).catch(() => ({ data: [] as StripeInvoice[] }));

    let spentFromInvoices = 0;
    let spentCurrency = currency;
    for (const inv of invoices.data ?? []) {
      const paid = Boolean(inv.paid) || String(inv.status || "").toLowerCase() === "paid";
      if (!paid) continue;
      const amt = typeof inv.amount_paid === "number" ? inv.amount_paid : 0;
      if (amt > 0) spentFromInvoices += amt;
      if (!spentCurrency && typeof inv.currency === "string") spentCurrency = inv.currency.toLowerCase();
    }

    const paymentIntents = await stripeGet<{ data: StripePaymentIntent[] }>("/v1/payment_intents", {
      customer,
      limit: 100,
      "created[gte]": String(monthStart),
    }).catch(() => ({ data: [] as StripePaymentIntent[] }));

    let spentFromNonInvoicePis = 0;
    for (const pi of paymentIntents.data ?? []) {
      if (pi && pi.invoice) continue; // avoid double counting invoice-backed payments
      const ok = String(pi.status || "").toLowerCase() === "succeeded";
      if (!ok) continue;
      const amt = typeof pi.amount === "number" ? pi.amount : 0;
      if (amt > 0) spentFromNonInvoicePis += amt;
      if (!spentCurrency && typeof pi.currency === "string") spentCurrency = pi.currency.toLowerCase();
    }

    const spentThisMonthCents = spentFromInvoices + spentFromNonInvoicePis;

    const representative = active[0];
    const subscription = representative
      ? {
          id: representative.id,
          status: String(representative.status),
          cancelAtPeriodEnd: Boolean(representative.cancel_at_period_end),
          currentPeriodEnd: typeof representative.current_period_end === "number" ? representative.current_period_end : null,
        }
      : undefined;

    return NextResponse.json({
      ok: true,
      configured: true,
      monthlyCents,
      currency,
      spentThisMonthCents,
      spentThisMonthCurrency: (spentCurrency || currency || "usd").toLowerCase(),
      monthlyBreakdown,
      subscription,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: "Failed to load billing summary",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 200 },
    );
  }
}
