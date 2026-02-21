import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { buildElevenLabsAgentPrompt, patchElevenLabsAgent } from "@/lib/elevenLabsConvai";
import { resolveElevenLabsConvaiToolIdsByKeys } from "@/lib/elevenLabsConvai";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

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

function envVoiceAgentId(): string {
  return envFirst(["VOICE_AGENT_ID", "ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID"]).slice(0, 120);
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

async function getProfileVoiceAgentId(ownerId: string): Promise<string | null> {
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
    select: { id: true, voiceAgentId: true, voiceAgentConfigJson: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const receptionist = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const apiKeyLegacy = receptionist?.settings?.voiceAgentApiKey?.trim() || "";
  const apiKey = apiKeyFromProfile.trim() || apiKeyLegacy.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing voice agent API key. Set it in Profile first." },
      { status: 400 },
    );
  }

  const profileAgentId = await getProfileVoiceAgentId(ownerId);
  const agentId = (campaign.voiceAgentId || "").trim() || (profileAgentId || "").trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Missing agent id. Set one on this campaign or in Profile." },
      { status: 400 },
    );
  }

  const config = parseVoiceAgentConfig(campaign.voiceAgentConfigJson);
  const prompt = buildElevenLabsAgentPrompt(config);
  const firstMessage = config.firstMessage.trim();

  let resolvedToolIds: string[] = [];
  if (Array.isArray(config.toolIds) && config.toolIds.length) {
    resolvedToolIds = config.toolIds;
  } else if (Array.isArray(config.toolKeys) && config.toolKeys.length) {
    const resolved = await resolveElevenLabsConvaiToolIdsByKeys({ apiKey, toolKeys: config.toolKeys }).catch(() => null);
    if (resolved && (resolved as any).ok === true) {
      const map = (resolved as any).toolIds as Record<string, string[]>;
      const flat = config.toolKeys
        .map((k) => String(k || "").trim().toLowerCase())
        .filter(Boolean)
        .flatMap((k) => (Array.isArray((map as any)[k]) ? (map as any)[k] : []));
      resolvedToolIds = flat;
    }
  }

  resolvedToolIds = resolvedToolIds
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 50);

  const result = await patchElevenLabsAgent({
    apiKey,
    agentId,
    firstMessage: firstMessage || undefined,
    prompt: prompt || undefined,
    toolIds: resolvedToolIds,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 502 });
  }

  return NextResponse.json({ ok: true, agentId, agent: result.agent });
}
