import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import type { PortalVariant } from "@/lib/portalVariant";
import { getNextPortalAdCampaignForOwner, type PortalAdPlacement } from "@/lib/portalAdCampaigns.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function detectDeviceFromUserAgent(ua: string | null): "mobile" | "desktop" {
  const s = String(ua || "");
  if (!s) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry/i.test(s) ? "mobile" : "desktop";
}

function asPlacement(v: string | null): PortalAdPlacement | null {
  if (v === "SIDEBAR_BANNER" || v === "TOP_BANNER" || v === "BILLING_SPONSORED" || v === "FULLSCREEN_REWARD" || v === "POPUP_CARD") return v;
  return null;
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const placement = asPlacement(url.searchParams.get("placement"));
  const path = (url.searchParams.get("path") || "").trim() || null;
  const excludeParam = (url.searchParams.get("exclude") || "").trim();
  const excludeCampaignIds = excludeParam ? excludeParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200) : [];

  if (!placement) {
    return NextResponse.json(
      { ok: false, error: "Invalid placement" },
      { status: 400 },
    );
  }

  const ownerId = auth.session.user.id;
  const portalVariant = (((auth.session.user as any).portalVariant as PortalVariant | undefined) ?? "portal") as PortalVariant;

  const campaign = await getNextPortalAdCampaignForOwner({
    ownerId,
    portalVariant,
    placement,
    path,
    excludeCampaignIds,
  });

  if (campaign?.id) {
    const userAgent = req.headers.get("user-agent");
    const device = detectDeviceFromUserAgent(userAgent);
    await prisma.portalAdCampaignEvent
      .create({
        data: {
          campaignId: campaign.id,
          ownerId,
          kind: "IMPRESSION",
          metaJson: { action: "IMPRESSION", placement, path, device, userAgent },
        },
        select: { id: true },
      })
      .catch(() => null);
  }

  const reward = campaign?.reward ?? null;
  const credits = Math.max(0, Math.floor(Number(reward?.credits || 0)));
  const cooldownHours = Math.max(0, Math.floor(Number(reward?.cooldownHours || 0)));

  if (campaign?.id && credits > 0 && cooldownHours > 0) {
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const lastClaim = await prisma.portalAdCampaignEvent
      .findFirst({
        where: { ownerId, campaignId: campaign.id, kind: "CLAIM" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
      .catch(() => null);

    const nowMs = Date.now();
    const lastMs = lastClaim?.createdAt ? lastClaim.createdAt.getTime() : 0;
    const eligibleAtMs = lastMs ? lastMs + cooldownMs : 0;
    const eligible = !lastMs || nowMs >= eligibleAtMs;

    return NextResponse.json({
      ok: true,
      campaign,
      rewardStatus: {
        eligible,
        nextEligibleAtIso: eligible ? null : new Date(eligibleAtMs).toISOString(),
      },
    });
  }

  return NextResponse.json({ ok: true, campaign: campaign ?? null });
}
