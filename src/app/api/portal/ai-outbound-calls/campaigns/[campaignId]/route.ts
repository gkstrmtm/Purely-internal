import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { normalizeTagIdList } from "@/lib/portalAiOutboundCalls";
import { normalizeToolIdList, normalizeToolKeyList, parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const voiceAgentConfigPatchSchema = z
  .object({
    firstMessage: z.string().trim().max(360).optional(),
    goal: z.string().trim().max(6000).optional(),
    personality: z.string().trim().max(6000).optional(),
    environment: z.string().trim().max(6000).optional(),
    tone: z.string().trim().max(6000).optional(),
    guardRails: z.string().trim().max(6000).optional(),
    toolKeys: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    toolIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    script: z.string().trim().min(0).max(5000).optional(),
    audienceTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    voiceAgentId: z.string().trim().max(120).optional(),
    voiceAgentConfig: voiceAgentConfigPatchSchema.optional(),
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
    select: { id: true, voiceAgentConfigJson: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const data: any = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.script !== undefined) data.script = parsed.data.script;
  if (parsed.data.audienceTagIds !== undefined) data.audienceTagIdsJson = normalizeTagIdList(parsed.data.audienceTagIds);

  if (parsed.data.voiceAgentId !== undefined) {
    const id = parsed.data.voiceAgentId.trim().slice(0, 120);
    data.voiceAgentId = id ? id : null;
  }

  if (parsed.data.voiceAgentConfig !== undefined) {
    const base = parseVoiceAgentConfig(existing.voiceAgentConfigJson);
    const patch = parsed.data.voiceAgentConfig;

    const next = {
      ...base,
      ...(patch.firstMessage !== undefined ? { firstMessage: patch.firstMessage.trim().slice(0, 360) } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal.trim().slice(0, 6000) } : {}),
      ...(patch.personality !== undefined ? { personality: patch.personality.trim().slice(0, 6000) } : {}),
      ...(patch.environment !== undefined ? { environment: patch.environment.trim().slice(0, 6000) } : {}),
      ...(patch.tone !== undefined ? { tone: patch.tone.trim().slice(0, 6000) } : {}),
      ...(patch.guardRails !== undefined ? { guardRails: patch.guardRails.trim().slice(0, 6000) } : {}),
      ...(patch.toolKeys !== undefined ? { toolKeys: normalizeToolKeyList(patch.toolKeys) } : {}),
      ...(patch.toolIds !== undefined ? { toolIds: normalizeToolIdList(patch.toolIds) } : {}),
    };

    data.voiceAgentConfigJson = next as any;
  }

  await prisma.portalAiOutboundCallCampaign.update({
    where: { id: campaignId.data },
    data,
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
