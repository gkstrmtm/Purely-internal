import crypto from "crypto";

import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { upsertHoursSavedEvent } from "@/lib/hoursSaved";

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

export type AiReceptionistKnowledgeBaseLocator = {
  id: string;
  name: string;
  type: "file" | "url" | "text" | "folder";
  usage_mode?: "auto" | "prompt";
};

export type AiReceptionistKnowledgeBase = {
  version: 1;
  seedUrl: string;
  crawlDepth: number;
  maxUrls: number;
  text: string;
  locators?: AiReceptionistKnowledgeBaseLocator[];
  lastSyncedAtIso?: string;
  lastSyncError?: string;
  updatedAtIso?: string;
};

export type AiReceptionistSettings = {
  version: 1;
  enabled: boolean;
  mode: AiReceptionistMode;

  webhookToken: string;

  businessName: string;
  greeting: string;
  systemPrompt: string;

  // Inbound SMS auto-replies (separate from voice calls).
  smsEnabled: boolean;
  smsSystemPrompt: string;
  // If include list is non-empty, only contacts with ANY included tag will get a reply.
  smsIncludeTagIds: string[];
  // If exclude list matches ANY tag, do not reply.
  smsExcludeTagIds: string[];

  // If enabled, the voice agent is allowed to decide to transfer the call to a human.
  // (Requires a forward/transfer phone number and compatible voice-agent tools.)
  aiCanTransferToHuman: boolean;

  forwardToPhoneE164: string | null;

  // Messaging/chat agent (used by portal tools like funnels; separate from voice).
  chatAgentId: string;

  // Optional manual override for the messaging/chat agent id (support-provided).
  // When set, the system should use this agent id as-is.
  manualChatAgentId: string;

  // Optional manual override for the voice agent id (support-provided).
  // When set, the system should use this agent id as-is.
  manualAgentId: string;

  // Knowledge bases applied to the voice and SMS/chat agents.
  voiceKnowledgeBase: AiReceptionistKnowledgeBase | null;
  smsKnowledgeBase: AiReceptionistKnowledgeBase | null;

  voiceAgentId: string;
  // Optional selected voice id (applied during agent sync).
  voiceId: string;
  voiceAgentApiKey: string | null;
};

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function normalizeKnowledgeBaseLocators(raw: unknown): AiReceptionistKnowledgeBaseLocator[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: AiReceptionistKnowledgeBaseLocator[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim().slice(0, 200) : "";
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
    const typeRaw = typeof r.type === "string" ? r.type.trim().toLowerCase() : "";
    const type =
      typeRaw === "file" || typeRaw === "url" || typeRaw === "text" || typeRaw === "folder" ? (typeRaw as any) : null;
    const usageRaw = typeof (r as any).usage_mode === "string" ? String((r as any).usage_mode).trim().toLowerCase() : "";
    const usage_mode = usageRaw === "prompt" ? "prompt" : usageRaw === "auto" ? "auto" : undefined;
    if (!id || !name || !type) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, type, ...(usage_mode ? { usage_mode } : {}) });
    if (out.length >= 120) break;
  }
  return out;
}

