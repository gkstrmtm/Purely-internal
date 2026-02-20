import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { CREDIT_PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { resolvePortalOwnerIdForLogin } from "@/lib/portalAccounts";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const userVariant = (user as any).clientPortalVariant ? String((user as any).clientPortalVariant) : "PORTAL";
  if (userVariant !== "CREDIT") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ownerId = await resolvePortalOwnerIdForLogin(user.id).catch(() => user.id);

  const token = await encode({
    secret,
    token: {
      uid: ownerId,
      memberUid: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    maxAge: 60 * 60 * 24 * 30,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: CREDIT_PORTAL_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
