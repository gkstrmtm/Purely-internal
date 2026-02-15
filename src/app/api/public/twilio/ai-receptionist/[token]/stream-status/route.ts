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

function safeOneLine(s: unknown, max = 240): string {
  const text = typeof s === "string" ? s : "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function getTwilioParamText(src: URLSearchParams | FormData | null, key: string): string {
  if (!src) return "";
  const v = (src as any).get?.(key);
  return typeof v === "string" ? v : "";
}

async function getTwilioParams(req: Request): Promise<Record<string, string>> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const out: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) out[k] = v;
    return out;
  }

  const form = await req.formData().catch(() => null);
  if (!form) return {};

  const keys = [
    "AccountSid",
    "CallSid",
    "StreamSid",
    "StreamEvent",
    "StreamError",
    "ErrorCode",
    "ErrorMessage",
    "Timestamp",
  ];

  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = getTwilioParamText(form, k);
    if (v) out[k] = v;
  }

  // Capture any extra fields if present (best-effort).
  try {
    for (const [k, v] of (form as any).entries?.() || []) {
      if (typeof k === "string" && typeof v === "string" && !(k in out)) out[k] = v;
    }
  } catch {
    // ignore
  }

  return out;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function mergeNotes(prev: string | undefined, nextLine: string): string {
  const line = safeOneLine(nextLine, 280);
  const existing = typeof prev === "string" ? prev.trim() : "";
  const combined = existing ? `${existing}\n${line}` : line;
  return combined.trim().slice(0, 800);
}

function terminalStatusFromTwilio(callStatusRaw: unknown): "COMPLETED" | "FAILED" | null {
  const s = typeof callStatusRaw === "string" ? callStatusRaw.trim().toLowerCase() : "";
  if (!s) return null;
  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
  return null;
}

async function startTwilioCallRecording(opts: {
  ownerId: string;
  callSid: string;
  recordingStatusCallbackUrl: string;
}): Promise<{ ok: true; recordingSid: string | null } | { ok: false; error: string }> {
  const sid = String(opts.callSid || "").trim();
  if (!sid) return { ok: false, error: "Missing CallSid" };

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!twilio) return { ok: false, error: "Twilio not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("RecordingChannels", "dual");
  form.set("RecordingStatusCallback", opts.recordingStatusCallbackUrl);
  form.set("RecordingStatusCallbackMethod", "POST");
  form.set("RecordingStatusCallbackEvent", "completed");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "";
    return { ok: false, error: `Twilio did not start recording (${res?.status || "no response"}): ${String(text || "").slice(0, 200)}` };
  }

  const text = await res.text().catch(() => "");
  try {
    const json = text && text.trim() ? (JSON.parse(text) as any) : null;
    const recordingSid = typeof json?.sid === "string" ? json.sid.trim() : "";
    return { ok: true, recordingSid: recordingSid || null };
  } catch {
    return { ok: true, recordingSid: null };
  }
}

async function fetchTwilioCallStatus(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls/${encodeURIComponent(sid)}.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
    return status || null;
  } catch {
    return null;
  }
}

