import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { addCredits } from "@/lib/credits";
import { isFreeCreditsOwner } from "@/lib/credits";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  packages: z.number().int().min(1).max(20).default(1),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const email = auth.session.user.email;

  const free = await isFreeCreditsOwner(ownerId).catch(() => false);
  if (free) {
    return NextResponse.json({ ok: true, mode: "free", credited: 0, creditsPerPackage: creditsPerTopUpPackage() });
  }

  const priceId = (process.env.STRIPE_PRICE_CREDITS_TOPUP ?? "").trim();
  const stripeReady = isStripeConfigured() && Boolean(priceId) && Boolean(email);

  // Dev/test fallback: allow adding credits without Stripe.
  if (!stripeReady) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Purchasing credits is unavailable right now." }, { status: 400 });
    }

    const credited = parsed.data.packages * creditsPerTopUpPackage();
    const state = await addCredits(ownerId, credited);
    return NextResponse.json({ ok: true, mode: "test", credited, credits: state.balance, creditsPerPackage: creditsPerTopUpPackage() });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const customer = await getOrCreateStripeCustomerId(String(email));

  const successUrl = new URL("/portal/app/billing?topup=success", origin).toString();
  const cancelUrl = new URL("/portal/app/billing?topup=cancel", origin).toString();

  const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", {
    mode: "payment",
    customer,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": parsed.data.packages,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ ok: true, mode: "stripe", url: checkout.url });
}
