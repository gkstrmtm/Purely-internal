import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { hasPortalServiceCapability, type PortalServiceCapability } from "@/lib/portalPermissions";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";

export async function requireClientSessionForService(
  service: PortalServiceKey,
  capability: PortalServiceCapability = "view",
) {
  const auth = await requireClientSession();
  if (!auth.ok) return auth;

  // Portal session encodes the portal account owner in user.id and the acting member in user.memberId.
  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  // Owner always has full access.
  if (memberId === ownerId) {
    return { ...auth, access: { ownerId, memberId, memberRole: "OWNER" as const } };
  }

  await ensurePortalTasksSchema().catch(() => null);

  const row = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId, userId: memberId } },
    select: { role: true, permissionsJson: true },
  });

  const memberRoleRaw = typeof row?.role === "string" ? String(row.role) : null;
  const memberRole = memberRoleRaw === "ADMIN" || memberRoleRaw === "MEMBER" ? memberRoleRaw : null;
  if (!memberRole) {
    return {
      ok: false as const,
      status: 403 as const,
      session: auth.session,
    };
  }

  if (!hasPortalServiceCapability({ role: memberRole, permissionsJson: row?.permissionsJson, service, capability })) {
    return {
      ok: false as const,
      status: 403 as const,
      session: auth.session,
    };
  }

  return { ...auth, access: { ownerId, memberId, memberRole } };
}
