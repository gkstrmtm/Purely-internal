import { NextResponse } from "next/server";

import { findOwnerIdByTwilioToNumber } from "@/lib/twilioRouting";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { makeSmsThreadKey, normalizeSmsPeerKey, upsertPortalInboxMessage } from "@/lib/portalInbox";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function twimlEmpty() {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

async function fetchTwilioMessage(opts: {
  accountSid: string;
  authToken: string;
  messageSid: string;
}): Promise<
  | {
      ok: true;
      message: {
        sid: string;
        to: string;
        from: string;
        body: string;
        direction: string;
        dateCreated: string | null;
      };
    }
  | { ok: false; error: string }
> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    opts.accountSid,
  )}/Messages/${encodeURIComponent(opts.messageSid)}.json`;
  const basic = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");

  const res = await fetch(url, {
    headers: { authorization: `Basic ${basic}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { ok: false, error: "Twilio fetch failed" };
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, error: `Twilio fetch failed (${res.status}): ${text.slice(0, 240)}` };

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Twilio returned invalid JSON" };
  }

  return {
    ok: true,
    message: {
      sid: String(json?.sid || "").trim(),
      to: String(json?.to || "").trim(),
      from: String(json?.from || "").trim(),
      body: String(json?.body || ""),
      direction: String(json?.direction || ""),
      dateCreated: typeof json?.date_created === "string" ? json.date_created : null,
    },
  };
}

function parseTwilioRfc2822Date(dateCreated: string | null): Date | null {
  if (!dateCreated) return null;
  const d = new Date(dateCreated);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(req: Request) {
  const bodyRaw = await req.text().catch(() => "");
  const form = new URLSearchParams(bodyRaw);

  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const messageSid = String(form.get("MessageSid") ?? form.get("SmsSid") ?? "").trim();

  // Owner lookup: for outbound status callbacks, From is the connected Twilio number.
  // For inbound, To is the connected Twilio number.
  const ownerId = (from ? await findOwnerIdByTwilioToNumber(from) : null) ?? (to ? await findOwnerIdByTwilioToNumber(to) : null);
  if (!ownerId || !messageSid) return twimlEmpty();

  const cfg = await getOwnerTwilioSmsConfig(ownerId);
  if (!cfg) return twimlEmpty();

  // Avoid runtime failures if schema patches haven't been applied yet.
  await ensurePortalInboxSchema();

  const msgRes = await fetchTwilioMessage({ accountSid: cfg.accountSid, authToken: cfg.authToken, messageSid });
  if (!msgRes.ok) {
    // Best-effort fallback: create a deduped placeholder record.
    // We keep body empty to avoid showing misleading content.
    const peerRaw = to && cfg.fromNumberE164 === from ? to : from;
    const peer = normalizeSmsPeerKey(peerRaw);
    if (peer.peer && peer.peerKey) {
      const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(peer.peer);
      await upsertPortalInboxMessage({
        ownerId,
        channel: "SMS",
        direction: to && cfg.fromNumberE164 === from ? "OUT" : "IN",
        threadKey,
        peerAddress,
        peerKey,
        fromAddress: from,
        toAddress: to,
        bodyText: "",
        provider: "TWILIO",
        providerMessageId: messageSid,
      });
    }
    return twimlEmpty();
  }

  const tw = msgRes.message;
  if (!tw.sid || !tw.from || !tw.to) return twimlEmpty();

  const isOutbound = /outbound/i.test(tw.direction || "") || /\boutbound\b/i.test(String(tw.direction || ""));
  const direction = isOutbound ? "OUT" : "IN";

  const peerRaw = direction === "OUT" ? tw.to : tw.from;
  const peer = normalizeSmsPeerKey(peerRaw);
  if (!peer.peer || !peer.peerKey) return twimlEmpty();

  const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(peer.peer);
  const createdAt = parseTwilioRfc2822Date(tw.dateCreated);

  await upsertPortalInboxMessage({
    ownerId,
    channel: "SMS",
    direction,
    threadKey,
    peerAddress,
    peerKey,
    fromAddress: tw.from,
    toAddress: tw.to,
    bodyText: tw.body || "",
    provider: "TWILIO",
    providerMessageId: tw.sid,
    ...(createdAt ? { createdAt } : {}),
  });

  return twimlEmpty();
}

export async function GET() {
  // Twilio will POST. Keep GET harmless for quick health checks.
  return NextResponse.json({ ok: true });
}
