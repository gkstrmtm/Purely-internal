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

  // If enabled, the voice agent is allowed to decide to transfer the call to a human.
  // (Requires a forward/transfer phone number and compatible voice-agent tools.)
  aiCanTransferToHuman: boolean;

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
  // ElevenLabs conversation id (used to fetch transcript).
  conversationId?: string;
  recordingSid?: string;
  recordingDurationSec?: number;
  // Demo-only recording id (served via an authenticated endpoint). Avoid storing URLs in event data.
  demoRecordingId?: string;
  // Best-effort contact info captured by your voice agent.
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;

  // Optional transcript content for the call.
  transcript?: string;
  chargedCredits?: number;
  creditsChargedPartial?: boolean;
  // Idempotency guard: Twilio callbacks may be retried.
  creditsChargeAttempted?: boolean;
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
    greeting: "Thanks for calling. How can I help?",
    systemPrompt:
      "You are a helpful receptionist. Answer questions casually and clearly, and keep a friendly tone. If appropriate, capture lead details (name, email, phone) and help book an appointment. Be concise.",

    aiCanTransferToHuman: false,

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
  const aiCanTransferToHuman =
    typeof rec.aiCanTransferToHuman === "boolean" ? rec.aiCanTransferToHuman : base.aiCanTransferToHuman;

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
    aiCanTransferToHuman,
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

          const conversationIdRaw =
            typeof (r as any).conversationId === "string"
              ? String((r as any).conversationId)
              : (typeof (r as any).conversation_id === "string" ? String((r as any).conversation_id) : "");
          const conversationId = conversationIdRaw.trim() ? conversationIdRaw.trim().slice(0, 120) : "";

          const recordingSid = typeof r.recordingSid === "string" ? r.recordingSid : undefined;
          const recordingDurationSec = typeof r.recordingDurationSec === "number" && Number.isFinite(r.recordingDurationSec)
            ? Math.max(0, Math.floor(r.recordingDurationSec))
            : undefined;

          const demoRecordingIdRaw = typeof r.demoRecordingId === "string" ? r.demoRecordingId.trim() : "";
          let demoRecordingId = demoRecordingIdRaw ? demoRecordingIdRaw.slice(0, 40) : "";
          // Back-compat: if older demo events stored an audioUrl pointing at the demo endpoint,
          // extract the id so we can continue to play without persisting URLs.
          if (!demoRecordingId) {
            const audioUrlRaw = typeof (r as any).audioUrl === "string" ? String((r as any).audioUrl).trim() : "";
            const m = audioUrlRaw.match(/\/api\/portal\/ai-receptionist\/(?:demo-audio|recordings\/demo)\/([^/?#]+)/i);
            if (m?.[1]) demoRecordingId = m[1].trim().slice(0, 40);
          }

          const contactName = typeof r.contactName === "string" ? r.contactName.trim().slice(0, 120) : "";
          const contactEmail = typeof r.contactEmail === "string" ? r.contactEmail.trim().slice(0, 160) : "";
          const contactPhone = typeof r.contactPhone === "string" ? r.contactPhone.trim().slice(0, 60) : "";

          const transcriptRaw = typeof r.transcript === "string" ? r.transcript : "";
          const transcript = transcriptRaw.trim() ? transcriptRaw.trim().slice(0, 20000) : "";
          const chargedCredits = typeof r.chargedCredits === "number" && Number.isFinite(r.chargedCredits)
            ? Math.max(0, Math.floor(r.chargedCredits))
            : undefined;
          const creditsChargedPartial = typeof r.creditsChargedPartial === "boolean" ? r.creditsChargedPartial : undefined;
          const creditsChargeAttempted = typeof (r as any).creditsChargeAttempted === "boolean" ? (r as any).creditsChargeAttempted : undefined;

          return [
            {
              id: typeof r.id === "string" ? r.id : `call_${callSid}`,
              callSid,
              from,
              to,
              createdAtIso,
              status,
              ...(typeof r.notes === "string" && r.notes.trim() ? { notes: r.notes.trim().slice(0, 800) } : {}),
              ...(conversationId ? { conversationId } : {}),
              ...(recordingSid ? { recordingSid } : {}),
              ...(typeof recordingDurationSec === "number" ? { recordingDurationSec } : {}),
              ...(demoRecordingId ? { demoRecordingId } : {}),
              ...(contactName ? { contactName } : {}),
              ...(contactEmail ? { contactEmail } : {}),
              ...(contactPhone ? { contactPhone } : {}),
              ...(transcript ? { transcript } : {}),
              ...(typeof chargedCredits === "number" ? { chargedCredits } : {}),
              ...(typeof creditsChargedPartial === "boolean" ? { creditsChargedPartial } : {}),
              ...(typeof creditsChargeAttempted === "boolean" ? { creditsChargeAttempted } : {}),
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
  if (idx >= 0) {
    const prev = events[idx];
    // Merge patches so callbacks (recording/transcription) don't clobber each other.
    // Preserve the original createdAtIso for stable ordering.
    events[idx] = {
      ...prev,
      ...nextEvent,
      createdAtIso: prev.createdAtIso || nextEvent.createdAtIso,
    };
  } else {
    events.unshift(nextEvent);
  }

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

export async function deleteAiReceptionistCallEvent(ownerId: string, callSid: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = String(callSid || "").trim();
  if (!sid) return { ok: false, error: "Missing call sid" };

  const data = await getAiReceptionistServiceData(ownerId);
  const before = data.events.length;
  const events = data.events.filter((e) => String(e.callSid || "").trim() !== sid);
  if (events.length === before) return { ok: false, error: "Call not found" };

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

  return { ok: true };
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
