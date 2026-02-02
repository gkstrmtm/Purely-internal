import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["DIALER", "CLOSER"]).optional(),
  inviteCode: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const expected = process.env.SIGNUP_INVITE_CODE;
  if (!expected || parsed.data.inviteCode !== expected) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role ?? "DIALER",
    },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json({ user });
}
