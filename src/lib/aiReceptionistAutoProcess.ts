import { generateText, transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { findOrCreatePortalContact, findPortalContactByPhone } from "@/lib/portalContacts";
import { getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { prisma } from "@/lib/db";
import { fetchElevenLabsConversationTranscript } from "@/lib/elevenLabsConvai";
import { buildSpeakerTranscriptAlignedToFull } from "@/lib/dualChannelTranscript";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { normalizePhoneStrict } from "@/lib/phone";
import { getAppBaseUrl, listPortalAccountRecipientContacts, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";
import { splitStereoPcmWavToMonoWavs } from "@/lib/wav";

function safeTranscript(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  return s.slice(0, 20000);
}

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
  return key || null;
}

function normalizeRoleLabel(raw: string): string {
  const r = String(raw || "").trim().toLowerCase();
  if (!r) return "";
  if (r === "agent" || r === "assistant" || r === "ai" || r === "bot" || r === "system") return "Agent";
  if (r === "recipient" || r === "user" || r === "caller" || r === "human") return "Recipient";
  if (r.includes("agent")) return "Agent";
  if (r.includes("user") || r.includes("caller") || r.includes("recipient")) return "Recipient";
  return raw.trim().slice(0, 40);
}

function normalizeSpeakerTranscript(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([^:]{1,24})\s*:\s*(.+)$/);
    if (!m) {
      out.push(line);
      continue;
    }

    const role = normalizeRoleLabel(m[1] || "");
    const msg = String(m[2] || "").trim();
    if (!msg) continue;
    out.push(role ? `${role}: ${msg}` : msg);
  }

  return out.join("\n").trim().slice(0, 25000);
}

function chunkText(s: string, maxChars: number): string[] {
  const max = Math.max(80, Math.floor(maxChars || 0));
  const text = String(s || "").trim();
  if (!text) return [];

  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let cur = "";

  const push = () => {
    const t = cur.trim();
    if (t) chunks.push(t);
    cur = "";
  };

  for (const p of paras.length ? paras : [text]) {
    if (!cur) {
      cur = p;
      if (cur.length >= max) {
        chunks.push(cur.slice(0, max));
        cur = "";
      }
      continue;
    }

    if ((cur + "\n\n" + p).length <= max) {
      cur = cur + "\n\n" + p;
      continue;
    }

    push();
    cur = p;
    if (cur.length >= max) {
      chunks.push(cur.slice(0, max));
      cur = "";
    }
  }

  push();
  return chunks;
}

function safeOneLine(raw: unknown, max = 220) {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function isTechnicalNotes(raw: string): boolean {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("media stream callback")) return true;
  if (text.includes("stream-started") || text.includes("stream-stopped") || text.includes("stream-error")) return true;
  if (text.startsWith("recording detected:")) return true;
  if (text.startsWith("recording started:")) return true;
  if (text.includes("recording start requested")) return true;
  if (text.startsWith("live agent connected")) return true;
  if (text.startsWith("ai mode unavailable")) return true;
  if (text.startsWith("insufficient credits")) return true;
  if (text.startsWith("call status:")) return true;
  return false;
}

function hasSpeakerLabels(raw: string): boolean {
  const text = String(raw || "");
  return /^(agent|recipient|receptionist|ai receptionist)\s*:/im.test(text);
}

