import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { hasPublicTable } from "@/lib/dbSchema";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";
import { sendVerifyEmail } from "@/lib/portalEmailVerification.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function checkAuth(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.PORTAL_EMAIL_VERIFY_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return { ok: false as const, status: 503 as const, error: "Missing PORTAL_EMAIL_VERIFY_CRON_SECRET" };
  }
  if (!secret) return { ok: true as const, status: 200 as const };

  if (!isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-portal-email-verify-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }

  return { ok: true as const, status: 200 as const };
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const [tokensTable, hasEmailVerifiedAt, hasEmailSentAt] = await Promise.all([
    hasPublicTable("PortalEmailVerificationToken").catch(() => false),
    dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerifiedAt" }).catch(() => false),
    dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerificationEmailSentAt" }).catch(() => false),
  ]);

  if (!tokensTable || !hasEmailVerifiedAt || !hasEmailSentAt) {
    return NextResponse.json({ ok: true, skipped: true, reason: "schema_not_ready" });
  }

  const cutoff = new Date(Date.now() - 10 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      emailVerifiedAt: null,
      emailVerificationEmailSentAt: null,
      createdAt: { lte: cutoff },
      active: true,
      email: { not: "" },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, email: true },
  });

  let sent = 0;
  let failed = 0;

  for (const u of users) {
    const res = await sendVerifyEmail({ userId: u.id, toEmail: u.email });
    if (res.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({ ok: true, scanned: users.length, sent, failed });
}
