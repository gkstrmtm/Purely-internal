import crypto from "node:crypto";

import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

function forwardedHeaderValue(value: string | null): string {
  return String(value || "")
    .split(",")[0]
    ?.trim() || "";
}

function buildWebhookUrl(req: Request): string {
  const url = new URL(req.url);
  const forwardedProto = forwardedHeaderValue(req.headers.get("x-forwarded-proto"));
  const forwardedHost = forwardedHeaderValue(req.headers.get("x-forwarded-host"));
  const host = forwardedHost || forwardedHeaderValue(req.headers.get("host")) || url.host;
  const protocol = forwardedProto || url.protocol.replace(/:$/, "");
  return `${protocol}://${host}${url.pathname}${url.search}`;
}

function expectedTwilioSignature(opts: { authToken: string; url: string; bodyRaw: string }): string {
  const params = new URLSearchParams(opts.bodyRaw);
  const keys = Array.from(new Set(Array.from(params.keys()))).sort((a, b) => a.localeCompare(b));
  let payload = opts.url;
  for (const key of keys) {
    const values = params.getAll(key);
    if (!values.length) {
      payload += key;
      continue;
    }
    for (const value of values) payload += `${key}${value}`;
  }
  return crypto.createHmac("sha1", opts.authToken).update(payload, "utf8").digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(String(a || ""), "utf8");
  const bBuffer = Buffer.from(String(b || ""), "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export async function validateTwilioWebhookForOwner(opts: { req: Request; ownerId: string }): Promise<boolean> {
  if (process.env.TWILIO_DISABLE_WEBHOOK_SIGNATURE_CHECK === "1") return true;

  const signature = String(opts.req.headers.get("x-twilio-signature") || "").trim();
  if (!signature) return false;

  const twilio = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!twilio?.authToken) return false;

  const bodyRaw = await opts.req.text().catch(() => "");
  const expected = expectedTwilioSignature({
    authToken: twilio.authToken,
    url: buildWebhookUrl(opts.req),
    bodyRaw,
  });
  return safeEqual(signature, expected);
}