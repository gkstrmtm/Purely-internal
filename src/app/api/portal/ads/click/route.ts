import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import type { PortalVariant } from "@/lib/portalVariant";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function detectDeviceFromUserAgent(ua: string | null): "mobile" | "desktop" {
  const s = String(ua || "");
  if (!s) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry/i.test(s) ? "mobile" : "desktop";
}

function asPlacement(
  v: string | null,
):
  | "SIDEBAR_BANNER"
  | "TOP_BANNER"
  | "BILLING_SPONSORED"
  | "FULLSCREEN_REWARD"
  | "POPUP_CARD"
  | "HOSTED_BLOG_PAGE"
  | "HOSTED_REVIEWS_PAGE"
  | null {
  if (
    v === "SIDEBAR_BANNER" ||
    v === "TOP_BANNER" ||
    v === "BILLING_SPONSORED" ||
    v === "FULLSCREEN_REWARD" ||
    v === "POPUP_CARD" ||
    v === "HOSTED_BLOG_PAGE" ||
    v === "HOSTED_REVIEWS_PAGE"
  )
    return v;
  return null;
}

function safeRedirectUrl(raw: string | null, fallback: string) {
  const v = String(raw || "").trim();
  if (!v) return fallback;

  // Allow relative URLs (preferred).
  if (v.startsWith("/")) return v;

  // Allow https absolute URLs.
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return u.toString();
  } catch {
    // ignore
  }

  return fallback;
}

function normalizePortalVariantPath(path: string, portalVariant: PortalVariant): string {
  const s = String(path || "").trim();
  if (!s.startsWith("/")) return s;

  const basePath = portalVariant === "credit" ? "/credit" : "/portal";

  if (s === "/portal" || s.startsWith("/portal/")) return basePath + s.slice("/portal".length);
  if (s === "/credit" || s.startsWith("/credit/")) return basePath + s.slice("/credit".length);

  if (s === "/app" || s.startsWith("/app/")) return basePath + s;

  return s;
}

function toAbsoluteRedirectUrl(raw: string, reqUrl: string) {
  const v = String(raw || "").trim();
  if (v.startsWith("/")) return new URL(v, reqUrl);
  return new URL(v);
}

