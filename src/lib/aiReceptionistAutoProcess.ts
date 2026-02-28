import { generateText, transcribeAudio } from "@/lib/ai";
import { findPortalContactByPhone } from "@/lib/portalContacts";
import { getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { normalizePhoneStrict } from "@/lib/phone";
import { getAppBaseUrl, listPortalAccountRecipientContacts, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

function safeTranscript(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  return s.slice(0, 20000);
}

function safeOneLine(raw: unknown, max = 220) {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
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

async function fetchTwilioRecordingMp3(opts: {
  ownerId: string;
  recordingSid: string;
}): Promise<{ ok: true; bytes: ArrayBuffer; mimeType: string } | { ok: false; error: string }> {
  const rid = String(opts.recordingSid || "").trim();
  if (!rid) return { ok: false, error: "Missing recording sid" };

  const config = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!config) return { ok: false, error: "Twilio is not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}.mp3`;
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

  const mimeType = res.headers.get("content-type") || "audio/mpeg";
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

  if (!transcript && recordingSid) {
    const twilioTranscript = await fetchTwilioTranscriptTextForRecording({ ownerId, recordingSid }).catch(() => null);
    transcript = safeTranscript(twilioTranscript);
  }

  if (!transcript && recordingSid) {
    const rec = await fetchTwilioRecordingMp3({ ownerId, recordingSid }).catch(() => ({ ok: false as const, error: "fetch failed" }));
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
  const looksTechnical = existingNotes.toLowerCase().startsWith("media stream callback") || existingNotes.toLowerCase().startsWith("recording ");

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

  if (finalNotes && !ev2?.smsNotesSentAtIso) {
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
        finalNotes || "(No notes)",
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
      } as any);
    }
  }
}
