import crypto from "crypto";

import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";

const SERVICE_SLUG = "missed-call-textback";
const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

const MAX_EVENTS = 200;
const MAX_BODY_LEN = 900;

export type MissedCallTextBackSettings = {
  version: 1;
  enabled: boolean;
  replyDelaySeconds: number;
  replyBody: string;
  mediaUrls: string[];
  forwardToPhoneE164: string | null;
  webhookToken: string;
};

export type MissedCallTextBackEvent = {
  id: string;
  callSid: string;
  from: string;
  to: string | null;
  createdAtIso: string;

  dialCallStatus?: string;
  finalStatus: "ANSWERED" | "MISSED" | "UNKNOWN";

  smsStatus: "NONE" | "SENT" | "SKIPPED" | "FAILED";
  smsTo?: string;
  smsFrom?: string;
  smsBody?: string;
  smsMessageSid?: string;
  smsError?: string;
};

export type MissedCallTextBackServiceData = {
  version: 1;
  settings: MissedCallTextBackSettings;
  events: MissedCallTextBackEvent[];
};

function nowIso() {
  return new Date().toISOString();
}

function newToken(): string {
  // URL-safe enough, no padding.
  return crypto.randomBytes(18).toString("base64url");
}

export function parseMissedCallTextBackSettings(raw: unknown): MissedCallTextBackSettings {
  const base: MissedCallTextBackSettings = {
    version: 1,
    enabled: false,
    replyDelaySeconds: 5,
    replyBody: "Hey! Sorry we missed your call — what can we help with?",
    mediaUrls: [],
    forwardToPhoneE164: null,
    webhookToken: newToken(),
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;
  const replyDelaySecondsRaw = typeof rec.replyDelaySeconds === "number" ? rec.replyDelaySeconds : base.replyDelaySeconds;
  const replyDelaySeconds = Math.max(0, Math.min(600, Math.round(replyDelaySecondsRaw)));

  const replyBody = typeof rec.replyBody === "string" ? rec.replyBody.slice(0, MAX_BODY_LEN).trim() : base.replyBody;

  const mediaUrls = Array.isArray((rec as any).mediaUrls)
    ? ((rec as any).mediaUrls as unknown[])
        .flatMap((x) => (typeof x === "string" ? [x.trim().slice(0, 500)] : []))
        .filter((u) => Boolean(u) && (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")))
        .slice(0, 10)
    : [];

  let forwardToPhoneE164: string | null = null;
  if (typeof rec.forwardToPhoneE164 === "string" && rec.forwardToPhoneE164.trim()) {
    const parsed = normalizePhoneStrict(rec.forwardToPhoneE164);
    if (parsed.ok) forwardToPhoneE164 = parsed.e164;
  }

  const webhookToken = typeof rec.webhookToken === "string" && rec.webhookToken.trim().length >= 12 ? rec.webhookToken.trim() : base.webhookToken;

  return {
    version: 1,
    enabled,
    replyDelaySeconds,
    replyBody: replyBody || base.replyBody,
    mediaUrls,
    forwardToPhoneE164,
    webhookToken,
  };
}

function parseServiceData(raw: unknown): MissedCallTextBackServiceData {
  const defaultSettings = parseMissedCallTextBackSettings(null);
  const base: MissedCallTextBackServiceData = { version: 1, settings: defaultSettings, events: [] };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const settings = parseMissedCallTextBackSettings(rec.settings);

  const events = Array.isArray(rec.events)
    ? (rec.events as unknown[])
        .flatMap((e) => {
          if (!e || typeof e !== "object" || Array.isArray(e)) return [] as MissedCallTextBackEvent[];
          const r = e as Record<string, unknown>;
          const callSid = typeof r.callSid === "string" ? r.callSid : "";
          const from = typeof r.from === "string" ? r.from : "";
          const to = typeof r.to === "string" ? r.to : null;
          const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : nowIso();
          const finalStatus = r.finalStatus === "ANSWERED" || r.finalStatus === "MISSED" ? r.finalStatus : "UNKNOWN";
          const smsStatus = r.smsStatus === "SENT" || r.smsStatus === "SKIPPED" || r.smsStatus === "FAILED" ? r.smsStatus : "NONE";

          const dialCallStatus = typeof r.dialCallStatus === "string" ? r.dialCallStatus : undefined;

          if (!callSid || !from) return [] as MissedCallTextBackEvent[];

          const evt: MissedCallTextBackEvent = {
            id: typeof r.id === "string" ? r.id : `evt_${callSid}`,
            callSid,
            from,
            to,
            createdAtIso,
            finalStatus,
            smsStatus,
            ...(dialCallStatus ? { dialCallStatus } : {}),
            ...(typeof r.smsTo === "string" ? { smsTo: r.smsTo } : {}),
            ...(typeof r.smsFrom === "string" ? { smsFrom: r.smsFrom } : {}),
            ...(typeof r.smsBody === "string" ? { smsBody: r.smsBody } : {}),
            ...(typeof r.smsMessageSid === "string" ? { smsMessageSid: r.smsMessageSid } : {}),
            ...(typeof r.smsError === "string" ? { smsError: r.smsError } : {}),
          };

          return [evt];
        })
        .slice(0, MAX_EVENTS)
    : [];

  return {
    version: 1,
    settings,
    events,
  };
}

export async function getMissedCallTextBackServiceData(ownerId: string): Promise<MissedCallTextBackServiceData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseServiceData(row?.dataJson ?? null);
}

export async function setMissedCallTextBackSettings(ownerId: string, settings: MissedCallTextBackSettings): Promise<MissedCallTextBackSettings> {
  const current = await getMissedCallTextBackServiceData(ownerId);
  const payload: MissedCallTextBackServiceData = {
    version: 1,
    settings,
    events: current.events.slice(0, MAX_EVENTS),
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
    update: { status: "COMPLETE", dataJson: payload as any },
    select: { dataJson: true },
  });

  return parseServiceData(row.dataJson).settings;
}

export async function regenerateMissedCallWebhookToken(ownerId: string): Promise<MissedCallTextBackSettings> {
  const data = await getMissedCallTextBackServiceData(ownerId);
  const next: MissedCallTextBackSettings = { ...data.settings, webhookToken: newToken() };
  return await setMissedCallTextBackSettings(ownerId, next);
}

export async function listMissedCallTextBackEvents(ownerId: string, limit = 100): Promise<MissedCallTextBackEvent[]> {
  const data = await getMissedCallTextBackServiceData(ownerId);
  const n = Math.max(1, Math.min(200, Math.round(limit)));
  return data.events
    .slice()
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
    .slice(0, n);
}

export async function upsertMissedCallEvent(ownerId: string, nextEvent: MissedCallTextBackEvent): Promise<void> {
  const data = await getMissedCallTextBackServiceData(ownerId);
  const events = data.events.slice();
  const idx = events.findIndex((e) => e.callSid === nextEvent.callSid);
  if (idx >= 0) events[idx] = nextEvent;
  else events.unshift(nextEvent);

  const payload: MissedCallTextBackServiceData = {
    version: 1,
    settings: data.settings,
    events: events.slice(0, MAX_EVENTS),
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
    update: { status: "COMPLETE", dataJson: payload as any },
    select: { id: true },
  });
}

