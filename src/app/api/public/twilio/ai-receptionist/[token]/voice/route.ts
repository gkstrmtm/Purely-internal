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
import { resolveToolIdsForKeys } from "@/lib/voiceAgentTools";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

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
  const hasCredit = Boolean(credits && typeof credits.balance === "number" && credits.balance >= 1);
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
      notes: forwardTo ? "Insufficient credits — fell back to forwarding." : "Insufficient credits",
    });

    if (forwardTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">${xmlEscape(forwardTo)}</Dial>
</Response>`;
      return xmlResponse(xml);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We are unable to take your call right now.</Say>
  <Hangup/>
</Response>`;
    return xmlResponse(xml);
  }

  // Voicemail recording action endpoint (used as a fallback when a live agent isn't configured).
  const recordingAction = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/recording`,
  );

  const greeting = settings.greeting || "Thanks for calling — how can I help?";
  const systemPrompt = settings.systemPrompt || "";

  const agentId = String(settings.voiceAgentId || "").trim();
  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const apiKeyLegacyRaw = (settings as any)?.voiceAgentApiKey;
  const apiKeyLegacy = typeof apiKeyLegacyRaw === "string" ? apiKeyLegacyRaw.trim() : "";
  const apiKey = apiKeyFromProfile.trim() || apiKeyLegacy.trim();

  // If no voice agent configured, fall back to voicemail-style capture.
  if (!agentId || !apiKey) {
    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "IN_PROGRESS",
      notes: "Fell back to voicemail (ElevenLabs agent not configured: missing Agent ID and/or API key).",
    });
    const transcriptionCallback = webhookUrlFromRequest(
      req,
      `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/transcription`,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${xmlEscape(greeting)}</Say>
  <Pause length="1"/>
  <Say>Please leave a message after the beep.</Say>
  <Record action="${xmlEscape(recordingAction)}" method="POST" maxLength="3600" playBeep="true" transcribe="true" transcribeCallback="${xmlEscape(transcriptionCallback)}" />
</Response>`;
    return xmlResponse(xml);
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
  const transferToolIds = settings.aiCanTransferToHuman
    ? (
        // Prefer per-account IDs (resolved from API key and cached in Profile).
        (
          [
            ...(await getProfileVoiceAgentToolIds(ownerId, "transfer_to_number")),
            ...(await getProfileVoiceAgentToolIds(ownerId, "transfer_to_human")),
            ...(await getProfileVoiceAgentToolIds(ownerId, "call_transfer")),
            ...(await getProfileVoiceAgentToolIds(ownerId, "end_call")),
          ]
            .map((x) => x.trim())
            .filter(Boolean)
        )
          // Back-compat: env-configured tool IDs.
          .concat(resolveToolIdsForKeys(["transfer_to_human", "transfer_to_number", "call_transfer", "end_call"]))
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 50)
      )
    : [];

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
      user_id: null,
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
      source_info: { source: "portal_ai_receptionist_inbound" },
    },
  });

  if (!register.ok || !register.twiml.trim()) {
    // Fall back to forward if possible, else voicemail.
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    const errMsg = register.ok ? "Voice agent returned empty TwiML." : register.error;
    const fallbackNote = forwardTo
      ? `Fell back to forwarding (ElevenLabs live connect failed: ${errMsg})`
      : `Fell back to voicemail (ElevenLabs live connect failed: ${errMsg})`;

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

    const transcriptionCallback = webhookUrlFromRequest(
      req,
      `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/transcription`,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${xmlEscape(greeting)}</Say>
  <Pause length="1"/>
  <Say>Please leave a message after the beep.</Say>
  <Record action="${xmlEscape(recordingAction)}" method="POST" maxLength="3600" playBeep="true" transcribe="true" transcribeCallback="${xmlEscape(transcriptionCallback)}" />
</Response>`;
    return xmlResponse(xml);
  }

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "IN_PROGRESS",
    notes: transferNote ? `Live agent connected (ElevenLabs).\n${transferNote}` : "Live agent connected (ElevenLabs).",
  });

  // ElevenLabs TwiML already connects the call to the agent.
  return xmlResponse(register.twiml);
}

