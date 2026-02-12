import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    audienceTagIds: z.array(z.string().min(1)).max(100).optional(),
    smsFooter: z.string().max(300).optional(),
    emailFooter: z.string().max(2000).optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  await ensurePortalNurtureSchema();

  const campaign = await prisma.portalNurtureCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: {
      id: true,
      name: true,
      status: true,
      audienceTagIdsJson: true,
      smsFooter: true,
      emailFooter: true,
      createdAt: true,
      updatedAt: true,
      steps: {
        select: { id: true, ord: true, kind: true, delayMinutes: true, subject: true, body: true, updatedAt: true },
        orderBy: [{ ord: "asc" }],
      },
    },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const audienceTagIds =
    Array.isArray(campaign.audienceTagIdsJson) && campaign.audienceTagIdsJson.every((x) => typeof x === "string")
      ? (campaign.audienceTagIdsJson as string[])
      : [];

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      audienceTagIds,
      smsFooter: campaign.smsFooter,
      emailFooter: campaign.emailFooter,
      createdAtIso: campaign.createdAt.toISOString(),
      updatedAtIso: campaign.updatedAt.toISOString(),
      steps: campaign.steps.map((s) => ({
        id: s.id,
        ord: s.ord,
        kind: s.kind,
        delayMinutes: s.delayMinutes,
        subject: s.subject,
        body: s.body,
        updatedAtIso: s.updatedAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalNurtureSchema();

  const existing = await prisma.portalNurtureCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: { id: true, status: true, installPaidAt: true, stripeSubscriptionId: true },
  });

  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const now = new Date();

  const data: any = { updatedAt: now };
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.audienceTagIds !== undefined) data.audienceTagIdsJson = parsed.data.audienceTagIds;
  if (parsed.data.smsFooter !== undefined) data.smsFooter = parsed.data.smsFooter;
  if (parsed.data.emailFooter !== undefined) data.emailFooter = parsed.data.emailFooter;

  const nextStatus = parsed.data.status;
  const isActivating = nextStatus === "ACTIVE" && existing.status !== "ACTIVE";

  if (isActivating) {
    const email = auth.session.user.email;
    const installPriceId = (process.env.STRIPE_PRICE_NURTURE_CAMPAIGN_INSTALL ?? "").trim();
    const monthlyPriceId = (process.env.STRIPE_PRICE_NURTURE_CAMPAIGN_MONTHLY ?? "").trim();

    const stripeReady = Boolean(isStripeConfigured() && email && monthlyPriceId);
    if (process.env.NODE_ENV === "production" && !stripeReady) {
      return NextResponse.json({ ok: false, error: "Billing is unavailable right now." }, { status: 503 });
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    // If we already have a subscription id stored, verify it's active.
    if (stripeReady && existing.stripeSubscriptionId) {
      try {
        const sub = await stripeGet<any>(`/v1/subscriptions/${encodeURIComponent(String(existing.stripeSubscriptionId))}`);
        const status = String(sub?.status ?? "");
        if (["active", "trialing", "past_due"].includes(status)) {
          // ok
        } else {
          throw new Error("Subscription inactive");
        }
      } catch {
        // Fall through and create a new checkout session.
      }
    }

    // If subscription is missing or inactive, redirect to Stripe Checkout to purchase $29/mo per active campaign.
    if (stripeReady) {
      const includeInstall = !existing.installPaidAt;
      if (includeInstall && !installPriceId) {
        return NextResponse.json({ ok: false, error: "That service is not for sale yet" }, { status: 400 });
      }

      const customer = await getOrCreateStripeCustomerId(String(email));

      const successUrl = new URL(
        `/portal/app/services/nurture-campaigns?billing=success&campaignId=${encodeURIComponent(campaignId)}&session_id={CHECKOUT_SESSION_ID}`,
        origin,
      ).toString();
      const cancelUrl = new URL(
        `/portal/app/services/nurture-campaigns?billing=cancel&campaignId=${encodeURIComponent(campaignId)}`,
        origin,
      ).toString();

      const params: Record<string, unknown> = {
        mode: "subscription",
        customer,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        "metadata[kind]": includeInstall ? "nurture_install_and_monthly" : "nurture_monthly",
        "metadata[ownerId]": ownerId,
        "metadata[campaignId]": campaignId,
        "subscription_data[metadata][kind]": "nurture_campaign",
        "subscription_data[metadata][ownerId]": ownerId,
        "subscription_data[metadata][campaignId]": campaignId,
      };

      let i = 0;
      if (includeInstall) {
        params[`line_items[${i}][price]`] = installPriceId;
        params[`line_items[${i}][quantity]`] = 1;
        i += 1;
      }

      params[`line_items[${i}][price]`] = monthlyPriceId;
      params[`line_items[${i}][quantity]`] = 1;

      const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);

      return NextResponse.json(
        { ok: false, error: "Billing required", code: "BILLING_REQUIRED", url: checkout.url },
        { status: 402 },
      );
    }
  }

  const updated = await prisma.portalNurtureCampaign.updateMany({ where: { ownerId, id: campaignId }, data });

  if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  await ensurePortalNurtureSchema();

  await prisma.portalNurtureCampaign.deleteMany({ where: { ownerId, id: campaignId } });

  return NextResponse.json({ ok: true });
}
