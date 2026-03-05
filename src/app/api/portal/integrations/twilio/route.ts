import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOwnerTwilioSmsConfig, getOwnerTwilioSmsConfigMasked, setOwnerTwilioProvisioning, setOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { getPublicWebhookBaseUrl, provisionTwilioSmsWebhooksForFromNumber } from "@/lib/twilioProvisioning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("twilio", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId);

  return NextResponse.json({ ok: true, twilio });
}

const putSchema = z.object({
  accountSid: z.string().trim().min(6).max(80).optional(),
  authToken: z.string().trim().min(6).max(120).optional(),
  fromNumberE164: z.string().trim().max(32).optional(),
  clear: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("twilio", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  try {
    if (parsed.data.clear) {
      const twilio = await setOwnerTwilioSmsConfig(ownerId, parsed.data);
      await setOwnerTwilioProvisioning(ownerId, null);
      return NextResponse.json({ ok: true, twilio, note: "Cleared." });
    }

    const current = await getOwnerTwilioSmsConfig(ownerId);
    const accountSid = (parsed.data.accountSid ?? current?.accountSid ?? "").trim();
    const authToken = (parsed.data.authToken ?? current?.authToken ?? "").trim();
    const fromNumberE164 = (parsed.data.fromNumberE164 ?? current?.fromNumberE164 ?? "").trim();

    if (!accountSid || !authToken || !fromNumberE164) {
      return NextResponse.json(
        { ok: false, error: "Twilio requires Account SID, Auth Token, and a valid From number" },
        { status: 400 },
      );
    }

    // Zero-friction connect: provision Twilio webhooks automatically.
    const provisioning = await provisionTwilioSmsWebhooksForFromNumber({
      accountSid,
      authToken,
      fromNumberE164,
      baseUrl: getPublicWebhookBaseUrl(),
    });
    if (!provisioning.ok) {
      await setOwnerTwilioProvisioning(ownerId, {
        smsUrl: null,
        statusCallbackUrl: null,
        phoneNumberSid: null,
        updatedAtIso: provisioning.updatedAtIso,
        lastError: provisioning.error,
      }).catch(() => null);
      return NextResponse.json(
        { ok: false, error: provisioning.error, provisioning: { ok: false, updatedAtIso: provisioning.updatedAtIso } },
        { status: 400 },
      );
    }

    const twilio = await setOwnerTwilioSmsConfig(ownerId, { accountSid, authToken, fromNumberE164 });
    await setOwnerTwilioProvisioning(ownerId, {
      smsUrl: provisioning.smsUrl,
      statusCallbackUrl: provisioning.statusCallbackUrl,
      phoneNumberSid: provisioning.phoneNumberSid,
      updatedAtIso: provisioning.updatedAtIso,
      lastError: null,
    });

    return NextResponse.json({
      ok: true,
      twilio,
      provisioning: {
        ok: true,
        smsUrl: provisioning.smsUrl,
        statusCallbackUrl: provisioning.statusCallbackUrl,
        updatedAtIso: provisioning.updatedAtIso,
      },
      note: "Connected. Webhooks configured automatically.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
  }
}
