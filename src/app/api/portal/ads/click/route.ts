import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import type { PortalVariant } from "@/lib/portalVariant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function detectDeviceFromUserAgent(ua: string | null): "mobile" | "desktop" {
  const s = String(ua || "");
  if (!s) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry/i.test(s) ? "mobile" : "desktop";
}

function asPlacement(v: string | null): "SIDEBAR_BANNER" | "TOP_BANNER" | "BILLING_SPONSORED" | "FULLSCREEN_REWARD" | "POPUP_CARD" | null {
  if (v === "SIDEBAR_BANNER" || v === "TOP_BANNER" || v === "BILLING_SPONSORED" || v === "FULLSCREEN_REWARD" || v === "POPUP_CARD") return v;
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
  }

  return NextResponse.redirect(toAbsoluteRedirectUrl(redirectTo, req.url));
}
