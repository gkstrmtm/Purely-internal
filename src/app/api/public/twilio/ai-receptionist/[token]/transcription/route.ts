import { NextResponse } from "next/server";

import { findOwnerByAiReceptionistWebhookToken, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";
import { autoProcessAiReceptionistCall } from "@/lib/aiReceptionistAutoProcess";

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
  const transcriptionStatusLower = typeof transcriptionStatusRaw === "string" ? transcriptionStatusRaw.trim().toLowerCase() : "";
  const transcriptionLooksFinal = transcriptionStatusLower === "completed" || transcriptionStatusLower.includes("complete");

  if (!callSid) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const existing = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const match = existing?.events?.find((e: any) => String(e?.callSid || "") === callSid) as any;

  // Some Twilio transcription callbacks omit From/To. Reuse the stored call event.
  let fromFinal = from;
  let toFinal = to;
  if (!fromFinal) {
    fromFinal = typeof match?.from === "string" && match.from.trim() ? match.from.trim() : "Unknown";
  }
  if (!toFinal) {
    toFinal = typeof match?.to === "string" && match.to.trim() ? match.to.trim() : toFinal;
  }

  const fromParsed = normalizePhoneStrict(fromFinal);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : fromFinal;
  const toParsed = toFinal ? normalizePhoneStrict(toFinal) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : toFinal;

  const createdAtIso = typeof match?.createdAtIso === "string" && match.createdAtIso.trim()
    ? match.createdAtIso
    : new Date().toISOString();
  const status = typeof match?.status === "string" && match.status.trim() ? match.status : "IN_PROGRESS";

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso,
    status,
    ...(recordingSid ? { recordingSid } : {}),
    ...(transcriptionText ? { transcript: transcriptionText } : {}),
  });

  // Delegate post-call transcript/notes + SMS/email to the unified server-side pipeline.
  // This avoids generating notes from partial transcript callbacks.
  if (transcriptionLooksFinal) {
    await autoProcessAiReceptionistCall({
      ownerId,
      callSid,
      recordingSid: recordingSid || null,
      from: fromE164 || null,
      to: toE164 || null,
    }).catch((e) => {
      console.error("AI receptionist: transcription callback autoProcess failed", {
        ownerId,
        callSid,
        err: e instanceof Error ? e.message : String(e ?? "unknown"),
      });
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