function parseKnowledgeBase(raw: unknown, prev?: AiReceptionistKnowledgeBase | null): AiReceptionistKnowledgeBase | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prev ?? null;
  const rec = raw as Record<string, unknown>;
  const seedUrl = typeof rec.seedUrl === "string" ? normalizeUrl(rec.seedUrl.trim().slice(0, 500)) : "";
  const crawlDepth =
    typeof rec.crawlDepth === "number" && Number.isFinite(rec.crawlDepth)
      ? Math.max(0, Math.min(3, Math.floor(rec.crawlDepth)))
      : 0;
  const maxUrls =
    typeof rec.maxUrls === "number" && Number.isFinite(rec.maxUrls) ? Math.max(0, Math.min(100, Math.floor(rec.maxUrls))) : 0;
  const text = typeof rec.text === "string" ? rec.text.trim().slice(0, 20000) : "";
  const locators = normalizeKnowledgeBaseLocators(rec.locators);
  const lastSyncedAtIso = typeof rec.lastSyncedAtIso === "string" ? rec.lastSyncedAtIso.trim().slice(0, 40) : "";
  const lastSyncError = typeof rec.lastSyncError === "string" ? rec.lastSyncError.trim().slice(0, 800) : "";
  const updatedAtIso = typeof rec.updatedAtIso === "string" ? rec.updatedAtIso.trim().slice(0, 40) : "";

  return {
    version: 1,
    seedUrl,
    crawlDepth,
    maxUrls,
    text,
    locators,
    ...(lastSyncedAtIso ? { lastSyncedAtIso } : {}),
    ...(lastSyncError ? { lastSyncError } : {}),
    ...(updatedAtIso ? { updatedAtIso } : {}),
  };
}

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

  // Notification guards (Twilio callbacks may be retried).
  smsNotesSentAtIso?: string;
  smsTranscriptSentAtIso?: string;
  emailTranscriptSentAtIso?: string;
  emailRecordingSentAtIso?: string;

  // Last-known notification errors (useful for debugging Postmark/env issues).
  smsTranscriptSendError?: string;
  emailTranscriptSendError?: string;
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

    smsEnabled: false,
    smsSystemPrompt: "",
    smsIncludeTagIds: [],
    smsExcludeTagIds: [],

    aiCanTransferToHuman: false,

    forwardToPhoneE164: null,

    chatAgentId: prev?.chatAgentId ?? "",

    manualChatAgentId: prev?.manualChatAgentId ?? "",

    manualAgentId: prev?.manualAgentId ?? "",

    voiceKnowledgeBase: prev?.voiceKnowledgeBase ?? null,
    smsKnowledgeBase: prev?.smsKnowledgeBase ?? null,

    voiceAgentId: "",
    voiceId: prev?.voiceId ?? "",
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

  const smsEnabled = typeof (rec as any).smsEnabled === "boolean" ? Boolean((rec as any).smsEnabled) : base.smsEnabled;
  const smsSystemPrompt = typeof (rec as any).smsSystemPrompt === "string"
    ? String((rec as any).smsSystemPrompt).trim().slice(0, MAX_PROMPT_LEN)
    : base.smsSystemPrompt;

  const normalizeTagIds = (value: unknown): string[] => {
    const raw = Array.isArray(value) ? value : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of raw) {
      const id = typeof x === "string" ? x.trim().slice(0, 80) : "";
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= 60) break;
    }
    return out;
  };

  const smsIncludeTagIds = normalizeTagIds((rec as any).smsIncludeTagIds);
  const smsExcludeTagIds = normalizeTagIds((rec as any).smsExcludeTagIds);

  let forwardToPhoneE164: string | null = null;
  if (typeof rec.forwardToPhoneE164 === "string" && rec.forwardToPhoneE164.trim()) {
    const parsed = normalizePhoneStrict(rec.forwardToPhoneE164);
    if (parsed.ok) forwardToPhoneE164 = parsed.e164;
  }

  const webhookToken =
    typeof rec.webhookToken === "string" && rec.webhookToken.trim().length >= 12
      ? rec.webhookToken.trim()
      : base.webhookToken;

  const chatAgentIdRaw =
    typeof (rec as any).chatAgentId === "string"
      ? (rec as any).chatAgentId
      : typeof (rec as any).messagingAgentId === "string"
        ? (rec as any).messagingAgentId
        : typeof (rec as any).chatAgent === "string"
          ? (rec as any).chatAgent
          : "";
  const chatAgentId = String(chatAgentIdRaw || "").trim().slice(0, 120) || base.chatAgentId;

  const manualChatAgentIdRaw =
    typeof (rec as any).manualChatAgentId === "string"
      ? (rec as any).manualChatAgentId
      : typeof (rec as any).manualMessagingAgentId === "string"
        ? (rec as any).manualMessagingAgentId
        : typeof (rec as any).manualSmsAgentId === "string"
          ? (rec as any).manualSmsAgentId
          : "";
  const manualChatAgentId = String(manualChatAgentIdRaw || "").trim().slice(0, 120) || base.manualChatAgentId;

  const manualAgentIdRaw =
    typeof (rec as any).manualAgentId === "string"
      ? (rec as any).manualAgentId
      : typeof (rec as any).websiteAgentId === "string"
        ? (rec as any).websiteAgentId
        : typeof (rec as any).websiteChatAgentId === "string"
          ? (rec as any).websiteChatAgentId
          : "";
  const manualAgentId = String(manualAgentIdRaw || "").trim().slice(0, 120) || base.manualAgentId;

  const voiceKnowledgeBaseRaw =
    (rec as any).voiceKnowledgeBase ??
    (rec as any).voiceKB ??
    (rec as any).voiceKnowledge ??
    (rec as any).knowledgeBase ??
    null;
  const smsKnowledgeBaseRaw =
    (rec as any).smsKnowledgeBase ?? (rec as any).smsKB ?? (rec as any).smsKnowledge ?? (rec as any).chatKnowledgeBase ?? null;

  const voiceKnowledgeBase = parseKnowledgeBase(voiceKnowledgeBaseRaw, base.voiceKnowledgeBase);
  const smsKnowledgeBase = parseKnowledgeBase(smsKnowledgeBaseRaw, base.smsKnowledgeBase);

  const voiceAgentIdRaw =
    typeof rec.voiceAgentId === "string"
      ? rec.voiceAgentId
      : (typeof rec.elevenLabsAgentId === "string" ? rec.elevenLabsAgentId : "");
  const voiceAgentId = voiceAgentIdRaw.trim().slice(0, 120) || base.voiceAgentId;

  const voiceIdRaw = typeof (rec as any).voiceId === "string" ? String((rec as any).voiceId) : "";
  const voiceId = voiceIdRaw.trim().slice(0, 200) || base.voiceId;

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

    smsEnabled,
    smsSystemPrompt,
    smsIncludeTagIds,
    smsExcludeTagIds,
    aiCanTransferToHuman,
    forwardToPhoneE164,
    chatAgentId,
    manualChatAgentId,
    manualAgentId,
    voiceKnowledgeBase,
    smsKnowledgeBase,
    voiceAgentId,
    voiceId,
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

          const smsNotesSentAtIso = typeof (r as any).smsNotesSentAtIso === "string" ? String((r as any).smsNotesSentAtIso).trim() : "";
          const smsTranscriptSentAtIso = typeof (r as any).smsTranscriptSentAtIso === "string" ? String((r as any).smsTranscriptSentAtIso).trim() : "";
          const emailTranscriptSentAtIso = typeof (r as any).emailTranscriptSentAtIso === "string" ? String((r as any).emailTranscriptSentAtIso).trim() : "";
          const emailRecordingSentAtIso = typeof (r as any).emailRecordingSentAtIso === "string" ? String((r as any).emailRecordingSentAtIso).trim() : "";

          const smsTranscriptSendError = typeof (r as any).smsTranscriptSendError === "string" ? String((r as any).smsTranscriptSendError).trim() : "";
          const emailTranscriptSendError = typeof (r as any).emailTranscriptSendError === "string" ? String((r as any).emailTranscriptSendError).trim() : "";

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
              ...(smsNotesSentAtIso ? { smsNotesSentAtIso: smsNotesSentAtIso.slice(0, 40) } : {}),
              ...(smsTranscriptSentAtIso ? { smsTranscriptSentAtIso: smsTranscriptSentAtIso.slice(0, 40) } : {}),
              ...(emailTranscriptSentAtIso ? { emailTranscriptSentAtIso: emailTranscriptSentAtIso.slice(0, 40) } : {}),
              ...(emailRecordingSentAtIso ? { emailRecordingSentAtIso: emailRecordingSentAtIso.slice(0, 40) } : {}),
              ...(smsTranscriptSendError ? { smsTranscriptSendError: smsTranscriptSendError.slice(0, 400) } : {}),
              ...(emailTranscriptSendError ? { emailTranscriptSendError: emailTranscriptSendError.slice(0, 400) } : {}),
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

  // Persist hours saved outside the JSON event log (which is capped at 200 entries).
  try {
    const merged = idx >= 0 ? events[idx] : nextEvent;
    const isCompleted = String(merged.status || "").toUpperCase() === "COMPLETED";
    const durationSec = typeof merged.recordingDurationSec === "number" && Number.isFinite(merged.recordingDurationSec)
      ? Math.max(0, Math.floor(merged.recordingDurationSec))
      : 0;
    if (isCompleted && durationSec > 0) {
      const occurredAt = (() => {
        const raw = typeof merged.createdAtIso === "string" ? merged.createdAtIso : "";
        const d = raw ? new Date(raw) : null;
        return d && Number.isFinite(d.getTime()) ? d : null;
      })();

      await upsertHoursSavedEvent({
        ownerId,
        kind: "ai_receptionist_call",
        sourceId: String(merged.callSid || "").trim(),
        secondsSaved: durationSec * 2,
        occurredAt,
      });
    }
  } catch {
    // Best-effort only; do not block webhook processing.
  }
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
