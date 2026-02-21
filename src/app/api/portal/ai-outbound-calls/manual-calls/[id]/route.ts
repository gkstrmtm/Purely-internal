import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";
import { fetchElevenLabsConversationTranscript } from "@/lib/elevenLabsConvai";
import { transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { buildSpeakerTranscriptAlignedToFull } from "@/lib/dualChannelTranscript";
import { splitStereoPcmWavToMonoWavs } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function fetchTwilioCallStatus(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
    return status || null;
  } catch {
    return null;
  }
}

function mapTwilioToManualStatus(twilioStatus: string): "CALLING" | "COMPLETED" | "FAILED" {
  const s = String(twilioStatus || "").trim().toLowerCase();
  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
  return "CALLING";
}

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
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

function twilioBasicAuthHeader(config: { accountSid: string; authToken: string }) {
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  return `Basic ${basic}`;
}

async function fetchLatestRecordingSidForCall(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(config) },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const recordings = Array.isArray(json?.recordings) ? json.recordings : [];
    for (const r of recordings) {
      const rid = typeof r?.sid === "string" ? r.sid.trim() : "";
      if (rid) return rid;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTranscriptTextForRecording(ownerId: string, recordingSid: string): Promise<string | null> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const listRes = await fetch(listUrl, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(config) },
  }).catch(() => null as any);

  if (!listRes?.ok) return null;
  const listText = await listRes.text().catch(() => "");
  if (!listText.trim()) return null;

  try {
    const json = JSON.parse(listText) as any;
    const transcriptions = Array.isArray(json?.transcriptions) ? json.transcriptions : [];
    for (const t of transcriptions) {
      const status = typeof t?.status === "string" ? t.status.trim().toLowerCase() : "";
      const inlineText = typeof t?.transcription_text === "string" ? t.transcription_text : "";
      if (status === "completed" && inlineText.trim()) return inlineText.trim();

      const tsid = typeof t?.sid === "string" ? t.sid.trim() : "";
      if (status === "completed" && tsid) {
        const detailUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Transcriptions/${encodeURIComponent(tsid)}.json`;
        const detailRes = await fetch(detailUrl, {
          method: "GET",
          headers: { authorization: twilioBasicAuthHeader(config) },
        }).catch(() => null as any);

        if (!detailRes?.ok) continue;
        const detailText = await detailRes.text().catch(() => "");
        if (!detailText.trim()) continue;
        try {
          const detail = JSON.parse(detailText) as any;
          const tt = typeof detail?.transcription_text === "string" ? detail.transcription_text.trim() : "";
          if (tt) return tt;
        } catch {
          // ignore
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTwilioRecordingAudio(
  ownerId: string,
  recordingSid: string,
  ext: "mp3" | "wav",
): Promise<{ ok: true; bytes: ArrayBuffer; mimeType: string } | { ok: false; error: string }> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return { ok: false, error: "Missing recording sid" };

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return { ok: false, error: "Twilio is not configured for this account." };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}.${ext}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(config) },
    cache: "no-store",
  }).catch(() => null as any);

  if (!res) return { ok: false, error: "Failed to fetch recording audio" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Twilio recording fetch failed (${res.status}): ${text.slice(0, 200)}` };
  }

  const bytes = await res.arrayBuffer();
  const size = bytes?.byteLength ?? 0;
  // OpenAI-compatible transcription endpoints typically cap uploads around 25MB.
  if (size > 24 * 1024 * 1024) return { ok: false, error: "Recording too large to transcribe automatically." };

  const mimeType = res.headers.get("content-type") || "audio/mpeg";
  return { ok: true, bytes, mimeType };
}



