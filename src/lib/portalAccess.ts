import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { hasPortalServiceCapability, type PortalServiceCapability } from "@/lib/portalPermissions";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";

function serviceSlugForKey(key: PortalServiceKey): string | null {
  switch (key) {
    case "aiReceptionist":
      return "ai-receptionist";
    case "aiOutboundCalls":
      return "ai-outbound-calls";
    case "nurtureCampaigns":
      return "nurture-campaigns";
    case "missedCallTextback":
      return "missed-call-textback";
    case "leadScraping":
      return "lead-scraping";
    case "followUp":
      return "follow-up";
    case "media":
      return "media-library";
    case "outbox":
    case "inbox":
      return "inbox";
    case "billing":
      return null;
    default:
      return key;
  }
}

async function isServiceLifecycleDisabled(ownerId: string, serviceKey: PortalServiceKey): Promise<boolean> {
  const slug = serviceSlugForKey(serviceKey);
  if (!slug) return false;
  const row = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: slug } },
      select: { dataJson: true },
    })
    .catch(() => null);

  const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;
  const lifecycle = rec && rec.lifecycle && typeof rec.lifecycle === "object" && !Array.isArray(rec.lifecycle)
    ? (rec.lifecycle as Record<string, unknown>)
    : null;
  const state = typeof lifecycle?.state === "string" ? lifecycle.state.toLowerCase().trim() : "";
  return state === "paused" || state === "canceled";
}

export async function requireClientSessionForService(
  service: PortalServiceKey,
  capability: PortalServiceCapability = "view",
) {
  const auth = await requireClientSession();
  if (!auth.ok) return auth;

  // Portal session encodes the portal account owner in user.id and the acting member in user.memberId.
  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  // Paused/canceled services are disabled for everyone (including owner).
  if (await isServiceLifecycleDisabled(ownerId, service).catch(() => false)) {
    return {
      ok: false as const,
      status: 403 as const,
      session: auth.session,
    };
  }

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

export async function requireClientSessionForAnyService(
  services: PortalServiceKey[],
  capability: PortalServiceCapability = "view",
) {
  const auth = await requireClientSession();
  if (!auth.ok) return auth;

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

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

  const canUseAny = services.some((service) =>
    hasPortalServiceCapability({ role: memberRole, permissionsJson: row?.permissionsJson, service, capability }),
  );

  if (!canUseAny) {
    return {
      ok: false as const,
      status: 403 as const,
      session: auth.session,
    };
  }

  return { ...auth, access: { ownerId, memberId, memberRole } };
}