function readDiscountOffer(rewardJson: unknown): { promoCode: string; appliesToServiceSlugs: string[] } | null {
  if (!rewardJson || typeof rewardJson !== "object" || Array.isArray(rewardJson)) return null;
  const offers = (rewardJson as any).offers;
  if (!Array.isArray(offers)) return null;

  for (const o of offers) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    if (String((o as any).kind || "") !== "discount") continue;
    const promoCode = String((o as any).promoCode || "").trim().slice(0, 64);
    const appliesToServiceSlugs = Array.isArray((o as any).appliesToServiceSlugs)
      ? (o as any).appliesToServiceSlugs.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 50)
      : [];
    return { promoCode, appliesToServiceSlugs };
  }

  return null;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function readCpcBillingFromTarget(targetJson: unknown): { dailyBudgetCents: number; costPerClickCents: number } | null {
  if (!targetJson || typeof targetJson !== "object" || Array.isArray(targetJson)) return null;
  const billing = (targetJson as any).billing;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) return null;

  const modelRaw = typeof (billing as any).model === "string" ? String((billing as any).model).trim().toLowerCase() : "";
  if (modelRaw !== "cpc") return null;

  const dailyRaw =
    typeof (billing as any).dailyBudgetCents === "number"
      ? (billing as any).dailyBudgetCents
      : typeof (billing as any).dailyBudgetCents === "string"
        ? Number((billing as any).dailyBudgetCents)
        : NaN;
  const cpcRaw =
    typeof (billing as any).costPerClickCents === "number"
      ? (billing as any).costPerClickCents
      : typeof (billing as any).costPerClickCents === "string"
        ? Number((billing as any).costPerClickCents)
        : NaN;

  const dailyBudgetCents = Number.isFinite(dailyRaw) ? Math.max(0, Math.min(1_000_000_00, Math.floor(dailyRaw))) : 0;
  const costPerClickCents = Number.isFinite(cpcRaw) ? Math.max(1, Math.min(50_000, Math.floor(cpcRaw))) : 0;
  if (!costPerClickCents) return null;

  return { dailyBudgetCents, costPerClickCents };
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const campaignId = (url.searchParams.get("campaignId") || "").trim();
  const placement = asPlacement(url.searchParams.get("placement"));
  const path = (url.searchParams.get("path") || "").trim() || null;
  const to = url.searchParams.get("to");

  const ownerId = auth.session.user.id;
  const portalVariant = (((auth.session.user as any).portalVariant as PortalVariant | undefined) ?? "portal") as PortalVariant;

  const fallback = portalVariant === "credit" ? "/credit/app/billing" : "/portal/app/billing";

  // Prefer an explicit `to=` override (client passes the exact URL it rendered),
  // but normalize it for the current portal variant.
  let redirectTo = normalizePortalVariantPath(safeRedirectUrl(to, fallback), portalVariant);

  // If this campaign includes a discount offer and the configured link points at Billing,
  // route users to a dedicated discount checkout flow that pre-applies the promo code.
  if (campaignId && placement) {
    const row = await prisma.portalAdCampaign
      .findUnique({ where: { id: campaignId }, select: { rewardJson: true } })
      .catch(() => null);

    const discount = readDiscountOffer(row?.rewardJson);
    const billingBase = portalVariant === "credit" ? "/credit/app/billing" : "/portal/app/billing";
    if (discount && (redirectTo === billingBase || redirectTo.startsWith(billingBase + "?"))) {
      const basePath = portalVariant === "credit" ? "/credit" : "/portal";
      const serviceSlug = String(discount.appliesToServiceSlugs?.[0] || "").trim();
      const hasServices = (discount.appliesToServiceSlugs || []).length > 0;
      if (serviceSlug) {
        const qs = new URLSearchParams();
        if (discount.promoCode) qs.set("promoCode", discount.promoCode);
        qs.set("campaignId", campaignId);
        redirectTo = `${basePath}/app/discount/${encodeURIComponent(serviceSlug)}?${qs.toString()}`;
      } else if (hasServices) {
        const qs = new URLSearchParams();
        if (discount.promoCode) qs.set("promoCode", discount.promoCode);
        qs.set("services", discount.appliesToServiceSlugs.join(","));
        qs.set("campaignId", campaignId);
        redirectTo = `${basePath}/app/discount?${qs.toString()}`;
      }
    }
  }

  if (campaignId && placement) {
    const userAgent = req.headers.get("user-agent");
    const device = detectDeviceFromUserAgent(userAgent);

    await prisma.portalAdCampaignEvent
      .create({
        data: {
          campaignId,
          ownerId,
          kind: "IMPRESSION",
          metaJson: { action: "CLICK", placement, path, device, userAgent, to: redirectTo },
        },
        select: { id: true },
      })
      .catch(() => null);

    // Best-effort CPC billing: decrement advertiser balance and record spend.
    // This never blocks the redirect.
    try {
      const campaign = await prisma.portalAdCampaign.findUnique({
        where: { id: campaignId },
        select: { createdById: true, targetJson: true },
      });

      const advertiserUserId = String(campaign?.createdById || "").trim();
      const billing = readCpcBillingFromTarget(campaign?.targetJson);

      if (advertiserUserId && billing) {
        const now = new Date();
        const dayStart = startOfUtcDay(now);

        await prisma.$transaction(async (tx) => {
          // Prevent duplicate auto-topups for the same advertiser under concurrency.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ads_auto_topup:${advertiserUserId}`})::bigint)`;

          const account = await tx.adsAdvertiserAccount.upsert({
            where: { userId: advertiserUserId },
            update: {},
            create: { userId: advertiserUserId },
            select: {
              id: true,
              balanceCents: true,
              autoTopUpEnabled: true,
              autoTopUpThresholdCents: true,
              autoTopUpAmountCents: true,
              currency: true,
            },
          });

          let balanceCents = account.balanceCents;
          if (
            account.autoTopUpEnabled &&
            account.autoTopUpAmountCents > 0 &&
            balanceCents < Math.max(0, account.autoTopUpThresholdCents)
          ) {
            // Never add funds without charging Stripe.
            if (isStripeConfigured() && String(account.currency || "USD").toUpperCase() === "USD") {
              const advertiser = await tx.user.findUnique({ where: { id: advertiserUserId }, select: { email: true } }).catch(() => null);
              const email = normalizeEmail(advertiser?.email);
              if (email) {
                try {
                  const customerId = await getOrCreateStripeCustomerId(email);
                  const customer = await stripeGet<any>(`/v1/customers/${encodeURIComponent(customerId)}`);

                  const paymentMethod =
                    typeof customer?.invoice_settings?.default_payment_method === "string"
                      ? customer.invoice_settings.default_payment_method
                      : typeof customer?.default_source === "string"
                        ? customer.default_source
                        : "";

                  if (paymentMethod) {
                    const pi = await stripePost<any>("/v1/payment_intents", {
                      amount: account.autoTopUpAmountCents,
                      currency: "usd",
                      customer: customerId,
                      payment_method: paymentMethod,
                      off_session: true,
                      confirm: true,
                      description: `Purely Automation ads auto top-up ($${(account.autoTopUpAmountCents / 100).toFixed(2)})`,
                      "metadata[kind]": "ads_auto_topup",
                      "metadata[advertiserUserId]": advertiserUserId,
                      "metadata[reason]": "balance_below_threshold",
                    });

                    const paymentIntentId = typeof pi?.id === "string" ? pi.id : null;

                    await tx.adsAdvertiserAccount.update({
                      where: { id: account.id },
                      data: { balanceCents: { increment: account.autoTopUpAmountCents } },
                      select: { id: true },
                    });

                    await tx.adsAdvertiserLedgerEntry.create({
                      data: {
                        accountId: account.id,
                        kind: "TOPUP",
                        amountCents: account.autoTopUpAmountCents,
                        metaJson: { source: "stripe_auto_topup", reason: "balance_below_threshold", paymentIntentId },
                      },
                      select: { id: true },
                    });

                    balanceCents += account.autoTopUpAmountCents;
                  }
                } catch {
                  // ignore
                }
              }
            }
          }

          if (balanceCents < billing.costPerClickCents) return;

          if (billing.dailyBudgetCents > 0) {
            const sum = await tx.adsAdvertiserLedgerEntry.aggregate({
              where: { campaignId, kind: "SPEND", createdAt: { gte: dayStart } },
              _sum: { amountCents: true },
            });
            const spentToday = Number(sum?._sum?.amountCents || 0);
            if (spentToday + billing.costPerClickCents > billing.dailyBudgetCents) return;
          }

          const updated = await tx.adsAdvertiserAccount.updateMany({
            where: { id: account.id, balanceCents: { gte: billing.costPerClickCents } },
            data: { balanceCents: { decrement: billing.costPerClickCents } },
          });
          if (!updated.count) return;

          await tx.adsAdvertiserLedgerEntry.create({
            data: {
              accountId: account.id,
              kind: "SPEND",
              amountCents: billing.costPerClickCents,
              campaignId,
              metaJson: { source: "portal_click", placement, path, ownerId },
            },
            select: { id: true },
          });
        });
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.redirect(toAbsoluteRedirectUrl(redirectTo, req.url));
}
