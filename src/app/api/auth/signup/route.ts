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

  const rawInviteCode = parsed.data.inviteCode.trim();
  const inviteCode = rawInviteCode.toUpperCase();

  const expected = process.env.SIGNUP_INVITE_CODE;
  const allowLegacyEnvCode = !!expected && inviteCode === expected.trim().toUpperCase();

  const email = parsed.data.email.toLowerCase().trim();
  const now = new Date();

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      if (!allowLegacyEnvCode) {
        const invite = await tx.employeeInvite.findUnique({ where: { code: inviteCode } });
        if (!invite || invite.usedAt) throw new Error("INVITE_INVALID");
        if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) throw new Error("INVITE_EXPIRED");
      }

      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) throw new Error("EMAIL_TAKEN");

      const created = await tx.user.create({
        data: {
          email,
          name: parsed.data.name,
          passwordHash,
          role: parsed.data.role ?? "DIALER",
        },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!allowLegacyEnvCode) {
        const consumed = await tx.employeeInvite.updateMany({
          where: {
            code: inviteCode,
            usedAt: null,
          },
          data: {
            usedAt: now,
            usedById: created.id,
          },
        });

        if (consumed.count !== 1) throw new Error("INVITE_ALREADY_USED");
      }

      return created;
    });

    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown";

    if (message === "EMAIL_TAKEN") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    if (message === "INVITE_INVALID" || message === "INVITE_ALREADY_USED") {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
    }
    if (message === "INVITE_EXPIRED") {
      return NextResponse.json({ error: "Invite code expired" }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: "Unable to sign up",
        details: message,
      },
      { status: 500 },
    );
  }
}
