import { NextResponse } from "next/server";

import { requirePortalUser } from "@/lib/portalAuth";
import { portalBasePath } from "@/lib/portalVariant";
import { getAppBaseUrl } from "@/lib/portalNotifications";
import { getOrCreatePortalReferralCode, getPortalReferralStats } from "@/lib/portalReferrals.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const user = await requirePortalUser();

  const { code } = await getOrCreatePortalReferralCode({ ownerId: user.id, req });
  const stats = await getPortalReferralStats(user.id);

  const base = getAppBaseUrl();
  const portalBase = portalBasePath(user.portalVariant ?? "portal");
  const url = new URL(`${portalBase}/get-started`, base);
  url.searchParams.set("ref", code);

  return NextResponse.json({ ok: true, code, url: url.toString(), stats });
}
