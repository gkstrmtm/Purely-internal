import { NextResponse } from "next/server";

import {
  findOwnerByAiReceptionistWebhookToken,
  getOwnerProfilePhoneE164,
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";
import { getCreditsState, isFreeCreditsOwner } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { registerElevenLabsTwilioCall } from "@/lib/elevenLabsConvai";
import { normalizePhoneStrict } from "@/lib/phone";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

// Keep retrying stream reconnects rather than hanging up quickly.
// Twilio calls have natural time limits; this just prevents instant drop-offs.
const MAX_STREAM_RETRIES = 50;
const MAX_REGISTER_RETRIES = 1;

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

function xmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeSingleLine(s: unknown, max = 220) {
  const text = typeof s === "string" ? s : "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function hangupXml(message?: string) {
  const safe = safeSingleLine(message, 240);
  const say = safe ? `  <Say voice="Polly.Joanna">${xmlEscape(safe)}</Say>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${say}  <Hangup/>\n</Response>`;
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

function getIntParam(u: URL, key: string, def = 0): number {
  const raw = u.searchParams.get(key);
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) ? n : def;
}

function injectStreamStatusCallback(twiml: string, opts: { statusCallbackUrl: string }): string {
  const xml = String(twiml || "").trim();
  if (!xml) return xml;
  if (!/<Response[\s>]/i.test(xml) || !/<Stream[\s>]/i.test(xml)) return xml;

  // Inject statusCallback attributes into the first <Stream ...> tag.
  // Don’t overwrite if already present.
  const statusCallbackUrl = xmlEscape(opts.statusCallbackUrl);
  const injected = xml.replace(/<Stream\b([^>]*?)(\s*\/)?\s*>/i, (_full, attrs: string, selfClose: string) => {
    const rawAttrs = String(attrs || "");
    const isSelfClosing = Boolean(selfClose);
    const a = rawAttrs.replace(/\/\s*$/g, "");

    const hasStatusCallback = /\bstatusCallback\s*=\s*"/i.test(a);
    const hasMethod = /\bstatusCallbackMethod\s*=\s*"/i.test(a);
    const extra = [
      hasStatusCallback ? "" : ` statusCallback="${statusCallbackUrl}"`,
      hasMethod ? "" : ` statusCallbackMethod="POST"`,
    ].join("");

    return isSelfClosing ? `<Stream${a}${extra} />` : `<Stream${a}${extra}>`;
  });

  return injected;
}

function appendPauseAndRedirectAfterResponse(twiml: string, redirectUrl: string, pauseSeconds = 1): string {
  const xml = String(twiml || "").trim();
  if (!xml) return xml;
  if (!/<Response[\s>]/i.test(xml)) return xml;

  const safeUrl = xmlEscape(redirectUrl);
  const pause = Math.max(0, Math.min(30, Math.floor(pauseSeconds)));
  const pauseXml = pause > 0 ? `  <Pause length="${pause}"/>\n` : "";
  const redirect = `  <Redirect method="POST">${safeUrl}</Redirect>\n`;
  return xml.replace(/\n?\s*<\/Response>\s*$/i, `\n${pauseXml}${redirect}</Response>`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeoutMs = Math.max(1, Math.floor(ms));
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getTwilioParamText(src: URLSearchParams | FormData | null, key: string): string {
  if (!src) return "";
  const v = (src as any).get?.(key);
  return typeof v === "string" ? v : "";
}

async function getTwilioParams(req: Request): Promise<{ callSid: string; from: string; to: string | null }> {
  // Twilio can hit voice webhooks with either GET (query params) or POST (x-www-form-urlencoded).
  const url = new URL(req.url);
  if (req.method === "GET") {
    const callSid = url.searchParams.get("CallSid") || "";
    const from = url.searchParams.get("From") || "";
    const to = url.searchParams.get("To");
    return { callSid, from, to: to && to.trim() ? to : null };
  }

  const form = await req.formData().catch(() => null);
  const callSid = getTwilioParamText(form, "CallSid");
  const from = getTwilioParamText(form, "From");
  const toRaw = getTwilioParamText(form, "To");
  return { callSid, from, to: toRaw && toRaw.trim() ? toRaw : null };
}

async function handle(req: Request, token: string) {
  const requestUrl = new URL(req.url);
  const streamAttempt = Math.max(0, Math.min(10, getIntParam(requestUrl, "streamAttempt", 0)));
  const registerAttempt = Math.max(0, Math.min(10, getIntParam(requestUrl, "registerAttempt", 0)));

  const lookup = await findOwnerByAiReceptionistWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const ownerId = lookup.ownerId;
  const settings = lookup.data.settings;

  const { callSid, from, to } = await getTwilioParams(req);

  if (!callSid || !from) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const fromParsed = normalizePhoneStrict(from);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : from;
  const toParsed = to ? normalizePhoneStrict(to) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : to;

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "IN_PROGRESS",
  });

  if (streamAttempt > 0) {
    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "IN_PROGRESS",
      notes: `Retrying voice agent stream (attempt ${streamAttempt + 1}).`,
    });
  }

  if (!settings.enabled) {
    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "COMPLETED",
      notes: "Disabled",
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Reject/>\n</Response>`;
    return xmlResponse(xml);
  }

  // Simple v1 behavior:
  // - FORWARD: dial the configured forward number (or profile phone)
  // - AI: say a greeting (stub for streaming/agent handoff)

  if (settings.mode === "FORWARD") {
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    if (!forwardTo) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: `call_${callSid}`,
        callSid,
        from: fromE164,
        to: toE164,
        createdAtIso: new Date().toISOString(),
        status: "COMPLETED",
        notes: "Forward mode: no forward-to number configured (missing profile phone and forwardToPhoneE164).",
      });
      return xmlResponse(hangupXml(""));
    }

    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "IN_PROGRESS",
      notes: `Forwarding call to ${forwardTo}.`,
    });

    // Record forwarded calls (dual-channel when supported) so call recording works in FORWARD mode too.
    const recordingCallback = webhookUrlFromRequest(
      req,
      `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/dial-recording`,
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(recordingCallback)}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed">${xmlEscape(forwardTo)}</Dial>
</Response>`;
    return xmlResponse(xml);
  }

  // Credits gate (AI mode): require at least 1 credit to use.
  const free = await isFreeCreditsOwner(ownerId).catch(() => false);
  const credits = free ? { balance: 999999 } : await getCreditsState(ownerId).catch(() => null);
  const hasKnownBalance = Boolean(credits && typeof (credits as any).balance === "number" && Number.isFinite((credits as any).balance));
  const hasCredit = hasKnownBalance ? Boolean((credits as any).balance >= 1) : true; // fail open if credits lookup fails
  if (!hasCredit) {
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "COMPLETED",
      // If we can't forward, don't hard-fail the caller. We'll continue into AI mode below.
      notes: forwardTo
        ? "Insufficient credits. Fell back to forwarding."
        : "Insufficient credits (no forward number configured). Continuing in AI mode.",
    });

    if (forwardTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">${xmlEscape(forwardTo)}</Dial>
</Response>`;
      return xmlResponse(xml);
    }
    // No forward number available: proceed with AI mode even if credits are insufficient.
  }

  const profileAgentId = await getProfileVoiceAgentId(ownerId).catch(() => null);
  const agentId = String(settings.voiceAgentId || "").trim() || String(profileAgentId || "").trim();
  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const apiKeyLegacyRaw = (settings as any)?.voiceAgentApiKey;
  const apiKeyLegacy = typeof apiKeyLegacyRaw === "string" ? apiKeyLegacyRaw.trim() : "";
  const apiKey = apiKeyFromProfile.trim() || apiKeyLegacy.trim();

  // If no voice agent configured, never fall back to voicemail.
  // Prefer forwarding if a forward-to number exists; otherwise hang up with a generic message.
  if (!agentId || !apiKey) {
    const profilePhone = await getOwnerProfilePhoneE164(ownerId).catch(() => null);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "IN_PROGRESS",
      notes: forwardTo
        ? "AI mode unavailable (missing voice agent config). Forwarding."
        : "AI mode unavailable (missing voice agent config).",
    });

    if (forwardTo) {
      const recordingCallback = webhookUrlFromRequest(
        req,
        `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/dial-recording`,
      );
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(recordingCallback)}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed">${xmlEscape(forwardTo)}</Dial>
</Response>`;
      return xmlResponse(xml);
    }

    return xmlResponse(hangupXml(""));
  }

  // Start Twilio call recording for the *live* call, with callback to charge credits + request transcription.
  const liveRecordingCallback = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/call-recording`,
  );
  // Best-effort (don't block TwiML response on Twilio REST latency).
  void startTwilioCallRecording({ ownerId, callSid, recordingStatusCallbackUrl: liveRecordingCallback });

  // Register inbound call with ElevenLabs ConvAI and return their TwiML.
  const profilePhone = await getOwnerProfilePhoneE164(ownerId).catch(() => null);
  const transferTo = (settings.aiCanTransferToHuman ? (settings.forwardToPhoneE164 || profilePhone) : null) || null;
  const transferNote = settings.aiCanTransferToHuman
    ? (transferTo ? `AI transfer enabled → ${transferTo}.` : "AI transfer enabled, but no transfer number is configured.")
    : "";

  // Match the working outbound integration: ElevenLabs expects `from_number` to be the Twilio number and
  // `to_number` to be the remote party. For inbound calls, the remote party is the caller.
  const twilioCfg = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  const twilioFromNumber = typeof (twilioCfg as any)?.fromNumberE164 === "string" ? String((twilioCfg as any).fromNumberE164).trim() : "";
  const fromNumberForAgent = (twilioFromNumber || (toE164 || "").trim()).trim();
  const toNumberForAgent = fromE164;

  const register = await withTimeout(
    registerElevenLabsTwilioCall({
      apiKey,
      agentId,
      fromNumberE164: fromNumberForAgent,
      toNumberE164: toNumberForAgent,
      direction: "inbound",
      conversationInitiationClientData: {
        // Some ConvAI deployments validate this as a string; use ownerId for stability.
        user_id: ownerId,
        // Use a safe, documented enum value (previous custom value caused 422).
        source_info: { source: "unknown" },
        dynamic_variables: {
          owner_id: ownerId,
          business_name: settings.businessName || "",
          caller_number: fromE164,
          called_number: toE164 || "",
          twilio_from_number: fromNumberForAgent,
          transfer_number: transferTo || "",
          ai_transfer_enabled: settings.aiCanTransferToHuman ? true : false,
        },
      },
    }),
    8000,
    "register call",
  ).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "register call failed" }));

  if (!register.ok || !register.twiml.trim()) {
    // Never fall back to voicemail. Prefer forwarding if possible, else hang up.
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    const errMsg = register.ok ? "Voice agent returned empty TwiML." : register.error;
    console.error("AI receptionist: live agent connect failed", {
      ownerId,
      callSid,
      status: (register as any)?.status,
      error: errMsg,
    });

    const errLine = safeSingleLine(errMsg, 220);

    // Retry once before giving up. This handles transient ElevenLabs/network issues without immediately dropping callers.
    if (registerAttempt < MAX_REGISTER_RETRIES) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: `call_${callSid}`,
        callSid,
        from: fromE164,
        to: toE164,
        createdAtIso: new Date().toISOString(),
        status: "IN_PROGRESS",
        notes: `Live agent connect failed. Retrying. ${errLine ? `(${errLine})` : ""}`.trim(),
      });

      const nextRegisterAttempt = registerAttempt + 1;
      const retryUrl = webhookUrlFromRequest(
        req,
        `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/voice?registerAttempt=${encodeURIComponent(String(nextRegisterAttempt))}&streamAttempt=${encodeURIComponent(String(streamAttempt))}`,
      );

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Redirect method="POST">${xmlEscape(retryUrl)}</Redirect>
</Response>`;
      return xmlResponse(xml);
    }

    const fallbackNote = forwardTo
      ? `Live agent connect failed. Forwarding. ${errLine ? `(${errLine})` : ""}`.trim()
      : `Live agent connect failed. ${errLine ? `(${errLine})` : ""}`.trim();

    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "IN_PROGRESS",
      notes: fallbackNote,
    });

    if (forwardTo) {
      const recordingCallback = webhookUrlFromRequest(
        req,
        `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/dial-recording`,
      );
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(recordingCallback)}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed">${xmlEscape(forwardTo)}</Dial>
</Response>`;
      return xmlResponse(xml);
    }

    // If there's no forwarding path configured, hang up quietly (avoid confusing caller messaging).
    return xmlResponse(hangupXml(""));
  }

  const conversationId = extractConversationIdFromTwiml(register.twiml);

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "IN_PROGRESS",
    notes: transferNote ? `Live agent connected.\n${transferNote}` : "Live agent connected.",
    ...(conversationId ? ({ conversationId } as any) : {}),
  });

  // Add Stream status callbacks + retry redirect so we can (a) capture StreamError details and
  // (b) avoid 0-second calls if the remote WebSocket closes immediately.
  const streamStatusCallback = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/stream-status`,
  );

  const nextAttempt = streamAttempt + 1;
  const retryUrl = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/voice?streamAttempt=${encodeURIComponent(String(nextAttempt))}`,
  );

  const withCallbacks = injectStreamStatusCallback(register.twiml, { statusCallbackUrl: streamStatusCallback });
  const allowRetry = nextAttempt <= MAX_STREAM_RETRIES + 1;
  const withRetry = allowRetry ? appendPauseAndRedirectAfterResponse(withCallbacks, retryUrl, 1) : withCallbacks;

  return xmlResponse(withRetry);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return await handle(req, token);
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return await handle(req, token);
}

