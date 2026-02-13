import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { addCredits } from "@/lib/credits";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    credits: z.number().int().min(1).max(500_000).optional(),
    // Backwards compatibility (legacy UI).
    packages: z.number().int().min(1).max(200).optional(),
  })
  .refine((v) => typeof v.credits === "number" || typeof v.packages === "number", {
    message: "credits is required",
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

  const priceId = (process.env.STRIPE_PRICE_CREDITS_TOPUP ?? "").trim();
  const stripeReady = isStripeConfigured() && Boolean(email);

  const creditsPerPackage = creditsPerTopUpPackage();
  const requestedCredits =
    typeof parsed.data.credits === "number" ? parsed.data.credits : Math.max(1, parsed.data.packages ?? 1) * creditsPerPackage;

  // Dev/test fallback: allow adding credits without Stripe.
  if (!stripeReady) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Purchasing credits is unavailable right now." }, { status: 400 });
    }

    const credited = requestedCredits;
    const state = await addCredits(ownerId, credited);

    const baseUrl = getAppBaseUrl();
    void tryNotifyPortalAccountUsers({
      ownerId,
      kind: "credits_purchased",
      subject: `Credits added (test mode): ${credited}`,
      text: [`Credits were added to your account (test mode).`, "", `Credits: ${credited}`, "", `Open billing: ${baseUrl}/portal/app/billing`].join("\n"),
    }).catch(() => null);

    return NextResponse.json({ ok: true, mode: "test", credited, credits: state.balance, creditsPerPackage: creditsPerTopUpPackage() });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const customer = await getOrCreateStripeCustomerId(String(email));

  const successUrl = new URL(
    "/portal/app/billing?topup=success&session_id={CHECKOUT_SESSION_ID}",
    origin,
  ).toString();
  const cancelUrl = new URL("/portal/app/billing?topup=cancel", origin).toString();

  const unitAmountCents = requestedCredits * 10;

  const params: Record<string, unknown> = {
    mode: "payment",
    customer,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    "metadata[kind]": "credits_topup",
    "metadata[ownerId]": ownerId,
    "metadata[credits]": String(requestedCredits),
    "metadata[packages]": String(parsed.data.packages ?? ""),
    "metadata[creditsPerPackage]": String(creditsPerPackage),
  };

  // Always create an inline price so Checkout displays the correct credit quantity.
  // (Using a static Stripe Price with quantity leads to misleading labels like "25 credits".)
  void priceId; // kept for compatibility with existing env/config
  params["line_items[0][price_data][currency]"] = "usd";
  params["line_items[0][price_data][unit_amount]"] = unitAmountCents;
  params["line_items[0][price_data][product_data][name]"] = `${requestedCredits} credits`;
  params["line_items[0][quantity]"] = 1;

  const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);

  return NextResponse.json({ ok: true, mode: "stripe", url: checkout.url });
}
