import { missingOutboundEmailConfigReason, trySendTransactionalEmail } from "@/lib/emailSender";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

export type MarketingSendResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<MarketingSendResult> {
  const r = await trySendTransactionalEmail({
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    fromName: "Purely Automation",
  });

  if (r.ok) return { ok: true };
  if (r.skipped) return { ok: false, skipped: true, reason: missingOutboundEmailConfigReason() };
  return { ok: false, reason: r.reason };
}

export async function sendMarketingSms(opts: { to: string; body: string }): Promise<MarketingSendResult> {
  const r = await sendTwilioEnvSms({
    to: opts.to,
    body: opts.body,
    fromNumberEnvKeys: ["TWILIO_MARKETING_FROM_NUMBER", "TWILIO_FROM_NUMBER"],
  });

  if (r.ok) return { ok: true };
  if (r.skipped) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER/TWILIO_MARKETING_FROM_NUMBER",
    };
  }

  return { ok: false, reason: r.reason };
}
