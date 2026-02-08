import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decode } from "next-auth/jwt";

export const PORTAL_SESSION_COOKIE_NAME = "pa.portal.session";

export type PortalSessionUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
};

export async function getPortalUser(): Promise<PortalSessionUser | null> {
  const cookieStore = await cookies();
  const tokenRaw = cookieStore.get(PORTAL_SESSION_COOKIE_NAME)?.value;
  if (!tokenRaw) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const token = await decode({ token: tokenRaw, secret }).catch(() => null);
  if (!token) return null;

  const uid = typeof (token as any).uid === "string" ? (token as any).uid : null;
  const email = typeof (token as any).email === "string" ? (token as any).email : null;
  const role = typeof (token as any).role === "string" ? ((token as any).role as Role) : null;
  const name = typeof (token as any).name === "string" ? ((token as any).name as string) : null;

  if (!uid || !email || !role) return null;
  return { id: uid, email, role, name };
}

export async function requirePortalUser() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (user.role !== "CLIENT" && user.role !== "ADMIN") redirect("/login");
  return user;
}
