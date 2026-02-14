import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
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

function terminalStatusFromTwilio(callStatusRaw: unknown): "COMPLETED" | "FAILED" | null {
  const s = typeof callStatusRaw === "string" ? callStatusRaw.trim().toLowerCase() : "";
  if (!s) return null;

  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";

  return null;
}

async function fetchLatestRecordingSidForCall(opts: { ownerId: string; callSid: string }): Promise<string | null> {
  const sid = String(opts.callSid || "").trim();
  if (!sid) return null;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const recordings = Array.isArray(json?.recordings) ? json.recordings : Array.isArray(json) ? json : [];
    for (const r of recordings) {
      const rid = typeof r?.sid === "string" ? r.sid.trim() : "";
      if (rid) return rid;
    }
    return null;
  } catch {
    return null;
  }
}

async function requestTranscription(opts: { ownerId: string; recordingSid: string; token: string; req: Request }): Promise<boolean> {
  const recordingSid = String(opts.recordingSid || "").trim();
  if (!recordingSid) return false;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return false;

  const callbackUrl = webhookUrlFromRequest(
    opts.req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(opts.token)}/transcription`,
  );

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Recordings/${encodeURIComponent(recordingSid)}/Transcriptions.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("TranscriptionCallback", callbackUrl);
  form.set("TranscriptionCallbackMethod", "POST");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  return Boolean(res?.ok);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true, ownerId: true, status: true, callSid: true, recordingSid: true },
  });

  if (!manual) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const callStatusRaw = form?.get("CallStatus");

  const callSid = typeof callSidRaw === "string" ? callSidRaw.trim() : "";
  const effectiveCallSid = callSid || String(manual.callSid || "").trim();
  const nextStatus = terminalStatusFromTwilio(callStatusRaw);

  const updates: Record<string, any> = {};

  if (callSid && !manual.callSid) {
    updates.callSid = callSid;
  }

  // Don’t clobber COMPLETED if we already have it.
  const current = String(manual.status || "").trim().toUpperCase();
  if (nextStatus && current === "CALLING") {
    updates.status = nextStatus;
    if (nextStatus === "FAILED") {
      const s = typeof callStatusRaw === "string" ? callStatusRaw.trim() : "Call failed";
      updates.lastError = `Call status: ${s}`.slice(0, 500);
    }
  }

  if (Object.keys(updates).length) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: updates,
        select: { id: true },
      })
      .catch(() => null);
  }

  // Best-effort: if the call has ended but the recording callback is delayed/missed,
  // backfill the recordingSid directly from Twilio and kick off transcription.
  const currentAfter = String((updates.status ?? manual.status) || "").trim().toUpperCase();
  const needsRecordingBackfill =
    (currentAfter === "COMPLETED" || currentAfter === "FAILED") &&
    !String(manual.recordingSid || "").trim() &&
    Boolean(effectiveCallSid);

  if (needsRecordingBackfill) {
    const recordingSid = await fetchLatestRecordingSidForCall({ ownerId: manual.ownerId, callSid: effectiveCallSid });
    if (recordingSid) {
      await prisma.portalAiOutboundCallManualCall
        .update({
          where: { id: manual.id },
          data: { recordingSid },
          select: { id: true },
        })
        .catch(() => null);

      const ok = await requestTranscription({ ownerId: manual.ownerId, recordingSid, token: t, req });
      if (!ok) {
        await prisma.portalAiOutboundCallManualCall
          .update({
            where: { id: manual.id },
            data: { lastError: "Transcript request failed. Twilio transcription may be disabled for this account." },
            select: { id: true },
          })
          .catch(() => null);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
