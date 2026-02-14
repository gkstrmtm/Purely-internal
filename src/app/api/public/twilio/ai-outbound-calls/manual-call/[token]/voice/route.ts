import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { registerElevenLabsTwilioCall } from "@/lib/elevenLabsConvai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeE164(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s && s.length <= 32 ? s : "";
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
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";  return id ? id : null;
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
  return key ? key : null;
}

function fallbackTwiml(message?: string) {
  const safe = String(message || "").trim().slice(0, 200);
  const say = safe
    ? `  <Say voice="Polly.Joanna">${safe.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</Say>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${say}  <Hangup/>\n</Response>`;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse(fallbackTwiml(), 200);

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true, ownerId: true, campaignId: true, toNumberE164: true },
  });

  if (!manual) return xmlResponse(fallbackTwiml(), 200);

  const toNumberE164 = safeE164(manual.toNumberE164);
  const twilio = await getOwnerTwilioSmsConfig(manual.ownerId);
  if (!twilio || !toNumberE164) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: { status: "FAILED", lastError: "Twilio is not configured for this account." },
        select: { id: true },
      })
      .catch(() => null);

    return xmlResponse(fallbackTwiml("Sorry — we couldn't connect this call."), 200);
  }

  const campaignId = typeof manual.campaignId === "string" ? manual.campaignId : null;
  const campaign = campaignId
    ? await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId: manual.ownerId, id: campaignId },
        select: { voiceAgentId: true },
      })
    : null;

  const apiKey = ((await getProfileVoiceAgentApiKey(manual.ownerId).catch(() => null)) || "").trim();
  const profileAgentId = await getProfileVoiceAgentId(manual.ownerId);
  const agentId = String(campaign?.voiceAgentId || "").trim() || String(profileAgentId || "").trim();

  if (!apiKey || !agentId) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: {
          status: "FAILED",
          lastError: "Voice agent is not configured. Add a voice API key and agent ID in Profile (or set an agent ID on this campaign).",
        },
        select: { id: true },
      })
      .catch(() => null);

    return xmlResponse(fallbackTwiml("Sorry — we couldn't connect this call."), 200);
  }

  const register = await registerElevenLabsTwilioCall({
    apiKey,
    agentId,
    fromNumberE164: twilio.fromNumberE164,
    toNumberE164,
    direction: "outbound",
    conversationInitiationClientData: {
      dynamic_variables: {
        purely_source: "portal_manual_call",
        purely_manual_call_id: manual.id,
        purely_campaign_id: manual.campaignId,
      },
    },
  });

  if (!register.ok) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: {
          status: "FAILED",
          lastError: "Voice agent connection failed. Check the voice API key, agent ID, and Twilio integration.",
        },
        select: { id: true },
      })
      .catch(() => null);

    return xmlResponse(fallbackTwiml("Sorry — we couldn't connect this call."), 200);
  }

  return xmlResponse(register.twiml, 200);
}