async function requestTranscription(ownerId: string, recordingSid: string, req: Request, token: string): Promise<boolean> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return false;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return false;

  const callbackUrl = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(token)}/transcription`,
  );

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const form = new URLSearchParams();
  form.set("TranscriptionCallback", callbackUrl);
  form.set("TranscriptionCallbackMethod", "POST");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: twilioBasicAuthHeader(config),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  return Boolean(res?.ok);
}

async function getManualCallRow(ownerId: string, id: string) {
  return prisma.portalAiOutboundCallManualCall.findFirst({
    where: { ownerId, id },
    select: {
      id: true,
      campaignId: true,
      toNumberE164: true,
      status: true,
      callSid: true,
      conversationId: true,
      recordingSid: true,
      recordingDurationSec: true,
      transcriptText: true,
      lastError: true,
      webhookToken: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  await ensurePortalAiOutboundCallsSchema();

  const row = await getManualCallRow(ownerId, parsed.data);

  if (!row) return jsonError("Not found", 404);

  // Best-effort: reconcile stuck CALLING state with Twilio.
  if (row.status === "CALLING" && typeof row.callSid === "string" && row.callSid.trim()) {
    const twStatus = await fetchTwilioCallStatus(ownerId, row.callSid);
    if (twStatus) {
      const mapped = mapTwilioToManualStatus(twStatus);
      if (mapped !== "CALLING") {
        await prisma.portalAiOutboundCallManualCall
          .update({
            where: { id: row.id },
            data: {
              status: mapped,
              ...(mapped === "FAILED" ? { lastError: `Call status: ${twStatus}`.slice(0, 500) } : {}),
            },
            select: { id: true },
          })
          .catch(() => null);

        row.status = mapped;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    manualCall: {
      ...row,
      createdAtIso: row.createdAt.toISOString(),
      updatedAtIso: row.updatedAt.toISOString(),
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  await ensurePortalAiOutboundCallsSchema();

  const row = await getManualCallRow(ownerId, parsed.data);
  if (!row) return jsonError("Not found", 404);

  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) return jsonError("Twilio is not configured for this account.", 400);

  const updates: Record<string, any> = {};
  let requestedTranscription = false;
  let usedVoiceTranscript = false;

  const conversationId = String(row.conversationId || "").trim();
  const voiceApiKey = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";

  if (conversationId && /twilio\s+transcription/i.test(String(row.lastError || ""))) {
    updates.lastError = null;
  }

  // Prefer voice-platform transcript when available (Twilio transcription may be disabled).
  if (!String(row.transcriptText || "").trim() && conversationId && voiceApiKey.trim()) {
    const conv = await fetchElevenLabsConversationTranscript({ apiKey: voiceApiKey, conversationId });
    if (conv.ok && conv.transcript.trim()) {
      updates.transcriptText = conv.transcript.trim();
      usedVoiceTranscript = true;
      updates.lastError = null;
    } else if (!conv.ok) {
      // Keep this neutral; the portal should not nag about Twilio transcription when we expect voice transcript.
      const msg = String(conv.error || "").trim();
      if (msg && msg.toLowerCase().includes("missing") === false) {
        updates.lastError = `Transcript pending. ${msg}`.slice(0, 500);
      }
    }
  }

  if (!String(row.recordingSid || "").trim() && String(row.callSid || "").trim()) {
    const rid = await fetchLatestRecordingSidForCall(ownerId, row.callSid || "");
    if (rid) updates.recordingSid = rid;
  }

  const effectiveRecordingSid = String(updates.recordingSid ?? row.recordingSid ?? "").trim();
  const hasTranscriptAlready = Boolean(String(updates.transcriptText ?? row.transcriptText ?? "").trim());
  if (effectiveRecordingSid && !hasTranscriptAlready) {
    const txt = await fetchTranscriptTextForRecording(ownerId, effectiveRecordingSid);
    if (txt) {
      updates.transcriptText = txt;
      updates.lastError = null;
    } else if (row.webhookToken) {
      // Kick off transcription if it hasn't completed yet.
      requestedTranscription = await requestTranscription(ownerId, effectiveRecordingSid, req, row.webhookToken);
      if (!requestedTranscription) {
        // Avoid misleading Twilio messaging if we expect voice transcript.
        if (!conversationId || !voiceApiKey.trim()) {
          updates.lastError = "Transcript request failed. Transcription may be disabled for this account.";
        }
      }
    }
  }

  // Final fallback: always produce *some* transcript by transcribing the recording audio ourselves.
  // This avoids depending on ElevenLabs transcript availability and Twilio transcription settings.
  const stillNoTranscript = !String(updates.transcriptText ?? row.transcriptText ?? "").trim();
  if (effectiveRecordingSid && stillNoTranscript) {
    try {
      // Prefer real channel-separated transcript when Twilio recording is dual-channel.
      // IMPORTANT: keep the *full* transcript order as source-of-truth, then label segments by matching
      // against left/right channel transcripts. This prevents speaker lines being out-of-order.
      const wav = await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "wav");
      const mp3ForOrder = await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "mp3");
      if (wav.ok) {
        const split = splitStereoPcmWavToMonoWavs(wav.bytes);

        const [left, right, full] = await Promise.all([
          transcribeAudioVerbose({ bytes: split.leftWav, filename: `${effectiveRecordingSid}-left.wav`, mimeType: "audio/wav" }),
          transcribeAudioVerbose({ bytes: split.rightWav, filename: `${effectiveRecordingSid}-right.wav`, mimeType: "audio/wav" }),
          mp3ForOrder.ok
            ? transcribeAudioVerbose({ bytes: mp3ForOrder.bytes, filename: `${effectiveRecordingSid}.mp3`, mimeType: mp3ForOrder.mimeType || "audio/mpeg" })
            : Promise.resolve({ text: "", segments: [] }),
        ]);

        const combined = buildSpeakerTranscriptAlignedToFull({
          full,
          left,
          right,
          leftLabel: "Recipient",
          rightLabel: "Agent",
          maxChars: 25000,
        });

        if (combined.trim()) {
          updates.transcriptText = combined.trim().slice(0, 25000);
          updates.lastError = null;
        }
      }

      if (!String(updates.transcriptText ?? row.transcriptText ?? "").trim()) {
        // Fallback: single-pass transcription of compressed audio.
        const audio = mp3ForOrder.ok ? mp3ForOrder : await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "mp3");
        if (audio.ok) {
          const text = await transcribeAudio({
            bytes: audio.bytes,
            filename: `${effectiveRecordingSid}.mp3`,
            mimeType: audio.mimeType,
          });
          const cleaned = String(text || "").trim();
          if (cleaned) {
            updates.transcriptText = cleaned.slice(0, 25000);
            updates.lastError = null;
          }
        } else if (!String(updates.lastError ?? row.lastError ?? "").trim()) {
          updates.lastError = `Transcript pending. ${audio.error}`.slice(0, 500);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to transcribe recording";
      updates.lastError = `Transcript pending. ${msg}`.slice(0, 500);
    }
  }

  // If we ended up with a transcript, clear any old “transcription failed” warnings.
  if (String(updates.transcriptText ?? row.transcriptText ?? "").trim()) {
    if (String(updates.lastError ?? row.lastError ?? "").toLowerCase().includes("transcript")) {
      updates.lastError = null;
    }
  }

  if (Object.keys(updates).length) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: row.id },
        data: updates,
        select: { id: true },
      })
      .catch(() => null);
  }

  const latest = await getManualCallRow(ownerId, parsed.data);
  if (!latest) return jsonError("Not found", 404);

  return NextResponse.json({
    ok: true,
    requestedTranscription,
    usedVoiceTranscript,
    manualCall: {
      ...latest,
      createdAtIso: latest.createdAt.toISOString(),
      updatedAtIso: latest.updatedAt.toISOString(),
    },
  });
}
