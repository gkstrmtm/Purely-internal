import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getNextPortalAdCampaignForOwner, type PortalAdPlacement } from "@/lib/portalAdCampaigns.server";
import { signHostedAdsToken, type HostedAdsPlacement } from "@/lib/hostedAdsToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function detectDeviceFromUserAgent(ua: string | null): "mobile" | "desktop" {
  const s = String(ua || "");
  if (!s) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry/i.test(s) ? "mobile" : "desktop";
}

function normalizeDomain(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

function asPlacement(v: string | null): HostedAdsPlacement | null {
  if (v === "HOSTED_BLOG_PAGE" || v === "HOSTED_REVIEWS_PAGE") return v;
  return null;
}

async function resolveOwnerIdFromHandle(handleRaw: string): Promise<string | null> {
  const handle = String(handleRaw || "").trim().toLowerCase();
  if (!handle) return null;

  // Prefer ClientBlogSite.slug if it exists.
  const canUseClientBlogSiteSlug = await hasPublicColumn("ClientBlogSite", "slug").catch(() => false);
  if (canUseClientBlogSiteSlug) {
    const bySlug = await (prisma.clientBlogSite as any)
      .findFirst({ where: { slug: handle }, select: { ownerId: true }, take: 1 })
      .catch(() => null);
    if (bySlug?.ownerId) return String(bySlug.ownerId);
  }

  // Fallback: handle might be the site id.
  const byId = await (prisma.clientBlogSite as any)
    .findUnique({ where: { id: handle }, select: { ownerId: true } })
    .catch(() => null);
  if (byId?.ownerId) return String(byId.ownerId);

  // Fallback: booking site slug.
  const booking = await prisma.portalBookingSite
    .findFirst({ where: { slug: handle }, select: { ownerId: true }, take: 1 })
    .catch(() => null);
  if (booking?.ownerId) return String(booking.ownerId);

  // Last resort: stored blog slug (PortalServiceSetup JSON).
  const stored = await findOwnerIdByStoredBlogSiteSlug(handle).catch(() => null);
  return stored ? String(stored) : null;
}

async function resolveOwnerId(req: Request, siteSlug: string | null, domain: string | null): Promise<string | null> {
  const explicitDomain = domain ? normalizeDomain(domain) : "";
  if (explicitDomain) {
    const mapping = await resolveCustomDomain(explicitDomain);
    if (mapping?.ownerId && mapping.status === "VERIFIED") return String(mapping.ownerId);
    return null;
  }

  const slug = String(siteSlug || "").trim();
  if (slug) {
    const ownerId = await resolveOwnerIdFromHandle(slug);
    if (ownerId) return ownerId;
  }

  // Finally: infer from request host header.
  const host = normalizeDomain(req.headers.get("host"));
  if (host) {
    const mapping = await resolveCustomDomain(host);
    if (mapping?.ownerId && mapping.status === "VERIFIED") return String(mapping.ownerId);
  }

  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const placement = asPlacement(url.searchParams.get("placement"));
  const path = (url.searchParams.get("path") || "").trim().slice(0, 500) || null;
  const excludeParam = (url.searchParams.get("exclude") || "").trim();
  const excludeCampaignIds = excludeParam
    ? excludeParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];

  const siteSlug = (url.searchParams.get("siteSlug") || "").trim().slice(0, 120) || null;
  const domain = (url.searchParams.get("domain") || "").trim().slice(0, 200) || null;

  if (!placement) {
    return NextResponse.json({ ok: false, error: "Invalid placement" }, { status: 400 });
  }

  const ownerId = await resolveOwnerId(req, siteSlug, domain);
  if (!ownerId) {
    return NextResponse.json({ ok: true, campaign: null }, { status: 200 });
  }

  const campaign = await getNextPortalAdCampaignForOwner({
    ownerId,
    portalVariant: "portal",
    placement: placement as PortalAdPlacement,
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
          metaJson: {
            action: "IMPRESSION",
            viewer: "public",
            placement,
            path,
            device,
            userAgent,
            siteSlug,
            domain,
          },
        },
        select: { id: true },
      })
      .catch(() => null);
  }

  const clickUrl = (() => {
    if (!campaign?.id) return null;

    const exp = Date.now() + 60 * 60 * 1000; // 1h
    const token = signHostedAdsToken({
      v: 1,
      campaignId: campaign.id,
      ownerId,
      placement,
      path,
      exp,
    });
    if (!token) return null;

    const qs = new URLSearchParams();
    qs.set("t", token);
    return `/api/public/hosted-ads/click?${qs.toString()}`;
  })();

  return NextResponse.json({ ok: true, campaign: campaign ?? null, clickUrl });
}
