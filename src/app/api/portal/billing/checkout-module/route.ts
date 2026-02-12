import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  module: z.enum(["blog", "booking", "crm", "leadOutbound"]),
  successPath: z.string().min(1).optional(),
  cancelPath: z.string().min(1).optional(),
});

function priceIdForModule(module: "blog" | "booking" | "crm" | "leadOutbound") {
  if (module === "blog") return process.env.STRIPE_PRICE_BLOG_AUTOMATION ?? "";
  if (module === "booking") return process.env.STRIPE_PRICE_BOOKING_AUTOMATION ?? "";
  if (module === "crm") return process.env.STRIPE_PRICE_CRM_AUTOMATION ?? "";
  return process.env.STRIPE_PRICE_LEAD_OUTBOUND ?? "";
}

function originFromReq(req: Request) {
  return (
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const priceId = priceIdForModule(parsed.data.module).trim();
  if (!priceId) {
    return NextResponse.json({ error: "That service is not for sale yet" }, { status: 400 });
  }

  const email = auth.session.user.email;
  if (!email) {
    return NextResponse.json({ error: "Missing user email" }, { status: 400 });
  }

  const origin = originFromReq(req);
  const successUrl = new URL(parsed.data.successPath ?? "/portal/app/billing?checkout=success", origin).toString();
  const cancelUrl = new URL(parsed.data.cancelPath ?? "/portal/app/billing?checkout=cancel", origin).toString();

  try {
    const customer = await getOrCreateStripeCustomerId(email);

    const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", {
      mode: "subscription",
      customer,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      allow_promotion_codes: true,
      "subscription_data[metadata][ownerId]": auth.session.user.id,
      "subscription_data[metadata][source]": "portal_billing_addon",
      "subscription_data[metadata][module]": parsed.data.module,
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
