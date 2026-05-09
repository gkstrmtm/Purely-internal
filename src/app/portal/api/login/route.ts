import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { isMissingColumnError } from "@/lib/dbSchemaCompat";
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

const LOGIN_DB_TIMEOUT_MS = 8_000;
const LOGIN_DB_ATTEMPTS = 1;

class PortalLoginDbTimeoutError extends Error {
  constructor(message = "Login database request timed out") {
    super(message);
    this.name = "PortalLoginDbTimeoutError";
  }
}

function isPrismaPoolTimeoutError(err: unknown): boolean {
  if (err instanceof PortalLoginDbTimeoutError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2024") return true;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("connection pool") && normalized.includes("timed out");
}

function isMissingClientPortalVariantColumnError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") return true;
  return isMissingColumnError(err, "clientPortalVariant");
}

type PortalLoginUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: string;
  active: boolean;
  clientPortalVariant?: string | null;
};

async function findPortalLoginUserByEmail(email: string): Promise<{ user: PortalLoginUser | null; hasVariantColumn: boolean }> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        active: true,
        clientPortalVariant: true,
      },
    });
    return { user: (user as PortalLoginUser | null) ?? null, hasVariantColumn: true };
  } catch (error) {
    if (!isMissingClientPortalVariantColumnError(error)) throw error;
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        active: true,
      },
    });
    return { user: (user as PortalLoginUser | null) ?? null, hasVariantColumn: false };
  }
}

async function withDbTimeout<T>(work: Promise<T>, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new PortalLoginDbTimeoutError(label || "Login database request timed out")), LOGIN_DB_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withDbRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number; delayMs?: number }): Promise<T> {
  const attempts = Math.max(1, Math.min(4, Math.floor(opts?.attempts ?? LOGIN_DB_ATTEMPTS)));
  const delayMs = Math.max(50, Math.min(2_000, Math.floor(opts?.delayMs ?? 200)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withDbTimeout(fn(), `Login database request timed out on attempt ${attempt}`);
    } catch (error) {
      lastError = error;
      if (!isPrismaPoolTimeoutError(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
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
  try {
    const variant = (normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER)) || "portal") satisfies PortalVariant;

    const wantsToken = (() => {
      const v = (req.headers.get("x-pa-return-token") ?? "").trim();
      if (v === "1" || v.toLowerCase() === "true") return true;
      const client = (req.headers.get("x-pa-client") ?? "").trim().toLowerCase();
      return client === "native" || client === "mobile";
    })();

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

    const initialLookup = await withDbRetry(() => findPortalLoginUserByEmail(email));
    const hasVariantColumn = initialLookup.hasVariantColumn;
    if (variant === "credit" && !hasVariantColumn) {
      return NextResponse.json(
        { error: "We’re updating our system. Please try again in a few minutes." },
        { status: 503 },
      );
    }

    const userSelect: any = {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      role: true,
      active: true,
      ...(hasVariantColumn ? { clientPortalVariant: true } : {}),
    };

    let user: any = initialLookup.user;

    if ((!user || !user.active) && isPortalDemoLogin) {
      const passwordHash = await hashPassword(parsed.data.password);
      user = await withDbRetry(() => prisma.user.upsert({
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
      }));
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
    if (!ok && isPortalDemoLogin) {
      const passwordHash = await hashPassword(parsed.data.password);
      user = await withDbRetry(() => prisma.user.update({ where: { id: user.id }, data: { passwordHash }, select: userSelect }));
      ok = true;
    }

    if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

    const ownerId = isPortalDemoLogin
      ? user.id
      : await withDbRetry(() => resolvePortalOwnerIdForLogin(user.id)).catch(() => user.id);
    const profileSetup = isPortalDemoLogin
      ? null
      : await withDbRetry(() => prisma.portalServiceSetup.findUnique({
          where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
          select: { dataJson: true },
        })).catch(() => null);
    const defaultFrom = isPortalDemoLogin ? null : normalizeDefaultLoginPath((profileSetup?.dataJson as any)?.defaultLoginPath);

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
  } catch (error) {
    if (isPrismaPoolTimeoutError(error)) {
      return NextResponse.json({ error: "Login is temporarily unavailable. Please try again." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unexpected login error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
