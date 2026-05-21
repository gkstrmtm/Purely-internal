import { NextResponse } from "next/server";

import { clearMetaOauthConnection, getPortalMetaProviderReadiness } from "@/lib/portalMetaIntegration.server";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE() {
  const auth = await requireClientSessionForService("media", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() || "portal";
  if (!ownerId || memberId !== ownerId) {
    return NextResponse.json({ ok: false, error: "Only the account owner can disconnect Meta." }, { status: 403 });
  }

  await clearMetaOauthConnection(ownerId);
  const readiness = await getPortalMetaProviderReadiness(ownerId, { portalVariant, isOwnerSession: true });
  return NextResponse.json({ ok: true, note: "Meta disconnected.", readiness });
}