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
    role: z.enum(["ADMIN", "MEMBER"]).optional(),
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

  const existing = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId, userId: targetUserId } },
    select: { role: true, permissionsJson: true },
  });

  const roleRaw = typeof existing?.role === "string" ? String(existing.role) : null;
  const role = roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : "MEMBER";

  const nextRole = parsed.data.role ?? role;
  if (nextRole !== "ADMIN" && nextRole !== "MEMBER") {
    return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
  }

  const nextPermissionsJson =
    nextRole === "ADMIN"
      ? null
      : normalizePortalPermissions(
          parsed.data.permissions !== undefined ? parsed.data.permissions : (existing?.permissionsJson as any),
          nextRole,
        );

  await (prisma as any).portalAccountMember.update({
    where: { ownerId_userId: { ownerId, userId: targetUserId } },
    data: { role: nextRole, permissionsJson: nextPermissionsJson },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
  if (myRole !== "OWNER" && myRole !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  const targetUserId = String(userId || "").trim();
  if (!targetUserId) return NextResponse.json({ ok: false, error: "Invalid user" }, { status: 400 });
  if (targetUserId === ownerId) {
    return NextResponse.json({ ok: false, error: "Owner cannot be removed." }, { status: 400 });
  }
  if (targetUserId === memberId) {
    return NextResponse.json({ ok: false, error: "You can’t remove yourself." }, { status: 400 });
  }

  const deleted = await (prisma as any).portalAccountMember.deleteMany({
    where: { ownerId, userId: targetUserId },
  });

  if (!deleted?.count) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
