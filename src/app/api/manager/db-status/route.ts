import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (session.user.role !== "MANAGER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const [userCount, activeUserCount, creditCount, portalCount] = await Promise.all([
    prisma.user.count().catch(() => -1),
    prisma.user.count({ where: { active: true } }).catch(() => -1),
    prisma.user.count({ where: { clientPortalVariant: "CREDIT" } }).catch(() => -1),
    prisma.user.count({ where: { clientPortalVariant: "PORTAL" } }).catch(() => -1),
  ]);

  return NextResponse.json(
    {
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
    },
    { headers: { "cache-control": "no-store" } },
  );
}
