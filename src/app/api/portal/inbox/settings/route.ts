import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { getPortalInboxSettings, regeneratePortalInboxWebhookToken } from "@/lib/portalInbox";
import { getOrCreateOwnerMailboxAddress } from "@/lib/portalMailbox";
import { getPublicWebhookBaseUrl, twilioSmsWebhookUrl } from "@/lib/twilioProvisioning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const [settings, twilio, mailbox] = await Promise.all([
    getPortalInboxSettings(ownerId),
    getOwnerTwilioSmsConfigMasked(ownerId),
    getOrCreateOwnerMailboxAddress(ownerId).catch(() => null),
  ]);

  return NextResponse.json({
    ok: true,
    settings,
    twilio,
    mailbox: mailbox ? { emailAddress: mailbox.emailAddress, localPart: mailbox.localPart } : null,
    webhooks: {
      // Universal router URL (recommended): works even when multiple services share the same Twilio number.
      // Routes by Twilio "To" number → owner.
      twilioInboundSmsUrl: twilioSmsWebhookUrl(getPublicWebhookBaseUrl()),
      // Legacy per-owner token URL (still supported for backwards compatibility).
      twilioInboundSmsUrlLegacy: `${getPublicWebhookBaseUrl()}/api/public/inbox/${encodeURIComponent(settings.webhookToken)}/twilio/sms`,
    },
  });
}

const putSchema = z.object({ regenerateToken: z.boolean().optional() });

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ownerId = auth.session.user.id;
  if (!parsed.data.regenerateToken) {
    return NextResponse.json({ ok: false, error: "Nothing to do" }, { status: 400 });
  }

  const [settings, twilio, mailbox] = await Promise.all([
    regeneratePortalInboxWebhookToken(ownerId),
    getOwnerTwilioSmsConfigMasked(ownerId),
    getOrCreateOwnerMailboxAddress(ownerId).catch(() => null),
  ]);

  return NextResponse.json({
    ok: true,
    settings,
    twilio,
    mailbox: mailbox ? { emailAddress: mailbox.emailAddress, localPart: mailbox.localPart } : null,
    webhooks: {
      twilioInboundSmsUrl: twilioSmsWebhookUrl(getPublicWebhookBaseUrl()),
      twilioInboundSmsUrlLegacy: `${getPublicWebhookBaseUrl()}/api/public/inbox/${encodeURIComponent(settings.webhookToken)}/twilio/sms`,
    },
  });
}
