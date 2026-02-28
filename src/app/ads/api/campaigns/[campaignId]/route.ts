import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const user = await requireAdsUser();
  const { campaignId } = await ctx.params;

  const row = await prisma.portalAdCampaign.findFirst({
    where: { id: campaignId, createdById: user.id },
    select: {
      id: true,
      name: true,
      enabled: true,
      placement: true,
      startAt: true,
      endAt: true,
      targetJson: true,
      creativeJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, campaign: row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const user = await requireAdsUser();
  const { campaignId } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  if (parsed.data.enabled === undefined) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.portalAdCampaign.updateMany({
    where: { id: campaignId, createdById: user.id },
    data: {
      enabled: parsed.data.enabled,
      updatedById: user.id,
    },
  });

  if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
