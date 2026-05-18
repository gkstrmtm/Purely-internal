import { prisma } from "@/lib/db";

const PLATFORM_ACCESS_GRANT_SETUP_SLUG = "__platform_access_grant";
export const PLATFORM_ACCESS_REQUIRED_MESSAGE = "Platform admin access required. Ask an admin to grant access from Employees.";

export function platformAdminAuthError(status: number) {
  return status === 401 ? "Unauthorized" : PLATFORM_ACCESS_REQUIRED_MESSAGE;
}

type GrantStoreLike = Pick<typeof prisma, "portalServiceSetup">;

export async function ensurePlatformAdminGrantsSchema(_db: GrantStoreLike = prisma) {
  return;
}

export async function listActivePlatformAdminGrantUserIds(db: GrantStoreLike = prisma) {
  const rows = await db.portalServiceSetup.findMany({
    where: {
      serviceSlug: PLATFORM_ACCESS_GRANT_SETUP_SLUG,
      status: "COMPLETE",
    },
    select: { ownerId: true },
  });

  return new Set(rows.map((row) => row.ownerId));
}

export async function isPlatformAdminGranted(userId: string, db: GrantStoreLike = prisma) {
  if (!userId) return false;

  const row = await db.portalServiceSetup.findUnique({
    where: {
      ownerId_serviceSlug: {
        ownerId: userId,
        serviceSlug: PLATFORM_ACCESS_GRANT_SETUP_SLUG,
      },
    },
    select: { id: true, status: true },
  });

  return row?.status === "COMPLETE";
}

export async function setPlatformAdminGrant(input: {
  userId: string;
  actorUserId: string;
  enabled: boolean;
  db?: GrantStoreLike;
}) {
  const db = input.db ?? prisma;

  if (input.enabled) {
    await db.portalServiceSetup.upsert({
      where: {
        ownerId_serviceSlug: {
          ownerId: input.userId,
          serviceSlug: PLATFORM_ACCESS_GRANT_SETUP_SLUG,
        },
      },
      update: {
        status: "COMPLETE",
        dataJson: {
          grantedByUserId: input.actorUserId,
          grantedAtIso: new Date().toISOString(),
        },
      },
      create: {
        ownerId: input.userId,
        serviceSlug: PLATFORM_ACCESS_GRANT_SETUP_SLUG,
        status: "COMPLETE",
        dataJson: {
          grantedByUserId: input.actorUserId,
          grantedAtIso: new Date().toISOString(),
        },
      },
      select: { id: true },
    });

    return { enabled: true as const };
  }

  await db.portalServiceSetup.deleteMany({
    where: {
      ownerId: input.userId,
      serviceSlug: PLATFORM_ACCESS_GRANT_SETUP_SLUG,
    },
  });

  return { enabled: false as const };
}
