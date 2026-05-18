import { NextResponse } from "next/server";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DELETED_ACCOUNT_SETUP_SLUG = "__portal_deleted_account";

export async function DELETE(_req: Request, { params }: { params: Promise<{ ownerId: string }> }) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: platformAdminAuthError(auth.status) }, { status: auth.status });
  }

  const ownerId = String((await params)?.ownerId || "").trim();
  if (!ownerId) return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });

  if (auth.userId === ownerId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, name: true, role: true, active: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // This route is intended for deleting client portal accounts.
  // Keep it narrow to avoid accidentally scrubbing employee accounts.
  if (user.role !== "CLIENT") {
    return NextResponse.json({ error: "Only client accounts can be deleted from portal overrides." }, { status: 400 });
  }

  // We cannot hard-delete the row safely (FK restricts would cascade across many portal tables).
  // Instead we:
  // - store a tombstone record containing the original identity (so it remains visible in overrides)
  // - deactivate the user
  // - replace the unique email with a deterministic tombstone email so the original email can be re-used for a new signup
  const originalEmail = String(user.email || "").trim().toLowerCase();
  const originalName = String(user.name || "").trim();
  const deletedAtIso = new Date().toISOString();
  const tombstoneEmail = `deleted+${user.id}@purelyautomation.invalid`;

  await prisma.$transaction(async (tx) => {
    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: DELETED_ACCOUNT_SETUP_SLUG } },
      update: {
        status: "COMPLETE",
        dataJson: {
          version: 1,
          deletedAtIso,
          deletedByUserId: auth.userId,
          originalEmail,
          originalName,
        } as any,
      },
      create: {
        ownerId: user.id,
        serviceSlug: DELETED_ACCOUNT_SETUP_SLUG,
        status: "COMPLETE",
        dataJson: {
          version: 1,
          deletedAtIso,
          deletedByUserId: auth.userId,
          originalEmail,
          originalName,
        } as any,
      },
      select: { id: true },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        active: false,
        email: tombstoneEmail,
        name: originalName ? `[Deleted] ${originalName}`.slice(0, 120) : "[Deleted]",
      },
      select: { id: true },
    });
  });

  return NextResponse.json({ ok: true });
}
