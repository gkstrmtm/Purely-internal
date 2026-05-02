import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { prisma } from "@/lib/db";
import {
  buildElevenLabsAgentPrompt,
  createElevenLabsAgent,
  getElevenLabsAgent,
  patchElevenLabsAgent,
  resolveElevenLabsConvaiToolIdsByKeys,
  type KnowledgeBaseLocator,
} from "@/lib/elevenLabsConvai";
import { buildOutboundIntelligenceBrief } from "@/lib/portalAiOutboundIntelligence";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";
import { resolveToolIdsForKeys } from "@/lib/voiceAgentTools";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const value = (process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function envVoiceAgentId(): string {
  return envFirst(["VOICE_AGENT_ID", "ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID"]).slice(0, 120);
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function normalizeToolKey(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseKnowledgeBaseLocators(raw: unknown): KnowledgeBaseLocator[] {
  const rec = safeRecord(raw);
  const items = Array.isArray((rec as any).locators) ? ((rec as any).locators as any[]) : [];
  const out: KnowledgeBaseLocator[] = [];
  for (const item of items) {
    const locator = safeRecord(item);
    const id = typeof locator.id === "string" ? locator.id.trim().slice(0, 200) : "";
    const name = typeof locator.name === "string" ? locator.name.trim().slice(0, 200) : "";
    const typeRaw = typeof locator.type === "string" ? locator.type.trim().toLowerCase() : "";
    const type = typeRaw === "file" || typeRaw === "url" || typeRaw === "text" || typeRaw === "folder" ? typeRaw : null;
    const usageRaw = typeof (locator as any).usage_mode === "string" ? String((locator as any).usage_mode).trim().toLowerCase() : "";
    const usage_mode = usageRaw === "prompt" ? "prompt" : usageRaw === "auto" ? "auto" : undefined;
    if (!id || !name || !type) continue;
    out.push({ id, name, type, ...(usage_mode ? { usage_mode } : {}) });
    if (out.length >= 120) break;
  }
  return out;
}

function mergeUniqueStrings(values: Array<string | null | undefined>, max = 50): string[] {
  const out: string[] = [];
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (!next || out.includes(next)) continue;
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function buildOutboundGoalLead(goal: string): string {
  const normalizedGoal = String(goal || "")
    .trim()
    .replace(/\b(?:real\s+quick|really\s+quick)\b/gi, "")
    .replace(/\band\s+see\s+what\s+happened\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim();
  if (!normalizedGoal) return "";
  if (/^(?:booking|rebooking|consultation|automation|ai\s+receptionist|missed\s+consultation|follow-up|follow up)/i.test(normalizedGoal)) {
    return `I'm calling about ${normalizedGoal}.`;
  }
  if (/^following\s+up\s+about\b/i.test(normalizedGoal)) {
    return `I'm ${normalizedGoal}.`;
  }
  if (/^following\s+up\s+on\b/i.test(normalizedGoal)) {
    return `I'm ${normalizedGoal}.`;
  }
  if (/^follow\s+up\s+about\b/i.test(normalizedGoal)) {
    return `I'm calling to ${normalizedGoal.replace(/^follow\s+up\s+/i, "follow up ")}.`;
  }
  if (/^follow(?:ing)?\s+up\b/i.test(normalizedGoal)) {
    return `I'm ${normalizedGoal}.`;
  }
  if (/^(?:check(?:ing)?\s+in|see\s+if|rebook|book|get|help|reviv)/i.test(normalizedGoal)) {
    return `I'm calling to ${normalizedGoal}.`;
  }
  return `I'm calling about ${normalizedGoal}.`;
}

function isLegacyGeneratedOutboundFirstMessage(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!text) return false;
  return text.includes("did i catch you at a bad time?");
}

export function requiredOutboundToolKeys(config: ReturnType<typeof parseVoiceAgentConfig>): string[] {
  return mergeUniqueStrings(["voicemail_detection", "end_call", ...config.toolKeys.map((key) => normalizeToolKey(key))]);
}

export async function resolveRequiredOutboundTooling(opts: {
  apiKey: string;
  config: ReturnType<typeof parseVoiceAgentConfig>;
}): Promise<{
  desiredToolKeys: string[];
  resolvedToolIds: string[];
  resolvedToolIdsByKey: Record<string, string[]>;
  missingRequiredToolKeys: string[];
}> {
  const desiredToolKeys = requiredOutboundToolKeys(opts.config);
  const resolvedToolIdsByKey: Record<string, string[]> = {};
  for (const key of desiredToolKeys) resolvedToolIdsByKey[key] = [];

  const remoteResolved = await resolveElevenLabsConvaiToolIdsByKeys({ apiKey: opts.apiKey, toolKeys: desiredToolKeys }).catch(() => null);
  if (remoteResolved && (remoteResolved as any).ok === true) {
    const map = (remoteResolved as any).toolIds as Record<string, string[]>;
    for (const key of desiredToolKeys) {
      const normalized = normalizeToolKey(key);
      const ids = Array.isArray((map as any)[normalized]) ? (map as any)[normalized] : [];
      resolvedToolIdsByKey[key] = mergeUniqueStrings([...(resolvedToolIdsByKey[key] || []), ...ids]);
    }
  }

  for (const key of desiredToolKeys) {
    resolvedToolIdsByKey[key] = mergeUniqueStrings([...(resolvedToolIdsByKey[key] || []), ...resolveToolIdsForKeys([key])]);
  }

  const resolvedToolIds = mergeUniqueStrings([
    ...(Array.isArray(opts.config.toolIds) ? opts.config.toolIds : []),
    ...Object.values(resolvedToolIdsByKey).flat(),
  ]).slice(0, 50);

  const missingRequiredToolKeys = ["end_call"]
    .filter((key) => desiredToolKeys.includes(key))
    .filter((key) => !(resolvedToolIdsByKey[key] || []).length)
    .filter(() => !(Array.isArray(opts.config.toolIds) && opts.config.toolIds.length));

  return {
    desiredToolKeys,
    resolvedToolIds,
    resolvedToolIdsByKey,
    missingRequiredToolKeys,
  };
}

export function buildDefaultAiOutboundCallFirstMessage(identity?: {
  businessName?: string | null;
  ownerName?: string | null;
  goal?: string | null;
}): string {
  const businessName = String(identity?.businessName || "").trim() || "our team";
  const ownerName = String(identity?.ownerName || "").trim();
  const goal = String(identity?.goal || "").trim().replace(/[.]+$/g, "");
  const caller = ownerName ? `${ownerName} from ${businessName}` : `the team at ${businessName}`;
  const goalLead = buildOutboundGoalLead(goal);
  return `Hi, this is ${caller}.${goalLead ? ` ${goalLead}` : ""}`.slice(0, 360);
}

export async function getProfileVoiceAgentId(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentId;
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id || envVoiceAgentId() || null;
}

export async function getProfileVoiceAgentApiKey(ownerId: string): Promise<string | null> {
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

export async function ensureAiOutboundCallCampaignVoiceAgent(opts: {
  ownerId: string;
  campaignId: string;
}): Promise<
  | { ok: true; agentId: string; apiKey: string; createdAgentId?: string }
  | { ok: false; error: string; status?: number }
> {
  const ownerId = String(opts.ownerId || "").trim();
  const campaignId = String(opts.campaignId || "").trim();
  if (!ownerId || !campaignId) return { ok: false, error: "Missing ownerId or campaignId", status: 400 };

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: {
      id: true,
      name: true,
      voiceAgentId: true,
      manualVoiceAgentId: true,
      voiceAgentConfigJson: true,
      voiceId: true,
      knowledgeBaseJson: true,
    },
  });
  if (!campaign) return { ok: false, error: "Campaign not found", status: 404 };

  const [profileApiKey, receptionist, profileAgentId, profile, ownerUser, twilio] = await Promise.all([
    getProfileVoiceAgentApiKey(ownerId).catch(() => null),
    getAiReceptionistServiceData(ownerId).catch(() => null),
    getProfileVoiceAgentId(ownerId).catch(() => null),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }).catch(() => null),
    getOwnerTwilioSmsConfig(ownerId).catch(() => null),
  ]);

  const apiKey = String(profileApiKey || "").trim() || String(receptionist?.settings?.voiceAgentApiKey || "").trim();
  if (!apiKey) return { ok: false, error: "Missing voice agent API key. Set it in Profile first.", status: 400 };

  const config = parseVoiceAgentConfig((campaign as any).voiceAgentConfigJson);
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const outboundBrief = buildOutboundIntelligenceBrief({
    campaignName: campaign.name,
    kind: "calls",
    businessContext,
    config,
  });
  const generatedFirstMessage = buildDefaultAiOutboundCallFirstMessage({
    businessName: profile?.businessName || null,
    ownerName: ownerUser?.name || null,
    goal: config.goal || null,
  });
  const configuredFirstMessage = config.firstMessage.trim();
  const shouldReplaceConfiguredFirstMessage = !configuredFirstMessage || isLegacyGeneratedOutboundFirstMessage(configuredFirstMessage);
  const effectiveFirstMessage = shouldReplaceConfiguredFirstMessage ? generatedFirstMessage : configuredFirstMessage;
  if (shouldReplaceConfiguredFirstMessage && effectiveFirstMessage) {
    await prisma.portalAiOutboundCallCampaign
      .updateMany({
        where: { id: campaign.id, ownerId },
        data: {
          voiceAgentConfigJson: {
            ...config,
            firstMessage: effectiveFirstMessage,
          } as any,
          updatedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  const knowledgeBase = parseKnowledgeBaseLocators((campaign as any).knowledgeBaseJson);
  const voiceId = typeof (campaign as any).voiceId === "string" ? String((campaign as any).voiceId).trim().slice(0, 200) : "";
  const manualAgentId = String((campaign as any).manualVoiceAgentId || "").trim();
  const existingCampaignAgentId = String((campaign as any).voiceAgentId || "").trim();
  const fallbackRemoteAgentId = manualAgentId || existingCampaignAgentId;

  const tooling = await resolveRequiredOutboundTooling({ apiKey, config });
  const desiredToolKeys = tooling.desiredToolKeys;
  let resolvedToolIds = tooling.resolvedToolIds;
  let missingRequiredToolKeys = tooling.missingRequiredToolKeys;
  if (missingRequiredToolKeys.length && fallbackRemoteAgentId) {
    const remoteAgent = await getElevenLabsAgent({ apiKey, agentId: fallbackRemoteAgentId }).catch(() => null);
    if (remoteAgent?.ok && Array.isArray(remoteAgent.toolIds) && remoteAgent.toolIds.length) {
      resolvedToolIds = mergeUniqueStrings([...resolvedToolIds, ...remoteAgent.toolIds]).slice(0, 50);
      missingRequiredToolKeys = [];
    }
  }

  const prompt = buildElevenLabsAgentPrompt(
    config,
    { businessName: profile?.businessName || null, ownerName: ownerUser?.name || null, callbackNumber: twilio?.fromNumberE164 || null },
    { outboundBrief, kind: "calls" },
    { hasEndCallTool: resolvedToolIds.length > 0 },
  );

  const nextVoiceAgentConfig = {
    ...config,
    firstMessage: effectiveFirstMessage,
    toolKeys: desiredToolKeys,
    toolIds: resolvedToolIds,
  };

  await prisma.portalAiOutboundCallCampaign
    .updateMany({
      where: { id: campaign.id, ownerId },
      data: {
        voiceAgentConfigJson: nextVoiceAgentConfig as any,
        updatedAt: new Date(),
      },
    })
    .catch(() => null);

  if (manualAgentId) {
    return { ok: true, agentId: manualAgentId, apiKey };
  }

  const sharedProfileAgentId = String(profileAgentId || "").trim();
  const shouldCreateDedicatedAgent = !existingCampaignAgentId || (sharedProfileAgentId && existingCampaignAgentId === sharedProfileAgentId);

  if (shouldCreateDedicatedAgent) {
    const created = await createElevenLabsAgent({
      apiKey,
      name: `Purely AI outbound - ${campaign.name}`.slice(0, 160),
      firstMessage: effectiveFirstMessage || undefined,
      prompt: prompt || undefined,
      toolIds: resolvedToolIds,
      voiceId: voiceId || undefined,
      knowledgeBase: knowledgeBase.length ? knowledgeBase : undefined,
    });
    if (!created.ok) return { ok: false, error: created.error, status: created.status };

    await prisma.portalAiOutboundCallCampaign
      .updateMany({ where: { id: campaign.id, ownerId }, data: { voiceAgentId: created.agentId, updatedAt: new Date() } })
      .catch(() => null);

    return { ok: true, agentId: created.agentId, apiKey, createdAgentId: created.agentId };
  }

  const patched = await patchElevenLabsAgent({
    apiKey,
    agentId: existingCampaignAgentId,
    firstMessage: effectiveFirstMessage || undefined,
    prompt: prompt || undefined,
    toolIds: resolvedToolIds,
    voiceId: voiceId || undefined,
    knowledgeBase: knowledgeBase.length ? knowledgeBase : undefined,
  });
  if (!patched.ok) return { ok: false, error: patched.error, status: patched.status };

  return { ok: true, agentId: existingCampaignAgentId, apiKey };
}
