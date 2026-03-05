import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getMissedCallTextBackServiceData } from "@/lib/missedCallTextBack";
import { getPortalInboxSettings } from "@/lib/portalInbox";
import { webhookBaseUrlFromRequest } from "@/lib/webhookBase";
import {
  getPublicWebhookBaseUrl,
  twilioSmsStatusCallbackUrl,
  twilioSmsWebhookUrl,
} from "@/lib/twilioProvisioning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("webhooks");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const [inbox, ai, missed] = await Promise.all([
    getPortalInboxSettings(ownerId).catch(() => null),
    getAiReceptionistServiceData(ownerId).catch(() => null),
    getMissedCallTextBackServiceData(ownerId).catch(() => null),
  ]);

  const inboxToken = inbox?.webhookToken || null;
  const aiToken = ai?.settings?.webhookToken || null;
  const missedToken = missed?.settings?.webhookToken || null;

  const publicBaseUrl = getPublicWebhookBaseUrl();

  const inboxTwilioSmsUrlLegacy = inboxToken
    ? `${publicBaseUrl}/api/public/inbox/${encodeURIComponent(inboxToken)}/twilio/sms`
    : null;

  const aiReceptionistVoiceUrlLegacy = aiToken
    ? `${publicBaseUrl}/api/public/twilio/ai-receptionist/${encodeURIComponent(aiToken)}/voice`
    : null;

  const missedCallVoiceUrlLegacy = missedToken
    ? `${publicBaseUrl}/api/public/twilio/missed-call-textback/${encodeURIComponent(missedToken)}/voice`
    : null;
  const twilioSmsInboundUrl = twilioSmsWebhookUrl(publicBaseUrl);
  const twilioSmsStatusCbUrl = twilioSmsStatusCallbackUrl(publicBaseUrl);

  return NextResponse.json({
    ok: true,
    baseUrl: publicBaseUrl,
    requestBaseUrl: webhookBaseUrlFromRequest(req),
    twilio: {
      smsInboundUrl: twilioSmsInboundUrl,
      smsStatusCallbackUrl: twilioSmsStatusCbUrl,
    },
    legacy: {
      inboxTwilioSmsUrl: inboxTwilioSmsUrlLegacy,
      aiReceptionistVoiceUrl: aiReceptionistVoiceUrlLegacy,
      missedCallVoiceUrl: missedCallVoiceUrlLegacy,
    },
  });
}
