import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function maskedDbIdentity() {
  const urlRaw = process.env.DATABASE_URL || "";
  try {
    const u = new URL(urlRaw);
    return {
      host: u.host,
      db: u.pathname?.replace(/^\//, "") || null,
      search: u.search || "",
    };
  } catch {
    return { host: null, db: null, search: "" };
  }
}

export async function GET(req: Request) {
  const secret = String(process.env.ADMIN_DEBUG_SECRET || "").trim();
  const provided = String(req.headers.get("x-admin-debug-secret") || "").trim();

  // If not configured, or secret mismatch, pretend the route doesn't exist.
  if (!secret || !provided || provided !== secret) {
    return new NextResponse(null, { status: 404 });
  }

  const [userCount, activeUserCount, creditCount, portalCount] = await Promise.all([
    prisma.user.count().catch(() => -1),
    prisma.user.count({ where: { active: true } }).catch(() => -1),
    prisma.user.count({ where: { clientPortalVariant: "CREDIT" as any } }).catch(() => -1),
    prisma.user.count({ where: { clientPortalVariant: "PORTAL" as any } }).catch(() => -1),
  ]);

  return NextResponse.json({
    ok: true,
    db: maskedDbIdentity(),
    counts: {
      users: userCount,
      activeUsers: activeUserCount,
      creditUsers: creditCount,
      portalUsers: portalCount,
    },
    env: {
      nodeEnv: process.env.NODE_ENV || null,
      nextauthUrl: process.env.NEXTAUTH_URL || null,
      clientSignupEnabled: process.env.CLIENT_SIGNUP_ENABLED ?? null,
    },
  });
}
