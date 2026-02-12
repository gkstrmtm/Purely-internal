import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { buildElevenLabsAgentPrompt, patchElevenLabsAgent } from "@/lib/elevenLabsConvai";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

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
  return id ? id : null;
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

  // API key comes from AI Receptionist settings (same key, different agent ids).
  const receptionist = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const apiKey = receptionist?.settings?.voiceAgentApiKey?.trim() || "";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing voice agent API key. Set it in AI Receptionist settings first." },
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

  const result = await patchElevenLabsAgent({
    apiKey,
    agentId,
    firstMessage: firstMessage || undefined,
    prompt: prompt || undefined,
    toolIds: config.toolIds,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 502 });
  }

  return NextResponse.json({ ok: true, agentId, agent: result.agent });
}
