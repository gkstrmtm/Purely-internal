import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  getOrCreateStripeCustomerId,
  isStripeConfigured,
  stripeDelete,
  stripeGet,
  stripePost,
} from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    subscriptionId: z.string().trim().min(1),
    immediate: z.boolean().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured" }, { status: 400 });
  }

  const email = auth.session.user.email;
  if (!email) return NextResponse.json({ ok: false, error: "Missing user email" }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const customer = await getOrCreateStripeCustomerId(email);
  const subId = parsed.data.subscriptionId;

  try {
    const sub = await stripeGet<any>(`/v1/subscriptions/${encodeURIComponent(subId)}`);
    const subCustomer = typeof sub?.customer === "string" ? sub.customer : "";
    if (!subCustomer || subCustomer !== customer) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (parsed.data.immediate) {
      await stripeDelete(`/v1/subscriptions/${subId}`);
      return NextResponse.json({ ok: true, canceled: true, immediate: true });
    }

    await stripePost(`/v1/subscriptions/${subId}`, { cancel_at_period_end: true });
    return NextResponse.json({ ok: true, canceled: true, immediate: false });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Failed to cancel subscription", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 502 },
    );
  }
}
