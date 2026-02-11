import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { normalizeTagIdList } from "@/lib/portalAiOutboundCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    script: z.string().trim().min(0).max(5000).optional(),
    audienceTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalAiOutboundCallsSchema();

  const existing = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const data: any = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.script !== undefined) data.script = parsed.data.script;
  if (parsed.data.audienceTagIds !== undefined) data.audienceTagIdsJson = normalizeTagIdList(parsed.data.audienceTagIds);

  await prisma.portalAiOutboundCallCampaign.update({
    where: { id: campaignId.data },
    data,
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
