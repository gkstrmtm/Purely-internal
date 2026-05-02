import { NextResponse } from "next/server";

import { buildAiOutboundVoicemailTwiml, indicatesMachineAnswered } from "@/lib/aiOutboundVoicemail";
import { appendAiOutboundManualCallWebhookLog } from "@/lib/aiOutboundCallDebug";
import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

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

async function updateTwilioCallTwiml(opts: {
  ownerId: string;
  callSid: string;
  twiml: string;
}): Promise<boolean> {
  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!twilio) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/Calls/${encodeURIComponent(opts.callSid)}.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");
  const form = new URLSearchParams();
  form.set("Twiml", opts.twiml);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null);

  return Boolean(res?.ok);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');

  const form = await req.formData().catch(() => null);
  const answeredBy = form?.get("AnsweredBy");
  const callSid = typeof form?.get("CallSid") === "string" ? String(form?.get("CallSid") || "").trim() : "";

  if (!indicatesMachineAnswered(answeredBy) || !callSid) {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true, ownerId: true, campaignId: true, callSid: true },
  });
  if (!manual?.id || String(manual.callSid || "").trim() !== callSid) {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }

  await appendAiOutboundManualCallWebhookLog({
    route: "manual-call:amd-status",
    token: t,
    manualCallId: manual.id,
    callSid,
    details: {
      answeredBy,
    },
  });

  const [campaign, profile, ownerUser] = await Promise.all([
    typeof manual.campaignId === "string" && manual.campaignId.trim()
      ? prisma.portalAiOutboundCallCampaign.findFirst({
          where: { ownerId: manual.ownerId, id: manual.campaignId },
          select: { voiceAgentConfigJson: true },
        }).catch(() => null)
      : Promise.resolve(null),
    prisma.businessProfile.findUnique({ where: { ownerId: manual.ownerId }, select: { businessName: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: manual.ownerId }, select: { name: true } }).catch(() => null),
  ]);

  const config = parseVoiceAgentConfig(campaign?.voiceAgentConfigJson);
  const twiml = buildAiOutboundVoicemailTwiml({
    businessName: profile?.businessName || null,
    ownerName: ownerUser?.name || null,
    goal: config.goal || null,
    callbackNumber: (await getOwnerTwilioSmsConfig(manual.ownerId).catch(() => null))?.fromNumberE164 || null,
  });

  const updated = await updateTwilioCallTwiml({ ownerId: manual.ownerId, callSid, twiml });
  await appendAiOutboundManualCallWebhookLog({
    route: "manual-call:amd-status:update-call",
    token: t,
    manualCallId: manual.id,
    callSid,
    details: {
      answeredBy,
      updated,
    },
  });
  if (!updated) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: manual.id },
        data: { lastError: "AMD callback could not redirect the call to the voicemail fallback." },
        select: { id: true },
      })
      .catch(() => null);
  }

  return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
}
