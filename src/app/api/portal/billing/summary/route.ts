import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
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
        unit_amount?: number | null;
        recurring?: { interval?: string | null } | null;
      };
    }>;
  };
};

export async function GET() {
  const auth = await requireClientSession();
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
    return NextResponse.json({ ok: true, configured: true, monthlyCents: 0, currency: "usd" });
  }

  try {
    const customer = await getOrCreateStripeCustomerId(email);
    const subs = await stripeGet<{ data: StripeSubscription[] }>("/v1/subscriptions", {
      customer,
      status: "all",
      limit: 25,
      "expand[]": "data.items.data.price",
    });

    const active = subs.data.find((s) =>
      ["active", "trialing", "past_due"].includes(String(s.status)),
    );

    if (!active) {
      return NextResponse.json({ ok: true, configured: true, monthlyCents: 0, currency: "usd" });
    }

    const currency = (active.currency || "usd").toLowerCase();

    let monthlyCents = 0;
    for (const item of active.items?.data ?? []) {
      const qty = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1;
      const unit = item.price?.unit_amount;
      const interval = item.price?.recurring?.interval;

      if (typeof unit !== "number") continue;
      if (interval && interval !== "month") continue;

      monthlyCents += unit * qty;
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      monthlyCents,
      currency,
      subscription: {
        id: active.id,
        status: String(active.status),
        cancelAtPeriodEnd: Boolean(active.cancel_at_period_end),
        currentPeriodEnd: typeof active.current_period_end === "number" ? active.current_period_end : null,
      },
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
