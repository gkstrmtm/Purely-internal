import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import type { PortalVariant } from "@/lib/portalVariant";
import { getPortalAdCampaignForOwnerById } from "@/lib/portalAdCampaigns.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readBodyNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const portalVariant = (((auth.session.user as any).portalVariant as PortalVariant | undefined) ?? "portal") as PortalVariant;

  const body = (await req.json().catch(() => null)) as any;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const path = typeof body?.path === "string" ? body.path.trim() : null;

  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "Missing campaignId" }, { status: 400 });
  }

  const watchedSecondsRaw = readBodyNumber(body?.watchedSeconds);
  const watchedSeconds = watchedSecondsRaw == null ? 0 : Math.max(0, Math.floor(watchedSecondsRaw));

  const campaign = await getPortalAdCampaignForOwnerById({ ownerId, portalVariant, campaignId, path });
  if (!campaign) {
    return NextResponse.json({ ok: false, error: "Campaign not available." }, { status: 404 });
  }

  const reward = campaign.reward ?? null;
  const credits = Math.max(0, Math.floor(Number(reward?.credits || 0)));
  const cooldownHours = Math.max(0, Math.floor(Number(reward?.cooldownHours || 0)));
  const minWatchSeconds = Math.max(0, Math.floor(Number(reward?.minWatchSeconds || 0)));

  if (!credits) {
    return NextResponse.json({ ok: false, error: "This campaign has no reward." }, { status: 400 });
  }

  if (minWatchSeconds && watchedSeconds < minWatchSeconds) {
    return NextResponse.json(
      { ok: false, error: `Watch at least ${minWatchSeconds}s to claim.` },
      { status: 400 },
    );
  }

  const now = new Date();
  const cooldownMs = cooldownHours > 0 ? cooldownHours * 60 * 60 * 1000 : 0;

  const result = await prisma.$transaction(async (tx) => {
    if (cooldownMs) {
      const last = await tx.portalAdCampaignEvent.findFirst({
        where: { ownerId, campaignId, kind: "CLAIM" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      if (last?.createdAt) {
        const dt = now.getTime() - last.createdAt.getTime();
        if (dt < cooldownMs) {
          const nextAt = new Date(last.createdAt.getTime() + cooldownMs);
          return { ok: false as const, nextAtIso: nextAt.toISOString() };
        }
      }
    }

    await tx.portalAdCampaignEvent.create({
      data: {
        ownerId,
        campaignId,
        kind: "CLAIM",
        metaJson: { watchedSeconds, path },
      },
      select: { id: true },
    });

    const creditsRow = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: "credits" } },
      select: { dataJson: true },
    });

    const rec =
      creditsRow?.dataJson && typeof creditsRow.dataJson === "object" && !Array.isArray(creditsRow.dataJson)
        ? (creditsRow.dataJson as Record<string, unknown>)
        : {};
    const prevBalanceRaw = typeof rec.balance === "number" ? rec.balance : 0;
    const prevBalance = Number.isFinite(prevBalanceRaw) ? Math.max(0, Math.floor(prevBalanceRaw)) : 0;
    const autoTopUp = Boolean(rec.autoTopUp);

    const nextBalance = prevBalance + credits;
    const nextCreditsState = { balance: nextBalance, autoTopUp };

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: "credits" } },
      create: { ownerId, serviceSlug: "credits", status: "COMPLETE", dataJson: nextCreditsState },
      update: { status: "COMPLETE", dataJson: nextCreditsState },
      select: { id: true },
    });

    const nextAtIso = cooldownMs ? new Date(now.getTime() + cooldownMs).toISOString() : null;
    return { ok: true as const, creditsAdded: credits, balance: nextBalance, nextAtIso };
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Already claimed recently.", nextAtIso: result.nextAtIso },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true, creditsAdded: result.creditsAdded, balance: result.balance, nextAtIso: result.nextAtIso });
}
