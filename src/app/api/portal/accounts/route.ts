import { NextResponse } from "next/server";

import { getPortalUser } from "@/lib/portalAuth";
import { listAccessiblePortalAccounts } from "@/lib/portalAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getPortalUser({ variant: "auto" }).catch(() => null);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const ownerId = String(user.id || "").trim();
  const memberId = String(user.memberId || user.id || "").trim();
  const variant = user.portalVariant ?? "portal";

  const accounts = await listAccessiblePortalAccounts({
    memberId,
    currentOwnerId: ownerId,
    variant,
  }).catch(() => []);

  return NextResponse.json({
    ok: true,
    ownerId,
    memberId,
    variant,
    accounts,
  });
}