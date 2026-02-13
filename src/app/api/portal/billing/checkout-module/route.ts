import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";
import { moduleByKey, usdToCents } from "@/lib/portalModulesCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  module: z.enum([
    "blog",
    "booking",
    "automations",
    "reviews",
    "newsletter",
    "nurture",
    "aiReceptionist",
    "leadScraping",
    "crm",
    "leadOutbound",
  ]),
  successPath: z.string().min(1).optional(),
  cancelPath: z.string().min(1).optional(),
});

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

  const moduleItem = moduleByKey(parsed.data.module);
  const monthlyCents = usdToCents(moduleItem.monthlyUsd);
  const setupCents = usdToCents(moduleItem.setupUsd);
  if (!monthlyCents || monthlyCents <= 0) {
    return NextResponse.json({ error: "Invalid module pricing" }, { status: 400 });
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

    const params: Record<string, unknown> = {
      mode: "subscription",
      customer,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      "subscription_data[metadata][ownerId]": auth.session.user.id,
      "subscription_data[metadata][source]": "portal_billing_addon",
      "subscription_data[metadata][module]": parsed.data.module,
    };

    let idx = 0;
    if (setupCents && setupCents > 0) {
      params[`line_items[${idx}][quantity]`] = 1;
      params[`line_items[${idx}][price_data][currency]`] = "usd";
      params[`line_items[${idx}][price_data][unit_amount]`] = setupCents;
      params[`line_items[${idx}][price_data][product_data][name]`] = `${moduleItem.title} setup`;
      params[`line_items[${idx}][price_data][product_data][description]`] = moduleItem.description.slice(0, 450);
      params[`line_items[${idx}][price_data][product_data][metadata][module]`] = parsed.data.module;
      params[`line_items[${idx}][price_data][product_data][metadata][kind]`] = "setup";
      idx += 1;
    }

    params[`line_items[${idx}][quantity]`] = 1;
    params[`line_items[${idx}][price_data][currency]`] = "usd";
    params[`line_items[${idx}][price_data][unit_amount]`] = monthlyCents;
    params[`line_items[${idx}][price_data][recurring][interval]`] = "month";
    params[`line_items[${idx}][price_data][product_data][name]`] = moduleItem.title;
    params[`line_items[${idx}][price_data][product_data][description]`] = moduleItem.description.slice(0, 450);
    params[`line_items[${idx}][price_data][product_data][metadata][module]`] = parsed.data.module;

    const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
