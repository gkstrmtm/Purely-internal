import { NextResponse } from "next/server";

import { generateText } from "@/lib/ai";
import { findPortalContactByPhone } from "@/lib/portalContacts";
import { findOwnerByAiReceptionistWebhookToken, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";
import { getAppBaseUrl, listPortalAccountRecipientContacts, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeTranscript(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  // Keep event JSON compact.
  return s.slice(0, 20000);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await findOwnerByAiReceptionistWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const ownerId = lookup.ownerId;

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const fromRaw = form?.get("From");
  const toRaw = form?.get("To");
  const recordingSidRaw = form?.get("RecordingSid");

  // Twilio transcription callback commonly includes TranscriptionText/TranscriptionStatus.
  const transcriptionTextRaw = form?.get("TranscriptionText") ?? form?.get("transcription_text") ?? form?.get("Text");
  const transcriptionStatusRaw = form?.get("TranscriptionStatus");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;
  const recordingSid = typeof recordingSidRaw === "string" ? recordingSidRaw : "";
  const transcriptionText = safeTranscript(transcriptionTextRaw);
  const transcriptionStatus = typeof transcriptionStatusRaw === "string" ? transcriptionStatusRaw.trim() : "";

  if (!callSid) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  // Some Twilio transcription callbacks omit From/To. Reuse the stored call event.
  let fromFinal = from;
  let toFinal = to;
  if (!fromFinal) {
    const existing = await getAiReceptionistServiceData(ownerId).catch(() => null);
    const match = existing?.events?.find((e: any) => String(e?.callSid || "") === callSid) as any;
    fromFinal = typeof match?.from === "string" && match.from.trim() ? match.from.trim() : "Unknown";
    toFinal = typeof match?.to === "string" && match.to.trim() ? match.to.trim() : toFinal;
  }

  const fromParsed = normalizePhoneStrict(fromFinal);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : fromFinal;
  const toParsed = toFinal ? normalizePhoneStrict(toFinal) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : toFinal;

  let summary = "";
  let contactName = fromE164;

  // Prefer an existing portal contact name if this number matches a saved contact.
  try {
    const existingContact = fromE164
      ? await findPortalContactByPhone({ ownerId, phone: fromE164 })
      : null;
    if (existingContact?.name) {
      contactName = existingContact.name;
    }
  } catch {
    // Best-effort only; fall back to number/LLM name.
  }
  
  if (transcriptionText) {
    try {
      summary = await generateText({
        system:
          "You are a helpful receptionist assistant. Given a full call transcript, write a single clear takeaway for the business owner.\n" +
          "Focus ONLY on the main reason for the call and what the business needs to do next.\n" +
          "Ignore greetings, small talk, and repeated details.\n" +
          "If the caller's name is mentioned (e.g. 'This is John'), include it. If not, use 'Unknown'.\n" +
          "Return exactly one short sentence under 220 characters, in the format: 'Caller: [Name/Unknown]. Summary: [main takeaway]'.",
        user: `Transcript:\n"${transcriptionText}"`,
      });

      // Simple extraction if the LLM followed format "Caller: ... Summary: ..."
      const nameMatch = summary.match(/Caller:\s*([^.]+)/i);
      if (nameMatch && nameMatch[1]) {
        const potentialName = nameMatch[1].trim();
        if (potentialName.toLowerCase() !== "unknown" && contactName === fromE164) {
          contactName = potentialName;
        }
      }
    } catch (e) {
      console.error("AI summary failed", e);
      summary = transcriptionText.slice(0, 100) + "...";
    }
  }

  const notes = summary
    ? summary
    : !transcriptionText
    ? (transcriptionStatus
        ? `Transcript status: ${transcriptionStatus}`
        : "Transcript callback received.")
    : "";

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "COMPLETED",
    ...(notes ? { notes } : {}),
    ...(recordingSid ? { recordingSid } : {}),
    ...(transcriptionText ? { transcript: transcriptionText } : {}),
    ...(contactName !== fromE164 ? { contactName } : {}),
  });

  // Notifications (best-effort)
  try {
    const baseUrl = getAppBaseUrl();

    const data = await getAiReceptionistServiceData(ownerId).catch(() => null);
    const event = (data?.events || []).find((e: any) => String(e?.callSid || "").trim() === callSid) as any;

    const hasNotes = Boolean(String(notes || "").trim());
    const hasTranscript = Boolean(String(transcriptionText || "").trim());
    const recordingSidEffective = (typeof recordingSid === "string" && recordingSid.trim())
      ? recordingSid.trim()
      : (typeof event?.recordingSid === "string" ? event.recordingSid.trim() : "");

    const contacts = await listPortalAccountRecipientContacts(ownerId).catch(() => []);

    // 1) SMS: send NOTES ONLY to profile phones (optional), once.
    if (hasNotes && !event?.smsNotesSentAtIso) {
      const smsBody = [
        `AI receptionist notes${contactName ? `: ${contactName}` : ""}`,
        notes,
        fromE164 ? `From: ${fromE164}` : null,
        toE164 ? `To: ${toE164}` : null,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 900);

      await Promise.all(
        contacts
          .map((c) => c.phoneE164)
          .filter(Boolean)
          .map((to) => sendTwilioEnvSms({ to: to as string, body: smsBody, fromNumberEnvKeys: ["TWILIO_FROM_NUMBER"] })),
      );

      await upsertAiReceptionistCallEvent(ownerId, {
        id: `call_${callSid}`,
        callSid,
        from: fromE164,
        to: toE164,
        createdAtIso: new Date().toISOString(),
        status: "COMPLETED",
        smsNotesSentAtIso: new Date().toISOString(),
      });
    }

    // 2) Email: send TRANSCRIPT (and recording link if available), once.
    if (hasTranscript && !event?.emailTranscriptSentAtIso) {
      const recordingUrl = recordingSidEffective
        ? `${baseUrl}/api/portal/ai-receptionist/recordings/${encodeURIComponent(recordingSidEffective)}`
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
          transcriptionStatus ? `Transcript status: ${transcriptionStatus}` : null,
          "",
          "Notes:",
          notes || "(No notes)",
          "",
          "Transcript:",
          transcriptionText || "(No transcript)",
          "",
          recordingUrl ? `Recording: ${recordingUrl}` : "Recording: (not available yet)",
          "",
          `Open AI receptionist: ${baseUrl}/portal/app/services/ai-receptionist`,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      if (res.ok) {
        await upsertAiReceptionistCallEvent(ownerId, {
          id: `call_${callSid}`,
          callSid,
          from: fromE164,
          to: toE164,
          createdAtIso: new Date().toISOString(),
          status: "COMPLETED",
          emailTranscriptSentAtIso: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("Failed to send receptionist notifications", err);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
