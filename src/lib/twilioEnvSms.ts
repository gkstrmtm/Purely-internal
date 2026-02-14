export type EnvTwilioSmsResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

function resolveFromNumber(fromNumberEnvKeys: string[]) {
  for (const k of fromNumberEnvKeys) {
    const v = (process.env[k] || "").trim();
    if (v) return v;
  }
  return "";
}

export async function sendTwilioEnvSms(opts: {
  to: string;
  body: string;
  fromNumberEnvKeys?: string[];
}): Promise<EnvTwilioSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = resolveFromNumber(opts.fromNumberEnvKeys ?? ["TWILIO_FROM_NUMBER"]);

  if (!accountSid || !authToken || !fromNumber) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or Twilio from-number env var",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", opts.to);
  form.set("From", fromNumber);
  form.set("Body", (opts.body || "").slice(0, 900));

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
