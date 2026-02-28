import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAdsUser } from "@/lib/adsAuth";

export async function GET() {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const account = await prisma.adsAdvertiserAccount
    .findUnique({
      where: { userId: user.id },
      select: {
        balanceCents: true,
        currency: true,
        autoTopUpEnabled: true,
        autoTopUpThresholdCents: true,
        autoTopUpAmountCents: true,
      },
    })
    .catch(() => null);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name ?? null, role: user.role },
    account: account ?? {
      balanceCents: 0,
      currency: "USD",
      autoTopUpEnabled: false,
      autoTopUpThresholdCents: 2000,
      autoTopUpAmountCents: 5000,
    },
  });
}
