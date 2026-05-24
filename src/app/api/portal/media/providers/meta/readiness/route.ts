import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getPortalMetaProviderReadiness } from "@/lib/portalMetaIntegration.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() || "portal";

  return NextResponse.json({
    ok: true,
    readiness: await getPortalMetaProviderReadiness(ownerId, {
      portalVariant,
      isOwnerSession: Boolean(ownerId && memberId === ownerId),
    }),
  });
}