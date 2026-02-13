import { NextResponse } from "next/server";

import { findOwnerByAiReceptionistWebhookToken, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function appendNotes(existing: unknown, extra: string): string {
  const a = typeof existing === "string" ? existing.trim() : "";
  const b = String(extra || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  return `${a}\n${b}`;
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

function ceilMinutesFromSeconds(seconds: number): number {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (s <= 0) return 0;
  return Math.max(1, Math.ceil(s / 60));
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
  const durationRaw = form?.get("RecordingDuration");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;
  const recordingSid = typeof recordingSidRaw === "string" ? recordingSidRaw : "";
  const durationSec =
    typeof durationRaw === "string"
      ? Number(durationRaw)
      : typeof durationRaw === "number"
        ? durationRaw
        : NaN;

  if (!callSid) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  // Twilio callbacks may omit From/To. Reuse existing event details if present.
  let fromFinal = from;
  let toFinal = to;
  let existingNotes: string | undefined;
  if (!fromFinal) {
    const existing = await getAiReceptionistServiceData(ownerId).catch(() => null);
    const match = existing?.events?.find((e: any) => String(e?.callSid || "") === callSid) as any;
    fromFinal = typeof match?.from === "string" && match.from.trim() ? match.from.trim() : "Unknown";
    toFinal = typeof match?.to === "string" && match.to.trim() ? match.to.trim() : toFinal;
    existingNotes = typeof match?.notes === "string" && match.notes.trim() ? match.notes.trim() : undefined;
  } else {
    const existing = await getAiReceptionistServiceData(ownerId).catch(() => null);
    const match = existing?.events?.find((e: any) => String(e?.callSid || "") === callSid) as any;
    existingNotes = typeof match?.notes === "string" && match.notes.trim() ? match.notes.trim() : undefined;
  }

  const fromParsed = normalizePhoneStrict(fromFinal);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : fromFinal;
  const toParsed = toFinal ? normalizePhoneStrict(toFinal) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : toFinal;

  const startedMinutes = ceilMinutesFromSeconds(durationSec);
  const recordedNote = startedMinutes > 0 ? `Call recorded (${startedMinutes} started minute(s)).` : "Call recorded.";

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "COMPLETED",
    notes: appendNotes(existingNotes, recordedNote),
    ...(recordingSid ? { recordingSid } : {}),
    ...(Number.isFinite(durationSec) ? { recordingDurationSec: Math.max(0, Math.floor(durationSec)) } : {}),
  });

  // Best-effort transcription for forwarded calls.
  if (recordingSid) {
    const twilio = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
    if (twilio) {
      const callbackUrl = webhookUrlFromRequest(
        req,
        `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/transcription`,
      );

      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Recordings/${encodeURIComponent(recordingSid)}/Transcriptions.json`;
      const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");
      const form = new URLSearchParams();
      form.set("TranscriptionCallback", callbackUrl);
      form.set("TranscriptionCallbackMethod", "POST");

      await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      }).catch(() => null);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
