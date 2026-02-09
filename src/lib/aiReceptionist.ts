import crypto from "crypto";

import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";

const SERVICE_SLUG = "ai-receptionist";
const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

const MAX_EVENTS = 200;
const MAX_GREETING_LEN = 360;
const MAX_PROMPT_LEN = 6000;

function nowIso() {
  return new Date().toISOString();
}

function newToken(): string {
  // URL-safe, no padding.
  return crypto.randomBytes(18).toString("base64url");
}

export type AiReceptionistMode = "AI" | "FORWARD";

export type AiReceptionistSettings = {
  version: 1;
  enabled: boolean;
  mode: AiReceptionistMode;

  webhookToken: string;

  businessName: string;
  greeting: string;
  systemPrompt: string;

  forwardToPhoneE164: string | null;

  voiceAgentId: string;
  voiceAgentApiKey: string | null;
};

export type AiReceptionistCallEvent = {
  id: string;
  callSid: string;
  from: string;
  to: string | null;
  createdAtIso: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "UNKNOWN";
  notes?: string;
  recordingSid?: string;
  recordingDurationSec?: number;
  // Best-effort contact info captured by your voice agent (e.g. ElevenLabs).
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;

  // Optional transcript content for the call.
  transcript?: string;

  // Optional audio URL override (e.g. demo audio). If omitted, recordingSid may be used.
  audioUrl?: string;
  chargedCredits?: number;
  creditsChargedPartial?: boolean;
};

export type AiReceptionistServiceData = {
  version: 1;
  settings: AiReceptionistSettings;
  events: AiReceptionistCallEvent[];
};

export type PublicAiReceptionistSettings = Omit<AiReceptionistSettings, "voiceAgentApiKey"> & {
  voiceAgentConfigured: boolean;
};

export function parseAiReceptionistSettings(
  raw: unknown,
  prev?: AiReceptionistSettings | null,
): AiReceptionistSettings {
  const base: AiReceptionistSettings = {
    version: 1,
    enabled: false,
    mode: "AI",

    webhookToken: prev?.webhookToken ?? newToken(),

    businessName: "",
    greeting: "Thanks for calling — how can I help?",
    systemPrompt:
      "You are a helpful AI receptionist. Your goal is to answer questions, capture lead details, and help book appointments. Be concise.",

    forwardToPhoneE164: null,

    voiceAgentId: "",
    voiceAgentApiKey: prev?.voiceAgentApiKey ?? null,
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;
  const mode = rec.mode === "FORWARD" ? "FORWARD" : "AI";

  const businessName = typeof rec.businessName === "string" ? rec.businessName.trim().slice(0, 120) : base.businessName;
  const greeting = typeof rec.greeting === "string" ? rec.greeting.trim().slice(0, MAX_GREETING_LEN) : base.greeting;
  const systemPrompt = typeof rec.systemPrompt === "string" ? rec.systemPrompt.trim().slice(0, MAX_PROMPT_LEN) : base.systemPrompt;

  let forwardToPhoneE164: string | null = null;
  if (typeof rec.forwardToPhoneE164 === "string" && rec.forwardToPhoneE164.trim()) {
    const parsed = normalizePhoneStrict(rec.forwardToPhoneE164);
    if (parsed.ok) forwardToPhoneE164 = parsed.e164;
  }

  const webhookToken =
    typeof rec.webhookToken === "string" && rec.webhookToken.trim().length >= 12
      ? rec.webhookToken.trim()
      : base.webhookToken;

  const voiceAgentIdRaw =
    typeof rec.voiceAgentId === "string"
      ? rec.voiceAgentId
      : (typeof rec.elevenLabsAgentId === "string" ? rec.elevenLabsAgentId : "");
  const voiceAgentId = voiceAgentIdRaw.trim().slice(0, 120) || base.voiceAgentId;

  let voiceAgentApiKey = base.voiceAgentApiKey;
  const voiceAgentApiKeyRaw =
    typeof rec.voiceAgentApiKey === "string"
      ? rec.voiceAgentApiKey
      : (typeof rec.elevenLabsApiKey === "string" ? rec.elevenLabsApiKey : undefined);
  if (typeof voiceAgentApiKeyRaw === "string") {
    const k = voiceAgentApiKeyRaw.trim();
    if (k) voiceAgentApiKey = k.slice(0, 400);
  }

  return {
    version: 1,
    enabled,
    mode,
    webhookToken,
    businessName,
    greeting: greeting || base.greeting,
    systemPrompt: systemPrompt || base.systemPrompt,
    forwardToPhoneE164,
    voiceAgentId,
    voiceAgentApiKey,
  };
}

function parseServiceData(raw: unknown): AiReceptionistServiceData {
  const defaultSettings = parseAiReceptionistSettings(null, null);
  const base: AiReceptionistServiceData = { version: 1, settings: defaultSettings, events: [] };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const settings = parseAiReceptionistSettings(rec.settings, null);

  const events = Array.isArray(rec.events)
    ? (rec.events as unknown[])
        .flatMap((e) => {
          if (!e || typeof e !== "object" || Array.isArray(e)) return [] as AiReceptionistCallEvent[];
          const r = e as Record<string, unknown>;

          const callSid = typeof r.callSid === "string" ? r.callSid : "";
          const from = typeof r.from === "string" ? r.from : "";
          const to = typeof r.to === "string" ? r.to : null;
          const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : nowIso();
          let status: AiReceptionistCallEvent["status"] = "UNKNOWN";
          if (
            r.status === "IN_PROGRESS" ||
            r.status === "COMPLETED" ||
            r.status === "FAILED" ||
            r.status === "UNKNOWN"
          ) {
            status = r.status;
          }

          if (!callSid || !from) return [] as AiReceptionistCallEvent[];

          const recordingSid = typeof r.recordingSid === "string" ? r.recordingSid : undefined;
          const recordingDurationSec = typeof r.recordingDurationSec === "number" && Number.isFinite(r.recordingDurationSec)
            ? Math.max(0, Math.floor(r.recordingDurationSec))
            : undefined;

          const contactName = typeof r.contactName === "string" ? r.contactName.trim().slice(0, 120) : "";
          const contactEmail = typeof r.contactEmail === "string" ? r.contactEmail.trim().slice(0, 160) : "";
          const contactPhone = typeof r.contactPhone === "string" ? r.contactPhone.trim().slice(0, 60) : "";

          const transcriptRaw = typeof r.transcript === "string" ? r.transcript : "";
          const transcript = transcriptRaw.trim() ? transcriptRaw.trim().slice(0, 20000) : "";

          const audioUrlRaw = typeof r.audioUrl === "string" ? r.audioUrl.trim() : "";
          const audioUrl =
            audioUrlRaw && audioUrlRaw.length <= 500 && (audioUrlRaw.startsWith("/") || audioUrlRaw.startsWith("https://"))
              ? audioUrlRaw
              : "";
          const chargedCredits = typeof r.chargedCredits === "number" && Number.isFinite(r.chargedCredits)
            ? Math.max(0, Math.floor(r.chargedCredits))
            : undefined;
          const creditsChargedPartial = typeof r.creditsChargedPartial === "boolean" ? r.creditsChargedPartial : undefined;

          return [
            {
              id: typeof r.id === "string" ? r.id : `call_${callSid}`,
              callSid,
              from,
              to,
              createdAtIso,
              status,
              ...(typeof r.notes === "string" && r.notes.trim() ? { notes: r.notes.trim().slice(0, 800) } : {}),
              ...(recordingSid ? { recordingSid } : {}),
              ...(typeof recordingDurationSec === "number" ? { recordingDurationSec } : {}),
              ...(contactName ? { contactName } : {}),
              ...(contactEmail ? { contactEmail } : {}),
              ...(contactPhone ? { contactPhone } : {}),
              ...(transcript ? { transcript } : {}),
              ...(audioUrl ? { audioUrl } : {}),
              ...(typeof chargedCredits === "number" ? { chargedCredits } : {}),
              ...(typeof creditsChargedPartial === "boolean" ? { creditsChargedPartial } : {}),
            },
          ];
        })
        .slice(0, MAX_EVENTS)
    : [];

  return { version: 1, settings, events };
}

export function toPublicSettings(settings: AiReceptionistSettings): PublicAiReceptionistSettings {
  const { voiceAgentApiKey, ...rest } = settings;
  return {
    ...rest,
    voiceAgentConfigured: Boolean(voiceAgentApiKey && voiceAgentApiKey.trim()),
  };
}

export async function getAiReceptionistServiceData(ownerId: string): Promise<AiReceptionistServiceData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  // Preserve secrets by parsing with prev settings if present.
  const parsed = parseServiceData(row?.dataJson ?? null);
  const prev = parsed.settings;

  // Re-parse settings from storage with prev to keep voiceAgentApiKey stable.
  const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;

  const settings = parseAiReceptionistSettings(rec?.settings, prev);

  return { version: 1, settings, events: parsed.events };
}