export async function findOwnerByMissedCallWebhookToken(token: string): Promise<{ ownerId: string; data: MissedCallTextBackServiceData } | null> {
  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
    take: 200,
  });

  for (const row of rows) {
    const data = parseServiceData(row.dataJson);
    if (data.settings.webhookToken === token) return { ownerId: row.ownerId, data };
  }

  return null;
}

export async function getOwnerProfilePhoneE164(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;

  const raw = rec?.phone;
  if (typeof raw !== "string" || !raw.trim()) return null;

  const parsed = normalizePhoneStrict(raw);
  return parsed.ok ? parsed.e164 : null;
}

export function renderMissedCallReplyBody(template: string, vars: { from: string; to?: string | null }): string {
  const safe = (template || "").slice(0, MAX_BODY_LEN);
  return safe
    .replaceAll("{from}", vars.from)
    .replaceAll("{to}", vars.to ?? "")
    .trim();
}

export async function sendOwnerSms(ownerId: string, opts: { to: string; body: string }) {
  return await sendOwnerTwilioSms({ ownerId, to: opts.to, body: opts.body.slice(0, MAX_BODY_LEN) });
}

export async function sendOwnerMms(ownerId: string, opts: { to: string; body: string; mediaUrls?: string[] }) {
  const mediaUrls = Array.isArray(opts.mediaUrls) ? opts.mediaUrls.filter(Boolean).slice(0, 10) : [];
  return await sendOwnerTwilioSms({
    ownerId,
    to: opts.to,
    body: opts.body.slice(0, MAX_BODY_LEN),
    mediaUrls,
  });
}
