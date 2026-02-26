import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
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

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("billing");
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
  const redirectTo = safeRedirectUrl(to, fallback);

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

  return NextResponse.redirect(redirectTo);
}
