import { getAppBaseUrl } from "@/lib/portalNotifications";

export type TwilioProvisionSmsWebhooksResult =
  | {
      ok: true;
      phoneNumberSid: string;
      fromNumberE164: string;
      smsUrl: string;
      statusCallbackUrl: string;
      updatedAtIso: string;
    }
  | {
      ok: false;
      error: string;
      updatedAtIso: string;
    };

function cleanBaseUrl(raw: string): string {
  return String(raw || "").trim().replace(/\/$/, "");
}

export function getPublicWebhookBaseUrl(): string {
  const explicit = String(process.env.PUBLIC_WEBHOOK_BASE_URL ?? "").trim();
  if (explicit && /^https?:\/\//i.test(explicit)) return cleanBaseUrl(explicit);
  return cleanBaseUrl(getAppBaseUrl());
}

export function twilioSmsWebhookUrl(baseUrl: string): string {
  return `${cleanBaseUrl(baseUrl)}/api/public/twilio/sms`;
}

export function twilioSmsStatusCallbackUrl(baseUrl: string): string {
  return `${cleanBaseUrl(baseUrl)}/api/public/twilio/sms/status`;
}

async function twilioFetchJson(opts: {
  accountSid: string;
  authToken: string;
  url: string;
  method: "GET" | "POST";
  form?: URLSearchParams;
}): Promise<{ ok: true; json: any } | { ok: false; status: number; text: string }> {
  const basic = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");

  const res = await fetch(opts.url, {
    method: opts.method,
    headers:
      opts.method === "POST"
        ? {
            authorization: `Basic ${basic}`,
            "content-type": "application/x-www-form-urlencoded",
          }
        : { authorization: `Basic ${basic}` },
    body: opts.method === "POST" ? opts.form?.toString() : undefined,
  }).catch(() => null);

  if (!res) return { ok: false, status: 0, text: "Twilio request failed" };
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, status: res.status, text };

  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, text: text || "Invalid JSON from Twilio" };
  }
}

export async function provisionTwilioSmsWebhooksForFromNumber(opts: {
  accountSid: string;
  authToken: string;
  fromNumberE164: string;
  baseUrl?: string;
}): Promise<TwilioProvisionSmsWebhooksResult> {
  const updatedAtIso = new Date().toISOString();
  const baseUrl = cleanBaseUrl(opts.baseUrl || getPublicWebhookBaseUrl());

  const smsUrl = twilioSmsWebhookUrl(baseUrl);
  const statusCallbackUrl = twilioSmsStatusCallbackUrl(baseUrl);

  try {
    const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      opts.accountSid,
    )}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(opts.fromNumberE164)}&PageSize=20`;

    const listRes = await twilioFetchJson({
      accountSid: opts.accountSid,
      authToken: opts.authToken,
      url: listUrl,
      method: "GET",
    });

    if (!listRes.ok) {
      return {
        ok: false,
        updatedAtIso,
        error: `Twilio list numbers failed (${listRes.status}): ${String(listRes.text || "").slice(0, 240)}`,
      };
    }

    const rows = Array.isArray(listRes.json?.incoming_phone_numbers)
      ? (listRes.json.incoming_phone_numbers as any[])
      : [];

    const match = rows.find((r) => String(r?.phone_number || "").trim() === opts.fromNumberE164) ?? rows[0];
    const phoneNumberSid = typeof match?.sid === "string" ? match.sid : "";
    if (!phoneNumberSid) {
      return {
        ok: false,
        updatedAtIso,
        error: `Twilio: phone number not found in this account (${opts.fromNumberE164}). Double-check Account SID/Auth Token and the From number.`,
      };
    }

    const smsAppSid = String(match?.sms_application_sid || "").trim();
    if (smsAppSid) {
      return {
        ok: false,
        updatedAtIso,
        error:
          "Twilio: this number is configured with an SMS Application (smsApplicationSid). Remove it in Twilio Console (or contact support) so we can set the SMS webhook URL directly on the number.",
      };
    }

    const form = new URLSearchParams();
    form.set("SmsUrl", smsUrl);
    form.set("SmsMethod", "POST");
    form.set("StatusCallback", statusCallbackUrl);
    form.set("StatusCallbackMethod", "POST");

    const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      opts.accountSid,
    )}/IncomingPhoneNumbers/${encodeURIComponent(phoneNumberSid)}.json`;

    const updateRes = await twilioFetchJson({
      accountSid: opts.accountSid,
      authToken: opts.authToken,
      url: updateUrl,
      method: "POST",
      form,
    });

    if (!updateRes.ok) {
      return {
        ok: false,
        updatedAtIso,
        error: `Twilio update number failed (${updateRes.status}): ${String(updateRes.text || "").slice(0, 240)}`,
      };
    }

    return {
      ok: true,
      phoneNumberSid,
      fromNumberE164: opts.fromNumberE164,
      smsUrl,
      statusCallbackUrl,
      updatedAtIso,
    };
  } catch (e) {
    return {
      ok: false,
      updatedAtIso,
      error: e instanceof Error ? e.message : "Twilio provisioning failed",
    };
  }
}
