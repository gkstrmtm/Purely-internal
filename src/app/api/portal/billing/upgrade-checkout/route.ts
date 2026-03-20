import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";
import { planById, planQuantity } from "@/lib/portalOnboardingWizardCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  bundleId: z.enum(["launch-kit", "sales-loop", "brand-builder"]),
});

type BundleId = z.infer<typeof bodySchema>["bundleId"];

function bundlePlanIds(id: BundleId): string[] {
  switch (id) {
    case "launch-kit":
      return ["core", "automations", "ai-receptionist", "blogs"];
    case "sales-loop":
      return ["core", "booking", "ai-receptionist", "lead-scraping-b2b", "ai-outbound"];
    case "brand-builder":
      return ["core", "blogs", "reviews", "newsletter", "nurture"];
    default:
      return ["core"];
  }
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
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
  const email = String(owner?.email || auth.session.user.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing user email" }, { status: 400 });
  }

  const planIds = bundlePlanIds(parsed.data.bundleId);
  if (!planIds.includes("core")) planIds.unshift("core");

  const quantities: Record<string, number> = {};
  for (const id of planIds) {
    const p = planById(id);
    if (!p?.quantityConfig) continue;
    quantities[id] = planQuantity(p, quantities);
  }

  // Ensure onboarding-confirm can flip billing model + activate services.
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "onboarding-intake" } },
    create: {
      ownerId,
      serviceSlug: "onboarding-intake",
      status: "COMPLETE",
      dataJson: {
        billingPreference: "subscription",
        selectedPlanIds: planIds,
        selectedPlanQuantities: quantities,
        couponCode: "",
        updatedAt: new Date().toISOString(),
      },
    },
    update: {
      status: "COMPLETE",
      dataJson: {
        billingPreference: "subscription",
        selectedPlanIds: planIds,
        selectedPlanQuantities: quantities,
        couponCode: "",
        updatedAt: new Date().toISOString(),
      },
    },
    select: { id: true },
  });

  const origin = originFromReq(req);
  const successUrl = `${origin}/portal/app/billing/upgrade/complete?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/portal/app/billing/upgrade?checkout=cancel`;

  const customer = await getOrCreateStripeCustomerId(email);

  const params: Record<string, unknown> = {
    mode: "subscription",
    customer,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    "subscription_data[metadata][ownerId]": ownerId,
    "subscription_data[metadata][source]": "portal_billing_upgrade",
    "subscription_data[metadata][bundleId]": parsed.data.bundleId,
    "subscription_data[metadata][planIds]": planIds.join(","),
  };

  let idx = 0;
  for (const planId of planIds) {
    const plan = planById(planId);
    if (!plan) continue;
    const qty = typeof quantities[planId] === "number" ? quantities[planId] : 1;

    if (plan.oneTimeUsd && plan.oneTimeUsd > 0) {
      const cents = Math.round(plan.oneTimeUsd * 100);
      params[`line_items[${idx}][quantity]`] = qty;
      params[`line_items[${idx}][price_data][currency]`] = "usd";
      params[`line_items[${idx}][price_data][unit_amount]`] = cents;
      params[`line_items[${idx}][price_data][product_data][name]`] = `${plan.title} setup`;
      params[`line_items[${idx}][price_data][product_data][description]`] = plan.description.slice(0, 450);
      params[`line_items[${idx}][price_data][product_data][metadata][planId]`] = planId;
      params[`line_items[${idx}][price_data][product_data][metadata][kind]`] = "setup";
      idx += 1;
    }

    if (!plan.monthlyUsd || plan.monthlyUsd <= 0) continue;

    const cents = Math.round(plan.monthlyUsd * 100);
    params[`line_items[${idx}][quantity]`] = qty;
    params[`line_items[${idx}][price_data][currency]`] = "usd";
    params[`line_items[${idx}][price_data][unit_amount]`] = cents;
    params[`line_items[${idx}][price_data][recurring][interval]`] = "month";
    params[`line_items[${idx}][price_data][product_data][name]`] = plan.title;
    params[`line_items[${idx}][price_data][product_data][description]`] = plan.description.slice(0, 450);
    params[`line_items[${idx}][price_data][product_data][metadata][planId]`] = planId;
    idx += 1;
  }

  if (idx === 0) {
    return NextResponse.json({ ok: false, error: "No billable items selected" }, { status: 400 });
  }

  try {
    const checkout = await stripePost<{ url: string; id: string }>("/v1/checkout/sessions", params);
    return NextResponse.json({ ok: true, url: checkout.url, sessionId: checkout.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
