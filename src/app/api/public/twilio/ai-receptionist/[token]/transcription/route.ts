import { NextResponse } from "next/server";

import { findOwnerByAiReceptionistWebhookToken, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
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
  const transcriptionTextRaw = form?.get("TranscriptionText");
  const transcriptionStatusRaw = form?.get("TranscriptionStatus");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;
  const recordingSid = typeof recordingSidRaw === "string" ? recordingSidRaw : "";
  const transcriptionText = safeTranscript(transcriptionTextRaw);
  const transcriptionStatus = typeof transcriptionStatusRaw === "string" ? transcriptionStatusRaw.trim() : "";

  if (!callSid || !from) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const fromParsed = normalizePhoneStrict(from);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : from;
  const toParsed = to ? normalizePhoneStrict(to) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : to;

  const notes = transcriptionText
    ? "Transcript received."
    : transcriptionStatus
      ? `Transcript status: ${transcriptionStatus}`
      : "Transcript callback received.";

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "COMPLETED",
    notes,
    ...(recordingSid ? { recordingSid } : {}),
    ...(transcriptionText ? { transcript: transcriptionText } : {}),
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
