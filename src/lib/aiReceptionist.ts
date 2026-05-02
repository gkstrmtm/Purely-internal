import crypto from "crypto";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { prisma } from "@/lib/db";
import { findPortalContactByPhone } from "@/lib/portalContacts";
import { getPortalServiceStatusesForOwner } from "@/lib/portalServicesStatus";
import { normalizePhoneStrict } from "@/lib/phone";
import { upsertHoursSavedEvent } from "@/lib/hoursSaved";

const SERVICE_SLUG = "ai-receptionist";
const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

const MAX_EVENTS = 200;
const MAX_GREETING_LEN = 360;
const MAX_PROMPT_LEN = 6000;

function cleanPromptLine(value: unknown, maxLen = 280) {
  return String(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

type AiReceptionistServiceStatuses = Record<string, { state: string; label: string }>;

function normalizeAiReceptionistServiceStatuses(
  result:
    | { statuses?: Record<string, { state: string; label: string }> | null | undefined }
    | Record<string, { state: string; label: string }>
    | null
    | undefined,
): AiReceptionistServiceStatuses | null {
  if (!result) return null;
  const maybeWrapped = result as { statuses?: Record<string, { state: string; label: string }> | null | undefined };
  if (maybeWrapped.statuses && typeof maybeWrapped.statuses === "object" && !Array.isArray(maybeWrapped.statuses)) {
    return maybeWrapped.statuses as AiReceptionistServiceStatuses;
  }
  return result as AiReceptionistServiceStatuses;
}

function buildAiReceptionistServiceContext(statuses: AiReceptionistServiceStatuses | null | undefined): string {
  if (!statuses) return "";

  const activeServices = PORTAL_SERVICES.filter((service) => {
    if (service.hidden) return false;
    const state = String(statuses[service.slug]?.state || "").trim().toLowerCase();
    return state === "active" || state === "needs_setup";
  }).slice(0, 10);

  if (!activeServices.length) return "";

  const lines = [
    "BUSINESS_SERVICES (use these concrete offerings when the customer asks what the business does):",
    ...activeServices.map((service) => {
      const description = cleanPromptLine(service.description, 160);
      const highlights = Array.isArray(service.highlights)
        ? service.highlights.map((item) => cleanPromptLine(item, 90)).filter(Boolean).slice(0, 2)
        : [];
      const status = cleanPromptLine(statuses[service.slug]?.label || "", 40);
      return [
        `- ${service.title}${status ? ` (${status})` : ""}: ${description}`,
        highlights.length ? `  Highlights: ${highlights.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ];

  return lines.join("\n");
}

function normalizeServiceReplyTitle(service: { slug: string; title: string }) {
  switch (service.slug) {
    case "funnel-builder":
      return "funnels and lead capture";
    case "inbox":
      return "shared inbox and SMS/email follow-up";
    case "ai-receptionist":
      return "AI receptionist";
    case "booking":
      return "booking automation";
    case "reviews":
      return "review requests";
    case "newsletter":
      return "newsletters";
    case "lead-scraping":
      return "lead scraping";
    case "automations":
      return "custom automations";
    case "ai-outbound-calls":
      return "AI outbound";
    case "blogs":
      return "automated blogs";
    default:
      return cleanPromptLine(service.title, 60).toLowerCase();
  }
}

function joinHumanList(items: string[]) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function normalizeInboundIntentText(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPriorConversation(historyText?: string | null) {
  return Boolean(String(historyText || "").trim());
}

function isGreetingOnlyIntent(raw: string) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|sup|what'?s up)[!., ]*$/i.test(String(raw || "").trim());
}

function isAcknowledgementIntent(raw: string) {
  return /^(got it|ok|okay|kk|sounds good|understood|cool|nice|perfect|thanks|thank you|appreciate it)[!., ]*$/i.test(String(raw || "").trim());
}

function isTestingIntent(raw: string) {
  const text = normalizeInboundIntentText(raw);
  if (/\b(test|testing|capability|workflow|sms)\b/.test(text)) return true;
  if (/\b(check|checking)\b/.test(text) && /\b(sms|reply|replies|flow|system)\b/.test(text)) return true;
  if (/\b(working|works)\b/.test(text) && /\b(sms|reply|replies|flow|system)\b/.test(text)) return true;
  return false;
}

function isOwnerIntent(raw: string) {
  const text = normalizeInboundIntentText(raw);
  return /\b(owner|founder)\b/.test(text) || /purely'?s owner/.test(text);
}

function isServiceListIntent(raw: string, historyText?: string | null) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return false;
  if (/(list\s+(your\s+)?services|what\s+(services|do\s+you\s+offer)|services\s+pls|what\s+can\s+you\s+help\s+with|what\s+do\s+you\s+guys\s+do|what\s+does\s+the\s+business\s+offer)/i.test(text)) {
    return true;
  }
  if (/(list\s+them(\s+all)?|list\s+all\s+of\s+them|what\s+are\s+they)/i.test(text)) {
    const history = String(historyText || "").toLowerCase();
    return /service|offer|automation|help with/.test(history);
  }
  return false;
}

function asksForSchedulingAvailability(raw: string) {
  const text = normalizeInboundIntentText(raw);
  return /(what|which) (day|time)/.test(text) || /when works/.test(text) || /(what day works best|what time works best|when are you available)/.test(text);
}

function looksLikeAvailabilityAnswer(raw: string) {
  const text = normalizeInboundIntentText(raw);
  return /(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|tonight|am|pm|\b\d{1,2}(:\d{2})?\b)/.test(text);
}

export type AiReceptionistSmsConversationTurn = {
  role: "assistant" | "customer";
  content: string;
};

function extractCustomerGoal(historyTurns: AiReceptionistSmsConversationTurn[], inbound: string) {
  const customerTurns = historyTurns.filter((turn) => turn.role === "customer").map((turn) => turn.content).filter(Boolean);
  const seed = customerTurns.find((turn) => turn.length >= 8) || customerTurns[0] || cleanPromptLine(inbound, 220);
  return cleanPromptLine(seed, 220);
}

function extractPendingAssistantQuestion(lastAssistant: string) {
  const value = cleanPromptLine(lastAssistant, 220);
  return looksLikeQuestion(value) ? value : "";
}

function summarizeReceptionistIntent(raw: string, historyText?: string | null) {
  if (isServiceListIntent(raw, historyText)) return "The customer is asking what services the business offers.";
  if (isOwnerIntent(raw) && isTestingIntent(raw)) return "The customer is confirming the SMS flow and identifying themselves as the business owner.";
  if (isTestingIntent(raw)) return "The customer is testing the SMS conversation flow.";
  if (isAcknowledgementIntent(raw)) return "The customer is acknowledging the previous reply and waiting for the next useful step.";
  if (isGreetingOnlyIntent(raw)) return "The customer is greeting the business.";
  const trimmed = cleanPromptLine(raw, 220);
  return trimmed ? `Latest customer message intent: ${trimmed}` : "The customer is continuing the conversation.";
}

function looksLikeQuestion(raw: string) {
  const text = String(raw || "").trim();
  return /\?$/.test(text) || /^(what|when|where|which|who|how|are|is|do|did|can|could|would|should)\b/i.test(text);
}

function trimConversationTurns(turns: AiReceptionistSmsConversationTurn[], maxTurns = 10) {
  return turns
    .map((turn) => ({ role: turn.role, content: cleanPromptLine(turn.content, 320) }))
    .filter((turn) => Boolean(turn.content))
    .slice(-Math.max(1, maxTurns));
}

export function buildAiReceptionistSmsConversationContext(opts: {
  inbound: string;
  historyTurns?: AiReceptionistSmsConversationTurn[];
  contactName?: string | null;
  contactContextNote?: string | null;
}) {
  const historyTurns = trimConversationTurns(Array.isArray(opts.historyTurns) ? opts.historyTurns : []);
  const inbound = cleanPromptLine(opts.inbound, 400);
  const lastAssistant = [...historyTurns].reverse().find((turn) => turn.role === "assistant")?.content || "";
  const lastCustomer = [...historyTurns].reverse().find((turn) => turn.role === "customer")?.content || "";
  const currentCustomerGoal = extractCustomerGoal(historyTurns, inbound);
  const pendingAssistantQuestion = extractPendingAssistantQuestion(lastAssistant);
  const likelyReplyingToAssistant = Boolean(historyTurns.length && lastAssistant && looksLikeQuestion(lastAssistant));
  const likelyAnsweringPendingQuestion = Boolean(likelyReplyingToAssistant && pendingAssistantQuestion && !isGreetingOnlyIntent(inbound) && !isAcknowledgementIntent(inbound));
  const likelyAnsweringSchedulingQuestion = Boolean(likelyReplyingToAssistant && asksForSchedulingAvailability(lastAssistant) && looksLikeAvailabilityAnswer(inbound));
  const contactName = cleanPromptLine(opts.contactName, 120);
  const contactContextNote = cleanPromptLine(opts.contactContextNote, 600);
  const transcript = historyTurns
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "Customer"}: ${turn.content}`)
    .join("\n");

  const context = [
    "THREAD_CONTEXT (authoritative):",
    `- Existing conversation: ${historyTurns.length ? "yes" : "no"}`,
    contactName ? `- Contact name: ${contactName}` : "",
    contactContextNote ? `- ${contactContextNote}` : "",
    historyTurns.length ? `- Prior turn count: ${historyTurns.length}` : "",
    lastAssistant ? `- Last assistant message: ${lastAssistant}` : "",
    lastCustomer ? `- Last customer message before the latest SMS: ${lastCustomer}` : "",
    currentCustomerGoal ? `- Current customer goal: ${currentCustomerGoal}` : "",
    pendingAssistantQuestion ? `- Pending assistant question: ${pendingAssistantQuestion}` : "",
    likelyReplyingToAssistant ? "- Latest inbound message is likely answering or continuing the assistant's previous prompt." : "",
    likelyAnsweringPendingQuestion ? "- Latest inbound message should be treated as a direct answer to the pending assistant question." : "",
    likelyAnsweringSchedulingQuestion ? "- Latest inbound message appears to answer the assistant's scheduling or availability question." : "",
    `- ${summarizeReceptionistIntent(inbound, transcript)}`,
    historyTurns.length
      ? "- Continue this exact thread. Do not restart the conversation, do not greet again, and do not ask generic opener questions."
      : "- This is a fresh conversation, so a normal greeting is allowed if helpful.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    hasPriorConversation: historyTurns.length > 0,
    transcript,
    context,
    likelyReplyingToAssistant,
    likelyAnsweringPendingQuestion,
    likelyAnsweringSchedulingQuestion,
    lastAssistant,
    lastCustomer,
  };
}

export function buildAiReceptionistSmsUserPrompt(opts: {
  inbound: string;
  conversationContext: string;
  transcript?: string | null;
}) {
  return [
    opts.conversationContext,
    opts.transcript ? `Conversation so far:\n${String(opts.transcript || "").trim()}` : "",
    "Latest inbound SMS:",
    cleanPromptLine(opts.inbound, 2000),
    "Write the next SMS reply text only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeAiReceptionistSmsReplyText(opts: {
  raw: string;
  hasPriorConversation?: boolean;
  maxLen?: number;
}) {
  const text = String(opts.raw || "").trim();
  if (!text) return "";

  let oneLine = text.replace(/\s+/g, " ").trim();
  if (opts.hasPriorConversation) {
    oneLine = oneLine
      .replace(/^(hi|hello|hey|hi there|hello there|hey there)([!,.\s]+)(?=[a-z0-9])/i, "")
      .replace(/^(thanks for testing(?: our)?(?: sms)? capability[!,.\s]*)/i, "")
      .replace(/^(thanks for testing[!,.\s]*)/i, "")
      .replace(/^(just checking in[!,.\s]*)/i, "")
      .replace(/^(if you have any questions or need assistance, feel free to ask[!,.\s]*)/i, "")
      .replace(/^(how can i (help|assist) you today\??[!,.\s]*)/i, "")
      .trim();
  }

  if (!oneLine) return "";
  const maxLen = Math.max(80, Math.floor(Number(opts.maxLen || 320)));
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen - 1)}…` : oneLine;
}

export async function tryBuildAiReceptionistDeterministicSmsReply(opts: {
  ownerId: string;
  inbound: string;
  historyText?: string | null;
  settings?: Pick<AiReceptionistSettings, "businessName"> | Record<string, unknown> | null;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  if (!ownerId) return null;

  const hasHistory = hasPriorConversation(opts.historyText);
  const businessName = cleanPromptLine((opts.settings as any)?.businessName, 80) || "the business";
  const history = String(opts.historyText || "").trim();
  const historyLines = history ? history.split(/\n+/).filter(Boolean) : [];
  const lastAssistantLine = [...historyLines].reverse().find((line) => /^Assistant:\s*/i.test(line)) || "";
  const lastAssistant = lastAssistantLine.replace(/^Assistant:\s*/i, "").trim();

  if (hasHistory && asksForSchedulingAvailability(lastAssistant) && looksLikeAvailabilityAnswer(opts.inbound)) {
    const availability = cleanPromptLine(opts.inbound, 120);
    return `Got it - ${availability}. If you want, I can help you lock in a specific time or point you to the booking link.`;
  }

  if (hasHistory && isOwnerIntent(opts.inbound) && isTestingIntent(opts.inbound)) {
    return `Got it - ${businessName} SMS replies are live and working. I can help with services, booking, inbox, follow-up, and automations whenever you need it.`;
  }

  if (hasHistory && isTestingIntent(opts.inbound)) {
    return "Got it - SMS replies are working. If you want to test something specific next, tell me what you want to check.";
  }

  if (hasHistory && isAcknowledgementIntent(opts.inbound)) {
    return "Got it. Tell me what you need next and I’ll keep it moving.";
  }

  if (isGreetingOnlyIntent(opts.inbound)) {
    return hasHistory ? "What do you need?" : "How can I help you today?";
  }

  if (!isServiceListIntent(opts.inbound, opts.historyText)) return null;

  const statusResult = await getPortalServiceStatusesForOwner({ ownerId, fallbackEmail: null, portalVariant: "portal" }).catch(() => null);
  const statuses = normalizeAiReceptionistServiceStatuses(statusResult);
  const prioritizedSlugs = [
    "funnel-builder",
    "inbox",
    "booking",
    "reviews",
    "newsletter",
    "ai-receptionist",
    "lead-scraping",
    "automations",
    "ai-outbound-calls",
    "blogs",
  ];

  const prioritizedServices = prioritizedSlugs
    .map((slug) => PORTAL_SERVICES.find((service) => service.slug === slug))
    .filter((service): service is NonNullable<typeof service> => Boolean(service && !service.hidden));

  const picked = prioritizedServices
    .filter((service) => {
      const state = String(statuses?.[service.slug]?.state || "").trim().toLowerCase();
      return state === "active" || state === "needs_setup";
    })
    .slice(0, 6);

  const finalServices = (picked.length ? picked : prioritizedServices.slice(0, 6)).slice(0, 6);
  if (!finalServices.length) return null;

  const serviceBusinessName = cleanPromptLine((opts.settings as any)?.businessName, 80) || "We";
  const services = joinHumanList(finalServices.map((service) => normalizeServiceReplyTitle(service)));
  const prefix = serviceBusinessName === "We" ? serviceBusinessName : `${serviceBusinessName} helps with`;
  const reply = `${prefix} ${services}. If you want, I can point you to the best fit for what you're trying to automate.`
    .replace(/\s+/g, " ")
    .trim();

  return reply.length > 320 ? `${reply.slice(0, 317).trimEnd()}...` : reply;
}

export async function buildAiReceptionistSmsSystemPrompt(opts: {
  ownerId: string;
  settings: Pick<AiReceptionistSettings, "businessName" | "systemPrompt" | "smsSystemPrompt"> | Record<string, unknown>;
  conversationContext?: string | null;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  const settings = opts.settings ?? {};

  const businessName = cleanPromptLine((settings as any).businessName, 200);
  const smsPrompt = cleanPromptLine((settings as any).smsSystemPrompt, 4000);
  const basePrompt = smsPrompt || cleanPromptLine((settings as any).systemPrompt, 4000);

  const [businessProfileContext, serviceStatusResult] = await Promise.all([
    ownerId ? getBusinessProfileAiContext(ownerId).catch(() => "") : Promise.resolve(""),
    ownerId
      ? getPortalServiceStatusesForOwner({ ownerId, fallbackEmail: null, portalVariant: "portal" }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const serviceStatuses = normalizeAiReceptionistServiceStatuses(serviceStatusResult);
  const serviceContext = buildAiReceptionistServiceContext(serviceStatuses);

  return [
    basePrompt || "You are a helpful receptionist.",
    "You are replying via SMS.",
    "Treat the recent conversation as the active thread context. Continue naturally and do not ask the customer to repeat or clarify details that are already clear from the thread.",
    "If the thread context says this is an existing conversation, continue from the last turn instead of starting over.",
    "If the latest inbound message looks like an answer to the assistant's previous message, treat it as a continuation of that exchange.",
    "Use the current customer goal and pending assistant question from the thread context as the primary guide for the next reply.",
    "When the latest inbound message directly answers the pending assistant question, use that answer immediately and move the conversation forward.",
    "Do not say 'hi', 'thanks for clarifying', or similar filler when the customer is already mid-thread unless that acknowledgement is truly necessary.",
    "Keep replies concise: 1-3 short sentences, under 320 characters when possible.",
    "No markdown. No long lists. Ask at most one question, and only when the next step is genuinely unclear.",
    "If the customer asks about services, what the business offers, or what you can help with, answer directly using the business context below before asking any follow-up.",
    businessName ? `Business name: ${businessName}` : "",
    opts.conversationContext ? String(opts.conversationContext).trim() : "",
    businessProfileContext,
    serviceContext,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_PROMPT_LEN);
}

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
  // If include list is non-empty, only contacts with ANY included tag will be answered by the AI receptionist.
  voiceIncludeTagIds: string[];
  // If exclude list matches ANY tag, do not let the AI receptionist answer.
  voiceExcludeTagIds: string[];
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
      ? Math.max(0, Math.min(5, Math.floor(rec.crawlDepth)))
      : 0;
  const maxUrls =
    typeof rec.maxUrls === "number" && Number.isFinite(rec.maxUrls) ? Math.max(0, Math.min(1000, Math.floor(rec.maxUrls))) : 0;
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
  contactId?: string;
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
    voiceIncludeTagIds: [],
    voiceExcludeTagIds: [],
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

  const voiceIncludeTagIds = normalizeTagIds((rec as any).voiceIncludeTagIds);
  const voiceExcludeTagIds = normalizeTagIds((rec as any).voiceExcludeTagIds);
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
    voiceIncludeTagIds,
    voiceExcludeTagIds,
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

  const events = await Promise.all(
    parsed.events.map(async (event) => {
      const rawPhone = String(event.contactPhone || event.from || "").trim();
      if (!rawPhone) return event;
      const match = await findPortalContactByPhone({ ownerId, phone: rawPhone }).catch(() => null);
      if (!match?.id) return event;
      return { ...event, contactId: match.id };
    }),
  );

  return { version: 1, settings, events };
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
