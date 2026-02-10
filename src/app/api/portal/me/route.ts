import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { normalizePortalPermissions } from "@/lib/portalPermissions";

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
  const memberId = (auth.session.user as any).memberId || ownerId;

  if (memberId === ownerId) {
    return NextResponse.json({
      ok: true,
      ownerId,
      memberId,
      role: "OWNER" as const,
      permissions: normalizePortalPermissions({}, "OWNER"),
    });
  }

  const row = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId, userId: memberId } },
    select: { role: true, permissionsJson: true },
  });

  const roleRaw = typeof row?.role === "string" ? String(row.role) : null;
  const role = roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : null;
  if (!role) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    ownerId,
    memberId,
    role,
    permissions: normalizePortalPermissions(row?.permissionsJson, role),
  });
}
