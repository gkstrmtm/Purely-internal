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
  const auth = await requireClientSessionForService("aiOutboundCalls");
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

  const url = new URL(req.url);
  const take = Math.max(1, Math.min(60, Number(url.searchParams.get("take") || 60) || 60));

  await ensurePortalAiOutboundCallsSchema();

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: { id: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const [statusAgg, sourceAgg, recent] = await Promise.all([
    prisma.portalAiOutboundMessageEnrollment.groupBy({
      by: ["status"],
      where: { ownerId, campaignId: campaign.id },
      _count: { _all: true },
    }),
    prisma.portalAiOutboundMessageEnrollment.groupBy({
      by: ["source"],
      where: { ownerId, campaignId: campaign.id },
      _count: { _all: true },
    }),
    prisma.portalAiOutboundMessageEnrollment.findMany({
      where: { ownerId, campaignId: campaign.id },
      select: {
        id: true,
        status: true,
        source: true,
        nextSendAt: true,
        sentFirstMessageAt: true,
        threadId: true,
        attemptCount: true,
        lastError: true,
        nextReplyAt: true,
        replyAttemptCount: true,
        replyLastError: true,
        updatedAt: true,
        createdAt: true,
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
    }),
  ]);

  const countsByStatus: Record<string, number> = {};
  for (const row of statusAgg) {
    countsByStatus[String((row as any).status)] = Number((row as any)?._count?._all ?? 0);
  }

  const countsBySource: Record<string, number> = {};
  for (const row of sourceAgg) {
    countsBySource[String((row as any).source)] = Number((row as any)?._count?._all ?? 0);
  }

  return NextResponse.json({
    ok: true,
    countsByStatus,
    countsBySource,
    recent: recent.map((e) => ({
      id: String(e.id),
      status: String(e.status),
      source: String((e as any).source || "TAG"),
      nextSendAtIso: e.nextSendAt ? e.nextSendAt.toISOString() : null,
      sentFirstMessageAtIso: e.sentFirstMessageAt ? e.sentFirstMessageAt.toISOString() : null,
      threadId: e.threadId ? String(e.threadId) : null,
      attemptCount: Number(e.attemptCount || 0),
      lastError: e.lastError ? String(e.lastError) : null,
      nextReplyAtIso: e.nextReplyAt ? e.nextReplyAt.toISOString() : null,
      replyAttemptCount: Number((e as any).replyAttemptCount || 0),
      replyLastError: (e as any).replyLastError ? String((e as any).replyLastError) : null,
      createdAtIso: e.createdAt.toISOString(),
      updatedAtIso: e.updatedAt.toISOString(),
      contact: e.contact
        ? {
            id: String(e.contact.id),
            name: e.contact.name ? String(e.contact.name) : null,
            email: e.contact.email ? String(e.contact.email) : null,
            phone: e.contact.phone ? String(e.contact.phone) : null,
          }
        : null,
    })),
  });
}
