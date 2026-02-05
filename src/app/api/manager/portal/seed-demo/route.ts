import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

function randomPassword() {
  // Avoid ambiguous characters
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const bodySchema = z
  .object({
    fullEmail: z.string().email().optional(),
    fullPassword: z.string().min(6).optional(),
    limitedEmail: z.string().email().optional(),
    limitedPassword: z.string().min(6).optional(),
  })
  .optional();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "MANAGER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const fullEmail = (parsed.data?.fullEmail ?? "demo-full@purelyautomation.dev")
    .toLowerCase()
    .trim();
  const limitedEmail = (parsed.data?.limitedEmail ?? "demo-limited@purelyautomation.dev")
    .toLowerCase()
    .trim();

  const fullPassword = parsed.data?.fullPassword ?? randomPassword();
  const limitedPassword = parsed.data?.limitedPassword ?? randomPassword();

  const [fullUser, limitedUser] = await prisma.$transaction([
    prisma.user.upsert({
      where: { email: fullEmail },
      update: {
        role: "CLIENT",
        active: true,
        name: "Demo Client (Full)",
        passwordHash: await hashPassword(fullPassword),
      },
      create: {
        email: fullEmail,
        name: "Demo Client (Full)",
        role: "CLIENT",
        active: true,
        passwordHash: await hashPassword(fullPassword),
      },
      select: { id: true, email: true, name: true, role: true },
    }),
    prisma.user.upsert({
      where: { email: limitedEmail },
      update: {
        role: "CLIENT",
        active: true,
        name: "Demo Client (Limited)",
        passwordHash: await hashPassword(limitedPassword),
      },
      create: {
        email: limitedEmail,
        name: "Demo Client (Limited)",
        role: "CLIENT",
        active: true,
        passwordHash: await hashPassword(limitedPassword),
      },
      select: { id: true, email: true, name: true, role: true },
    }),
  ]);

  return NextResponse.json(
    {
      full: { ...fullUser, password: fullPassword },
      limited: { ...limitedUser, password: limitedPassword },
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
