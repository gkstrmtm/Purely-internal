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

  await prisma.$transaction(async (tx) => {
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

    // Award credits once the invited user verifies their email.
    // Avoid overly-strict IP gating (it caused legit referrals to never award).
    // Self-referrals are already blocked at signup; keep the award logic simple and reliable.
    if (!referral.inviterId || referral.inviterId === verified.userId) return { awarded: false };

    await addCreditsTx(tx as any, referral.inviterId, awardCredits);

    await tx.portalReferral.update({
      where: { id: referral.id },
      data: { creditsAwardedAt: new Date() },
      select: { id: true },
    });

    return { awarded: true };
  });

  // Don't message the invited user about the inviter's credits.
  return NextResponse.json({ ok: true, alreadyVerified: Boolean((verified as any).alreadyVerified) });
}
