import { missingOutboundEmailConfigReason, trySendTransactionalEmail } from "@/lib/emailSender";

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

function resolveMarketingFromNumber() {
  return (
    process.env.TWILIO_MARKETING_FROM_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    ""
  ).trim();
}

export async function sendMarketingSms(opts: { to: string; body: string }): Promise<MarketingSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = resolveMarketingFromNumber();

  if (!accountSid || !authToken || !fromNumber) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER/TWILIO_MARKETING_FROM_NUMBER",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", opts.to);
  form.set("From", fromNumber);
  form.set("Body", opts.body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Twilio failed (${res.status}): ${text.slice(0, 500)}` };
  }

  return { ok: true };
}
