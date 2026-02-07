import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";

function boolEnv(v?: string) {
  return v === "1" || v === "true" || v === "yes";
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env var ${name}`);
  return v.trim();
}

export async function POST(req: Request) {
  if (!boolEnv(process.env.DEMO_PORTAL_SEED_ENABLED)) {
    return NextResponse.json(
      { error: "Demo seeding is disabled" },
      { status: 403 },
    );
  }

  const expected = process.env.DEMO_PORTAL_SEED_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Missing DEMO_PORTAL_SEED_SECRET" },
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-demo-seed-secret") ?? "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let fullEmail: string;
  let fullPassword: string;
  let limitedEmail: string;
  let limitedPassword: string;

  try {
    fullEmail = requireEnv("DEMO_PORTAL_FULL_EMAIL").toLowerCase();
    fullPassword = requireEnv("DEMO_PORTAL_FULL_PASSWORD");
    limitedEmail = requireEnv("DEMO_PORTAL_LIMITED_EMAIL").toLowerCase();
    limitedPassword = requireEnv("DEMO_PORTAL_LIMITED_PASSWORD");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Missing env vars";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const runUpserts = async () => {
    const [fullUser, limitedUser] = await prisma.$transaction([
      prisma.user.upsert({
      where: { email: fullEmail },
      update: { role: "CLIENT", active: true, name: "Demo Client (Full)" },
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
      update: { role: "CLIENT", active: true, name: "Demo Client (Limited)" },
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

    // Ensure the full demo account has a healthy credit balance for demos.
    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId: fullUser.id, serviceSlug: "credits" } },
      create: {
        ownerId: fullUser.id,
        serviceSlug: "credits",
        status: "COMPLETE",
        dataJson: { balance: 100, autoTopUp: false },
      },
      update: {
        dataJson: { balance: 100, autoTopUp: false },
        status: "COMPLETE",
      },
      select: { id: true },
    });

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

  return NextResponse.json({ fullUser, limitedUser });
}
