import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { acceptInvite } from "@/lib/portalAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    token: z.string().min(10),
    name: z.string().min(1).max(80),
    password: z.string().min(6).max(200),
  })
  .strict();

export async function POST(req: Request) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const accepted = await acceptInvite({
    token: parsed.data.token,
    name: parsed.data.name,
    passwordHash,
  });

  if (!accepted.ok) {
    return NextResponse.json({ ok: false, error: accepted.error }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: accepted.userId } });
  if (!user || !user.active) {
    return NextResponse.json({ ok: false, error: "Unable to complete invite" }, { status: 500 });
  }

  const token = await encode({
    secret,
    token: {
      uid: accepted.ownerId,
      memberUid: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    maxAge: 60 * 60 * 24 * 30,
  });

  const res = NextResponse.json({ ok: true, ownerId: accepted.ownerId, memberId: user.id });
  res.cookies.set({
    name: PORTAL_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
