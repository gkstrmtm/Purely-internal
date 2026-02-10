import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  getMissedCallTextBackServiceData,
  parseMissedCallTextBackSettings,
  regenerateMissedCallWebhookToken,
  setMissedCallTextBackSettings,
  listMissedCallTextBackEvents,
  getOwnerProfilePhoneE164,
} from "@/lib/missedCallTextBack";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("missedCallTextback");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const [data, profilePhone] = await Promise.all([
    getMissedCallTextBackServiceData(ownerId),
    getOwnerProfilePhoneE164(ownerId),
  ]);

  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId);
  const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
  const webhookUrlLegacy = webhookUrlFromRequest(
    req,
    `/api/public/twilio/missed-call-textback/${data.settings.webhookToken}/voice`,
  );

  const events = await listMissedCallTextBackEvents(ownerId, 120);

  return NextResponse.json({
    ok: true,
    settings: data.settings,
    events,
    profilePhone,
    twilioConfigured: twilio.configured,
    twilioReason: twilio.configured ? undefined : "Twilio not configured in portal",
    webhookUrl,
    webhookUrlLegacy,
    notes: {
      variables: ["{from}", "{to}"],
    },
  });
}

const putSchema = z.object({
  settings: z.unknown(),
  regenerateToken: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("missedCallTextback");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  if (parsed.data.regenerateToken) {
    const next = await regenerateMissedCallWebhookToken(ownerId);
    const events = await listMissedCallTextBackEvents(ownerId, 120);
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const twilio = await getOwnerTwilioSmsConfigMasked(ownerId);
    const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
    const webhookUrlLegacy = webhookUrlFromRequest(req, `/api/public/twilio/missed-call-textback/${next.webhookToken}/voice`);

    return NextResponse.json({
      ok: true,
      settings: next,
      events,
      profilePhone,
      twilioConfigured: twilio.configured,
      twilioReason: twilio.configured ? undefined : "Twilio not configured in portal",
      webhookUrl,
      webhookUrlLegacy,
      notes: { variables: ["{from}", "{to}"] },
    });
  }

  const normalized = parseMissedCallTextBackSettings(parsed.data.settings);
  const next = await setMissedCallTextBackSettings(ownerId, normalized);
  const events = await listMissedCallTextBackEvents(ownerId, 120);
  const profilePhone = await getOwnerProfilePhoneE164(ownerId);
  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId);
  const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
  const webhookUrlLegacy = webhookUrlFromRequest(req, `/api/public/twilio/missed-call-textback/${next.webhookToken}/voice`);

  return NextResponse.json({
    ok: true,
    settings: next,
    events,
    profilePhone,
    twilioConfigured: twilio.configured,
    twilioReason: twilio.configured ? undefined : "Twilio not configured in portal",
    webhookUrl,
    webhookUrlLegacy,
    notes: { variables: ["{from}", "{to}"] },
  });
}
