import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { getPortalInboxSettings, regeneratePortalInboxWebhookToken } from "@/lib/portalInbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function baseUrlFromRequest(req: Request): string {
  const env = process.env.NEXTAUTH_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const [settings, twilio] = await Promise.all([
    getPortalInboxSettings(ownerId),
    getOwnerTwilioSmsConfigMasked(ownerId),
  ]);

  const base = baseUrlFromRequest(req);

  return NextResponse.json({
    ok: true,
    settings,
    twilio,
    webhooks: {
      twilioInboundSmsUrl: `${base}/api/public/inbox/${settings.webhookToken}/twilio/sms`,
      sendgridInboundEmailUrl: `${base}/api/public/inbox/${settings.webhookToken}/sendgrid/inbound`,
    },
  });
}

const putSchema = z.object({ regenerateToken: z.boolean().optional() });

export async function PUT(req: Request) {
  const auth = await requireClientSession();
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

  const [settings, twilio] = await Promise.all([
    regeneratePortalInboxWebhookToken(ownerId),
    getOwnerTwilioSmsConfigMasked(ownerId),
  ]);

  const base = baseUrlFromRequest(req);

  return NextResponse.json({
    ok: true,
    settings,
    twilio,
    webhooks: {
      twilioInboundSmsUrl: `${base}/api/public/inbox/${settings.webhookToken}/twilio/sms`,
      sendgridInboundEmailUrl: `${base}/api/public/inbox/${settings.webhookToken}/sendgrid/inbound`,
    },
  });
}
