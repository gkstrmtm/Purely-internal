import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { normalizeTagIdList } from "@/lib/portalAiOutboundCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireClientSessionForService("aiOutboundCalls");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await ensurePortalAiOutboundCallsSchema();

  const campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
    where: { ownerId },
    select: { id: true, name: true, status: true, script: true, audienceTagIdsJson: true, createdAt: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const campaignIds = campaigns.map((c) => c.id);
  const enrollAgg = campaignIds.length
    ? await prisma.portalAiOutboundCallEnrollment.groupBy({
        by: ["campaignId", "status"],
        where: { ownerId, campaignId: { in: campaignIds } },
        _count: { _all: true },
      })
    : [];

  const countsByCampaign = new Map<string, { queued: number; completed: number }>();
  for (const row of enrollAgg) {
    const campaignId = String(row.campaignId);
    const status = String((row as any).status);
    const count = Number((row as any)?._count?._all ?? 0);
    const next = countsByCampaign.get(campaignId) ?? { queued: 0, completed: 0 };
    if (status === "QUEUED") next.queued += count;
    if (status === "COMPLETED") next.completed += count;
    countsByCampaign.set(campaignId, next);
  }

  return NextResponse.json({
    ok: true,
    campaigns: campaigns.map((c) => {
      const counts = countsByCampaign.get(String(c.id)) ?? { queued: 0, completed: 0 };
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        script: c.script,
        audienceTagIds: normalizeTagIdList(c.audienceTagIdsJson),
        createdAtIso: c.createdAt.toISOString(),
        updatedAtIso: c.updatedAt.toISOString(),
        enrollQueued: counts.queued,
        enrollCompleted: counts.completed,
      };
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalAiOutboundCallsSchema();

  const now = new Date();
  const id = crypto.randomUUID();
  const name = parsed.data.name?.trim() || "New campaign";

  await prisma.portalAiOutboundCallCampaign.create({
    data: {
      id,
      ownerId,
      name,
      status: "DRAFT",
      script: "Hi {contact.name} — this is {business.name}. We saw your recent request and wanted to help. If now isn’t a good time, you can call us back.",
      audienceTagIdsJson: [],
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id });
}
