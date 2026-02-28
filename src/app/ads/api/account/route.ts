import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const patchSchema = z
  .object({
    autoTopUpEnabled: z.boolean().optional(),
    autoTopUpThresholdCents: z.number().int().min(0).max(1_000_000_00).optional(),
    autoTopUpAmountCents: z.number().int().min(100).max(1_000_000_00).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const user = await requireAdsUser();

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  try {
    const account = await prisma.adsAdvertiserAccount.upsert({
      where: { userId: user.id },
      update: {
        ...(parsed.data.autoTopUpEnabled === undefined ? {} : { autoTopUpEnabled: parsed.data.autoTopUpEnabled }),
        ...(parsed.data.autoTopUpThresholdCents === undefined
          ? {}
          : { autoTopUpThresholdCents: parsed.data.autoTopUpThresholdCents }),
        ...(parsed.data.autoTopUpAmountCents === undefined
          ? {}
          : { autoTopUpAmountCents: parsed.data.autoTopUpAmountCents }),
      },
      create: {
        userId: user.id,
        autoTopUpEnabled: parsed.data.autoTopUpEnabled ?? false,
        autoTopUpThresholdCents: parsed.data.autoTopUpThresholdCents ?? 2000,
        autoTopUpAmountCents: parsed.data.autoTopUpAmountCents ?? 5000,
      },
      select: {
        balanceCents: true,
        currency: true,
        autoTopUpEnabled: true,
        autoTopUpThresholdCents: true,
        autoTopUpAmountCents: true,
      },
    });

    return NextResponse.json({ ok: true, account });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Auto top-up settings are not available yet (database not migrated).",
      },
      { status: 503 },
    );
  }
}
