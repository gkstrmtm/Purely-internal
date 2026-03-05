import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

export async function GET(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  if (!campaignId.success) return NextResponse.json({ ok: false, error: "Invalid campaign id" }, { status: 400 });

  await ensurePortalAiOutboundCallsSchema();

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: { id: true },
  });
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const agg = await prisma.portalAiOutboundCallEnrollment.groupBy({
    by: ["status"],
    where: { ownerId, campaignId: campaignId.data },
    _count: { _all: true },
  });

  const counts = { queued: 0, calling: 0, completed: 0, failed: 0, skipped: 0 };
  for (const row of agg) {
    const status = String((row as any).status || "");
    const count = Number((row as any)?._count?._all ?? 0);
    if (status === "QUEUED") counts.queued += count;
    if (status === "CALLING") counts.calling += count;
    if (status === "COMPLETED") counts.completed += count;
    if (status === "FAILED") counts.failed += count;
    if (status === "SKIPPED") counts.skipped += count;
  }

  const recent = await prisma.portalAiOutboundCallEnrollment.findMany({
    where: { ownerId, campaignId: campaignId.data },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 60,
    select: {
      id: true,
      status: true,
      nextCallAt: true,
      callSid: true,
      attemptCount: true,
      lastError: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      contact: { select: { id: true, name: true, phone: true, email: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    counts,
    recent: recent.map((e) => ({
      id: e.id,
      status: e.status,
      attemptCount: e.attemptCount,
      lastError: e.lastError,
      callSid: e.callSid,
      nextCallAtIso: e.nextCallAt ? e.nextCallAt.toISOString() : null,
      completedAtIso: e.completedAt ? e.completedAt.toISOString() : null,
      createdAtIso: e.createdAt.toISOString(),
      updatedAtIso: e.updatedAt.toISOString(),
      contact: {
        id: e.contact.id,
        name: e.contact.name,
        phone: e.contact.phone,
        email: e.contact.email,
      },
    })),
  });
}
