import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

export async function DELETE(_req: Request, ctx: { params: Promise<{ campaignId: string; activityId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await ensurePortalAiOutboundCallsSchema();
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  const activityId = idSchema.safeParse(params.activityId);
  if (!campaignId.success || !activityId.success) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const enrollment = await prisma.portalAiOutboundMessageEnrollment.findFirst({
    where: { ownerId, campaignId: campaignId.data, id: activityId.data },
    select: { id: true },
  });
  if (!enrollment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await prisma.portalAiOutboundMessageEnrollment.delete({
    where: { id: enrollment.id },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
