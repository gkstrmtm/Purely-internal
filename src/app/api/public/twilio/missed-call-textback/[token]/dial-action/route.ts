import { NextResponse } from "next/server";

import {
  findOwnerByMissedCallWebhookToken,
  upsertMissedCallEvent,
  renderMissedCallReplyBody,
  sendOwnerMms,
} from "@/lib/missedCallTextBack";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await findOwnerByMissedCallWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
  }

  const ownerId = lookup.ownerId;
  const settings = lookup.data.settings;

  const form = await req.formData().catch(() => null);
  const dialStatusRaw = form?.get("DialCallStatus");
  const callSidRaw = form?.get("CallSid");
  const fromRaw = form?.get("From");
  const toRaw = form?.get("To");

  const dialCallStatus = typeof dialStatusRaw === "string" ? dialStatusRaw : "";
  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";

  const fromParsed = typeof fromRaw === "string" ? normalizePhoneStrict(fromRaw) : null;
  const fromE164 = fromParsed && fromParsed.ok ? fromParsed.e164 : typeof fromRaw === "string" ? fromRaw : "";

  const toParsed = typeof toRaw === "string" ? normalizePhoneStrict(toRaw) : null;
  const toE164 = toParsed && toParsed.ok ? toParsed.e164 : typeof toRaw === "string" ? toRaw : null;

  const existing = lookup.data.events.find((e) => e.callSid === callSid) ?? null;

  const answered = dialCallStatus === "completed";
  const finalStatus = answered ? "ANSWERED" : "MISSED";

  // Update the call outcome first.
  if (callSid && fromE164) {
    await upsertMissedCallEvent(ownerId, {
      id: existing?.id ?? `evt_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
      dialCallStatus,
      finalStatus,
      smsStatus: existing?.smsStatus ?? "NONE",
      smsTo: existing?.smsTo,
      smsFrom: existing?.smsFrom,
      smsBody: existing?.smsBody,
      smsMessageSid: existing?.smsMessageSid,
      smsError: existing?.smsError,
    });
  }

  // If the call was answered or automation is off, do nothing else.
  if (answered || !settings.enabled || !callSid || !fromE164) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
  }

  // Best-effort: trigger portal automations for missed calls.
  try {
    await runOwnerAutomationsForEvent({
      ownerId,
      triggerKind: "missed_call",
      message: { from: fromE164, to: toE164 || "", body: "" },
      contact: { name: fromE164, phone: fromE164 },
    });
  } catch {
    // ignore
  }

  const delayMs = Math.max(0, Math.min(600, Math.round(settings.replyDelaySeconds))) * 1000;
  if (delayMs) await sleep(delayMs);

  const replyBody = renderMissedCallReplyBody(settings.replyBody, { from: fromE164, to: toE164 });
  const res = await sendOwnerMms(ownerId, { to: fromE164, body: replyBody, mediaUrls: settings.mediaUrls });
  await upsertMissedCallEvent(ownerId, {
    id: existing?.id ?? `evt_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
    dialCallStatus,
    finalStatus,
    smsStatus: res.ok ? "SENT" : "FAILED",
    smsTo: fromE164,
    smsBody: replyBody,
    smsMessageSid: res.ok ? res.messageSid : undefined,
    smsError: res.ok ? undefined : res.error,
  });

  return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
}
