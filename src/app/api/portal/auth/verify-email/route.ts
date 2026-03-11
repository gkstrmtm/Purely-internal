import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { addCreditsTx } from "@/lib/credits";
import { verifyEmailToken } from "@/lib/portalEmailVerification.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  token: z.string().min(20).max(200),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const verified = await verifyEmailToken(parsed.data.token);
  if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 400 });

  // If this user was referred, mark verified and award credits once.
  const awardCredits = 100;

  const result = await prisma.$transaction(async (tx) => {
    const referral = await tx.portalReferral.findUnique({
      where: { invitedUserId: verified.userId },
      select: { id: true, inviterId: true, creditsAwardedAt: true },
    });

    if (!referral) return { awarded: false };

    await tx.portalReferral.update({
      where: { id: referral.id },
      data: { invitedVerifiedAt: new Date() },
      select: { id: true },
    });

    if (referral.creditsAwardedAt) return { awarded: false };

    // Best-effort anti-abuse: require IP difference if inviter recorded one.
    const inviter = await tx.user.findUnique({
      where: { id: referral.inviterId },
      select: { portalReferralCodeCreatedIp: true },
    });

    const invited = await tx.portalReferral.findUnique({
      where: { id: referral.id },
      select: { invitedIp: true },
    });

    const inviterIp = String(inviter?.portalReferralCodeCreatedIp || "").trim();
    const invitedIp = String(invited?.invitedIp || "").trim();

    if (!inviterIp || !invitedIp) {
      return { awarded: false };
    }

    if (inviterIp === invitedIp) {
      return { awarded: false };
    }

    await addCreditsTx(tx as any, referral.inviterId, awardCredits);

    await tx.portalReferral.update({
      where: { id: referral.id },
      data: { creditsAwardedAt: new Date() },
      select: { id: true },
    });

    return { awarded: true };
  });

  return NextResponse.json({ ok: true, ...(result.awarded ? { referralCreditsAwarded: awardCredits } : {}) });
}
