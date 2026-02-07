import { NextResponse } from "next/server";

import { findOwnerByAiReceptionistWebhookToken, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { consumeCredits } from "@/lib/credits";
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
  const durationSec = typeof durationRaw === "string" ? Number(durationRaw) : (typeof durationRaw === "number" ? durationRaw : NaN);

  if (!callSid || !from) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const fromParsed = normalizePhoneStrict(from);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : from;
  const toParsed = to ? normalizePhoneStrict(to) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : to;

  const needCredits = ceilMinutesFromSeconds(durationSec);

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

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "COMPLETED",
    notes:
      needCredits > 0
        ? (chargedCredits > 0
            ? (chargedPartial
                ? `Charged ${chargedCredits} credit(s) (partial, ${needCredits} needed).`
                : `Charged ${chargedCredits} credit(s).`)
            : "No credits charged.")
        : "No recording duration reported.",
    ...(recordingSid ? { recordingSid } : {}),
    ...(Number.isFinite(durationSec) ? { recordingDurationSec: Math.max(0, Math.floor(durationSec)) } : {}),
    ...(chargedCredits > 0 ? { chargedCredits } : {}),
    ...(chargedPartial ? { creditsChargedPartial: true } : {}),
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks. Your message was received.</Say>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
