import { prisma } from "@/lib/db";
import { getPortalUser } from "@/lib/portalAuth";
import { headers } from "next/headers";

import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export async function requireFunnelBuilderSession() {
  const user = await getPortalUser({ variant: "auto" });
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

  const variant = user.portalVariant === "credit" ? "credit" : "portal";

  const h = await headers();
  const headerVariant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER));
  if (headerVariant && headerVariant !== variant) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        `Funnel Builder auth variant mismatch: header=${headerVariant} resolved=${variant}. Use variant-aware auth (auto) and set x-portal-variant correctly.`,
      );
    }
    return { ok: false as const, status: 400 as const, session: null };
  }

  // Credit portal has additional restrictions (must be a credit-variant client portal user).
  if (variant === "credit") {
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
  }

  return {
    ok: true as const,
    status: 200 as const,
    variant,
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
