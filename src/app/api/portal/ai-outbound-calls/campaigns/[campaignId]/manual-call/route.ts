import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import {
  placeElevenLabsTwilioOutboundCall,
  resolveElevenLabsAgentPhoneNumberId,
} from "@/lib/elevenLabsConvai";
import { normalizePhoneStrict } from "@/lib/phone";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

const bodySchema = z.object({
  toNumber: z.string().trim().min(1).max(40),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
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
  return id ? id : null;
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

async function startTwilioCallRecording(opts: {
  ownerId: string;
  callSid: string;
  recordingStatusCallbackUrl: string;
}): Promise<void> {
  const sid = String(opts.callSid || "").trim();
  if (!sid) return;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("RecordingChannels", "dual");
  form.set("RecordingStatusCallback", opts.recordingStatusCallbackUrl);
  form.set("RecordingStatusCallbackMethod", "POST");
  form.set("RecordingStatusCallbackEvent", "completed");

  await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null);
}

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const campaignId = String(params.campaignId || "").trim();
  if (!campaignId) return jsonError("Missing campaign id", 400);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid body", 400);

  const toParsed = normalizePhoneStrict(parsed.data.toNumber);
  if (!toParsed.ok || !toParsed.e164) return jsonError("Invalid phone number", 400);

  await ensurePortalAiOutboundCallsSchema();

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: { id: true, voiceAgentId: true },
  });
  if (!campaign) return jsonError("Not found", 404);

  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) return jsonError("Twilio is not configured for this account", 400);

  const apiKey = ((await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "").trim();
  if (!apiKey) return jsonError("Missing voice API key. Set it in Profile first.", 400);

  const profileAgentId = await getProfileVoiceAgentId(ownerId);
  const agentId = String(campaign.voiceAgentId || "").trim() || String(profileAgentId || "").trim();
  if (!agentId) return jsonError("Missing agent id. Set one on this campaign or in Profile.", 400);

  const resolved = await resolveElevenLabsAgentPhoneNumberId({ apiKey, agentId });
  if (!resolved.ok) return jsonError(resolved.error, resolved.status || 502);

  const manualCallId = crypto.randomUUID();
  const token = crypto.randomUUID();

  const call = await placeElevenLabsTwilioOutboundCall({
    apiKey,
    agentId,
    agentPhoneNumberId: resolved.phoneNumberId,
    toNumberE164: toParsed.e164,
    conversationInitiationClientData: {
      dynamic_variables: {
        purely_source: "portal_manual_call",
        purely_campaign_id: campaign.id,
      },
    },
  });

  if (!call.ok) {
    await prisma.portalAiOutboundCallManualCall.create({
      data: {
        id: manualCallId,
        ownerId,
        campaignId: campaign.id,
        webhookToken: token,
        toNumberE164: toParsed.e164,
        status: "FAILED",
        lastError: call.error.slice(0, 500),
      },
      select: { id: true },
    });

    return jsonError(call.error, call.status || 502);
  }

  const callSid = String(call.callSid || "").trim() || null;
  const conversationId = String(call.conversationId || "").trim() || null;

  await prisma.portalAiOutboundCallManualCall.create({
    data: {
      id: manualCallId,
      ownerId,
      campaignId: campaign.id,
      webhookToken: token,
      toNumberE164: toParsed.e164,
      status: "CALLING",
      ...(callSid ? { callSid } : {}),
      ...(conversationId ? { conversationId } : {}),
    },
    select: { id: true },
  });

  if (callSid) {
    const recordingCallback = webhookUrlFromRequest(
      req,
      `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(token)}/call-recording`,
    );

    await startTwilioCallRecording({ ownerId, callSid, recordingStatusCallbackUrl: recordingCallback });
  }

  return NextResponse.json({
    ok: true,
    id: manualCallId,
    callSid,
    conversationId,
  });
}
