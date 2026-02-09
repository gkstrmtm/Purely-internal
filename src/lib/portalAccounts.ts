import crypto from "crypto";

import { prisma } from "@/lib/db";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";

export type PortalAccountMemberRole = "OWNER" | "ADMIN" | "MEMBER";

export async function listPortalAccountMembers(ownerId: string) {
  await ensurePortalTasksSchema().catch(() => null);

  const rows = await (prisma as any).portalAccountMember.findMany({
    where: { ownerId },
    select: {
      id: true,
      ownerId: true,
      userId: true,
      role: true,
      permissionsJson: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, role: true, active: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return rows as any[];
}

export async function listPortalAccountInvites(ownerId: string) {
  await ensurePortalTasksSchema().catch(() => null);

  const rows = await (prisma as any).portalAccountInvite.findMany({
    where: { ownerId },
    select: { id: true, email: true, role: true, token: true, expiresAt: true, acceptedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return rows as any[];
}

export async function createPortalAccountInvite(opts: {
  ownerId: string;
  email: string;
  role: PortalAccountMemberRole;
  expiresHours?: number;
}) {
  await ensurePortalTasksSchema().catch(() => null);

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresHours = Math.max(1, Math.min(24 * 30, Math.round(opts.expiresHours || 72)));
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

  const invite = await (prisma as any).portalAccountInvite.create({
    data: {
      id: crypto.randomUUID().replace(/-/g, ""),
      ownerId: opts.ownerId,
      email: opts.email.toLowerCase().trim(),
      role: opts.role,
      token,
      expiresAt,
    },
    select: { id: true, ownerId: true, email: true, role: true, token: true, expiresAt: true, acceptedAt: true },
  });

  return invite as any;
}

export async function findInviteByToken(token: string) {
  await ensurePortalTasksSchema().catch(() => null);

  const invite = await (prisma as any).portalAccountInvite.findUnique({
    where: { token },
    select: { id: true, ownerId: true, email: true, role: true, token: true, expiresAt: true, acceptedAt: true, createdAt: true },
  });

  return invite as any | null;
}

export async function acceptInvite(opts: { token: string; name: string; passwordHash: string }) {
  await ensurePortalTasksSchema().catch(() => null);

  const token = opts.token.trim();
  if (!token) return { ok: false as const, error: "Invalid invite" };

  const invite = await findInviteByToken(token);
  if (!invite) return { ok: false as const, error: "Invite not found" };
  if (invite.acceptedAt) return { ok: false as const, error: "Invite already used" };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { ok: false as const, error: "Invite expired" };

  const email = String(invite.email || "").toLowerCase().trim();
  if (!email) return { ok: false as const, error: "Invite invalid" };

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });

    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            name: opts.name.trim().slice(0, 80) || existing.name,
            passwordHash: existing.passwordHash ? existing.passwordHash : opts.passwordHash,
            active: true,
            role: existing.role,
          },
        })
      : await tx.user.create({
          data: {
            email,
            name: opts.name.trim().slice(0, 80) || email,
            passwordHash: opts.passwordHash,
            role: "CLIENT",
            active: true,
          },
        });

    await (tx as any).portalAccountMember.upsert({
      where: { ownerId_userId: { ownerId: invite.ownerId, userId: user.id } },
      update: { role: invite.role },
      create: {
        id: crypto.randomUUID().replace(/-/g, ""),
        ownerId: invite.ownerId,
        userId: user.id,
        role: invite.role,
      },
      select: { id: true },
    });

    await (tx as any).portalAccountInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
      select: { id: true },
    });

    return { userId: user.id, ownerId: invite.ownerId };
  });

  return { ok: true as const, ...result };
}

export async function resolvePortalOwnerIdForLogin(userId: string) {
  await ensurePortalTasksSchema().catch(() => null);

  const membership = await (prisma as any).portalAccountMember.findFirst({
    where: { userId },
    select: { ownerId: true },
    orderBy: { createdAt: "asc" },
  });

  const ownerId = typeof membership?.ownerId === "string" && membership.ownerId.trim() ? membership.ownerId : userId;
  return ownerId;
}

export async function getPortalAccountMemberRole(opts: { ownerId: string; userId: string }) {
  await ensurePortalTasksSchema().catch(() => null);
  if (!opts.ownerId || !opts.userId) return null;
  const row = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId: opts.ownerId, userId: opts.userId } },
    select: { role: true },
  });
  const role = typeof row?.role === "string" ? String(row.role) : null;
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER" ? (role as PortalAccountMemberRole) : null;
}
