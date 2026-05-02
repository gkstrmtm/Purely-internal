import { NextResponse } from "next/server";

import { buildAiOutboundVoicemailTwiml, fallbackTwiml, indicatesMachineAnswered } from "@/lib/aiOutboundVoicemail";
import { appendAiOutboundManualCallWebhookLog } from "@/lib/aiOutboundCallDebug";
import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { ensureAiOutboundCallCampaignVoiceAgent } from "@/lib/portalAiOutboundCallVoiceAgent";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { registerElevenLabsTwilioCall } from "@/lib/elevenLabsConvai";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function fetchTwilioAnsweredBy(opts: {
  ownerId: string;
  callSid: string;
}): Promise<string> {
  const callSid = String(opts.callSid || "").trim();
  if (!callSid) return "";

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!twilio) return "";

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls/${encodeURIComponent(callSid)}.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  }).catch(() => null);

  if (!res?.ok) return "";
  const text = await res.text().catch(() => "");
  if (!text.trim()) return "";

  try {
    const json = JSON.parse(text) as any;
    const answeredBy = typeof json?.answered_by === "string" ? json.answered_by : typeof json?.answeredBy === "string" ? json.answeredBy : "";
    return answeredBy.trim();
  } catch {
    return "";
  }
}

function extractConversationIdFromTwiml(twiml: string): string {
  const s = String(twiml || "");
  const m =
    s.match(/<Parameter\b[^>]*\bname=['\"]conversation_id['\"][^>]*\bvalue=['\"]([^'\"]+)['\"][^>]*>/i) ||
    s.match(/\bname=['\"]conversation_id['\"][^>]*\bvalue=['\"]([^'\"]+)['\"]/i) ||
    s.match(/\bconversation_id\"\s+value=\"([^\"]+)\"/i);
  const id = m?.[1] ? String(m[1]).trim() : "";
  return id && id.length <= 200 ? id : "";
}

function stripRedirectVerbs(twiml: string): string {
  const xml = String(twiml || "");
  if (!xml) return "";

  return xml
    .replace(/<Redirect\b[^>]*>[^]*?<\/Redirect>/gi, "")
    .replace(/<Redirect\b[^>]*\/\s*>/gi, "");
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse(fallbackTwiml(), 200);

  const form = await req.formData().catch(() => null);
  const answeredBy = form?.get("AnsweredBy");
  const callSid = typeof form?.get("CallSid") === "string" ? String(form?.get("CallSid") || "").trim() : "";

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true, ownerId: true, campaignId: true, toNumberE164: true, conversationId: true },
  });

  if (!manual) return xmlResponse(fallbackTwiml(), 200);

  const answeredByText = typeof answeredBy === "string" ? answeredBy.trim() : "";
  const twilioAnsweredBy = answeredByText || (callSid ? await fetchTwilioAnsweredBy({ ownerId: manual.ownerId, callSid }) : "");

  await appendAiOutboundManualCallWebhookLog({
    route: "manual-call:voice",
    token: t,
    manualCallId: manual.id,
    callSid,
    details: {
      answeredBy: answeredByText,
      twilioAnsweredBy,
      campaignId: manual.campaignId,
    },
  });

  console.log(
    JSON.stringify({
      route: "manual-call:voice",
      manualCallId: manual.id,
      callSid,
      answeredBy: answeredByText,
      twilioAnsweredBy,
    }),
  );

  if (indicatesMachineAnswered(twilioAnsweredBy || answeredByText) && typeof manual.campaignId === "string" && manual.campaignId.trim()) {
    const [campaign, profile, ownerUser] = await Promise.all([
      prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId: manual.ownerId, id: manual.campaignId },
        select: { voiceAgentConfigJson: true },
      }).catch(() => null),
      prisma.businessProfile.findUnique({ where: { ownerId: manual.ownerId }, select: { businessName: true } }).catch(() => null),
      prisma.user.findUnique({ where: { id: manual.ownerId }, select: { name: true } }).catch(() => null),
    ]);

    const config = parseVoiceAgentConfig(campaign?.voiceAgentConfigJson);
    return xmlResponse(
      buildAiOutboundVoicemailTwiml({
        businessName: profile?.businessName || null,
        ownerName: ownerUser?.name || null,
        goal: config.goal || null,
        callbackNumber: (await getOwnerTwilioSmsConfig(manual.ownerId).catch(() => null))?.fromNumberE164 || null,
      }),
      200,
    );
  }

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

    return xmlResponse(fallbackTwiml("Sorry. We couldn't connect this call."), 200);
  }

  const ensured = typeof manual.campaignId === "string" && manual.campaignId.trim()
    ? await ensureAiOutboundCallCampaignVoiceAgent({ ownerId: manual.ownerId, campaignId: manual.campaignId })
    : { ok: false as const, error: "Manual call is missing its campaign." };

  const apiKey = ensured.ok ? ensured.apiKey.trim() : "";
  const agentId = ensured.ok ? ensured.agentId.trim() : "";

  if (!apiKey || !agentId) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: {
          status: "FAILED",
          lastError: ensured.ok ? "Voice agent is not configured for this campaign." : String(ensured.error || "Voice agent is not configured for this campaign.").slice(0, 500),
        },
        select: { id: true },
      })
      .catch(() => null);

    return xmlResponse(fallbackTwiml("Sorry. We couldn't connect this call."), 200);
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

    return xmlResponse(fallbackTwiml("Sorry. We couldn't connect this call."), 200);
  }

  const conversationId = extractConversationIdFromTwiml(register.twiml);
  if (conversationId && String(manual.conversationId || "").trim() !== conversationId) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: { conversationId },
        select: { id: true },
      })
      .catch(() => null);
  }

  return xmlResponse(stripRedirectVerbs(register.twiml), 200);
}
