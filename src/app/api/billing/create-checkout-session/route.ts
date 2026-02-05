import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";

const bodySchema = z.object({
  priceId: z.string().min(1),
  successPath: z.string().min(1).optional(),
  cancelPath: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const successUrl = new URL(parsed.data.successPath ?? "/portal?checkout=success", origin).toString();
  const cancelUrl = new URL(parsed.data.cancelPath ?? "/portal?checkout=cancel", origin).toString();

  const email = session.user.email;
  if (!email) {
    return NextResponse.json({ error: "Missing user email" }, { status: 400 });
  }

  try {
    const customer = await getOrCreateStripeCustomerId(email);

    const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", {
      mode: "subscription",
      customer,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price]": parsed.data.priceId,
      "line_items[0][quantity]": 1,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
