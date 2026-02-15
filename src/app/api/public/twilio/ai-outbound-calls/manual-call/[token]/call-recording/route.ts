import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
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

async function requestTranscription(opts: { ownerId: string; recordingSid: string; token: string; req: Request }): Promise<void> {
  const recordingSid = String(opts.recordingSid || "").trim();
  if (!recordingSid) return;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return;

  const callbackUrl = webhookUrlFromRequest(
    opts.req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(opts.token)}/transcription`,
  );

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Recordings/${encodeURIComponent(recordingSid)}/Transcriptions.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("TranscriptionCallback", callbackUrl);
  form.set("TranscriptionCallbackMethod", "POST");

  await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true, ownerId: true },
  });

  if (!manual) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const form = await req.formData().catch(() => null);
  const recordingSidRaw = form?.get("RecordingSid");
  const durationRaw = form?.get("RecordingDuration");

  const recordingSid = typeof recordingSidRaw === "string" ? recordingSidRaw.trim() : "";
  const durationSec = typeof durationRaw === "string" ? Number(durationRaw) : typeof durationRaw === "number" ? durationRaw : NaN;

  if (recordingSid) {
    await prisma.portalAiOutboundCallManualCall.update({
      where: { id: manual.id },
      data: {
        recordingSid,
        status: "COMPLETED",
        ...(Number.isFinite(durationSec)
          ? { recordingDurationSec: Math.max(0, Math.floor(durationSec)), lastError: null }
          : {}),
      },
      select: { id: true },
    });

    await requestTranscription({ ownerId: manual.ownerId, recordingSid, token: t, req });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
