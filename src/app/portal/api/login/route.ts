import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { CREDIT_PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { resolvePortalOwnerIdForLogin } from "@/lib/portalAccounts";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const portalVariantToCookieName: Record<PortalVariant, string> = {
  portal: PORTAL_SESSION_COOKIE_NAME,
  credit: CREDIT_PORTAL_SESSION_COOKIE_NAME,
};

export async function POST(req: Request) {
  const variant = (normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER)) || "portal") satisfies PortalVariant;

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

  const demoEmailAllowlist = new Set(
    [
      "demo-full@purelyautomation.dev",
      "demo-limited@purelyautomation.dev",
      String(process.env.DEMO_PORTAL_FULL_EMAIL || "").trim().toLowerCase(),
      String(process.env.DEMO_PORTAL_LIMITED_EMAIL || "").trim().toLowerCase(),
    ].filter(Boolean),
  );
  const isPortalDemoLogin = variant === "portal" && demoEmailAllowlist.has(email);

  let user = await prisma.user.findUnique({ where: { email } });

  // Safety valve: if the demo account is missing (or its password got reset),
  // allow recreating/resetting it on login so the portal doesn't get bricked.
  if ((!user || !user.active) && isPortalDemoLogin) {
    const passwordHash = await hashPassword(parsed.data.password);
    user = await prisma.user.upsert({
      where: { email },
      update: {
        role: "CLIENT",
        active: true,
        name: email.includes("demo-limited") ? "Demo Client (Limited)" : "Demo Client (Full)",
        clientPortalVariant: "PORTAL",
        passwordHash,
      },
      create: {
        email,
        name: email.includes("demo-limited") ? "Demo Client (Limited)" : "Demo Client (Full)",
        role: "CLIENT",
        active: true,
        clientPortalVariant: "PORTAL",
        passwordHash,
      },
    });
  }

  if (!user || !user.active) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const expectedUserVariant = variant === "credit" ? "CREDIT" : "PORTAL";
  if (String(user.clientPortalVariant) !== expectedUserVariant) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  let ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok && isPortalDemoLogin) {
    // Demo recovery: accept the provided password and reset the demo hash.
    const passwordHash = await hashPassword(parsed.data.password);
    user = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    ok = true;
  }

  if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  // Multi-user portal accounts: session uid is the account ownerId.
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
    name: portalVariantToCookieName[variant],
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
