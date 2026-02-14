import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";

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

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true, status: true, callSid: true },
  });

  if (!manual) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const callStatusRaw = form?.get("CallStatus");

  const callSid = typeof callSidRaw === "string" ? callSidRaw.trim() : "";
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
