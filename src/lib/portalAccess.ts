import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { hasPortalServiceCapability, type PortalServiceCapability } from "@/lib/portalPermissions";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { resolveEntitlements } from "@/lib/entitlements";

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

  // Only module-backed services can be paused/canceled.
  const svc = PORTAL_SERVICES.find((s) => s.slug === slug) ?? null;
  if (!svc) return false;

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

function readLifecycleState(row: { dataJson: unknown } | null): { state: string; reason: string } {
  const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;
  const lifecycle = rec && rec.lifecycle && typeof rec.lifecycle === "object" && !Array.isArray(rec.lifecycle)
    ? (rec.lifecycle as Record<string, unknown>)
    : null;
  const state = typeof lifecycle?.state === "string" ? lifecycle.state.toLowerCase().trim() : "";
  const reason = typeof lifecycle?.reason === "string" ? lifecycle.reason.toLowerCase().trim() : "";
  return { state, reason };
}

function ownedByLifecycle(state: string, reason: string) {
  if (!state) return false;
  if (state === "paused" && reason === "pending_payment") return false;
  return state === "active" || state === "paused" || state === "canceled";
}

async function isServiceUnlockedForOwner(opts: {
  ownerId: string;
  serviceKey: PortalServiceKey;
  sessionEmail: string | null | undefined;
}) {
  const slug = serviceSlugForKey(opts.serviceKey);
  if (!slug) return true;

  const svc = PORTAL_SERVICES.find((s) => s.slug === slug) ?? null;
  // Core/utility routes (profile, businessProfile, people, etc.) are not part of the service catalog.
  // They should not be gated by module ownership.
  if (!svc) return true;
  if (svc?.included) return true;

  // Entitlements must be computed from the portal account owner identity.
  const owner = await prisma.user
    .findUnique({ where: { id: opts.ownerId }, select: { email: true } })
    .catch(() => null);
  const entitlementsEmail = String(owner?.email || opts.sessionEmail || "");
  const entitlements = await resolveEntitlements(entitlementsEmail);

  if (svc?.entitlementKey && Boolean((entitlements as any)?.[svc.entitlementKey])) return true;

  const setup = await prisma.portalServiceSetup
    .findUnique({ where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: slug } }, select: { dataJson: true } })
    .catch(() => null);
  const { state, reason } = readLifecycleState(setup);
  return ownedByLifecycle(state, reason);
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

  // Ownership gating: if the portal account doesn't have this service, deny access.
  if (!(await isServiceUnlockedForOwner({ ownerId, serviceKey: service, sessionEmail: auth.session.user.email }).catch(() => false))) {
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

  const anyUnlocked = await (async () => {
    for (const s of services) {
      const ok = await isServiceUnlockedForOwner({ ownerId, serviceKey: s, sessionEmail: auth.session.user.email }).catch(() => false);
      if (ok) return true;
    }
    return false;
  })();

  if (!anyUnlocked) {
    return {
      ok: false as const,
      status: 403 as const,
      session: auth.session,
    };
  }

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
