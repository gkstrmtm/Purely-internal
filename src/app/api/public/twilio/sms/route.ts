import { NextResponse } from "next/server";

import { findOwnerIdByTwilioToNumber } from "@/lib/twilioRouting";
import { makeSmsThreadKey, normalizeSmsPeerKey, upsertPortalInboxMessage } from "@/lib/portalInbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function twimlEmpty() {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

export async function POST(req: Request) {
  const bodyRaw = await req.text().catch(() => "");
  const form = new URLSearchParams(bodyRaw);

  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const body = String(form.get("Body") ?? "");
  const messageSid = String(form.get("MessageSid") ?? "").trim();

  const ownerId = to ? await findOwnerIdByTwilioToNumber(to) : null;
  if (!ownerId) return twimlEmpty();

  const peer = normalizeSmsPeerKey(from);
  if (!peer.peer || !peer.peerKey) return twimlEmpty();

  const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(peer.peer);

  await upsertPortalInboxMessage({
    ownerId,
    channel: "SMS",
    direction: "IN",
    threadKey,
    peerAddress,
    peerKey,
    fromAddress: from,
    toAddress: to,
    bodyText: body,
    provider: "TWILIO",
    providerMessageId: messageSid || null,
  });

  return twimlEmpty();
}

export async function GET() {
  // Twilio will POST. Keep GET harmless for quick health checks.
  return NextResponse.json({ ok: true });
}
