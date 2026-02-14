import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
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
  onError?: (message: string) => Promise<void> | void;
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null);

  if (!res || !res.ok) {
    const text = res ? await res.text().catch(() => "") : "";
    try {
      await Promise.resolve(
        opts.onError?.(
          `Twilio did not start recording (${res?.status || "no response"}): ${String(text || "").slice(0, 200)}`,
        ),
      );
    } catch {
      // ignore
    }
  }
}

async function createTwilioOutboundCall(opts: {
  ownerId: string;
  toNumberE164: string;
  voiceUrl: string;
  statusCallbackUrl?: string;
  recordingStatusCallbackUrl?: string;
}): Promise<{ ok: true; callSid: string } | { ok: false; error: string; status?: number }> {
  const to = String(opts.toNumberE164 || "").trim();
  const voiceUrl = String(opts.voiceUrl || "").trim();
  if (!to) return { ok: false, error: "Missing destination phone number" };
  if (!voiceUrl) return { ok: false, error: "Missing voice URL" };

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return { ok: false, error: "Twilio is not configured for this account" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", twilio.fromNumberE164);
  form.set("Url", voiceUrl);
  form.set("Method", "POST");

  // Force call recording at the Twilio level so recordings exist even if the separate
  // start-recording request is delayed/missed.
  const recordingCb = typeof opts.recordingStatusCallbackUrl === "string" ? opts.recordingStatusCallbackUrl.trim() : "";
  if (recordingCb) {
    form.set("Record", "true");
    form.set("RecordingChannels", "dual");
    form.set("RecordingStatusCallback", recordingCb);
    form.set("RecordingStatusCallbackMethod", "POST");
    form.set("RecordingStatusCallbackEvent", "completed");
  }

  const statusCallbackUrl = typeof opts.statusCallbackUrl === "string" ? opts.statusCallbackUrl.trim() : "";
  if (statusCallbackUrl) {
    form.set("StatusCallback", statusCallbackUrl);
    form.set("StatusCallbackMethod", "POST");
    form.append("StatusCallbackEvent", "initiated");
    form.append("StatusCallbackEvent", "ringing");
    form.append("StatusCallbackEvent", "answered");
    form.append("StatusCallbackEvent", "completed");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, error: `Twilio failed (${res.status}): ${text.slice(0, 400)}`, status: res.status };
  }

  try {
    const json = JSON.parse(text) as any;
    const callSid = typeof json?.sid === "string" ? json.sid.trim() : "";
    if (!callSid) return { ok: false, error: "Twilio returned an unexpected response." };
    return { ok: true, callSid };
  } catch {
    return { ok: false, error: "Twilio returned an unexpected response." };
  }
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

  const manualCallId = crypto.randomUUID();
  const token = crypto.randomUUID();

  await prisma.portalAiOutboundCallManualCall.create({
    data: {
      id: manualCallId,
      ownerId,
      campaignId: campaign.id,
      webhookToken: token,
      toNumberE164: toParsed.e164,
      status: "CALLING",
      callSid: null,
      conversationId: null,
    },
    select: { id: true },
  });

  const voiceUrl = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(token)}/voice`,
  );

  const statusCallbackUrl = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(token)}/call-status`,
  );

  const recordingCallback = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(token)}/call-recording`,
  );

  const started = await createTwilioOutboundCall({
    ownerId,
    toNumberE164: toParsed.e164,
    voiceUrl,
    statusCallbackUrl,
    recordingStatusCallbackUrl: recordingCallback,
  });
  if (!started.ok) {
    await prisma.portalAiOutboundCallManualCall.update({
      where: { id: manualCallId },
      data: { status: "FAILED", lastError: started.error.slice(0, 500) },
      select: { id: true },
    });
    return jsonError(started.error, started.status || 502);
  }

  const callSid = started.callSid;

  await prisma.portalAiOutboundCallManualCall.update({
    where: { id: manualCallId },
    data: { callSid },
    select: { id: true },
  });

  // Fallback: still attempt starting recording explicitly (best-effort).
  await startTwilioCallRecording({
    ownerId,
    callSid,
    recordingStatusCallbackUrl: recordingCallback,
    onError: async (message) => {
      await prisma.portalAiOutboundCallManualCall
        .update({
          where: { id: manualCallId },
          data: { lastError: message.slice(0, 500) },
          select: { id: true },
        })
        .catch(() => null);
    },
  });

  return NextResponse.json({
    ok: true,
    id: manualCallId,
    callSid,
    conversationId: null,
  });
}
