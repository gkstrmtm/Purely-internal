import { prisma } from "@/lib/db";
import { getPortalUser } from "@/lib/portalAuth";

export async function requireCreditClientSession() {
  const user = await getPortalUser({ variant: "credit" });
  if (!user) return { ok: false as const, status: 401 as const, session: null };

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return {
      ok: false as const,
      status: 403 as const,
      session: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name ?? undefined,
          memberId: user.memberId ?? undefined,
        },
      },
    };
  }

  const dbUser = await prisma.user
    .findUnique({ where: { id: user.id }, select: { clientPortalVariant: true } })
    .catch(() => null);

  if (dbUser?.clientPortalVariant !== "CREDIT") {
    return {
      ok: false as const,
      status: 403 as const,
      session: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name ?? undefined,
          memberId: user.memberId ?? undefined,
        },
      },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    session: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name ?? undefined,
        memberId: user.memberId ?? undefined,
      },
    },
  };
}