export async function setAiReceptionistSettings(ownerId: string, settings: AiReceptionistSettings): Promise<AiReceptionistSettings> {
  const current = await getAiReceptionistServiceData(ownerId);
  const payload: AiReceptionistServiceData = {
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

  return getAiReceptionistSettingsFromRow(row.dataJson, settings);
}

function getAiReceptionistSettingsFromRow(raw: unknown, prev: AiReceptionistSettings): AiReceptionistSettings {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  return parseAiReceptionistSettings(rec?.settings, prev);
}

export async function regenerateAiReceptionistWebhookToken(ownerId: string): Promise<AiReceptionistSettings> {
  const data = await getAiReceptionistServiceData(ownerId);
  const next: AiReceptionistSettings = { ...data.settings, webhookToken: newToken() };
  return await setAiReceptionistSettings(ownerId, next);
}

export async function listAiReceptionistEvents(ownerId: string, limit = 60): Promise<AiReceptionistCallEvent[]> {
  const data = await getAiReceptionistServiceData(ownerId);
  const n = Math.max(1, Math.min(200, Math.round(limit)));
  return data.events
    .slice()
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
    .slice(0, n);
}

export async function upsertAiReceptionistCallEvent(ownerId: string, nextEvent: AiReceptionistCallEvent): Promise<void> {
  const data = await getAiReceptionistServiceData(ownerId);
  const events = data.events.slice();
  const idx = events.findIndex((e) => e.callSid === nextEvent.callSid);
  if (idx >= 0) events[idx] = nextEvent;
  else events.unshift(nextEvent);

  const payload: AiReceptionistServiceData = {
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

export async function findOwnerByAiReceptionistWebhookToken(
  token: string,
): Promise<{ ownerId: string; data: AiReceptionistServiceData } | null> {
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
