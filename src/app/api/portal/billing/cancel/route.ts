import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import {
  getOrCreateStripeCustomerId,
  isStripeConfigured,
  stripeDelete,
  stripeGet,
  stripePost,
} from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  immediate: z.boolean().optional(),
});

type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
};

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  const email = auth.session.user.email;
  if (!email) {
    return NextResponse.json({ error: "Missing user email" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const customer = await getOrCreateStripeCustomerId(email);

    const subs = await stripeGet<{ data: StripeSubscription[] }>("/v1/subscriptions", {
      customer,
      status: "all",
      limit: 25,
    });

    const active = subs.data.find((s) =>
      ["active", "trialing", "past_due"].includes(String(s.status)),
    );

    if (!active) {
      return NextResponse.json({ ok: true, canceled: false, message: "No active subscription" });
    }

    if (parsed.data.immediate) {
      await stripeDelete(`/v1/subscriptions/${active.id}`);
      return NextResponse.json({ ok: true, canceled: true, immediate: true });
    }

    await stripePost(`/v1/subscriptions/${active.id}`, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({ ok: true, canceled: true, immediate: false });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to cancel subscription",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
