import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyHostedAdsToken } from "@/lib/hostedAdsToken";
import { getPortalAdCampaignForOwnerById, type PortalAdPlacement } from "@/lib/portalAdCampaigns.server";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function detectDeviceFromUserAgent(ua: string | null): "mobile" | "desktop" {
  const s = String(ua || "");
  if (!s) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry/i.test(s) ? "mobile" : "desktop";
}

function safeRedirectUrl(raw: string | null, fallback: string) {
  const v = String(raw || "").trim();
  if (!v) return fallback;

  if (v.startsWith("/")) return v;

  try {
    const u = new URL(v);
    if (u.protocol === "https:") return u.toString();
  } catch {
    // ignore
  }

  return fallback;
}

function toAbsoluteRedirectUrl(raw: string, reqUrl: string) {
  const v = String(raw || "").trim();
  if (v.startsWith("/")) return new URL(v, reqUrl);
  return new URL(v);
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
  const url = new URL(req.url);
  const tokenRaw = (url.searchParams.get("t") || "").trim();
  const token = verifyHostedAdsToken(tokenRaw);

  if (!token) {
    return NextResponse.redirect(toAbsoluteRedirectUrl("/", req.url));
  }

  if (Date.now() > token.exp) {
    return NextResponse.redirect(toAbsoluteRedirectUrl("/", req.url));
  }

  const ownerId = token.ownerId;
  const campaignId = token.campaignId;
  const placement = token.placement as PortalAdPlacement;
  const path = token.path || null;

  const campaign = await getPortalAdCampaignForOwnerById({
    ownerId,
    portalVariant: "portal",
    campaignId,
    path,
  });

  const to = safeRedirectUrl(campaign?.creative?.linkUrl ?? null, "/");

  if (campaign?.id) {
    const userAgent = req.headers.get("user-agent");
    const device = detectDeviceFromUserAgent(userAgent);

    await prisma.portalAdCampaignEvent
      .create({
        data: {
          campaignId: campaign.id,
          ownerId,
          kind: "IMPRESSION",
          metaJson: { action: "CLICK", viewer: "public", placement, path, device, userAgent, to },
        },
        select: { id: true },
      })
      .catch(() => null);

    // Best-effort CPC billing: same logic as the portal click endpoint, but marked as public.
    try {
      const row = await prisma.portalAdCampaign.findUnique({
        where: { id: campaignId },
        select: { createdById: true, targetJson: true },
      });

      const advertiserUserId = String(row?.createdById || "").trim();
      const billing = readCpcBillingFromTarget(row?.targetJson);

      if (advertiserUserId && billing) {
        const now = new Date();
        const dayStart = startOfUtcDay(now);

        await prisma.$transaction(async (tx) => {
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
            if (isStripeConfigured() && String(account.currency || "USD").toUpperCase() === "USD") {
              const advertiser = await tx.user
                .findUnique({ where: { id: advertiserUserId }, select: { email: true } })
                .catch(() => null);
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
              metaJson: { source: "hosted_public_click", placement, path, ownerId },
            },
            select: { id: true },
          });
        });
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.redirect(toAbsoluteRedirectUrl(to, req.url));
}
