import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";

export async function requireManagerSession() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId) return { ok: false as const, status: 401 as const, session: null };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const, session };

  return { ok: true as const, status: 200 as const, session };
}

export async function requireClientSession() {
  const user = await getPortalUser();
  if (!user) return { ok: false as const, status: 401 as const, session: null };
  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return {
      ok: false as const,
      status: 403 as const,
      session: { user: { id: user.id, email: user.email, role: user.role, name: user.name ?? undefined, memberId: user.memberId ?? undefined } },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    session: { user: { id: user.id, email: user.email, role: user.role, name: user.name ?? undefined, memberId: user.memberId ?? undefined } },
  };
}
