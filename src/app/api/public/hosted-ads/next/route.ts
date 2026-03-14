import { NextResponse } from "next/server";

import crypto from "crypto";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getNextPortalAdCampaignForOwner, type PortalAdPlacement } from "@/lib/portalAdCampaigns.server";
import { signHostedAdsToken, type HostedAdsPlacement } from "@/lib/hostedAdsToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOSTED_ADS_VIEWER_COOKIE = "pa_hadv";

function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "";
}

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashViewerPart(input: string): string {
  const secret =
    process.env.HOSTED_ADS_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "";
  const mac = crypto
    .createHmac("sha256", secret || "hosted_ads")
    .update(input)
    .digest();
  return base64UrlEncode(mac).slice(0, 32);
}

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

  let viewerHashForToken: string | null = null;
  if (campaign?.id) {
    const userAgent = req.headers.get("user-agent");
    const device = detectDeviceFromUserAgent(userAgent);

    const ip = getClientIp(req);
    const ipHash = ip ? hashViewerPart(`ip:${ip}`) : null;
    const uaHash = userAgent ? hashViewerPart(`ua:${userAgent}`) : null;
    viewerHashForToken = hashViewerPart(`vh:${ipHash || ""}:${uaHash || ""}`);
    const dedupKey = ipHash ? `imp:v1:${campaign.id}:${placement}:${ipHash}` : null;

    // Best-effort impression dedupe to reduce bot spam and DB churn.
    let shouldLog = true;
    if (dedupKey) {
      try {
        const windowStart = new Date(Date.now() - 30 * 1000);
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          select exists(
            select 1
            from "PortalAdCampaignEvent" e
            where e."campaignId" = ${campaign.id}
              and e."ownerId" = ${ownerId}
              and e."kind" = 'IMPRESSION'
              and e."createdAt" >= ${windowStart}
              and (e."metaJson"->>'action') = 'IMPRESSION'
              and (e."metaJson"->>'viewer') = 'public'
              and (e."metaJson"->>'dedupKey') = ${dedupKey}
            limit 1
          ) as "exists";
        `;
        if (rows?.[0]?.exists) shouldLog = false;
      } catch {
        // ignore
      }
    }

    if (shouldLog) {
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
              ipHash,
              uaHash,
              dedupKey,
            },
          },
          select: { id: true },
        })
        .catch(() => null);
    }
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
      vh: viewerHashForToken,
      exp,
    });
    if (!token) return null;

    const qs = new URLSearchParams();
    qs.set("t", token);
    return `/api/public/hosted-ads/click?${qs.toString()}`;
  })();

  const res = NextResponse.json({ ok: true, campaign: campaign ?? null, clickUrl });
  if (viewerHashForToken) {
    res.cookies.set(HOSTED_ADS_VIEWER_COOKIE, viewerHashForToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/public/hosted-ads",
      maxAge: 10 * 60,
    });
  }
  return res;
}
