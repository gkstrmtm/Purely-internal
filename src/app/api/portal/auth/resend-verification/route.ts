import { NextResponse } from "next/server";

import { requirePortalUser } from "@/lib/portalAuth";
import { prisma } from "@/lib/db";
import { sendVerifyEmail } from "@/lib/portalEmailVerification.server";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function publicResendVerificationError(reason: string): string {
  const normalized = String(reason || "").toLowerCase();
  if (
    normalized.includes("inactive") ||
    normalized.includes("suppression") ||
    normalized.includes("suppressed") ||
    normalized.includes("hard bounce") ||
    normalized.includes("spam complaint")
  ) {
    return "We could not send a verification email to this address right now. Please contact support so we can help verify your account.";
  }
  return "Unable to resend verification email right now. Please try again in a minute.";
}

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
  if (!res.ok) {
    return NextResponse.json({ error: publicResendVerificationError(res.reason) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
