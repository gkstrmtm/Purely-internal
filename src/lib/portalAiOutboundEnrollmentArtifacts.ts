import { analyzeAiOutboundBookingTranscript, parseAiOutboundBookingConfig } from "@/lib/aiOutboundBooking";
import { transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getBookingFormConfig } from "@/lib/bookingForm";
import { prisma } from "@/lib/db";
import { buildSpeakerTranscriptAlignedToFull } from "@/lib/dualChannelTranscript";
import { fetchElevenLabsConversationTranscript } from "@/lib/elevenLabsConvai";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { splitStereoPcmWavToMonoWavs } from "@/lib/wav";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const value = (process.env[key] ?? "").trim();
    if (value) return value;
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
    for (const recording of recordings) {
      const recordingSid = typeof recording?.sid === "string" ? recording.sid.trim() : "";
      if (recordingSid) return recordingSid;
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
    for (const transcription of transcriptions) {
      const status = typeof transcription?.status === "string" ? transcription.status.trim().toLowerCase() : "";
      const inlineText = typeof transcription?.transcription_text === "string" ? transcription.transcription_text : "";
      if (status === "completed" && inlineText.trim()) return inlineText.trim();

      const transcriptionSid = typeof transcription?.sid === "string" ? transcription.sid.trim() : "";
      if (status === "completed" && transcriptionSid) {
        const detailUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Transcriptions/${encodeURIComponent(transcriptionSid)}.json`;
        const detailRes = await fetch(detailUrl, {
          method: "GET",
          headers: { authorization: twilioBasicAuthHeader(config) },
        }).catch(() => null as any);

        if (!detailRes?.ok) continue;
        const detailText = await detailRes.text().catch(() => "");
        if (!detailText.trim()) continue;

        try {
          const detail = JSON.parse(detailText) as any;
          const text = typeof detail?.transcription_text === "string" ? detail.transcription_text.trim() : "";
          if (text) return text;
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
  if ((bytes?.byteLength ?? 0) > 24 * 1024 * 1024) {
    return { ok: false, error: "Recording too large to transcribe automatically." };
  }

  return { ok: true, bytes, mimeType: res.headers.get("content-type") || "audio/mpeg" };
}

async function getEnrollmentRow(ownerId: string, enrollmentId: string) {
  return prisma.portalAiOutboundCallEnrollment.findFirst({
    where: { ownerId, id: enrollmentId },
    select: {
      id: true,
      ownerId: true,
      campaignId: true,
      contactId: true,
      status: true,
      callSid: true,
      conversationId: true,
      recordingSid: true,
      transcriptText: true,
      bookingAnalysisJson: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      campaign: { select: { bookingConfigJson: true } },
    } as any,
  }) as Promise<any>;
}

export async function refreshAiOutboundEnrollmentArtifacts(opts: { ownerId: string; enrollmentId: string }) {
  const ownerId = String(opts.ownerId || "").trim();
  const enrollmentId = String(opts.enrollmentId || "").trim();
  if (!ownerId || !enrollmentId) return { ok: false as const, enrollment: null };

  const row = await getEnrollmentRow(ownerId, enrollmentId);
  if (!row) return { ok: false as const, enrollment: null };

  const updates: Record<string, unknown> = {};
  const conversationId = String(row.conversationId || "").trim();
  const voiceApiKey = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";

  if (!String(row.transcriptText || "").trim() && conversationId && voiceApiKey.trim()) {
    const conv = await fetchElevenLabsConversationTranscript({ apiKey: voiceApiKey, conversationId }).catch(() => null);
    if (conv?.ok && conv.transcript.trim()) {
      updates.transcriptText = conv.transcript.trim().slice(0, 25000);
    }
  }

  if (!String(row.recordingSid || "").trim() && String(row.callSid || "").trim()) {
    const recordingSid = await fetchLatestRecordingSidForCall(ownerId, row.callSid || "");
    if (recordingSid) updates.recordingSid = recordingSid;
  }

  const effectiveRecordingSid = String(updates.recordingSid ?? row.recordingSid ?? "").trim();
  const hasTranscript = Boolean(String(updates.transcriptText ?? row.transcriptText ?? "").trim());

  if (effectiveRecordingSid && !hasTranscript) {
    const transcriptText = await fetchTranscriptTextForRecording(ownerId, effectiveRecordingSid);
    if (transcriptText) {
      updates.transcriptText = transcriptText.slice(0, 25000);
    }
  }

  if (effectiveRecordingSid && !String(updates.transcriptText ?? row.transcriptText ?? "").trim()) {
    try {
      const wav = await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "wav");
      const mp3ForOrder = await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "mp3");

      if (wav.ok) {
        const split = splitStereoPcmWavToMonoWavs(wav.bytes);
        const [left, right, full] = await Promise.all([
          transcribeAudioVerbose({ bytes: split.leftWav, filename: `${effectiveRecordingSid}-left.wav`, mimeType: "audio/wav" }),
          transcribeAudioVerbose({ bytes: split.rightWav, filename: `${effectiveRecordingSid}-right.wav`, mimeType: "audio/wav" }),
          mp3ForOrder.ok
            ? transcribeAudioVerbose({
                bytes: mp3ForOrder.bytes,
                filename: `${effectiveRecordingSid}.mp3`,
                mimeType: mp3ForOrder.mimeType || "audio/mpeg",
              })
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
        }
      }

      if (!String(updates.transcriptText ?? row.transcriptText ?? "").trim()) {
        const audio = mp3ForOrder.ok ? mp3ForOrder : await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "mp3");
        if (audio.ok) {
          const transcriptText = await transcribeAudio({
            bytes: audio.bytes,
            filename: `${effectiveRecordingSid}.mp3`,
            mimeType: audio.mimeType,
          });
          const cleaned = String(transcriptText || "").trim();
          if (cleaned) {
            updates.transcriptText = cleaned.slice(0, 25000);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const effectiveTranscript = String(updates.transcriptText ?? row.transcriptText ?? "").trim();
  const bookingConfig = parseAiOutboundBookingConfig((row.campaign as any)?.bookingConfigJson);
  if (effectiveTranscript && !(row as any).bookingAnalysisJson) {
    const shouldLoadBookingContext = bookingConfig.enabled && bookingConfig.calendarId;
    const [calendarsConfig, bookingForm] = await Promise.all([
      shouldLoadBookingContext ? getBookingCalendarsConfig(ownerId).catch(() => null) : Promise.resolve(null),
      getBookingFormConfig(ownerId).catch(() => null),
    ]);
    const calendar = shouldLoadBookingContext
      ? calendarsConfig?.calendars?.find((item) => String(item.id) === String(bookingConfig.calendarId)) ?? null
      : null;

    const analysis = await analyzeAiOutboundBookingTranscript({
      transcript: effectiveTranscript,
      calendarTitle: calendar?.title || "Follow-up consultation",
      meetingLocation: calendar?.meetingLocation ?? null,
      meetingDetails: calendar?.meetingDetails ?? null,
      form: bookingForm
        ? {
            phone: bookingForm.phone,
            notes: bookingForm.notes,
            questions: bookingForm.questions,
          }
        : null,
    }).catch(() => null);
    if (analysis) updates.bookingAnalysisJson = analysis as any;
  }

  if (Object.keys(updates).length) {
    await prisma.portalAiOutboundCallEnrollment.update({
      where: { id: row.id },
      data: updates as any,
      select: { id: true },
    });
  }

  const latest = await getEnrollmentRow(ownerId, enrollmentId);
  return { ok: true as const, enrollment: latest };
}