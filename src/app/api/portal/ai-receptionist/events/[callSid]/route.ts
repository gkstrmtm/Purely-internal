import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { deleteAiReceptionistCallEvent, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { fetchElevenLabsConversationTranscript } from "@/lib/elevenLabsConvai";
import { transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { buildSpeakerTranscriptAlignedToFull } from "@/lib/dualChannelTranscript";
import { splitStereoPcmWavToMonoWavs } from "@/lib/wav";

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

function twilioBasicAuthHeader(cfg: { accountSid: string; authToken: string }): string {
  const basic = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  return `Basic ${basic}`;
}

function terminalStatusFromTwilio(callStatusRaw: unknown): "COMPLETED" | "FAILED" | null {
  const s = typeof callStatusRaw === "string" ? callStatusRaw.trim().toLowerCase() : "";
  if (!s) return null;
  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
  return null;
}

async function fetchTwilioCallStatus(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls/${encodeURIComponent(sid)}.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfgFromTwilio(config)) },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
    return status || null;
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

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return { ok: false, error: "Twilio is not configured for this account" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}.${ext}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfgFromTwilio(config)) },
    cache: "no-store",
  }).catch(() => null as any);

  if (!res || typeof res.ok !== "boolean") return { ok: false, error: "Unable to fetch recording" };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Unable to fetch recording (${res.status}). ${body}`.slice(0, 300) };
  }

  const bytes = await res.arrayBuffer();
  const size = bytes?.byteLength ?? 0;
  if (size <= 0) return { ok: false, error: "Recording is empty" };
  if (size > 24 * 1024 * 1024) return { ok: false, error: "Recording too large to transcribe automatically." };

  const mimeType = res.headers.get("content-type") || (ext === "wav" ? "audio/wav" : "audio/mpeg");
  return { ok: true, bytes, mimeType };
}

function cfgFromTwilio(twilio: any): { accountSid: string; authToken: string } {
  return { accountSid: String(twilio.accountSid || ""), authToken: String(twilio.authToken || "") };
}

async function fetchLatestRecordingSidForCall(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfgFromTwilio(config)) },
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

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return null;

  const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const listRes = await fetch(listUrl, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfgFromTwilio(config)) },
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
          headers: { authorization: twilioBasicAuthHeader(cfgFromTwilio(config)) },
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

async function requestTranscription(ownerId: string, recordingSid: string, webhookToken: string, req: Request): Promise<boolean> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return false;

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return false;

  const callbackUrl = new URL(req.url);
  callbackUrl.pathname = `/api/public/twilio/ai-receptionist/${encodeURIComponent(webhookToken)}/transcription`;
  callbackUrl.search = "";

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const form = new URLSearchParams();
  form.set("TranscriptionCallback", callbackUrl.toString());
  form.set("TranscriptionCallbackMethod", "POST");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: twilioBasicAuthHeader(cfgFromTwilio(config)),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  return Boolean(res?.ok);
}

export async function POST(req: Request, ctx: { params: Promise<{ callSid: string }> }) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { callSid } = await ctx.params;
  const ownerId = auth.session.user.id;
  const sid = String(callSid || "").trim();
  if (!sid) return NextResponse.json({ ok: false, error: "Missing call sid" }, { status: 400 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const data = await getAiReceptionistServiceData(ownerId);
  const event = (data.events || []).find((e: any) => String(e?.callSid || "").trim() === sid) as any;
  if (!event) return NextResponse.json({ ok: false, error: "Call not found" }, { status: 404 });

  let effectiveStatus: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "UNKNOWN" =
    event?.status === "IN_PROGRESS" || event?.status === "COMPLETED" || event?.status === "FAILED" || event?.status === "UNKNOWN"
      ? event.status
      : "UNKNOWN";

  // Best-effort reconciliation: if the portal is refreshing a call that still looks IN_PROGRESS,
  // ask Twilio for the real call status and flip it terminal if needed.
  if (effectiveStatus === "IN_PROGRESS" || effectiveStatus === "UNKNOWN") {
    const twStatus = await fetchTwilioCallStatus(ownerId, sid);
    const mapped = terminalStatusFromTwilio(twStatus);
    if (mapped) {
      effectiveStatus = mapped;
      await upsertAiReceptionistCallEvent(ownerId, {
        id: String(event?.id || `call_${sid}`),
        callSid: sid,
        from: String(event?.from || "Unknown"),
        to: typeof event?.to === "string" ? event.to : null,
        createdAtIso: String(event?.createdAtIso || new Date().toISOString()),
        status: mapped,
      } as any);
    }
  }

  const existing = String(event?.transcript || "").trim();
  if (existing && !force) return NextResponse.json({ ok: true, transcript: existing });

  const conversationId = String((event as any)?.conversationId || "").trim();
  const svc = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const webhookToken = String(svc?.settings?.webhookToken || "").trim();
  const profileKey = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const legacyKey = typeof svc?.settings?.voiceAgentApiKey === "string" ? String(svc.settings.voiceAgentApiKey).trim() : "";
  const voiceApiKey = profileKey.trim() || legacyKey.trim();

  const updates: Record<string, any> = {};
  let requestedTranscription = false;
  let usedVoiceTranscript = false;

  // Prefer ElevenLabs transcript when available.
  if (!existing && conversationId && voiceApiKey) {
    const conv = await fetchElevenLabsConversationTranscript({ apiKey: voiceApiKey, conversationId });
    if (conv.ok && conv.transcript.trim()) {
      updates.transcript = conv.transcript.trim().slice(0, 25000);
      usedVoiceTranscript = true;
    }
  }

  let recordingSid = String(event?.recordingSid || "").trim();
  if (!recordingSid) {
    const rid = await fetchLatestRecordingSidForCall(ownerId, sid);
    if (rid) {
      recordingSid = rid;
      updates.recordingSid = rid;
    }
  }

  if (!recordingSid) {
    if (updates.transcript) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: String(event?.id || `call_${sid}`),
        callSid: sid,
        from: String(event?.from || "Unknown"),
        to: typeof event?.to === "string" ? event.to : null,
        createdAtIso: String(event?.createdAtIso || new Date().toISOString()),
        status: effectiveStatus,
        transcript: String(updates.transcript),
      });
      return NextResponse.json({ ok: true, transcript: updates.transcript, requestedTranscription, usedVoiceTranscript });
    }

    return NextResponse.json({ ok: false, error: "No recording available for this call" }, { status: 400 });
  }

  const hasTranscriptAlready = Boolean(String(updates.transcript ?? event?.transcript ?? "").trim());
  if (!hasTranscriptAlready) {
    const txt = await fetchTranscriptTextForRecording(ownerId, recordingSid);
    if (txt) {
      updates.transcript = txt.trim().slice(0, 25000);
    } else if (webhookToken) {
      requestedTranscription = await requestTranscription(ownerId, recordingSid, webhookToken, req);
    }
  }

  try {
    const wav = await fetchTwilioRecordingAudio(ownerId, recordingSid, "wav");
    const mp3 = await fetchTwilioRecordingAudio(ownerId, recordingSid, "mp3");

    let transcript = String(updates.transcript ?? "").trim();

    if (!transcript && wav.ok) {
      try {
        const split = splitStereoPcmWavToMonoWavs(wav.bytes);
        const [left, right, full] = await Promise.all([
          transcribeAudioVerbose({ bytes: split.leftWav, filename: `${recordingSid}-left.wav`, mimeType: "audio/wav" }),
          transcribeAudioVerbose({ bytes: split.rightWav, filename: `${recordingSid}-right.wav`, mimeType: "audio/wav" }),
          mp3.ok
            ? transcribeAudioVerbose({ bytes: mp3.bytes, filename: `${recordingSid}.mp3`, mimeType: mp3.mimeType || "audio/mpeg" })
            : Promise.resolve({ text: "", segments: [] }),
        ]);

        transcript = buildSpeakerTranscriptAlignedToFull({
          full,
          left,
          right,
          leftLabel: "Recipient",
          rightLabel: "Agent",
          maxChars: 25000,
        });
      } catch (err) {
        // Some recordings are mono-only or otherwise not compatible with the
        // stereo splitter. In that case, silently fall back to MP3-only
        // transcription instead of surfacing a noisy error to the portal.
        console.warn("AI receptionist: unable to split WAV for stereo transcript; falling back to MP3-only", {
          ownerId,
          callSid: sid,
          recordingSid,
          error: err instanceof Error ? err.message : String(err ?? "unknown"),
        });
      }
    }

    if (!transcript.trim() && mp3.ok) {
      const text = await transcribeAudio({ bytes: mp3.bytes, filename: `${recordingSid}.mp3`, mimeType: mp3.mimeType || "audio/mpeg" });
      transcript = String(text || "").trim().slice(0, 25000);
    }

    if (!transcript.trim()) {
      return NextResponse.json({ ok: false, error: "Unable to generate transcript yet" }, { status: 502 });
    }

    updates.transcript = transcript.trim().slice(0, 25000);

    await upsertAiReceptionistCallEvent(ownerId, {
      id: String(event?.id || `call_${sid}`),
      callSid: sid,
      from: String(event?.from || "Unknown"),
      to: typeof event?.to === "string" ? event.to : null,
      createdAtIso: String(event?.createdAtIso || new Date().toISOString()),
      status: effectiveStatus,
      recordingSid,
      transcript: String(updates.transcript),
    });

    // Reuse the same transcript-handling path as Twilio's transcription
    // callback so that notes, email, and SMS notifications are generated
    // even when we transcribe the recording ourselves.
    if (webhookToken && updates.transcript) {
      try {
        const callbackUrl = new URL(req.url);
        callbackUrl.pathname = `/api/public/twilio/ai-receptionist/${encodeURIComponent(webhookToken)}/transcription`;
        callbackUrl.search = "";

        const form = new URLSearchParams();
        form.set("CallSid", sid);
        form.set("From", String(event?.from || "Unknown"));
        if (typeof event?.to === "string" && event.to.trim()) form.set("To", event.to.trim());
        if (recordingSid) form.set("RecordingSid", recordingSid);
        form.set("TranscriptionText", String(updates.transcript));
        form.set("TranscriptionStatus", "completed");

        await fetch(callbackUrl.toString(), {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        }).catch(() => null as any);
      } catch {
        // Best-effort only; the portal will still show the transcript even if
        // notifications fail.
      }
    }

    return NextResponse.json({ ok: true, transcript: updates.transcript, requestedTranscription, usedVoiceTranscript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unable to generate transcript";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ callSid: string }> }) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { callSid } = await ctx.params;
  const ownerId = auth.session.user.id;

  const res = await deleteAiReceptionistCallEvent(ownerId, callSid);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "Call not found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
