import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getMissedCallTextBackServiceData } from "@/lib/missedCallTextBack";
import { getPortalInboxSettings } from "@/lib/portalInbox";
import { webhookBaseUrlFromRequest, webhookUrlFromRequest } from "@/lib/webhookBase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSession();
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

  const inboxTwilioSmsUrlLegacy = inboxToken
    ? webhookUrlFromRequest(req, `/api/public/inbox/${encodeURIComponent(inboxToken)}/twilio/sms`)
    : null;

  const aiReceptionistVoiceUrlLegacy = aiToken
    ? webhookUrlFromRequest(req, `/api/public/twilio/ai-receptionist/${encodeURIComponent(aiToken)}/voice`)
    : null;

  const missedCallVoiceUrlLegacy = missedToken
    ? webhookUrlFromRequest(req, `/api/public/twilio/missed-call-textback/${encodeURIComponent(missedToken)}/voice`)
    : null;

  return NextResponse.json({
    ok: true,
    baseUrl: webhookBaseUrlFromRequest(req),
    legacy: {
      inboxTwilioSmsUrl: inboxTwilioSmsUrlLegacy,
      aiReceptionistVoiceUrl: aiReceptionistVoiceUrlLegacy,
      missedCallVoiceUrl: missedCallVoiceUrlLegacy,
    },
  });
}
