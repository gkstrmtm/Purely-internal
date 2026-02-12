import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { isStripeConfigured, stripePost, getOrCreateStripeCustomerId } from "@/lib/stripeFetch";
import {
  monthlyTotalUsd,
  oneTimeTotalUsd,
  planById,
  planQuantity,
  ONBOARDING_UPFRONT_PAID_PLAN_IDS,
} from "@/lib/portalOnboardingWizardCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  planIds: z.array(z.string()).max(20),
  planQuantities: z.record(z.string(), z.number().int().min(0).max(50)).optional(),
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

  const allowed = new Set<string>(ONBOARDING_UPFRONT_PAID_PLAN_IDS as unknown as string[]);
  const raw = parsed.data.planIds.map((s) => s.trim()).filter(Boolean);
  const unique = Array.from(new Set(raw)).filter((id) => allowed.has(id));

  // Always include Core.
  if (!unique.includes("core")) unique.unshift("core");

  // Prevent selecting both lead-scraping plans at once.
  if (unique.includes("lead-scraping-b2b") && unique.includes("lead-scraping-b2c")) {
    // Prefer the more expensive plan.
    const filtered = unique.filter((id) => id !== "lead-scraping-b2b");
    unique.splice(0, unique.length, ...filtered);
  }

  const origin = originFromReq(req);
  const successUrl = `${origin}/portal/get-started/complete?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/portal/get-started?checkout=cancel`;

  const customer = await getOrCreateStripeCustomerId(email);

  const params: Record<string, unknown> = {
    mode: "subscription",
    customer,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    "subscription_data[metadata][ownerId]": ownerId,
    "subscription_data[metadata][source]": "portal_get_started",
    "subscription_data[metadata][planIds]": unique.join(","),
  };

  const quantities = parsed.data.planQuantities ?? {};
  const qtyById: Record<string, number> = {};
  for (const planId of unique) {
    const plan = planById(planId);
    if (!plan) continue;
    qtyById[planId] = planQuantity(plan, quantities);
  }

  const qtyMeta = unique
    .map((id) => `${id}=${typeof qtyById[id] === "number" ? qtyById[id] : 1}`)
    .join(";")
    .slice(0, 480);
  params["subscription_data[metadata][planQuantities]"] = qtyMeta;

  let idx = 0;
  for (const planId of unique) {
    const plan = planById(planId);
    if (!plan) continue;

    const qty = typeof qtyById[planId] === "number" ? qtyById[planId] : 1;

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

  const totalMonthly = monthlyTotalUsd(unique, qtyById);
  const totalOneTime = oneTimeTotalUsd(unique, qtyById);
  const totalDueToday = totalMonthly + totalOneTime;
  if (!totalDueToday || totalDueToday <= 0 || idx === 0) {
    return NextResponse.json({ ok: false, error: "No billable items selected" }, { status: 400 });
  }

  try {
    const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);
    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
