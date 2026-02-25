import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { addCredits } from "@/lib/credits";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import type { PortalVariant } from "@/lib/portalVariant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const REWARD_SLUG = "__portal_ads_reward";

function readIsoDate(dataJson: unknown, key: string): Date | null {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return null;
  const raw = (dataJson as any)[key];
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function POST() {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const portalVariant = ((auth.session.user as any).portalVariant as PortalVariant | undefined) ?? "portal";

  const billingModel = await getPortalBillingModelForOwner({ ownerId, portalVariant });
  if (!isCreditsOnlyBilling(billingModel)) {
    return NextResponse.json({ ok: false, error: "Ad rewards are only available in credits-only mode." }, { status: 400 });
  }

  const rewardCreditsRaw = Number(process.env.PORTAL_AD_REWARD_CREDITS ?? 25);
  const rewardCredits = Number.isFinite(rewardCreditsRaw) ? Math.max(1, Math.floor(rewardCreditsRaw)) : 25;

  const now = new Date();
  const cooldownMs = 24 * 60 * 60 * 1000;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: REWARD_SLUG } },
      select: { id: true, dataJson: true },
    });

    const lastClaimAt = readIsoDate(existing?.dataJson, "lastClaimAtIso");
    if (lastClaimAt && now.getTime() - lastClaimAt.getTime() < cooldownMs) {
      const nextAt = new Date(lastClaimAt.getTime() + cooldownMs);
      return { ok: false as const, nextAtIso: nextAt.toISOString() };
    }

    const nextData = {
      version: 1,
      lastClaimAtIso: now.toISOString(),
      rewardCredits,
      updatedAtIso: now.toISOString(),
    };

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: REWARD_SLUG } },
      create: { ownerId, serviceSlug: REWARD_SLUG, status: "COMPLETE", dataJson: nextData },
      update: { status: "COMPLETE", dataJson: nextData },
      select: { id: true },
    });

    const state = await addCredits(ownerId, rewardCredits);

    return { ok: true as const, creditsAdded: rewardCredits, balance: state.balance };
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Already claimed recently.", nextAtIso: result.nextAtIso },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true, creditsAdded: result.creditsAdded, balance: result.balance });
}
