import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ADS_SESSION_COOKIE_NAME } from "@/lib/adsAuth";

const bodySchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

export async function POST(req: Request) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } }).catch(() => null);
  if (existing?.id) return NextResponse.json({ error: "Account already exists" }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash,
      role: "CLIENT",
      active: true,
      // Default variant for new accounts; Ads login does not enforce this.
      clientPortalVariant: "PORTAL",
    },
    select: { id: true, email: true, name: true, role: true },
  });

  await prisma.adsAdvertiserAccount
    .create(
      {
        data: {
          userId: user.id,
          autoTopUpEnabled: true,
          autoTopUpThresholdCents: 2000,
          autoTopUpAmountCents: 5000,
        },
        select: { id: true },
      }
    )
    .catch(() => null);

  const token = await encode({
    secret,
    token: {
      uid: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    maxAge: 60 * 60 * 24 * 30,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADS_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
