import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export async function GET() {
  const user = await requireAdsUser();

  const account = await prisma.adsAdvertiserAccount
    .findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        balanceCents: true,
        currency: true,
        autoTopUpEnabled: true,
        autoTopUpThresholdCents: true,
        autoTopUpAmountCents: true,
      },
    })
    .catch(() => null);

  const accountId = account?.id || null;
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [campaignsTotal, campaignsEnabled, spendToday, spend7d, topups30d, chargedClicksToday, chargedClicks7d] =
    await Promise.all([
      prisma.portalAdCampaign.count({ where: { createdById: user.id } }).catch(() => 0),
      prisma.portalAdCampaign.count({ where: { createdById: user.id, enabled: true, reviewStatus: "APPROVED" } }).catch(() => 0),
      accountId
        ? prisma.adsAdvertiserLedgerEntry
            .aggregate({ where: { accountId, kind: "SPEND", createdAt: { gte: todayStart } }, _sum: { amountCents: true } })
            .catch(() => null)
        : null,
      accountId
        ? prisma.adsAdvertiserLedgerEntry
            .aggregate({ where: { accountId, kind: "SPEND", createdAt: { gte: sevenDaysAgo } }, _sum: { amountCents: true } })
            .catch(() => null)
        : null,
      accountId
        ? prisma.adsAdvertiserLedgerEntry
            .aggregate({ where: { accountId, kind: "TOPUP", createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }, _sum: { amountCents: true } })
            .catch(() => null)
        : null,
      accountId
        ? prisma.adsAdvertiserLedgerEntry.count({ where: { accountId, kind: "SPEND", createdAt: { gte: todayStart } } }).catch(() => 0)
        : 0,
      accountId
        ? prisma.adsAdvertiserLedgerEntry.count({ where: { accountId, kind: "SPEND", createdAt: { gte: sevenDaysAgo } } }).catch(() => 0)
        : 0,
    ]);

  return NextResponse.json({
    ok: true,
    nowIso: now.toISOString(),
    account: account
      ? {
          balanceCents: account.balanceCents,
          currency: account.currency,
          autoTopUpEnabled: account.autoTopUpEnabled,
          autoTopUpThresholdCents: account.autoTopUpThresholdCents,
          autoTopUpAmountCents: account.autoTopUpAmountCents,
        }
      : {
          balanceCents: 0,
          currency: "USD",
          autoTopUpEnabled: true,
          autoTopUpThresholdCents: 2000,
          autoTopUpAmountCents: 5000,
        },
    campaigns: { total: campaignsTotal, enabled: campaignsEnabled },
    spend: {
      todayCents: Number(spendToday?._sum?.amountCents || 0),
      last7dCents: Number(spend7d?._sum?.amountCents || 0),
    },
    topups: {
      last30dCents: Number(topups30d?._sum?.amountCents || 0),
    },
    clicks: {
      chargedToday: chargedClicksToday,
      chargedLast7d: chargedClicks7d,
    },
  });
}
