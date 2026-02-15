import { NextResponse } from "next/server";

import {
  findOwnerByAiReceptionistWebhookToken,
  getOwnerProfilePhoneE164,
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";
import { getCreditsState, isFreeCreditsOwner } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { registerElevenLabsTwilioCall } from "@/lib/elevenLabsConvai";
import { resolveElevenLabsConvaiToolIdsByKeys } from "@/lib/elevenLabsConvai";
import { normalizePhoneStrict } from "@/lib/phone";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function getProfileVoiceAgentToolIds(ownerId: string, toolKey: string): Promise<string[]> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const toolIds = rec?.voiceAgentToolIds;
  if (!toolIds || typeof toolIds !== "object" || Array.isArray(toolIds)) return [];

  const k = String(toolKey || "").trim().toLowerCase();
  const raw = (toolIds as any)[k];
  const xs = Array.isArray(raw) ? raw : [];
  return xs
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
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

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await findOwnerByAiReceptionistWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const ownerId = lookup.ownerId;
  const settings = lookup.data.settings;

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const fromRaw = form?.get("From");
  const toRaw = form?.get("To");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;

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
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>We are unable to take your call right now.</Say>\n  <Hangup/>\n</Response>`;
      return xmlResponse(xml);
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
        ? "Insufficient credits — fell back to forwarding."
        : "Insufficient credits (no forward number configured) — continuing in AI mode.",
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

  const greeting = settings.greeting || "Thanks for calling — how can I help?";
  const systemPrompt = settings.systemPrompt || "";

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
        ? "AI mode unavailable (missing voice agent config) — forwarding."
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

    return xmlResponse(hangupXml("We are unable to take your call right now."));
  }

  // Start Twilio call recording for the *live* call, with callback to charge credits + request transcription.
  const liveRecordingCallback = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/call-recording`,
  );
  await startTwilioCallRecording({ ownerId, callSid, recordingStatusCallbackUrl: liveRecordingCallback });

  // Register inbound call with ElevenLabs ConvAI and return their TwiML.
  const profilePhone = await getOwnerProfilePhoneE164(ownerId).catch(() => null);
  const transferTo = (settings.aiCanTransferToHuman ? (settings.forwardToPhoneE164 || profilePhone) : null) || null;
  let transferToolIds = settings.aiCanTransferToHuman
    ? [
        ...(await getProfileVoiceAgentToolIds(ownerId, "transfer_to_number")),
        ...(await getProfileVoiceAgentToolIds(ownerId, "transfer_to_human")),
        ...(await getProfileVoiceAgentToolIds(ownerId, "call_transfer")),
        ...(await getProfileVoiceAgentToolIds(ownerId, "end_call")),
      ]
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 50)
    : [];

  // Fallback: if profile cache is empty, attempt to resolve tool IDs directly from ElevenLabs using the API key.
  if (settings.aiCanTransferToHuman && !transferToolIds.length) {
    const resolved = await resolveElevenLabsConvaiToolIdsByKeys({
      apiKey,
      toolKeys: ["transfer_to_human", "transfer_to_number", "call_transfer", "end_call"],
    }).catch(() => null);

    if (resolved && (resolved as any).ok === true) {
      const map = (resolved as any).toolIds as Record<string, string[]>;
      transferToolIds = ["transfer_to_human", "transfer_to_number", "call_transfer", "end_call"]
        .flatMap((k) => (Array.isArray((map as any)[k]) ? (map as any)[k] : []))
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 50);
    }
  }

  const transferNote = settings.aiCanTransferToHuman
    ? (transferTo
        ? (transferToolIds.length
            ? `AI transfer enabled → ${transferTo}.`
            : "AI transfer enabled, but transfer tool IDs are not configured on the server.")
        : "AI transfer enabled, but no transfer number is configured.")
    : "";

  let promptOverride = systemPrompt.trim();
  if (settings.aiCanTransferToHuman) {
    if (transferTo) {
      const extra = `\n\nIf the caller asks for a human or the situation requires it, transfer the call to ${transferTo}. Use the call transfer tool when appropriate.`;
      promptOverride = `${promptOverride}${extra}`.trim();
    } else {
      const extra = "\n\nIf the caller asks for a human, explain that call transfer isn’t configured and offer to take a message.";
      promptOverride = `${promptOverride}${extra}`.trim();
    }
  }
  promptOverride = promptOverride.slice(0, 6000);

  const toNumberForAgent = toE164 || settings.forwardToPhoneE164 || profilePhone || fromE164;
  const register = await registerElevenLabsTwilioCall({
    apiKey,
    agentId,
    fromNumberE164: fromE164,
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
        transfer_number: transferTo || "",
        ai_transfer_enabled: settings.aiCanTransferToHuman ? true : false,
      },
      conversation_config_override: {
        agent: {
          ...(greeting.trim() ? { first_message: greeting.trim().slice(0, 360) } : {}),
          ...(promptOverride.trim()
            ? {
                prompt: {
                  prompt: promptOverride.trim().slice(0, 6000),
                  ...(transferToolIds.length ? { tool_ids: transferToolIds } : {}),
                },
              }
            : {}),
        },
      },
    },
  });

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

    const fallbackNote = forwardTo
      ? "Live agent connect failed — forwarding."
      : "Live agent connect failed.";

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

    return xmlResponse(hangupXml("We are unable to take your call right now."));
  }

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "IN_PROGRESS",
    notes: transferNote ? `Live agent connected.\n${transferNote}` : "Live agent connected.",
  });

  // ElevenLabs TwiML already connects the call to the agent.
  return xmlResponse(register.twiml);
}

