import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { buildSuggestedSetupPreviewForOwner } from "@/lib/suggestedSetup/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Suggested setup should be available anywhere in the portal. Gate it on Profile access
  // (members have this by default), not Business Profile (members do not).
  const auth = await requireClientSessionForService("profile", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = ((auth as any).access?.ownerId as string | undefined) || auth.session.user.id;

  try {
    const { entitlements, preview } = await buildSuggestedSetupPreviewForOwner(ownerId);

    return NextResponse.json({
      ok: true,
      entitlements,
      activationProfile: preview.activationProfile,
      proposedActions: preview.proposedActions,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to load suggested setup" },
      { status: 500 },
    );
  }
}
