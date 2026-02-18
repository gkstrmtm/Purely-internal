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
    kind: z.enum(["SMS", "EMAIL"]).optional(),
  })
  .strict();

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

  const campaign = await prisma.portalNurtureCampaign.findFirst({ where: { ownerId, id: campaignId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ord = await prisma.portalNurtureStep.count({ where: { ownerId, campaignId } });
  const now = new Date();

  const id = crypto.randomUUID();
  const kind = parsed.data.kind ?? "SMS";

  await prisma.portalNurtureStep.create({
    data: {
      id,
      ownerId,
      campaignId,
      ord,
      kind,
      delayMinutes: ord === 0 ? 0 : 60 * 24,
      subject: kind === "EMAIL" ? "Quick question" : null,
      body:
        kind === "EMAIL"
          ? "Hi {contact.name},\n\nJust checking in. Do you want help getting this set up?\n\n– {business.name}"
          : "Hey {contact.name}, just checking in. Want help getting this set up?",
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.portalNurtureCampaign.updateMany({ where: { ownerId, id: campaignId }, data: { updatedAt: now } });

  return NextResponse.json({ ok: true, id });
}
