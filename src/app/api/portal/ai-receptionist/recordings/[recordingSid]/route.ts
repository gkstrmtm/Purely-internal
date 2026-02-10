import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { listAiReceptionistEvents } from "@/lib/aiReceptionist";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<{ recordingSid: string }> }) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const { recordingSid } = await ctx.params;
  const sid = (recordingSid || "").trim();

  if (!sid) return jsonError("Missing recording sid", 400);
  if (sid.length > 64) return jsonError("Invalid recording sid", 400);

  const events = await listAiReceptionistEvents(ownerId, 200);
  const allowed = events.some((e) => typeof e.recordingSid === "string" && e.recordingSid === sid);
  if (!allowed) return jsonError("Not found", 404);

  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) return jsonError("Twilio is not configured for this account", 400);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Recordings/${encodeURIComponent(sid)}.mp3`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Basic ${basic}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return jsonError("Failed to fetch recording", 502);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonError(`Twilio recording fetch failed (${res.status}): ${text.slice(0, 200)}`, 502);
  }

  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "audio/mpeg";

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
    },
  });
}
