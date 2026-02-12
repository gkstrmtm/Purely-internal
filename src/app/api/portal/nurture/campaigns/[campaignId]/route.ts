import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { ensureNurtureCampaignMonthlyCharge } from "@/lib/portalNurtureMonthlyBilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    audienceTagIds: z.array(z.string().min(1)).max(100).optional(),
    smsFooter: z.string().max(300).optional(),
    emailFooter: z.string().max(2000).optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  await ensurePortalNurtureSchema();

  const campaign = await prisma.portalNurtureCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: {
      id: true,
      name: true,
      status: true,
      audienceTagIdsJson: true,
      smsFooter: true,
      emailFooter: true,
      createdAt: true,
      updatedAt: true,
      steps: {
        select: { id: true, ord: true, kind: true, delayMinutes: true, subject: true, body: true, updatedAt: true },
        orderBy: [{ ord: "asc" }],
      },
    },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const audienceTagIds =
    Array.isArray(campaign.audienceTagIdsJson) && campaign.audienceTagIdsJson.every((x) => typeof x === "string")
      ? (campaign.audienceTagIdsJson as string[])
      : [];

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      audienceTagIds,
      smsFooter: campaign.smsFooter,
      emailFooter: campaign.emailFooter,
      createdAtIso: campaign.createdAt.toISOString(),
      updatedAtIso: campaign.updatedAt.toISOString(),
      steps: campaign.steps.map((s) => ({
        id: s.id,
        ord: s.ord,
        kind: s.kind,
        delayMinutes: s.delayMinutes,
        subject: s.subject,
        body: s.body,
        updatedAtIso: s.updatedAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalNurtureSchema();

  const existing = await prisma.portalNurtureCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: { status: true },
  });

  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const now = new Date();

  const data: any = { updatedAt: now };
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.audienceTagIds !== undefined) data.audienceTagIdsJson = parsed.data.audienceTagIds;
  if (parsed.data.smsFooter !== undefined) data.smsFooter = parsed.data.smsFooter;
  if (parsed.data.emailFooter !== undefined) data.emailFooter = parsed.data.emailFooter;

  const nextStatus = parsed.data.status;
  const isActivating = nextStatus === "ACTIVE" && existing.status !== "ACTIVE";

  if (isActivating) {
    const charged = await ensureNurtureCampaignMonthlyCharge({ ownerId, campaignId, now });
    if (!charged.ok) {
      if (charged.reason === "insufficient_credits") {
        return NextResponse.json(
          {
            ok: false,
            error: "Insufficient credits",
            code: "INSUFFICIENT_CREDITS",
            neededCredits: 29,
            balanceCredits: charged.state.balance,
          },
          { status: 402 },
        );
      }

      return NextResponse.json({ ok: false, error: "Billing is processing" }, { status: 409 });
    }
  }

  const updated = await prisma.portalNurtureCampaign.updateMany({ where: { ownerId, id: campaignId }, data });

  if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  await ensurePortalNurtureSchema();

  await prisma.portalNurtureCampaign.deleteMany({ where: { ownerId, id: campaignId } });

  return NextResponse.json({ ok: true });
}
