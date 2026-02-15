import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function fetchTwilioCallStatus(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
    return status || null;
  } catch {
    return null;
  }
}

function mapTwilioToManualStatus(twilioStatus: string): "CALLING" | "COMPLETED" | "FAILED" {
  const s = String(twilioStatus || "").trim().toLowerCase();
  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
  return "CALLING";
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const campaignId = (url.searchParams.get("campaignId") || "").trim();

  await ensurePortalAiOutboundCallsSchema();

  const rows = await prisma.portalAiOutboundCallManualCall.findMany({
    where: {
      ownerId,
      ...(campaignId ? { campaignId } : {}),
    },
    select: {
      id: true,
      campaignId: true,
      toNumberE164: true,
      status: true,
      callSid: true,
      conversationId: true,
      recordingSid: true,
      recordingDurationSec: true,
      transcriptText: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 20,
  });

  // Best-effort: if any calls are stuck in CALLING, reconcile with Twilio.
  // This fixes older calls created before status callbacks were in place.
  const now = Date.now();
  const toCheck = rows
    .filter((r) => r.status === "CALLING" && typeof r.callSid === "string" && r.callSid.trim())
    .filter((r) => now - r.updatedAt.getTime() > 90_000)
    .slice(0, 3);

  const resolvedStatuses = await Promise.all(
    toCheck.map(async (r) => {
      const twStatus = await fetchTwilioCallStatus(ownerId, r.callSid || "");
      if (!twStatus) return null;
      const mapped = mapTwilioToManualStatus(twStatus);
      if (mapped === "CALLING") return null;

      await prisma.portalAiOutboundCallManualCall
        .update({
          where: { id: r.id },
          data: {
            status: mapped,
            ...(mapped === "FAILED" ? { lastError: `Call status: ${twStatus}`.slice(0, 500) } : {}),
          },
          select: { id: true },
        })
        .catch(() => null);

      return { id: r.id, status: mapped as "COMPLETED" | "FAILED" };
    }),
  );

  const statusMap = new Map(resolvedStatuses.filter(Boolean).map((x: any) => [x.id, x.status] as const));

  return NextResponse.json({
    ok: true,
    manualCalls: rows.map((r) => ({
      ...r,
      ...(statusMap.has(r.id) ? { status: statusMap.get(r.id) } : {}),
      createdAtIso: r.createdAt.toISOString(),
      updatedAtIso: r.updatedAt.toISOString(),
    })),
  });
}
