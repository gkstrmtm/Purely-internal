import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getPortalAccountMemberRole } from "@/lib/portalAccounts";
import { normalizePortalPermissions, portalPermissionsInputSchema } from "@/lib/portalPermissions";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    permissions: portalPermissionsInputSchema.optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  // Only the owner or an ADMIN member can edit permissions.
  const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
  if (myRole !== "OWNER" && myRole !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  const targetUserId = String(userId || "").trim();
  if (!targetUserId) return NextResponse.json({ ok: false, error: "Invalid user" }, { status: 400 });
  if (targetUserId === ownerId) {
    return NextResponse.json({ ok: false, error: "Owner permissions cannot be changed." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  // Keep role the same; only update permissionsJson.
  const existing = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId, userId: targetUserId } },
    select: { role: true },
  });

  const roleRaw = typeof existing?.role === "string" ? String(existing.role) : null;
  const role = roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : "MEMBER";

  const permissionsJson = normalizePortalPermissions(parsed.data.permissions, role);

  await (prisma as any).portalAccountMember.update({
    where: { ownerId_userId: { ownerId, userId: targetUserId } },
    data: { permissionsJson },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
