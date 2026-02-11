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
    tagIds: z.array(z.string().min(1)).max(100).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

function readTagIds(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const out: string[] = [];
  for (const x of json) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalNurtureSchema();

  const campaign = await prisma.portalNurtureCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: { id: true, status: true, audienceTagIdsJson: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (campaign.status !== "ACTIVE") {
    return NextResponse.json({ ok: false, error: "Activate the campaign before enrolling contacts." }, { status: 400 });
  }

  const tagIds = (parsed.data.tagIds && parsed.data.tagIds.length ? parsed.data.tagIds : readTagIds(campaign.audienceTagIdsJson)).filter(
    Boolean,
  );

  if (!tagIds.length) {
    return NextResponse.json({ ok: false, error: "Select at least one audience tag before enrolling." }, { status: 400 });
  }

  // Find contacts that have ANY of the selected tags.
  const matches = await prisma.portalContactTagAssignment.findMany({
    where: { ownerId, tagId: { in: tagIds } },
    select: { contactId: true },
    take: 5000,
  });

  const contactIds = Array.from(new Set(matches.map((m) => String(m.contactId))));

  if (parsed.data.dryRun) {
    return NextResponse.json({ ok: true, wouldEnroll: contactIds.length });
  }

  const steps = await prisma.portalNurtureStep.findMany({
    where: { ownerId, campaignId },
    select: { ord: true, delayMinutes: true },
    orderBy: [{ ord: "asc" }],
    take: 1,
  });

  const firstDelay = steps.length ? Math.max(0, Number(steps[0].delayMinutes) || 0) : 0;

  const now = new Date();
  const firstSendAt = new Date(now.getTime() + firstDelay * 60 * 1000);

  // Create enrollments idempotently (unique on campaignId+contactId).
  // We can’t use createMany(skipDuplicates) reliably across all Prisma configs,
  // so we do a simple transaction per batch.
  const batchSize = 200;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    await prisma.$transaction(
      batch.map((contactId) => {
        const id = crypto.randomUUID();
        return prisma.portalNurtureEnrollment.upsert({
          where: { campaignId_contactId: { campaignId, contactId } },
          create: {
            id,
            ownerId,
            campaignId,
            contactId,
            status: "ACTIVE",
            stepIndex: 0,
            nextSendAt: firstSendAt,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            status: "ACTIVE",
            nextSendAt: firstSendAt,
            updatedAt: now,
          },
        });
      }),
    );
  }

  return NextResponse.json({ ok: true, enrolled: contactIds.length });
}
