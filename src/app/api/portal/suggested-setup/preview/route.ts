import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { buildSuggestedSetupPreviewForOwner } from "@/lib/suggestedSetup/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const { entitlements, preview } = await buildSuggestedSetupPreviewForOwner(ownerId);

  return NextResponse.json({
    ok: true,
    entitlements,
    activationProfile: preview.activationProfile,
    proposedActions: preview.proposedActions,
  });
}
