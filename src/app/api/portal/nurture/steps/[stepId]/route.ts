import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    ord: z.number().int().min(0).max(200).optional(),
    kind: z.enum(["SMS", "EMAIL"]).optional(),
    delayMinutes: z.number().int().min(0).max(60 * 24 * 365).optional(),
    subject: z.string().max(200).optional().nullable(),
    body: z.string().min(1).max(8000).optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ stepId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { stepId } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalNurtureSchema();

  const existing = await prisma.portalNurtureStep.findFirst({
    where: { ownerId, id: stepId },
    select: { id: true, campaignId: true, ord: true },
  });

  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const now = new Date();

  if (parsed.data.ord !== undefined && parsed.data.ord !== existing.ord) {
    const steps = await prisma.portalNurtureStep.findMany({
      where: { ownerId, campaignId: existing.campaignId },
      select: { id: true, ord: true },
      orderBy: [{ ord: "asc" }],
    });

    const toMove = steps.find((s) => s.id === existing.id);
    if (!toMove) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const without = steps.filter((s) => s.id !== existing.id);
    const nextIndex = Math.max(0, Math.min(without.length, parsed.data.ord));
    without.splice(nextIndex, 0, toMove);

    await prisma.$transaction(
      without.map((s, idx) =>
        prisma.portalNurtureStep.update({
          where: { id: s.id },
          data: { ord: idx, updatedAt: now },
        }),
      ),
    );
  }

  const data: any = { updatedAt: now };
  if (parsed.data.kind !== undefined) data.kind = parsed.data.kind;
  if (parsed.data.delayMinutes !== undefined) data.delayMinutes = parsed.data.delayMinutes;
  if (parsed.data.subject !== undefined) data.subject = parsed.data.subject;
  if (parsed.data.body !== undefined) data.body = parsed.data.body;

  await prisma.portalNurtureStep.updateMany({ where: { ownerId, id: stepId }, data });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ stepId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { stepId } = await ctx.params;

  await ensurePortalNurtureSchema();

  const step = await prisma.portalNurtureStep.findFirst({
    where: { ownerId, id: stepId },
    select: { id: true, campaignId: true },
  });

  if (!step) return NextResponse.json({ ok: true });

  const now = new Date();

  await prisma.portalNurtureStep.deleteMany({ where: { ownerId, id: stepId } });

  const remaining = await prisma.portalNurtureStep.findMany({
    where: { ownerId, campaignId: step.campaignId },
    select: { id: true },
    orderBy: [{ ord: "asc" }],
  });

  await prisma.$transaction(
    remaining.map((s, idx) =>
      prisma.portalNurtureStep.update({
        where: { id: s.id },
        data: { ord: idx, updatedAt: now },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}
