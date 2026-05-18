import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPlatformAdminCapability } from "@/lib/internalCapabilities";
import { isPlatformAdminGranted, platformAdminAuthError } from "@/lib/platformAdminGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DELETED_ACCOUNT_SETUP_SLUG = "__portal_deleted_account";

function parseDeletedAccountTombstone(dataJson: unknown): { originalEmail: string | null; originalName: string | null; deletedAtIso: string | null } {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) {
    return { originalEmail: null, originalName: null, deletedAtIso: null };
  }
  const record = dataJson as Record<string, unknown>;
  const originalEmail = typeof record.originalEmail === "string" ? record.originalEmail.trim().slice(0, 320) : "";
  const originalName = typeof record.originalName === "string" ? record.originalName.trim().slice(0, 200) : "";
  const deletedAtIso = typeof record.deletedAtIso === "string" ? record.deletedAtIso.trim().slice(0, 64) : "";
  return {
    originalEmail: originalEmail || null,
    originalName: originalName || null,
    deletedAtIso: deletedAtIso || null,
  };
}

async function requirePlatformAdmin(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const, userId: null as any };
  if (!hasPlatformAdminCapability(role, await isPlatformAdminGranted(userId).catch(() => false))) {
    return { ok: false as const, status: 403 as const, userId };
  }
  return { ok: true as const, status: 200 as const, userId };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ ownerId: string }> }) {
  const session = await getServerSession(authOptions);
  const auth = await requirePlatformAdmin(session);
  if (!auth.ok) {
    return NextResponse.json(
      { error: platformAdminAuthError(auth.status) },
      { status: auth.status },
    );
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

export async function PATCH(_req: Request, { params }: { params: Promise<{ ownerId: string }> }) {
  const session = await getServerSession(authOptions);
  const auth = await requirePlatformAdmin(session);
  if (!auth.ok) {
    return NextResponse.json(
      { error: platformAdminAuthError(auth.status) },
      { status: auth.status },
    );
  }

  const ownerId = String((await params)?.ownerId || "").trim();
  if (!ownerId) return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });

  const [user, tombstone] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, name: true, role: true, active: true } }),
    prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: DELETED_ACCOUNT_SETUP_SLUG } },
      select: { id: true, status: true, dataJson: true },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role !== "CLIENT") {
    return NextResponse.json({ error: "Only client accounts can be restored from portal overrides." }, { status: 400 });
  }
  if (!tombstone || tombstone.status !== "COMPLETE") {
    return NextResponse.json({ error: "This account is not archived." }, { status: 400 });
  }

  const parsed = parseDeletedAccountTombstone(tombstone.dataJson);
  const restoreEmail = String(parsed.originalEmail || "").trim().toLowerCase();
  const restoreName = String(parsed.originalName || "").trim() || user.name.replace(/^\[Deleted\]\s*/, "").trim() || "Portal User";

  if (!restoreEmail) {
    return NextResponse.json({ error: "Archived email is missing, so this account cannot be restored." }, { status: 400 });
  }

  const conflict = await prisma.user.findFirst({
    where: { email: restoreEmail, NOT: { id: ownerId } },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json({ error: "Original email is already in use. Restore is blocked." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: ownerId },
      data: {
        active: true,
        email: restoreEmail,
        name: restoreName,
      },
      select: { id: true },
    });

    const existingData = tombstone.dataJson && typeof tombstone.dataJson === "object" && !Array.isArray(tombstone.dataJson)
      ? (tombstone.dataJson as Record<string, unknown>)
      : {};

    await tx.portalServiceSetup.update({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: DELETED_ACCOUNT_SETUP_SLUG } },
      data: {
        status: "NOT_STARTED",
        dataJson: {
          ...existingData,
          restoredAtIso: new Date().toISOString(),
          restoredByUserId: auth.userId,
          originalEmail: restoreEmail,
          originalName: restoreName,
        } as any,
      },
      select: { id: true },
    });
  });

  return NextResponse.json({ ok: true });
}
