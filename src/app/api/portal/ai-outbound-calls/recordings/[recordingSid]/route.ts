import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request, ctx: { params: Promise<{ recordingSid: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const { recordingSid } = await ctx.params;
  const sid = String(recordingSid || "").trim();

  if (!sid) return jsonError("Missing recording sid", 400);
  if (sid.length > 64) return jsonError("Invalid recording sid", 400);

  await ensurePortalAiOutboundCallsSchema();

  const allowed = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { ownerId, recordingSid: sid },
    select: { id: true },
  });

  if (!allowed) return jsonError("Not found", 404);

  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) return jsonError("Twilio is not configured for this account", 400);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Recordings/${encodeURIComponent(sid)}.mp3`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const range = req.headers.get("range") || "";

  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Basic ${basic}`,
      ...(range ? { range } : {}),
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res) return jsonError("Failed to fetch recording", 502);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonError(`Twilio recording fetch failed (${res.status}): ${text.slice(0, 200)}`, 502);
  }

  const out = new Headers();
  const contentType = res.headers.get("content-type") || "audio/mpeg";
  out.set("content-type", contentType);

  // Preserve range/seek headers so the browser can scrub reliably.
  for (const key of ["content-length", "accept-ranges", "content-range", "etag", "last-modified"]) {
    const v = res.headers.get(key);
    if (v) out.set(key, v);
  }

  out.set("cache-control", "private, no-store");

  return new NextResponse(res.body, {
    status: res.status,
    headers: out,
  });
}
