import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/db";
import { dbHasUserClientPortalVariantColumn } from "@/lib/dbSchemaCompat";
import { hashPassword } from "@/lib/password";
import { CREDIT_PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { acceptInvite } from "@/lib/portalAccounts";
import type { PortalVariant } from "@/lib/portalVariant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const portalVariantToCookieName: Record<PortalVariant, string> = {
  portal: PORTAL_SESSION_COOKIE_NAME,
  credit: CREDIT_PORTAL_SESSION_COOKIE_NAME,
};

function isSecureRequest(req: Request): boolean {
  const xfProto = req.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

const bodySchema = z
  .object({
    token: z.string().min(10),
    name: z.string().min(1).max(80),
    password: z.string().min(6).max(200),
    portalVariant: z.enum(["portal", "credit"]).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const portalVariant = parsed.data.portalVariant === "credit" ? "credit" : "portal";

  const accepted = await acceptInvite({
    token: parsed.data.token,
    name: parsed.data.name,
    passwordHash,
  });

  if (!accepted.ok) {
    return NextResponse.json({ ok: false, error: accepted.error }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: accepted.userId } });
  if (!user || !user.active) {
    return NextResponse.json({ ok: false, error: "Unable to complete invite" }, { status: 500 });
  }

  const hasVariantColumn = await dbHasUserClientPortalVariantColumn();
  if (hasVariantColumn) {
    await prisma.user.update({
      where: { id: accepted.userId },
      data: { clientPortalVariant: portalVariant === "credit" ? "CREDIT" : "PORTAL" },
    }).catch(() => null);
  }

  const token = await encode({
    secret,
    token: {
      uid: accepted.ownerId,
      memberUid: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    maxAge: 60 * 60 * 24 * 30,
  });

  const res = NextResponse.json({ ok: true, ownerId: accepted.ownerId, memberId: user.id });
  res.cookies.set({
    name: portalVariantToCookieName[portalVariant],
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
