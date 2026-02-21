import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { makeSmsThreadKey, tryUpsertPortalInboxMessage } from "@/lib/portalInbox";

const SERVICE_SLUG = "integrations";
const DEFAULT_DEMO_FULL_EMAIL_DEV = "demo-full@purelyautomation.dev";
const DEFAULT_DEMO_FULL_EMAIL_COM = "demo-full@purelyautomation.com";

export type OwnerTwilioSmsConfig = {
  accountSid: string;
  authToken: string;
  fromNumberE164: string;
  updatedAtIso: string;
};

export type OwnerTwilioSmsConfigMasked = {
  configured: boolean;
  accountSidMasked: string | null;
  fromNumberE164: string | null;
  hasAuthToken: boolean;
  updatedAtIso: string | null;
};

function maskAccountSid(sid: string): string {
  const clean = (sid || "").trim();
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 2)}…${clean.slice(-4)}`;
}

function parseConfig(raw: unknown): OwnerTwilioSmsConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;

  const accountSid = typeof rec.accountSid === "string" ? rec.accountSid.trim() : "";
  const authToken = typeof rec.authToken === "string" ? rec.authToken.trim() : "";
  const fromRaw = typeof rec.fromNumberE164 === "string" ? rec.fromNumberE164.trim() : "";

  const parsedFrom = normalizePhoneStrict(fromRaw);
  const fromNumberE164 = parsedFrom.ok && parsedFrom.e164 ? parsedFrom.e164 : "";

  const updatedAtIso = typeof rec.updatedAtIso === "string" ? rec.updatedAtIso : new Date().toISOString();

  if (!accountSid || !authToken || !fromNumberE164) return null;

  return { accountSid, authToken, fromNumberE164, updatedAtIso };
}

function getIntegrationsRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { version: 1 };
  const rec = raw as Record<string, unknown>;
  return { ...rec, version: 1 };
}

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function envTwilioConfig(): OwnerTwilioSmsConfig | null {
  const candidate: OwnerTwilioSmsConfig = {
    accountSid: envFirst(["TWILIO_ACCOUNT_SID"]),
    authToken: envFirst(["TWILIO_AUTH_TOKEN"]),
    fromNumberE164: envFirst(["TWILIO_FROM_NUMBER", "TWILIO_SMS_FROM_NUMBER", "TWILIO_MARKETING_FROM_NUMBER"]),
    updatedAtIso: new Date().toISOString(),
  };

  return parseConfig(candidate);
}

function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

async function envTwilioConfigForOwner(ownerId: string): Promise<OwnerTwilioSmsConfig | null> {
  const envConfig = envTwilioConfig();
  if (!envConfig) return null;

  const allow = new Set<string>([DEFAULT_DEMO_FULL_EMAIL_DEV, DEFAULT_DEMO_FULL_EMAIL_COM]);
  const fromEnv = normalizeEmail(process.env.DEMO_PORTAL_FULL_EMAIL);
  if (fromEnv) allow.add(fromEnv);

  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
  const email = normalizeEmail(user?.email);
  if (!email) return null;

  return allow.has(email) ? envConfig : null;
}

export async function getOwnerTwilioSmsConfig(ownerId: string): Promise<OwnerTwilioSmsConfig | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec = getIntegrationsRecord(row?.dataJson ?? null);
  const twilioRaw = rec.twilio;
  const saved = parseConfig(twilioRaw);
  if (saved) return saved;
  return await envTwilioConfigForOwner(ownerId);
}

export async function getOwnerTwilioSmsConfigMasked(ownerId: string): Promise<OwnerTwilioSmsConfigMasked> {
  const config = await getOwnerTwilioSmsConfig(ownerId);
  return {
    configured: Boolean(config),
    accountSidMasked: config ? maskAccountSid(config.accountSid) : null,
    fromNumberE164: config ? config.fromNumberE164 : null,
    hasAuthToken: config ? Boolean(config.authToken) : false,
    updatedAtIso: config ? config.updatedAtIso : null,
  };
}

export async function setOwnerTwilioSmsConfig(ownerId: string, input: {
  accountSid?: string;
  authToken?: string;
  fromNumberE164?: string;
  clear?: boolean;
}): Promise<OwnerTwilioSmsConfigMasked> {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec = getIntegrationsRecord(existing?.dataJson ?? null);
  const current = parseConfig(rec.twilio);

  if (input.clear) {
    const next = { ...rec } as any;
    delete next.twilio;

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
      update: { status: "COMPLETE", dataJson: next },
      select: { id: true },
    });

    return {
      configured: false,
      accountSidMasked: null,
      fromNumberE164: null,
      hasAuthToken: false,
      updatedAtIso: null,
    };
  }

  const accountSid = typeof input.accountSid === "string" ? input.accountSid.trim() : current?.accountSid ?? "";
  const authToken = typeof input.authToken === "string" ? input.authToken.trim() : current?.authToken ?? "";
  const fromParsed = normalizePhoneStrict(typeof input.fromNumberE164 === "string" ? input.fromNumberE164 : current?.fromNumberE164 ?? "");
  const fromNumberE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : "";

  const nextTwilio: OwnerTwilioSmsConfig = {
    accountSid,
    authToken,
    fromNumberE164,
    updatedAtIso: new Date().toISOString(),
  };

  const valid = parseConfig(nextTwilio);
  if (!valid) {
    // We don’t want to partially save invalid creds.
    throw new Error("Twilio requires Account SID, Auth Token, and a valid From number");
  }

  const next = { ...rec, twilio: nextTwilio } as any;

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
    update: { status: "COMPLETE", dataJson: next },
    select: { id: true },
  });

  return {
    configured: true,
    accountSidMasked: maskAccountSid(nextTwilio.accountSid),
    fromNumberE164: nextTwilio.fromNumberE164,
    hasAuthToken: Boolean(nextTwilio.authToken),
    updatedAtIso: nextTwilio.updatedAtIso,
  };
}

export async function sendOwnerTwilioSms(opts: {
  ownerId: string;
  to: string;
  body: string;
  mediaUrls?: string[];
}): Promise<{ ok: true; messageSid?: string } | { ok: false; error: string }> {
  const config = await getOwnerTwilioSmsConfig(opts.ownerId);
  if (!config) return { ok: false, error: "Texting not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", opts.to);
  form.set("From", config.fromNumberE164);
  const body = (opts.body || "").slice(0, 900);
  if (body.trim()) form.set("Body", body);

  const mediaUrls = Array.isArray(opts.mediaUrls) ? opts.mediaUrls.filter(Boolean).slice(0, 10) : [];
  for (const url of mediaUrls) {
    form.append("MediaUrl", url);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, error: `Twilio failed (${res.status}): ${text.slice(0, 400)}` };
  }

  try {
    const json = JSON.parse(text) as any;
    const messageSid = typeof json?.sid === "string" ? json.sid : undefined;
    if (messageSid) {
      const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(opts.to);
      await tryUpsertPortalInboxMessage({
        ownerId: opts.ownerId,
        channel: "SMS",
        direction: "OUT",
        threadKey,
        peerAddress,
        peerKey,
        fromAddress: config.fromNumberE164,
        toAddress: opts.to,
        bodyText: opts.body,
        provider: "TWILIO",
        providerMessageId: messageSid,
      });
    }
    return { ok: true, messageSid };
  } catch {
    const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(opts.to);
    await tryUpsertPortalInboxMessage({
      ownerId: opts.ownerId,
      channel: "SMS",
      direction: "OUT",
      threadKey,
      peerAddress,
      peerKey,
      fromAddress: config.fromNumberE164,
      toAddress: opts.to,
      bodyText: opts.body,
      provider: "TWILIO",
      providerMessageId: null,
    });
    return { ok: true };
  }
}
