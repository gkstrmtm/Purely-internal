import { NextResponse } from "next/server";

import { findOwnerByAiReceptionistWebhookToken, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";

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

  const notes = !transcriptionText
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
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
