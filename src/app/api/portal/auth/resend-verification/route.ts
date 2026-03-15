import { NextResponse } from "next/server";

import { requirePortalUser } from "@/lib/portalAuth";
import { prisma } from "@/lib/db";
import { sendVerifyEmail } from "@/lib/portalEmailVerification.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const user = await requirePortalUser();
  const userId = user.memberId || user.id;

  const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  if (!row?.email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  if (row.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const res = await sendVerifyEmail({ userId, toEmail: row.email });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 502 });

  return NextResponse.json({ ok: true });
}
