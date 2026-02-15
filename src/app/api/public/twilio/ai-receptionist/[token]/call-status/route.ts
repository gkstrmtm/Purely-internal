import { NextResponse } from "next/server";

import {
  findOwnerByAiReceptionistWebhookToken,
  listAiReceptionistEvents,
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";
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

function appendNotes(existing: unknown, extra: string): string {
  const a = typeof existing === "string" ? existing.trim() : "";
  const b = String(extra || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  return `${a}\n${b}`;
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

async function requestTranscription(opts: {
  ownerId: string;
  recordingSid: string;
  token: string;
  req: Request;
}): Promise<boolean> {
  const recordingSid = String(opts.recordingSid || "").trim();
  if (!recordingSid) return false;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return false;

  const callbackUrl = webhookUrlFromRequest(
    opts.req,
    `/api/public/twilio/ai-receptionist/${encodeURIComponent(opts.token)}/transcription`,
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

async function handle(req: Request, token: string) {
  const t = String(token || "").trim();
  if (!t) return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");

  const lookup = await findOwnerByAiReceptionistWebhookToken(t);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const ownerId = lookup.ownerId;

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const callStatusRaw = form?.get("CallStatus");

  const callSid = typeof callSidRaw === "string" ? callSidRaw.trim() : "";
  if (!callSid) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const existing = (await listAiReceptionistEvents(ownerId, 200)).find((e) => e.callSid === callSid) || null;
  const nextStatus = terminalStatusFromTwilio(callStatusRaw);

  const updates: Record<string, any> = {};

  const current = String(existing?.status || "").trim().toUpperCase();
  if (nextStatus && (current === "IN_PROGRESS" || current === "UNKNOWN" || !current)) {
    updates.status = nextStatus;
    if (nextStatus === "FAILED") {
      const s = typeof callStatusRaw === "string" ? callStatusRaw.trim() : "Call failed";
      updates.notes = appendNotes(existing?.notes, `Call status: ${s}`);
    }
  }

  if (Object.keys(updates).length) {
    await upsertAiReceptionistCallEvent(ownerId, {
      id: existing?.id || `call_${callSid}`,
      callSid,
      from: existing?.from || "unknown",
      to: existing?.to ?? null,
      createdAtIso: existing?.createdAtIso || new Date().toISOString(),
      status: updates.status ?? existing?.status ?? "IN_PROGRESS",
      ...(typeof updates.notes === "string" ? { notes: updates.notes } : {}),
    } as any);
  }

  const currentAfter = String((updates.status ?? existing?.status) || "").trim().toUpperCase();
  const needsRecordingBackfill =
    (currentAfter === "COMPLETED" || currentAfter === "FAILED") && !String(existing?.recordingSid || "").trim();

  if (needsRecordingBackfill) {
    const recordingSid = await fetchLatestRecordingSidForCall({ ownerId, callSid });
    if (recordingSid) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: existing?.id || `call_${callSid}`,
        callSid,
        from: existing?.from || "unknown",
        to: existing?.to ?? null,
        createdAtIso: existing?.createdAtIso || new Date().toISOString(),
        status:
          currentAfter === "COMPLETED" || currentAfter === "FAILED"
            ? (currentAfter as any)
            : (existing?.status || "IN_PROGRESS"),
        recordingSid,
      } as any);

      await requestTranscription({ ownerId, recordingSid, token: t, req });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
  return xmlResponse(xml);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return await handle(req, token);
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return await handle(req, token);
}
