import { NextResponse } from "next/server";

import { requirePortalUser } from "@/lib/portalAuth";
import { prisma } from "@/lib/db";
import { sendVerifyEmail } from "@/lib/portalEmailVerification.server";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const user = await requirePortalUser();
  const userId = user.memberId || user.id;

  const hasEmailVerifiedAt = await dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerifiedAt" }).catch(() => false);

  const select: Record<string, boolean> = { email: true };
  if (hasEmailVerifiedAt) select.emailVerifiedAt = true;

  const row = await prisma.user.findUnique({ where: { id: userId }, select: select as any });
  const email = typeof (row as any)?.email === "string" ? String((row as any).email).trim() : "";
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  if (hasEmailVerifiedAt && (row as any).emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const res = await sendVerifyEmail({ userId, toEmail: email });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 502 });

  return NextResponse.json({ ok: true });
}