async function fetchLatestRecordingSidForCall(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

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

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
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
  const lookup = await findOwnerByAiReceptionistWebhookToken(token);
  if (!lookup) return json({ ok: false, error: "Invalid token" }, 404);

  const ownerId = lookup.ownerId;
  const params = await getTwilioParams(req);

  const callSid = safeOneLine(params.CallSid, 80);
  const streamSid = safeOneLine(params.StreamSid, 80);
  const streamEvent = safeOneLine(params.StreamEvent, 80);
  const streamError = safeOneLine(params.StreamError || params.ErrorMessage, 260);
  const errorCode = safeOneLine(params.ErrorCode, 40);

  if (!callSid) return json({ ok: false, error: "Missing CallSid" }, 400);

  const existing = (await listAiReceptionistEvents(ownerId, 200)).find((e) => e.callSid === callSid) || null;

  const parts = [
    "Media Stream callback",
    streamEvent ? `event=${streamEvent}` : "",
    streamSid ? `streamSid=${streamSid}` : "",
    errorCode ? `code=${errorCode}` : "",
    streamError ? `error=${streamError}` : "",
  ].filter(Boolean);

  const line = parts.join(" ");
  const notes = mergeNotes(existing?.notes, line);

  const baseEvent: any = {
    id: `call_${callSid}`,
    callSid,
    from: existing?.from || "unknown",
    to: existing?.to ?? null,
    createdAtIso: existing?.createdAtIso || new Date().toISOString(),
    status: existing?.status || "IN_PROGRESS",
    notes,
  };

  await upsertAiReceptionistCallEvent(ownerId, baseEvent);

  // When the media stream starts, the call is definitely in-progress.
  // This is the most reliable moment to start Twilio call recording for AI mode.
  const ev = String(streamEvent || "").trim().toLowerCase();
  if (ev === "stream-started") {
    const currentEvent = (await listAiReceptionistEvents(ownerId, 200)).find((e) => e.callSid === callSid) || existing;
    const hasRecording = Boolean(String(currentEvent?.recordingSid || "").trim());

    if (!hasRecording) {
      const existingRid = await fetchLatestRecordingSidForCall(ownerId, callSid);
      if (existingRid) {
        await upsertAiReceptionistCallEvent(ownerId, {
          id: currentEvent?.id || `call_${callSid}`,
          callSid,
          from: currentEvent?.from || "unknown",
          to: currentEvent?.to ?? null,
          createdAtIso: currentEvent?.createdAtIso || new Date().toISOString(),
          status: currentEvent?.status || "IN_PROGRESS",
          recordingSid: existingRid,
          notes: mergeNotes(currentEvent?.notes, `Recording detected: ${existingRid}`),
        } as any);
      } else {
        const liveRecordingCallback = webhookUrlFromRequest(
          req,
          `/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/call-recording`,
        );

        const started = await startTwilioCallRecording({
          ownerId,
          callSid,
          recordingStatusCallbackUrl: liveRecordingCallback,
        });

        if (started.ok) {
          await upsertAiReceptionistCallEvent(ownerId, {
            id: currentEvent?.id || `call_${callSid}`,
            callSid,
            from: currentEvent?.from || "unknown",
            to: currentEvent?.to ?? null,
            createdAtIso: currentEvent?.createdAtIso || new Date().toISOString(),
            status: currentEvent?.status || "IN_PROGRESS",
            ...(started.recordingSid ? { recordingSid: started.recordingSid } : {}),
            notes: mergeNotes(currentEvent?.notes, started.recordingSid ? `Recording started: ${started.recordingSid}` : "Recording start requested."),
          } as any);
        } else {
          await upsertAiReceptionistCallEvent(ownerId, {
            id: currentEvent?.id || `call_${callSid}`,
            callSid,
            from: currentEvent?.from || "unknown",
            to: currentEvent?.to ?? null,
            createdAtIso: currentEvent?.createdAtIso || new Date().toISOString(),
            status: currentEvent?.status || "IN_PROGRESS",
            notes: mergeNotes(currentEvent?.notes, started.error),
          } as any);
        }
      }
    }
  }

  // Best-effort reconciliation: if the media stream ended/errored, the call is often already terminal.
  // Flip events out of IN_PROGRESS so the portal doesn't show them stuck forever.
  const isTerminalStreamEvent = ev === "stream-stopped" || ev === "stream-error";
  const current = String(existing?.status || "").trim().toUpperCase();
  const shouldReconcile = isTerminalStreamEvent && (current === "IN_PROGRESS" || current === "UNKNOWN" || !current);

  if (shouldReconcile) {
    const twStatus = await fetchTwilioCallStatus(ownerId, callSid);
    const mapped = terminalStatusFromTwilio(twStatus);
    if (mapped) {
      await upsertAiReceptionistCallEvent(ownerId, {
        id: existing?.id || `call_${callSid}`,
        callSid,
        from: existing?.from || "unknown",
        to: existing?.to ?? null,
        createdAtIso: existing?.createdAtIso || new Date().toISOString(),
        status: mapped,
        ...(mapped === "FAILED" && twStatus ? { notes: mergeNotes(notes, `Call status: ${twStatus}`) } : {}),
      } as any);

      const hasRecording = Boolean(String(existing?.recordingSid || "").trim());
      if (!hasRecording) {
        const rid = await fetchLatestRecordingSidForCall(ownerId, callSid);
        if (rid) {
          await upsertAiReceptionistCallEvent(ownerId, {
            id: existing?.id || `call_${callSid}`,
            callSid,
            from: existing?.from || "unknown",
            to: existing?.to ?? null,
            createdAtIso: existing?.createdAtIso || new Date().toISOString(),
            status: mapped,
            recordingSid: rid,
          } as any);
          await requestTranscription({ ownerId, recordingSid: rid, token, req });
        }
      }
    }
  }

  return json({ ok: true });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return await handle(req, token);
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return await handle(req, token);
}
