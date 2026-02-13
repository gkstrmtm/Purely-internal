import { NextResponse } from "next/server";

import {
  findOwnerByAiReceptionistWebhookToken,
  getAiReceptionistServiceData,
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";
import { consumeCredits } from "@/lib/credits";
import { normalizePhoneStrict } from "@/lib/phone";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

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

function ceilMinutesFromSeconds(seconds: number): number {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (s <= 0) return 0;
  return Math.max(1, Math.ceil(s / 60));
}

const CREDITS_PER_STARTED_MINUTE = 5;

function appendNotes(existing: unknown, extra: string): string {
  const a = typeof existing === "string" ? existing.trim() : "";
  const b = String(extra || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  return `${a}\n${b}`;
}

async function requestTranscription(opts: {
  ownerId: string;
  recordingSid: string;
  token: string;
  req: Request;
}): Promise<void> {
  const recordingSid = String(opts.recordingSid || "").trim();
  if (!recordingSid) return;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return;

  const callbackUrl = webhookUrlFromRequest(
    opts.req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(opts.token)}/transcription`,
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
  const durationSec = typeof durationRaw === "string" ? Number(durationRaw) : typeof durationRaw === "number" ? durationRaw : NaN;

  if (!callSid) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  // Twilio recording callbacks may omit From/To. Reuse existing event details if present.
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
  const needCredits = startedMinutes * CREDITS_PER_STARTED_MINUTE;

  let chargedCredits = 0;
  let chargedPartial = false;

  if (needCredits > 0) {
    const consumed = await consumeCredits(ownerId, needCredits);
    if (consumed.ok) {
      chargedCredits = needCredits;
    } else {
      const available = Math.max(0, Math.floor(consumed.state.balance));
      if (available > 0) {
        const partial = await consumeCredits(ownerId, available);
        if (partial.ok) {
          chargedCredits = available;
          chargedPartial = true;
        }
      }
    }
  }

  const chargeNote =
    needCredits > 0
      ? (chargedCredits > 0
          ? (chargedPartial
              ? `Charged ${chargedCredits} credit(s) (partial, ${needCredits} needed).`
              : `Charged ${chargedCredits} credit(s).`)
          : "No credits charged.")
      : "No recording duration reported.";

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "COMPLETED",
    notes: appendNotes(existingNotes, chargeNote),
    ...(recordingSid ? { recordingSid } : {}),
    ...(Number.isFinite(durationSec) ? { recordingDurationSec: Math.max(0, Math.floor(durationSec)) } : {}),
    ...(chargedCredits > 0 ? { chargedCredits } : {}),
    ...(chargedPartial ? { creditsChargedPartial: true } : {}),
  });

  // Best-effort transcription for live calls (may take 1–2 minutes).
  if (recordingSid) {
    await requestTranscription({ ownerId, recordingSid, token, req });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
  return xmlResponse(xml);
}
