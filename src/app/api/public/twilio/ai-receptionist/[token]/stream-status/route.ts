import { NextResponse } from "next/server";

import {
  findOwnerByAiReceptionistWebhookToken,
  listAiReceptionistEvents,
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";

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

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: existing?.from || "unknown",
    to: existing?.to ?? null,
    createdAtIso: existing?.createdAtIso || new Date().toISOString(),
    status: existing?.status || "IN_PROGRESS",
    notes,
  });

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
