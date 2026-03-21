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

const callOutcomeTaggingPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    onCompletedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    onFailedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    onSkippedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict();

const messageOutcomeTaggingPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    onSentTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    onFailedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    onSkippedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict();

const knowledgeBaseLocatorSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(200),
    type: z.enum(["file", "url", "text", "folder"]),
    usage_mode: z.enum(["auto", "prompt"]).optional(),
  })
  .strict();

const knowledgeBasePatchSchema = z
  .object({
    seedUrl: z.string().trim().max(500).optional(),
    crawlDepth: z.number().int().min(0).max(3).optional(),
    maxUrls: z.number().int().min(0).max(100).optional(),
    text: z.string().trim().max(20000).optional(),
    locators: z.array(knowledgeBaseLocatorSchema).max(200).optional(),
  })
  .strict();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    audienceTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    chatAudienceTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    messageChannelPolicy: z.enum(["SMS", "EMAIL", "BOTH"]).optional(),
    voiceAgentId: z.string().trim().max(120).optional(),
    manualVoiceAgentId: z.string().trim().max(120).optional(),
    voiceAgentConfig: voiceAgentConfigPatchSchema.optional(),
    voiceId: z.string().trim().max(200).optional(),
    knowledgeBase: knowledgeBasePatchSchema.optional(),
    chatAgentId: z.string().trim().max(120).optional(),
    manualChatAgentId: z.string().trim().max(120).optional(),
    chatAgentConfig: voiceAgentConfigPatchSchema.optional(),
    callOutcomeTagging: callOutcomeTaggingPatchSchema.optional(),
    messageOutcomeTagging: messageOutcomeTaggingPatchSchema.optional(),
  })
  .strict();

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function parseCallOutcomeTagging(raw: unknown) {
  const rec = safeRecord(raw);
  return {
    enabled: Boolean(rec.enabled),
    onCompletedTagIds: normalizeTagIdList(rec.onCompletedTagIds),
    onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
    onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
  };
}

function parseMessageOutcomeTagging(raw: unknown) {
  const rec = safeRecord(raw);
  return {
    enabled: Boolean(rec.enabled),
    onSentTagIds: normalizeTagIdList(rec.onSentTagIds),
    onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
    onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
  };
}

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
    select: {
      id: true,
      voiceAgentConfigJson: true,
      chatAgentConfigJson: true,
      callOutcomeTaggingJson: true,
      messageOutcomeTaggingJson: true,
      voiceId: true,
      knowledgeBaseJson: true,
    },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const data: any = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.audienceTagIds !== undefined) data.audienceTagIdsJson = normalizeTagIdList(parsed.data.audienceTagIds);
  if (parsed.data.chatAudienceTagIds !== undefined) data.chatAudienceTagIdsJson = normalizeTagIdList(parsed.data.chatAudienceTagIds);
  if (parsed.data.messageChannelPolicy !== undefined) data.messageChannelPolicy = parsed.data.messageChannelPolicy;

  if (parsed.data.voiceAgentId !== undefined) {
    const id = parsed.data.voiceAgentId.trim().slice(0, 120);
    data.voiceAgentId = id ? id : null;
  }

  if (parsed.data.manualVoiceAgentId !== undefined) {
    const id = parsed.data.manualVoiceAgentId.trim().slice(0, 120);
    data.manualVoiceAgentId = id ? id : null;
  }

  if (parsed.data.voiceId !== undefined) {
    const voiceId = parsed.data.voiceId.trim().slice(0, 200);
    data.voiceId = voiceId ? voiceId : null;
  }

  if (parsed.data.chatAgentId !== undefined) {
    const id = parsed.data.chatAgentId.trim().slice(0, 120);
    data.chatAgentId = id ? id : null;
  }

  if (parsed.data.manualChatAgentId !== undefined) {
    const id = parsed.data.manualChatAgentId.trim().slice(0, 120);
    data.manualChatAgentId = id ? id : null;
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

  if (parsed.data.knowledgeBase !== undefined) {
    const baseRec = safeRecord((existing as any).knowledgeBaseJson);
    const base = {
      version: 1,
      seedUrl: typeof baseRec.seedUrl === "string" ? String(baseRec.seedUrl).trim().slice(0, 500) : "",
      crawlDepth: typeof baseRec.crawlDepth === "number" && Number.isFinite(baseRec.crawlDepth) ? Math.max(0, Math.min(3, Math.floor(baseRec.crawlDepth))) : 0,
      maxUrls: typeof baseRec.maxUrls === "number" && Number.isFinite(baseRec.maxUrls) ? Math.max(0, Math.min(100, Math.floor(baseRec.maxUrls))) : 0,
      text: typeof baseRec.text === "string" ? String(baseRec.text).trim().slice(0, 20000) : "",
      locators: Array.isArray(baseRec.locators) ? baseRec.locators : [],
    };

    const patch = parsed.data.knowledgeBase;
    const next = {
      ...base,
      ...(patch.seedUrl !== undefined ? { seedUrl: patch.seedUrl.trim().slice(0, 500) } : {}),
      ...(patch.crawlDepth !== undefined ? { crawlDepth: patch.crawlDepth } : {}),
      ...(patch.maxUrls !== undefined ? { maxUrls: patch.maxUrls } : {}),
      ...(patch.text !== undefined ? { text: patch.text.trim().slice(0, 20000) } : {}),
      ...(patch.locators !== undefined ? { locators: patch.locators.slice(0, 200) } : {}),
      updatedAtIso: new Date().toISOString(),
    };

    data.knowledgeBaseJson = next as any;
  }

  if (parsed.data.chatAgentConfig !== undefined) {
    const base = parseVoiceAgentConfig(existing.chatAgentConfigJson);
    const patch = parsed.data.chatAgentConfig;

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

    data.chatAgentConfigJson = next as any;
  }

  if (parsed.data.callOutcomeTagging !== undefined) {
    const base = parseCallOutcomeTagging((existing as any).callOutcomeTaggingJson);
    const patch = parsed.data.callOutcomeTagging;

    const next = {
      ...base,
      ...(patch.enabled !== undefined ? { enabled: Boolean(patch.enabled) } : {}),
      ...(patch.onCompletedTagIds !== undefined ? { onCompletedTagIds: normalizeTagIdList(patch.onCompletedTagIds) } : {}),
      ...(patch.onFailedTagIds !== undefined ? { onFailedTagIds: normalizeTagIdList(patch.onFailedTagIds) } : {}),
      ...(patch.onSkippedTagIds !== undefined ? { onSkippedTagIds: normalizeTagIdList(patch.onSkippedTagIds) } : {}),
    };

    data.callOutcomeTaggingJson = next as any;
  }

  if (parsed.data.messageOutcomeTagging !== undefined) {
    const base = parseMessageOutcomeTagging((existing as any).messageOutcomeTaggingJson);
    const patch = parsed.data.messageOutcomeTagging;

    const next = {
      ...base,
      ...(patch.enabled !== undefined ? { enabled: Boolean(patch.enabled) } : {}),
      ...(patch.onSentTagIds !== undefined ? { onSentTagIds: normalizeTagIdList(patch.onSentTagIds) } : {}),
      ...(patch.onFailedTagIds !== undefined ? { onFailedTagIds: normalizeTagIdList(patch.onFailedTagIds) } : {}),
      ...(patch.onSkippedTagIds !== undefined ? { onSkippedTagIds: normalizeTagIdList(patch.onSkippedTagIds) } : {}),
    };

    data.messageOutcomeTaggingJson = next as any;
  }

  await prisma.portalAiOutboundCallCampaign.update({
    where: { id: campaignId.data },
    data,
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