async function fetchTwilioTranscriptTextForRecording(opts: {
  ownerId: string;
  recordingSid: string;
}): Promise<string | null> {
  const rid = String(opts.recordingSid || "").trim();
  if (!rid) return null;

  const config = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, { method: "GET", headers: { authorization: `Basic ${basic}` } }).catch(() => null as any);
  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const transcriptions = Array.isArray(json?.transcriptions)
      ? json.transcriptions
      : Array.isArray(json)
        ? json
        : [];

    for (const t of transcriptions) {
      const status = typeof t?.status === "string" ? t.status.trim().toLowerCase() : "";
      const inlineText = typeof t?.transcription_text === "string" ? t.transcription_text : "";
      if (status === "completed" && inlineText.trim()) return inlineText.trim();
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchTwilioRecordingAudio(opts: {
  ownerId: string;
  recordingSid: string;
  ext: "mp3" | "wav";
}): Promise<{ ok: true; bytes: ArrayBuffer; mimeType: string } | { ok: false; error: string }> {
  const rid = String(opts.recordingSid || "").trim();
  if (!rid) return { ok: false, error: "Missing recording sid" };

  const config = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!config) return { ok: false, error: "Twilio is not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}.${opts.ext}`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
    cache: "no-store",
  }).catch(() => null as any);

  if (!res || typeof res.ok !== "boolean") return { ok: false, error: "Unable to fetch recording" };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Unable to fetch recording (${res.status}). ${body}`.slice(0, 280) };
  }

  const bytes = await res.arrayBuffer();
  const size = bytes?.byteLength ?? 0;
  if (size <= 0) return { ok: false, error: "Recording is empty" };
  if (size > 24 * 1024 * 1024) return { ok: false, error: "Recording too large to transcribe automatically" };

  const mimeType = res.headers.get("content-type") || (opts.ext === "wav" ? "audio/wav" : "audio/mpeg");
  return { ok: true, bytes, mimeType };
}

export async function autoProcessAiReceptionistCall(opts: {
  ownerId: string;
  callSid: string;
  recordingSid?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<void> {
  const ownerId = String(opts.ownerId || "").trim();
  const callSid = String(opts.callSid || "").trim();
  if (!ownerId || !callSid) return;

  const data = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const event = (data?.events || []).find((e: any) => String(e?.callSid || "").trim() === callSid) as any;
  if (!event) return;

  const recordingSid =
    String(opts.recordingSid || "").trim() || (typeof event?.recordingSid === "string" ? event.recordingSid.trim() : "");

  const fromFinal = String(opts.from || "").trim() || String(event?.from || "").trim();
  const toFinal = (String(opts.to || "").trim() || String(event?.to || "").trim()) || null;

  const fromParsed = normalizePhoneStrict(fromFinal);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : fromFinal;
  const toParsed = toFinal ? normalizePhoneStrict(toFinal) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : toFinal;

  let contactName = String(event?.contactName || "").trim() || fromE164;
  try {
    const existingContact = fromE164 ? await findPortalContactByPhone({ ownerId, phone: fromE164 }) : null;
    if (existingContact?.name) contactName = existingContact.name;
  } catch {
    // ignore
  }

  // Step 1: obtain transcript without relying on a signed-in browser.
  let transcript = safeTranscript(event?.transcript);

  // Prefer ElevenLabs conversation transcript when possible (speaker formatted).
  const conversationId = typeof (event as any)?.conversationId === "string" ? String((event as any).conversationId).trim() : "";
  if (!transcript && conversationId) {
    const profileKey = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
    const legacyKey = typeof data?.settings?.voiceAgentApiKey === "string" ? String(data.settings.voiceAgentApiKey).trim() : "";
    const voiceApiKey = profileKey.trim() || legacyKey.trim();

    if (voiceApiKey) {
      const conv = await fetchElevenLabsConversationTranscript({ apiKey: voiceApiKey, conversationId }).catch((e) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e ?? "fetch failed"),
      }));

      if (conv.ok && conv.transcript.trim()) {
        transcript = safeTranscript(normalizeSpeakerTranscript(conv.transcript));
      }
    }
  }

  if (!transcript && recordingSid) {
    const twilioTranscript = await fetchTwilioTranscriptTextForRecording({ ownerId, recordingSid }).catch(() => null);
    transcript = safeTranscript(twilioTranscript);
  }

  // Prefer a speaker-labeled transcript when we have dual-channel audio.
  if (recordingSid && (!transcript || !hasSpeakerLabels(transcript))) {
    try {
      const [wav, mp3] = await Promise.all([
        fetchTwilioRecordingAudio({ ownerId, recordingSid, ext: "wav" }).catch(() => ({ ok: false as const, error: "fetch failed" })),
        fetchTwilioRecordingAudio({ ownerId, recordingSid, ext: "mp3" }).catch(() => ({ ok: false as const, error: "fetch failed" })),
      ]);

      if (wav.ok) {
        try {
          const split = splitStereoPcmWavToMonoWavs(wav.bytes);
          const [left, right, full] = await Promise.all([
            transcribeAudioVerbose({ bytes: split.leftWav, filename: `${recordingSid}-left.wav`, mimeType: "audio/wav" }),
            transcribeAudioVerbose({ bytes: split.rightWav, filename: `${recordingSid}-right.wav`, mimeType: "audio/wav" }),
            mp3.ok
              ? transcribeAudioVerbose({ bytes: mp3.bytes, filename: `${recordingSid}.mp3`, mimeType: mp3.mimeType || "audio/mpeg" })
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

          if (combined.trim()) transcript = safeTranscript(combined);
        } catch (err) {
          console.warn("AI receptionist: unable to split WAV for stereo transcript; falling back", {
            ownerId,
            callSid,
            recordingSid,
            error: err instanceof Error ? err.message : String(err ?? "unknown"),
          });
        }
      }
    } catch {
      // Ignore; we'll fall back to other transcript sources.
    }
  }

  if (!transcript && recordingSid) {
    const rec = await fetchTwilioRecordingAudio({ ownerId, recordingSid, ext: "mp3" }).catch(() => ({ ok: false as const, error: "fetch failed" }));
    if (rec.ok) {
      try {
        transcript = safeTranscript(
          await transcribeAudio({ bytes: rec.bytes, filename: `${callSid}.mp3`, mimeType: rec.mimeType || "audio/mpeg" }),
        );
      } catch (e) {
        console.error("AI receptionist: self-transcribe failed", { ownerId, callSid, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // Step 2: generate concise notes (if missing / technical).
  const existingNotes = typeof event?.notes === "string" ? event.notes.trim() : "";
  const looksTechnical = isTechnicalNotes(existingNotes);

  let notes = existingNotes;
  if (transcript && (!notes || looksTechnical)) {
    try {
      const summary = await generateText({
        system:
          "You are a helpful receptionist assistant. Given a full call transcript, write a single clear takeaway for the business owner.\n" +
          "Focus ONLY on the main reason for the call and what the business needs to do next.\n" +
          "Ignore greetings, small talk, and repeated details.\n" +
          "If the caller's name is mentioned (e.g. 'This is John'), include it. If not, use 'Unknown'.\n" +
          "Return exactly one short sentence under 220 characters, in the format: 'Caller: [Name/Unknown]. Summary: [main takeaway]'.",
        user: `Transcript:\n\"${transcript}\"`,
      });

      notes = safeOneLine(summary, 220);
      const nameMatch = notes.match(/Caller:\s*([^.]+)/i);
      if (nameMatch?.[1]) {
        const potentialName = nameMatch[1].trim();
        if (potentialName && potentialName.toLowerCase() !== "unknown" && contactName === fromE164) {
          contactName = potentialName;
        }
      }
    } catch (e) {
      console.error("AI receptionist: notes generation failed", { ownerId, callSid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Best-effort: create/refresh a Portal Contact for this caller so they appear in People > Contacts.
  try {
    const eventEmail = typeof event?.contactEmail === "string" && event.contactEmail.trim() ? String(event.contactEmail).trim() : null;
    const eventPhoneRaw = typeof event?.contactPhone === "string" && event.contactPhone.trim() ? String(event.contactPhone).trim() : "";
    const eventPhoneParsed = eventPhoneRaw ? normalizePhoneStrict(eventPhoneRaw) : null;

    const phoneForContact =
      eventPhoneParsed && eventPhoneParsed.ok && eventPhoneParsed.e164
        ? eventPhoneParsed.e164
        : fromParsed.ok && fromParsed.e164
          ? fromParsed.e164
          : null;

    if (phoneForContact) {
      await findOrCreatePortalContact({
        ownerId,
        name: String(contactName || phoneForContact).slice(0, 80) || "Caller",
        email: eventEmail,
        phone: phoneForContact,
      });
    }
  } catch {
    // ignore
  }

  // Persist transcript/notes updates (idempotent).
  if (transcript || notes || (contactName && contactName !== fromE164) || (recordingSid && recordingSid !== String(event?.recordingSid || "").trim())) {
    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164 || event?.from || "unknown",
      to: toE164 ?? event?.to ?? null,
      createdAtIso: typeof event?.createdAtIso === "string" ? event.createdAtIso : new Date().toISOString(),
      status: "COMPLETED",
      ...(recordingSid ? { recordingSid } : {}),
      ...(transcript ? { transcript } : {}),
      ...(notes ? { notes } : {}),
      ...(contactName && contactName !== fromE164 ? { contactName } : {}),
    } as any);
  }

  // Step 3: send notifications (idempotent via sentAt timestamps).
  const refreshed = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const ev2 = (refreshed?.events || []).find((e: any) => String(e?.callSid || "").trim() === callSid) as any;
  if (!ev2) return;

  const finalNotes = String(ev2?.notes || "").trim();
  const finalTranscript = String(ev2?.transcript || "").trim();
  const finalRecordingSid = String(ev2?.recordingSid || "").trim();

  const baseUrl = getAppBaseUrl();
  const portalLink = `${baseUrl}/portal/app/services/ai-receptionist`;
  const contacts = await listPortalAccountRecipientContacts(ownerId).catch(() => []);

  if (finalNotes && !isTechnicalNotes(finalNotes) && !ev2?.smsNotesSentAtIso) {
    const smsBody = [
      `AI receptionist notes${contactName ? `: ${contactName}` : ""}`,
      finalNotes,
      fromE164 ? `From: ${fromE164}` : null,
      toE164 ? `To: ${toE164}` : null,
      portalLink,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 900);

    const destinations = contacts.map((c) => c.phoneE164).filter(Boolean) as string[];
    if (destinations.length) {
      const results = await Promise.all(
        destinations.map((to) =>
          sendTwilioEnvSms({
            to,
            body: smsBody,
            fromNumberEnvKeys: ["TWILIO_FROM_NUMBER", "TWILIO_MARKETING_FROM_NUMBER"],
          }),
        ),
      );

      if (results.some((r) => r.ok)) {
        await upsertAiReceptionistCallEvent(ownerId, {
          id: `call_${callSid}`,
          callSid,
          from: fromE164 || ev2?.from || "unknown",
          to: toE164 ?? ev2?.to ?? null,
          createdAtIso: typeof ev2?.createdAtIso === "string" ? ev2.createdAtIso : new Date().toISOString(),
          status: "COMPLETED",
          smsNotesSentAtIso: new Date().toISOString(),
        } as any);
      }
    }
  }

  // SMS transcript (split into chunks): send full transcript + notes after completion.
  if (finalTranscript && !ev2?.smsTranscriptSentAtIso) {
    const destinations = contacts.map((c) => c.phoneE164).filter(Boolean) as string[];

    if (!destinations.length) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: `call_${callSid}`,
        callSid,
        from: fromE164 || ev2?.from || "unknown",
        to: toE164 ?? ev2?.to ?? null,
        createdAtIso: typeof ev2?.createdAtIso === "string" ? ev2.createdAtIso : new Date().toISOString(),
        status: "COMPLETED",
        smsTranscriptSendError: "No recipient profile phones configured",
      } as any);
    } else {
      const header = [
        `AI receptionist transcript${contactName ? `: ${contactName}` : ""}`,
        fromE164 ? `From: ${fromE164}` : null,
        toE164 ? `To: ${toE164}` : null,
        finalNotes && !isTechnicalNotes(finalNotes) ? `Notes: ${finalNotes}` : null,
        portalLink,
      ]
        .filter(Boolean)
        .join("\n");

      const chunks = chunkText(finalTranscript, 820);
      const messages = [header, ...chunks.map((c, i) => `Transcript ${i + 1}/${chunks.length}:\n${c}`)];

      const results = await Promise.all(
        destinations.map(async (to) => {
          const sends = await Promise.all(
            messages.map((body) =>
              sendTwilioEnvSms({
                to,
                body: String(body || "").slice(0, 900),
                fromNumberEnvKeys: ["TWILIO_FROM_NUMBER", "TWILIO_MARKETING_FROM_NUMBER"],
              }),
            ),
          );
          const anyOk = sends.some((r) => r.ok);
          const firstBad = sends.find((r) => !r.ok);
          const firstErr = firstBad && !firstBad.ok ? firstBad.reason : "";
          return { to, anyOk, firstErr };
        }),
      );

      const anyOk = results.some((r) => r.anyOk);
      if (anyOk) {
        await upsertAiReceptionistCallEvent(ownerId, {
          id: `call_${callSid}`,
          callSid,
          from: fromE164 || ev2?.from || "unknown",
          to: toE164 ?? ev2?.to ?? null,
          createdAtIso: typeof ev2?.createdAtIso === "string" ? ev2.createdAtIso : new Date().toISOString(),
          status: "COMPLETED",
          smsTranscriptSentAtIso: new Date().toISOString(),
          smsTranscriptSendError: "",
        } as any);
      } else {
        const reason = safeOneLine(results.find((r) => r.firstErr)?.firstErr || "Unable to send SMS transcript", 280);
        await upsertAiReceptionistCallEvent(ownerId, {
          id: `call_${callSid}`,
          callSid,
          from: fromE164 || ev2?.from || "unknown",
          to: toE164 ?? ev2?.to ?? null,
          createdAtIso: typeof ev2?.createdAtIso === "string" ? ev2.createdAtIso : new Date().toISOString(),
          status: "COMPLETED",
          smsTranscriptSendError: reason,
        } as any);
      }
    }
  }

  if (finalTranscript && !ev2?.emailTranscriptSentAtIso) {
    const recordingUrl = finalRecordingSid
      ? `${baseUrl}/api/portal/ai-receptionist/recordings/${encodeURIComponent(finalRecordingSid)}`
      : "";

    const res = await tryNotifyPortalAccountUsers({
      ownerId,
      kind: "ai_receptionist_call_completed",
      subject: `AI receptionist transcript${contactName ? `: ${contactName}` : ""}`,
      smsMirror: false,
      text: [
        `Your AI receptionist handled a call from ${contactName} (${fromE164}).`,
        "",
        toE164 ? `To: ${toE164}` : null,
        "",
        "Notes:",
        finalNotes && !isTechnicalNotes(finalNotes) ? finalNotes : "(No notes)",
        "",
        "Transcript:",
        finalTranscript || "(No transcript)",
        "",
        recordingUrl ? `Recording: ${recordingUrl}` : "Recording: (not available yet)",
        "",
        `Open AI receptionist: ${portalLink}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    if (res.ok) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: `call_${callSid}`,
        callSid,
        from: fromE164 || ev2?.from || "unknown",
        to: toE164 ?? ev2?.to ?? null,
        createdAtIso: typeof ev2?.createdAtIso === "string" ? ev2.createdAtIso : new Date().toISOString(),
        status: "COMPLETED",
        emailTranscriptSentAtIso: new Date().toISOString(),
        emailTranscriptSendError: "",
      } as any);
    } else {
      const reason = safeOneLine(res.reason || "Email send failed", 380);
      console.error("AI receptionist: transcript email failed", { ownerId, callSid, reason });
      await upsertAiReceptionistCallEvent(ownerId, {
        id: `call_${callSid}`,
        callSid,
        from: fromE164 || ev2?.from || "unknown",
        to: toE164 ?? ev2?.to ?? null,
        createdAtIso: typeof ev2?.createdAtIso === "string" ? ev2.createdAtIso : new Date().toISOString(),
        status: "COMPLETED",
        emailTranscriptSendError: reason,
      } as any);
    }
  }
}
