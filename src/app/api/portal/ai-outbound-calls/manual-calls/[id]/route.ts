import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  await ensurePortalAiOutboundCallsSchema();

  const row = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { ownerId, id: parsed.data },
    select: {
      id: true,
      campaignId: true,
      toNumberE164: true,
      status: true,
      callSid: true,
      conversationId: true,
      recordingSid: true,
      transcriptText: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return jsonError("Not found", 404);

  // Best-effort: reconcile stuck CALLING state with Twilio.
  if (row.status === "CALLING" && typeof row.callSid === "string" && row.callSid.trim()) {
    const twStatus = await fetchTwilioCallStatus(ownerId, row.callSid);
    if (twStatus) {
      const mapped = mapTwilioToManualStatus(twStatus);
      if (mapped !== "CALLING") {
        await prisma.portalAiOutboundCallManualCall
          .update({
            where: { id: row.id },
            data: {
              status: mapped,
              ...(mapped === "FAILED" ? { lastError: `Call status: ${twStatus}`.slice(0, 500) } : {}),
            },
            select: { id: true },
          })
          .catch(() => null);

        row.status = mapped;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    manualCall: {
      ...row,
      createdAtIso: row.createdAt.toISOString(),
      updatedAtIso: row.updatedAt.toISOString(),
    },
  });
}
