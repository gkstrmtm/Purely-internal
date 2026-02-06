import { NextResponse } from "next/server";

import {
  findOwnerByMissedCallWebhookToken,
  getOwnerProfilePhoneE164,
  upsertMissedCallEvent,
  renderMissedCallReplyBody,
  sendOwnerSms,
} from "@/lib/missedCallTextBack";
import { normalizePhoneStrict } from "@/lib/phone";

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

function baseUrlFromRequest(req: Request): string {
  const env = process.env.NEXTAUTH_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await findOwnerByMissedCallWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const ownerId = lookup.ownerId;
  const settings = lookup.data.settings;

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const fromRaw = form?.get("From");
  const toRaw = form?.get("To");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;

  if (!callSid || !from) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const fromParsed = normalizePhoneStrict(from);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : from;
  const toParsed = to ? normalizePhoneStrict(to) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : to;

  const existing = lookup.data.events.find((e) => e.callSid === callSid) ?? null;
  await upsertMissedCallEvent(ownerId, {
    id: existing?.id ?? `evt_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
    finalStatus: existing?.finalStatus ?? "UNKNOWN",
    dialCallStatus: existing?.dialCallStatus,
    smsStatus: existing?.smsStatus ?? "NONE",
    smsTo: existing?.smsTo,
    smsFrom: existing?.smsFrom,
    smsBody: existing?.smsBody,
    smsMessageSid: existing?.smsMessageSid,
    smsError: existing?.smsError,
  });

  const profilePhone = await getOwnerProfilePhoneE164(ownerId);
  const forwardTo = settings.forwardToPhoneE164 || profilePhone;

  const base = baseUrlFromRequest(req);
  const actionUrl = `${base}/api/public/twilio/missed-call-textback/${token}/dial-action`;

  // If we can’t forward, treat it as a “missed call” and (optionally) text back immediately.
  if (!forwardTo) {
    if (settings.enabled) {
      const replyBody = renderMissedCallReplyBody(settings.replyBody, { from: fromE164, to: toE164 });
      const res = await sendOwnerSms(ownerId, { to: fromE164, body: replyBody });
      if (res.ok) {
        await upsertMissedCallEvent(ownerId, {
          id: `evt_${callSid}`,
          callSid,
          from: fromE164,
          to: toE164,
          createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
          finalStatus: "MISSED",
          dialCallStatus: "no-forward-number",
          smsStatus: "SENT",
          smsTo: fromE164,
          smsBody: replyBody,
          smsMessageSid: res.messageSid,
        });
      } else {
        await upsertMissedCallEvent(ownerId, {
          id: `evt_${callSid}`,
          callSid,
          from: fromE164,
          to: toE164,
          createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
          finalStatus: "MISSED",
          dialCallStatus: "no-forward-number",
          smsStatus: "FAILED",
          smsError: res.error,
        });
      }
    } else {
      await upsertMissedCallEvent(ownerId, {
        id: `evt_${callSid}`,
        callSid,
        from: fromE164,
        to: toE164,
        createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
        finalStatus: "MISSED",
        dialCallStatus: "no-forward-number",
        smsStatus: "SKIPPED",
        smsError: "Automation disabled",
      });
    }

    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  // Standard flow: dial the business number; dial-action decides whether it was missed.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" action="${actionUrl}" method="POST">${forwardTo}</Dial>
</Response>`;

  return xmlResponse(xml);
}
