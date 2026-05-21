import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { getPortalGrowthReadinessForOwner } from "@/lib/portalGrowthReadiness.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await requireClientSession();
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: auth.status },
      );
    }

    const workspaceVariant = (auth.session.user as any).portalVariant === "credit" ? "credit" : "portal";
    const payload = await getPortalGrowthReadinessForOwner({
      ownerId: auth.session.user.id,
      fallbackEmail: auth.session.user.email,
      workspaceVariant,
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("/api/portal/growth/readiness: failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load growth readiness" }, { status: 500 });
  }
}