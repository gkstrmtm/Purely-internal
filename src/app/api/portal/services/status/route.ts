import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { getPortalServiceStatusesForOwner } from "@/lib/portalServicesStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const portalVariant = (auth.session.user as any).portalVariant;

  try {
    const result = await getPortalServiceStatusesForOwner({
      ownerId,
      fallbackEmail: auth.session.user.email,
      portalVariant,
    });

    return NextResponse.json({
      ok: true,
      ownerId: result.ownerId,
      billingModel: result.billingModel,
      entitlements: result.entitlements,
      statuses: result.statuses,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Temporarily unavailable", statuses: null }, { status: 200 });
  }
}
