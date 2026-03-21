import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import {
  buildElevenLabsAgentPrompt,
  createElevenLabsAgent,
  getElevenLabsAgent,
  type KnowledgeBaseLocator,
  parseElevenLabsAgentPromptToVoiceAgentConfig,
  patchElevenLabsAgent,
} from "@/lib/elevenLabsConvai";
import { resolveElevenLabsConvaiToolIdsByKeys } from "@/lib/elevenLabsConvai";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";
import { resolveToolIdsForKeys } from "@/lib/voiceAgentTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

function normalizeToolKey(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function parseKnowledgeBaseLocators(raw: unknown): KnowledgeBaseLocator[] {
  const rec = safeRecord(raw);
  const xs = Array.isArray((rec as any).locators) ? ((rec as any).locators as any[]) : [];
  const out: KnowledgeBaseLocator[] = [];
  for (const x of xs) {
    const xr = safeRecord(x);
    const id = typeof xr.id === "string" ? xr.id.trim().slice(0, 200) : "";
    const name = typeof xr.name === "string" ? xr.name.trim().slice(0, 200) : "";
    const typeRaw = typeof xr.type === "string" ? xr.type.trim().toLowerCase() : "";
    const type = typeRaw === "file" || typeRaw === "url" || typeRaw === "text" || typeRaw === "folder" ? (typeRaw as any) : null;
    const usageRaw = typeof (xr as any).usage_mode === "string" ? String((xr as any).usage_mode).trim().toLowerCase() : "";
    const usage_mode = usageRaw === "prompt" ? "prompt" : usageRaw === "auto" ? "auto" : undefined;
    if (!id || !name || !type) continue;
    out.push({ id, name, type, ...(usage_mode ? { usage_mode } : {}) });
    if (out.length >= 120) break;
  }
  return out;
}

async function getProfileVoiceAgentApiKey(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentApiKey;
  const key = typeof raw === "string" ? raw.trim().slice(0, 400) : "";
  return key || envVoiceAgentApiKey() || null;
}

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
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

  await ensurePortalAiOutboundCallsSchema();

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: { id: true, name: true, chatAgentId: true, manualChatAgentId: true, chatAgentConfigJson: true, knowledgeBaseJson: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const manualAgentId = String((campaign as any).manualChatAgentId || "").trim();
  const hasManualOverride = Boolean(manualAgentId);

  const apiKey = ((await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing voice agent API key. Set it in Profile first." },
      { status: 400 },
    );
  }

  const config = parseVoiceAgentConfig(campaign.chatAgentConfigJson);
  const knowledgeBase = parseKnowledgeBaseLocators((campaign as any).knowledgeBaseJson);

  const [profile, ownerUser] = await Promise.all([
    prisma.businessProfile
      .findUnique({ where: { ownerId }, select: { businessName: true } })
      .catch(() => null),
    prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }).catch(() => null),
  ]);

  const prompt = buildElevenLabsAgentPrompt(config, {
    businessName: profile?.businessName || null,
    ownerName: ownerUser?.name || null,
  });
  const firstMessage = config.firstMessage.trim();

  const localConfigIsEmpty =
    !firstMessage &&
    !config.goal.trim() &&
    !config.personality.trim() &&
    !config.tone.trim() &&
    !config.environment.trim() &&
    !config.guardRails.trim() &&
    !(Array.isArray(config.toolIds) && config.toolIds.length) &&
    !(Array.isArray(config.toolKeys) && config.toolKeys.length);

  let resolvedToolIds: string[] = [];
  if (Array.isArray(config.toolIds) && config.toolIds.length) {
    resolvedToolIds = config.toolIds;
  } else if (Array.isArray(config.toolKeys) && config.toolKeys.length) {
    const resolved = await resolveElevenLabsConvaiToolIdsByKeys({ apiKey, toolKeys: config.toolKeys }).catch(() => null);
    if (resolved && (resolved as any).ok === true) {
      const map = (resolved as any).toolIds as Record<string, string[]>;
      const flat = config.toolKeys
        .map((k) => normalizeToolKey(k))
        .filter(Boolean)
        .flatMap((k) => (Array.isArray((map as any)[k]) ? (map as any)[k] : []));
      resolvedToolIds = flat;
    }
  }

  // Last-resort fallback when env vars are set for tool IDs.
  if (!resolvedToolIds.length && Array.isArray(config.toolKeys) && config.toolKeys.length) {
    resolvedToolIds = resolveToolIdsForKeys(config.toolKeys);
  }

  resolvedToolIds = resolvedToolIds
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 50);

  let agentId = manualAgentId || String(campaign.chatAgentId || "").trim();
  let createdAgentId: string | null = null;

  if (!agentId && !hasManualOverride) {
    const create = await createElevenLabsAgent({
      apiKey,
      name: `Purely AI outbound - Chat - ${campaign.name}`.slice(0, 160),
      firstMessage: firstMessage || undefined,
      prompt: prompt || undefined,
      toolIds: resolvedToolIds,
      knowledgeBase: knowledgeBase.length ? knowledgeBase : undefined,
    });

    if (!create.ok) {
      return NextResponse.json({ ok: false, error: create.error }, { status: create.status || 502 });
    }

    createdAgentId = create.agentId;
    agentId = create.agentId;

    await prisma.portalAiOutboundCallCampaign.updateMany({
      where: { id: campaign.id, ownerId },
      data: { chatAgentId: agentId },
    });
  }

  if (localConfigIsEmpty && agentId && !createdAgentId) {
    const remote = await getElevenLabsAgent({ apiKey, agentId });
    if (remote.ok) {
      const parsedPrompt = parseElevenLabsAgentPromptToVoiceAgentConfig(remote.prompt);
      const nextConfig = {
        ...config,
        ...(remote.firstMessage ? { firstMessage: remote.firstMessage } : {}),
        ...parsedPrompt,
        ...(remote.toolIds.length ? { toolIds: remote.toolIds } : {}),
      };

      await prisma.portalAiOutboundCallCampaign.updateMany({
        where: { id: campaign.id, ownerId },
        data: { chatAgentConfigJson: nextConfig as any },
      });

      return NextResponse.json({ ok: true, agentId, createdAgentId: createdAgentId || undefined, pulled: true });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Messages agent config is empty, so there is nothing to sync. Add a First message/Goal/etc, or try again after fixing voice agent connectivity.",
        details: remote.error,
      },
      { status: remote.status || 400 },
    );
  }

  const result = await patchElevenLabsAgent({
    apiKey,
    agentId,
    firstMessage: firstMessage || undefined,
    prompt: prompt || undefined,
    toolIds: resolvedToolIds,
    knowledgeBase: knowledgeBase.length ? knowledgeBase : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 502 });
  }

  return NextResponse.json({
    ok: true,
    agentId,
    createdAgentId: createdAgentId || undefined,
    noop: result.noop || undefined,
    agent: result.agent,
  });
}
