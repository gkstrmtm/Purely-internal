import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  if (process.env.CLIENT_SIGNUP_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Customer signup is disabled" },
      { status: 403 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const createUser = async () =>
    prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        role: "CLIENT",
      },
      select: { id: true, email: true, name: true, role: true },
    });

  let user;
  try {
    user = await createUser();
  } catch (e) {
    if (isClientRoleMissingError(e)) {
      await ensureClientRoleAllowed(prisma);
      user = await createUser();
    } else {
      throw e;
    }
  }

  return NextResponse.json({ user });
}
