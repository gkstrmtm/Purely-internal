import { prisma } from "@/lib/db";
import type { CreditsState } from "@/lib/credits";
import { consumeCredits } from "@/lib/credits";

const MONTHLY_CAMPAIGN_CREDITS = 29;
const PENDING_TTL_MS = 10 * 60 * 1000;
const FAILED_RETRY_AFTER_MS = 10 * 60 * 1000;

function periodKeyForDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type EnsureNurtureMonthlyChargeResult =
  | { ok: true; alreadyCharged: boolean; periodKey: string }
  | { ok: false; reason: "insufficient_credits"; periodKey: string; state: CreditsState }
  | { ok: false; reason: "pending" | "failed_recent"; periodKey: string };

export async function ensureNurtureCampaignMonthlyCharge(params: {
  ownerId: string;
  campaignId: string;
  now?: Date;
}): Promise<EnsureNurtureMonthlyChargeResult> {
  const now = params.now ?? new Date();
  const periodKey = periodKeyForDate(now);

  const existing = await prisma.portalNurtureCampaignMonthlyCharge
    .findUnique({
      where: { campaignId_periodKey: { campaignId: params.campaignId, periodKey } },
      select: { id: true, status: true, updatedAt: true },
    })
    .catch(() => null);

  if (existing?.status === "CHARGED") {
    return { ok: true, alreadyCharged: true, periodKey };
  }

  const updatedAtMs = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const ageMs = updatedAtMs ? Math.max(0, now.getTime() - updatedAtMs) : Number.POSITIVE_INFINITY;

  if (existing?.status === "PENDING") {
    if (ageMs < PENDING_TTL_MS) return { ok: false, reason: "pending", periodKey };
  }

  if (existing?.status === "FAILED") {
    if (ageMs < FAILED_RETRY_AFTER_MS) return { ok: false, reason: "failed_recent", periodKey };

    const claimed = await prisma.portalNurtureCampaignMonthlyCharge.updateMany({
      where: { id: existing.id, status: "FAILED" },
      data: { status: "PENDING", lastError: null },
    });

    if (!claimed.count) return { ok: false, reason: "pending", periodKey };
  }

  let chargeId = existing?.id ?? "";
  let created = false;

  if (!existing) {
    try {
      const row = await prisma.portalNurtureCampaignMonthlyCharge.create({
        data: {
          ownerId: params.ownerId,
          campaignId: params.campaignId,
          periodKey,
          status: "PENDING",
          credits: MONTHLY_CAMPAIGN_CREDITS,
          chargedAt: null,
          lastError: null,
        },
        select: { id: true },
      });
      chargeId = row.id;
      created = true;
    } catch {
      // Likely a race (unique constraint). Re-fetch and treat accordingly.
      const row = await prisma.portalNurtureCampaignMonthlyCharge
        .findUnique({
          where: { campaignId_periodKey: { campaignId: params.campaignId, periodKey } },
          select: { status: true },
        })
        .catch(() => null);

      if (row?.status === "CHARGED") return { ok: true, alreadyCharged: true, periodKey };
      return { ok: false, reason: "pending", periodKey };
    }
  }

  if (existing?.status === "PENDING" && !created) {
    // Another worker is already charging.
    return { ok: false, reason: "pending", periodKey };
  }

  const consumed = await consumeCredits(params.ownerId, MONTHLY_CAMPAIGN_CREDITS);
  if (!consumed.ok) {
    await prisma.portalNurtureCampaignMonthlyCharge
      .updateMany({
        where: { id: chargeId, status: "PENDING" },
        data: { status: "FAILED", lastError: "Insufficient credits" },
      })
      .catch(() => null);

    return { ok: false, reason: "insufficient_credits", periodKey, state: consumed.state };
  }

  await prisma.portalNurtureCampaignMonthlyCharge
    .updateMany({
      where: { id: chargeId, status: "PENDING" },
      data: { status: "CHARGED", chargedAt: now, credits: MONTHLY_CAMPAIGN_CREDITS, lastError: null },
    })
    .catch(() => null);

  return { ok: true, alreadyCharged: false, periodKey };
}
