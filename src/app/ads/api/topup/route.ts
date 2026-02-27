import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const bodySchema = z.object({
  amountCents: z.number().int().min(100).max(1_000_000_00),
});

export async function POST(req: Request) {
  const user = await requireAdsUser();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const amountCents = parsed.data.amountCents;

  const out = await prisma.$transaction(async (tx) => {
    const account = await tx.adsAdvertiserAccount.upsert({
      where: { userId: user.id },
      update: { balanceCents: { increment: amountCents } },
      create: { userId: user.id, balanceCents: amountCents },
      select: { id: true, balanceCents: true, currency: true },
    });

    await tx.adsAdvertiserLedgerEntry.create({
      data: {
        accountId: account.id,
        kind: "TOPUP",
        amountCents,
        metaJson: { source: "manual" },
      },
      select: { id: true },
    });

    return account;
  });

  return NextResponse.json({ ok: true, account: out });
}
