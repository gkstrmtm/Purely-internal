import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireClientSessionForService("nurtureCampaigns");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  await ensurePortalNurtureSchema();

  const campaigns = await prisma.portalNurtureCampaign.findMany({
    where: { ownerId },
    select: { id: true, name: true, status: true, updatedAt: true, createdAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const campaignIds = campaigns.map((c) => c.id);

  const [stepsAgg, enrollAgg] = await Promise.all([
    prisma.portalNurtureStep.groupBy({
      by: ["campaignId"],
      where: { ownerId, campaignId: { in: campaignIds } },
      _count: { _all: true },
    }),
    prisma.portalNurtureEnrollment.groupBy({
      by: ["campaignId", "status"],
      where: { ownerId, campaignId: { in: campaignIds } },
      _count: { _all: true },
    }),
  ]);

  const stepsCountByCampaign = new Map<string, number>();
  for (const row of stepsAgg) {
    stepsCountByCampaign.set(String(row.campaignId), Number((row as any)?._count?._all ?? 0));
  }

  const enrollCountsByCampaign = new Map<string, { active: number; completed: number; stopped: number }>();
  for (const row of enrollAgg) {
    const id = String(row.campaignId);
    const next = enrollCountsByCampaign.get(id) ?? { active: 0, completed: 0, stopped: 0 };
    const status = String((row as any).status);
    const count = Number((row as any)?._count?._all ?? 0);
    if (status === "ACTIVE") next.active += count;
    else if (status === "COMPLETED") next.completed += count;
    else if (status === "STOPPED") next.stopped += count;
    enrollCountsByCampaign.set(id, next);
  }

  return NextResponse.json({
    ok: true,
    campaigns: campaigns.map((c) => {
      const enroll = enrollCountsByCampaign.get(String(c.id)) ?? { active: 0, completed: 0, stopped: 0 };
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        createdAtIso: c.createdAt.toISOString(),
        updatedAtIso: c.updatedAt.toISOString(),
        stepsCount: stepsCountByCampaign.get(String(c.id)) ?? 0,
        enrollments: enroll,
      };
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalNurtureSchema();

  const now = new Date();
  const id = crypto.randomUUID();

  const name = parsed.data.name?.trim() || "New campaign";

  await prisma.portalNurtureCampaign.create({
    data: {
      id,
      ownerId,
      name,
      status: "DRAFT",
      smsFooter: "Reply STOP to opt out.",
      emailFooter: "",
      createdAt: now,
      updatedAt: now,
    },
  });

  const stepId = crypto.randomUUID();
  await prisma.portalNurtureStep.create({
    data: {
      id: stepId,
      ownerId,
      campaignId: id,
      ord: 0,
      kind: "SMS",
      delayMinutes: 0,
      body: "Hey {contact.name}, just checking in — any questions I can help with?",
      createdAt: now,
      updatedAt: now,
    },
  });

  return NextResponse.json({ ok: true, id });
}
