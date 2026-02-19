import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { decode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { hasPortalServiceCapability, type PortalServiceCapability } from "@/lib/portalPermissions";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

export const PORTAL_SESSION_COOKIE_NAME = "pa.portal.session";
export const CREDIT_PORTAL_SESSION_COOKIE_NAME = "pa.credit.session";

export type PortalSessionUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  memberId?: string | null;
  portalVariant?: PortalVariant;
};

async function portalVariantFromHeaders(): Promise<PortalVariant | null> {
  const h = await headers();
  return normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER));
}

export async function getPortalUser(opts?: { variant?: PortalVariant | "auto" }): Promise<PortalSessionUser | null> {
  const cookieStore = await cookies();
  const requestedVariant = opts?.variant ?? "auto";

  const headerVariant = requestedVariant === "auto" ? await portalVariantFromHeaders() : null;
  const variant: PortalVariant =
    requestedVariant === "portal" || requestedVariant === "credit"
      ? requestedVariant
      : headerVariant
        ? headerVariant
        : cookieStore.get(PORTAL_SESSION_COOKIE_NAME)
          ? "portal"
          : cookieStore.get(CREDIT_PORTAL_SESSION_COOKIE_NAME)
            ? "credit"
            : "portal";

  const cookieName = variant === "credit" ? CREDIT_PORTAL_SESSION_COOKIE_NAME : PORTAL_SESSION_COOKIE_NAME;
  const tokenRaw = cookieStore.get(cookieName)?.value;
  if (!tokenRaw) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const token = await decode({ token: tokenRaw, secret }).catch(() => null);
  if (!token) return null;

  const uid = typeof (token as any).uid === "string" ? (token as any).uid : null;
  const memberUid = typeof (token as any).memberUid === "string" ? (token as any).memberUid : null;
  const email = typeof (token as any).email === "string" ? (token as any).email : null;
  const role = typeof (token as any).role === "string" ? ((token as any).role as Role) : null;
  const name = typeof (token as any).name === "string" ? ((token as any).name as string) : null;

  if (!uid || !email || !role) return null;
  return { id: uid, email, role, name, memberId: memberUid && memberUid.trim() ? memberUid : uid, portalVariant: variant };
}

export async function requirePortalUser() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (user.role !== "CLIENT" && user.role !== "ADMIN") redirect("/login");
  return user;
}

export async function requirePortalUserForService(service: PortalServiceKey, capability: PortalServiceCapability = "view") {
  const user = await requirePortalUser();
  const ownerId = user.id;
  const memberId = user.memberId || ownerId;

  if (memberId === ownerId) return user;

  const row = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId, userId: memberId } },
    select: { role: true, permissionsJson: true },
  });

  const roleRaw = typeof row?.role === "string" ? String(row.role) : null;
  const role = roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : null;
  if (!role) redirect("/portal/login");

  const ok = hasPortalServiceCapability({
    role,
    permissionsJson: row?.permissionsJson,
    service,
    capability,
  });
  if (!ok) redirect("/portal/app");

  return user;
}

export async function requirePortalUserForAnyService(
  services: PortalServiceKey[],
  capability: PortalServiceCapability = "view",
) {
  const user = await requirePortalUser();
  const ownerId = user.id;
  const memberId = user.memberId || ownerId;

  if (memberId === ownerId) return user;

  const row = await (prisma as any).portalAccountMember.findUnique({
    where: { ownerId_userId: { ownerId, userId: memberId } },
    select: { role: true, permissionsJson: true },
  });

  const roleRaw = typeof row?.role === "string" ? String(row.role) : null;
  const role = roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : null;
  if (!role) redirect("/portal/login");

  const ok = services.some((service) =>
    hasPortalServiceCapability({ role, permissionsJson: row?.permissionsJson, service, capability }),
  );
  if (!ok) redirect("/portal/app");

  return user;
}
