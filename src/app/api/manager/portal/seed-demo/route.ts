import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";

export const runtime = "nodejs";

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function hintForError(message: string) {
  const msg = message.toLowerCase();
  if (
    msg.includes("invalid input value for enum") ||
    (msg.includes("role") && msg.includes("client") && msg.includes("enum"))
  ) {
    return "Database schema looks behind. Deploy with Prisma schema sync (e.g. run `prisma db push`) so the Role enum includes CLIENT, then try again.";
  }
  if (msg.includes("prisma") && msg.includes("connect")) {
    return "Database connection failed. Confirm DATABASE_URL is set and reachable from the deployed environment.";
  }
  return null;
}

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
  try {
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

    const fullPasswordHash = await hashPassword(fullPassword);
    const limitedPasswordHash = await hashPassword(limitedPassword);

    const runUpserts = async () => {
      const [fullUser, limitedUser] = await prisma.$transaction([
        prisma.user.upsert({
          where: { email: fullEmail },
          update: {
            role: "CLIENT",
            active: true,
            name: "Demo Client (Full)",
            passwordHash: fullPasswordHash,
          },
          create: {
            email: fullEmail,
            name: "Demo Client (Full)",
            role: "CLIENT",
            active: true,
            passwordHash: fullPasswordHash,
          },
          select: { id: true, email: true, name: true, role: true },
        }),
        prisma.user.upsert({
          where: { email: limitedEmail },
          update: {
            role: "CLIENT",
            active: true,
            name: "Demo Client (Limited)",
            passwordHash: limitedPasswordHash,
          },
          create: {
            email: limitedEmail,
            name: "Demo Client (Limited)",
            role: "CLIENT",
            active: true,
            passwordHash: limitedPasswordHash,
          },
          select: { id: true, email: true, name: true, role: true },
        }),
      ]);

      return [fullUser, limitedUser] as const;
    };

    let fullUser;
    let limitedUser;
    try {
      [fullUser, limitedUser] = await runUpserts();
    } catch (e) {
      if (isClientRoleMissingError(e)) {
        await ensureClientRoleAllowed(prisma);
        [fullUser, limitedUser] = await runUpserts();
      } else {
        throw e;
      }
    }

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
  } catch (err) {
    const message = toErrorMessage(err);
    const hint = hintForError(message);
    return NextResponse.json(
      {
        error: "Seed failed",
        details: message,
        hint,
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
