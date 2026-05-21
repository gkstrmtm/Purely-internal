import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { dbHasUserClientPortalVariantColumn } from "@/lib/dbSchemaCompat";
import { hashPassword, verifyPassword } from "@/lib/password";
import { CREDIT_PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { resolvePortalOwnerIdForLogin } from "@/lib/portalAccounts";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function normalizeDefaultLoginPath(input: unknown): string | null {
  const path = typeof input === "string" ? input.trim().slice(0, 240) : "";
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (!/^\/(portal|credit)\/app(?:$|\/(ai-chat|services))$/i.test(path)) return null;
  return path;
}

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const portalVariantToCookieName: Record<PortalVariant, string> = {
  portal: PORTAL_SESSION_COOKIE_NAME,
  credit: CREDIT_PORTAL_SESSION_COOKIE_NAME,
};

function isDemoRepairAllowed() {
  if (process.env.NODE_ENV !== "production") return true;
  const raw = String(process.env.ALLOW_PORTAL_DEMO_LOGIN_REPAIR || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function isSecureRequest(req: Request): boolean {
  const xfProto = req.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const variant = (normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER)) || "portal") satisfies PortalVariant;

  const wantsToken = (() => {
    const v = (req.headers.get("x-pa-return-token") ?? "").trim();
    if (v === "1" || v.toLowerCase() === "true") return true;
    const client = (req.headers.get("x-pa-client") ?? "").trim().toLowerCase();
    return client === "native" || client === "mobile";
  })();

  const hasVariantColumn = await dbHasUserClientPortalVariantColumn();
  if (variant === "credit" && !hasVariantColumn) {
    return NextResponse.json(
      { error: "We’re updating our system. Please try again in a few minutes." },
      { status: 503 },
    );
  }

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
  const allowDemoRepair = isPortalDemoLogin && isDemoRepairAllowed();

  const userSelect: any = {
    id: true,
    email: true,
    name: true,
    passwordHash: true,
    role: true,
    active: true,
    ...(hasVariantColumn ? { clientPortalVariant: true } : {}),
  };

  let user: any = await prisma.user.findUnique({ where: { email }, select: userSelect });

  if ((!user || !user.active) && allowDemoRepair) {
    console.warn("[portal-login] demo account repair: recreating or reactivating demo user", {
      email,
      variant,
      mode: process.env.NODE_ENV !== "production" ? "non-production" : "explicit-flag",
    });
    const passwordHash = await hashPassword(parsed.data.password);
    user = await prisma.user.upsert({
      where: { email },
      update: {
        role: "CLIENT",
        active: true,
        name: email.includes("demo-limited") ? "Demo Client (Limited)" : "Demo Client (Full)",
        ...(hasVariantColumn ? { clientPortalVariant: "PORTAL" } : {}),
        passwordHash,
      },
      create: {
        email,
        name: email.includes("demo-limited") ? "Demo Client (Limited)" : "Demo Client (Full)",
        role: "CLIENT",
        active: true,
        ...(hasVariantColumn ? { clientPortalVariant: "PORTAL" } : {}),
        passwordHash,
      },
      select: userSelect,
    });
  }

  if (!user || !user.active) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (hasVariantColumn) {
    const expectedUserVariant = variant === "credit" ? "CREDIT" : "PORTAL";
    if (String((user as any).clientPortalVariant) !== expectedUserVariant) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  let ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok && allowDemoRepair) {
    console.warn("[portal-login] demo account repair: resetting demo password from login request", {
      email,
      variant,
      mode: process.env.NODE_ENV !== "production" ? "non-production" : "explicit-flag",
    });
    const passwordHash = await hashPassword(parsed.data.password);
    user = await prisma.user.update({ where: { id: user.id }, data: { passwordHash }, select: userSelect });
    ok = true;
  }

  if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  // Multi-user portal accounts: session uid is the account ownerId.
  const ownerId = await resolvePortalOwnerIdForLogin(user.id).catch(() => user.id);
  const profileSetup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  }).catch(() => null);
  const defaultFrom = normalizeDefaultLoginPath((profileSetup?.dataJson as any)?.defaultLoginPath);

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

  const res = NextResponse.json(wantsToken ? { ok: true, token, defaultFrom } : { ok: true, defaultFrom });
  res.cookies.set({
    name: portalVariantToCookieName[variant],
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
