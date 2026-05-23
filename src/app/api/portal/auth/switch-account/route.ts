import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";

import { getPortalUser, CREDIT_PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { listAccessiblePortalAccounts } from "@/lib/portalAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({ ownerId: z.string().min(1).max(191) }).strict();

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
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const user = await getPortalUser({ variant: "auto" }).catch(() => null);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const currentOwnerId = String(user.id || "").trim();
  const memberId = String(user.memberId || user.id || "").trim();
  const nextOwnerId = parsed.data.ownerId.trim();
  const variant = user.portalVariant ?? "portal";

  if (!memberId || !nextOwnerId) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const accounts = await listAccessiblePortalAccounts({
    memberId,
    currentOwnerId,
    variant,
  }).catch(() => []);

  const nextAccount = accounts.find((account) => account.ownerId === nextOwnerId) || null;
  if (!nextAccount) {
    return NextResponse.json({ ok: false, error: "Account not available" }, { status: 403 });
  }

  const token = await encode({
    secret,
    token: {
      uid: nextOwnerId,
      memberUid: memberId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    maxAge: 60 * 60 * 24 * 30,
  });

  const res = NextResponse.json({ ok: true, ownerId: nextOwnerId, memberId });
  res.cookies.set({
    name: variant === "credit" ? CREDIT_PORTAL_SESSION_COOKIE_NAME : PORTAL_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}