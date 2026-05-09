import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { isMissingColumnError } from "@/lib/dbSchemaCompat";
import { verifyPassword } from "@/lib/password";
import { CREDIT_PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { resolvePortalOwnerIdForLogin } from "@/lib/portalAccounts";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const LOGIN_DB_TIMEOUT_MS = 8_000;
const LOGIN_DB_ATTEMPTS = 1;

class CreditLoginDbTimeoutError extends Error {
  constructor(message = "Login database request timed out") {
    super(message);
    this.name = "CreditLoginDbTimeoutError";
  }
}

function isPrismaPoolTimeoutError(err: unknown): boolean {
  if (err instanceof CreditLoginDbTimeoutError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2024") return true;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("connection pool") && normalized.includes("timed out");
}

function isMissingClientPortalVariantColumnError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") return true;
  return isMissingColumnError(err, "clientPortalVariant");
}

type CreditLoginUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: string;
  active: boolean;
  clientPortalVariant?: string | null;
};

async function findCreditLoginUserByEmail(email: string): Promise<{ user: CreditLoginUser | null; hasVariantColumn: boolean }> {
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
    return { user: (user as CreditLoginUser | null) ?? null, hasVariantColumn: true };
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
    return { user: (user as CreditLoginUser | null) ?? null, hasVariantColumn: false };
  }
}

async function withDbTimeout<T>(work: Promise<T>, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new CreditLoginDbTimeoutError(label || "Login database request timed out")), LOGIN_DB_TIMEOUT_MS);
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
      return await withDbTimeout(fn(), `Credit login database request timed out on attempt ${attempt}`);
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

    const lookup = await withDbRetry(() => findCreditLoginUserByEmail(email));
    const hasVariantColumn = lookup.hasVariantColumn;
    if (!hasVariantColumn) {
      return NextResponse.json(
        { error: "We’re updating our system. Please try again in a few minutes." },
        { status: 503 },
      );
    }

    const user = lookup.user;
    if (!user || !user.active) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const userVariant = String((user as any).clientPortalVariant);
    if (userVariant !== "CREDIT") {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.role !== "CLIENT" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const ownerId = await withDbRetry(() => resolvePortalOwnerIdForLogin(user.id)).catch(() => user.id);

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

    const res = NextResponse.json({ ok: true, defaultFrom: "/credit/app" });
    res.cookies.set({
      name: CREDIT_PORTAL_SESSION_COOKIE_NAME,
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
