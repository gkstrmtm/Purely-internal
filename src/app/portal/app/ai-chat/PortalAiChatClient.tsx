"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppConfirmModal, AppModal } from "@/components/AppModal";
import GlassSurface from "@/components/GlassSurface";
import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
import { useToast } from "@/components/ToastProvider";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { IconChevron, IconCopy, IconEdit, IconSchedule, IconSend, IconSendHover } from "@/app/portal/PortalIcons";
import { PORTAL_SERVICES, type PortalService } from "@/app/portal/services/catalog";
import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import { PURA_AI_PROFILE_OPTIONS, normalizePuraAiProfile, type PuraAiProfile } from "@/lib/puraAiProfile";
import { PURA_WELCOME_PROMPT_LIBRARY as WELCOME_PROMPT_LIBRARY, type PromptChipDefinition } from "@/lib/puraWelcomePrompts";
import { buildPortalAiChatThreadHref, parsePortalAiChatThreadRef } from "@/lib/portalAiChatThreadRefs";
import { usePuraCanvasUiBridgeClient, type PuraCanvasUiAction } from "@/lib/puraCanvasUiBridge.client";

const SCHEDULED_ACTION_PREFIX = "__PURA_SCHEDULED_ACTION__";

function tryParseScheduledEnvelopeForUi(textRaw: string): { title: string; stepsCount: number } | null {
  const t = String(textRaw || "").trim();
  if (!t.startsWith(SCHEDULED_ACTION_PREFIX)) return null;

  const afterPrefix = t.slice(SCHEDULED_ACTION_PREFIX.length).trim();
  const start = afterPrefix.indexOf("{");
  const end = afterPrefix.lastIndexOf("}");
  if (start < 0 || end <= start) return { title: "Scheduled task", stepsCount: 0 };

  try {
    const obj = JSON.parse(afterPrefix.slice(start, end + 1));
    const workTitle = typeof obj?.workTitle === "string" ? obj.workTitle.trim() : "";
    const steps = Array.isArray(obj?.steps) ? obj.steps : [];
    const firstStepTitle = typeof steps?.[0]?.title === "string" ? String(steps[0].title).trim() : "";
    const firstStepKey = typeof steps?.[0]?.key === "string" ? String(steps[0].key).trim() : "";
    const title = (workTitle || firstStepTitle || firstStepKey || "Scheduled task").slice(0, 200);
    return { title, stepsCount: steps.length };
  } catch {
    return { title: "Scheduled task", stepsCount: 0 };
  }
}

type AmbiguousContact = { name: string; email?: string | null; phone?: string | null };

type AssistantChoice =
  | {
      type: "booking_calendar";
      calendarId: string;
      label: string;
      description?: string;
    }
  | {
      type: "entity";
      kind: string;
      value: string;
      label: string;
      description?: string;
    };

type Thread = {
  id: string;
  title: string;
  lastMessageAt: string | null;
  isPinned: boolean;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  liveStatus?: LiveStatus | null;
  latestRunStatus?: ThreadRunStatus | null;
  nextStepContext?: NextStepContext | null;
  chatMode?: ChatMode | null;
  responseProfile?: PuraAiProfile | null;
};

type ThreadRunStatus = {
  status: string;
  runId?: string | null;
  updatedAt?: string | null;
};

type UnresolvedRunStatus = "needs_input" | "failed" | "interrupted" | "partial";

type UnresolvedRun = {
  status: UnresolvedRunStatus;
  runId?: string | null;
  updatedAt?: string | null;
  workTitle?: string | null;
  summaryText?: string | null;
  userRequest?: string | null;
  lastCompletedTitle?: string | null;
  canvasUrl?: string | null;
};

type NextStepContext = {
  updatedAt?: string | null;
  objective?: string | null;
  workTitle?: string | null;
  summaryText?: string | null;
  suggestedPrompt?: string | null;
  suggestions: string[];
  canvasUrl?: string | null;
};

type WorkingMemory = {
  threadSummary?: string | null;
  threadSummaryUpdatedAt?: string | null;
  recentRuns: RunTrace[];
};

function threadTimestampValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareThreadsForSidebar(a: Thread, b: Thread): number {
  if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
  const pinnedDelta = threadTimestampValue(b.pinnedAt) - threadTimestampValue(a.pinnedAt);
  if (pinnedDelta !== 0) return pinnedDelta;

  const lastMessageDelta = threadTimestampValue(b.lastMessageAt) - threadTimestampValue(a.lastMessageAt);
  if (lastMessageDelta !== 0) return lastMessageDelta;
  return threadTimestampValue(b.updatedAt) - threadTimestampValue(a.updatedAt);
}

function readStoredDraftChatMode(): ChatMode {
  if (typeof window === "undefined") return "plan";
  try {
    return normalizeThreadChatMode(window.localStorage.getItem(PURA_CHAT_DEFAULT_MODE_STORAGE_KEY));
  } catch {
    return "plan";
  }
}

function readStoredDraftResponseProfile(): PuraAiProfile {
  if (typeof window === "undefined") return "balanced";
  try {
    return normalizePuraAiProfile(window.localStorage.getItem(PURA_CHAT_DEFAULT_PROFILE_STORAGE_KEY));
  } catch {
    return "balanced";
  }
}

function readStoredWelcomePromptHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PURA_CHAT_WELCOME_PROMPT_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const value of parsed) {
      const id = typeof value === "string" ? value.trim().slice(0, 80) : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= 18) break;
    }
    return ids;
  } catch {
    return [];
  }
}

function writeStoredWelcomePromptHistory(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PURA_CHAT_WELCOME_PROMPT_HISTORY_STORAGE_KEY, JSON.stringify(ids.slice(0, 18)));
  } catch {}
}

function readStoredWelcomePromptRotation(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(PURA_CHAT_WELCOME_PROMPT_ROTATION_STORAGE_KEY);
    const parsed = Number.parseInt(String(raw || "0"), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeStoredWelcomePromptRotation(value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PURA_CHAT_WELCOME_PROMPT_ROTATION_STORAGE_KEY, String(Math.max(0, Math.floor(value))));
  } catch {}
}

function decodeBase64AudioBlob(base64: string, contentType: string): Blob {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType || "audio/mpeg" });
}

type ShareMember = { userId: string; email: string; name: string };

type Attachment = {
  id?: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  url: string;
};

type VisibleContextBadge = {
  kind: "service" | "page";
  label: string;
};

function looksLikeImageAttachment(a: any): boolean {
  const mime = typeof a?.mimeType === "string" ? a.mimeType.trim().toLowerCase() : "";
  if (mime.startsWith("image/")) return true;

  const name = typeof a?.fileName === "string" ? a.fileName.trim().toLowerCase() : "";
  const url = typeof a?.url === "string" ? a.url.trim().toLowerCase() : "";
  const hay = `${name} ${url}`;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(hay);
}

function safeImgSrc(src: string) {
  // Reuse href allowlisting; image src needs the same protocol constraints.
  return safeHref(src);
}

const ASSISTANT_LINK_ORIGIN = "https://purelyautomation.com";

function isInternalAssistantPath(pathname: string) {
  return (
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname === "/api/portal" ||
    pathname.startsWith("/api/portal/")
  );
}

function extractInternalAssistantPath(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw, ASSISTANT_LINK_ORIGIN);
    const path = `${url.pathname || ""}${url.search || ""}${url.hash || ""}`;
    return isInternalAssistantPath(url.pathname || "") ? path : null;
  } catch {
    return null;
  }
}

type AssistantAction = {
  key: string;
  title: string;
  confirmLabel?: string;
  args: Record<string, unknown>;
};

type RunTraceStep = {
  key: string;
  title: string;
  ok: boolean;
  linkUrl?: string | null;
};

type RunTrace = {
  at: string | null;
  workTitle: string | null;
  assistantMessageId?: string | null;
  canvasUrl?: string | null;
  steps: RunTraceStep[];
};

type RunLedgerEntry = {
  id: string;
  runId?: string | null;
  triggerKind: string;
  status: string;
  workTitle?: string | null;
  canvasUrl?: string | null;
  summaryText?: string | null;
  aiSummaryText?: string | null;
  aiSummaryGeneratedAt?: string | null;
  assistantMessageId?: string | null;
  scheduledMessageId?: string | null;
  createdAt: string;
  completedAt?: string | null;
  interruptedAt?: string | null;
  steps: RunTraceStep[];
  followUpSuggestions?: string[];
};

type LiveStatus = {
  phase: string | null;
  label: string | null;
  actionKey?: string | null;
  title?: string | null;
  updatedAt?: string | null;
  runId?: string | null;
  canInterrupt?: boolean | null;
  round?: number | null;
  completedSteps?: number | null;
  lastCompletedTitle?: string | null;
};

type CanvasUiCandidate = { role: string; name: string; tag: string; nth: number };

type Message = {
  id: string;
  role: "user" | "assistant" | string;
  text: string;
  attachmentsJson: any;
  visibleContextBadges?: VisibleContextBadge[];
  assistantActions?: AssistantAction[];
  runTrace?: RunTrace | null;
  followUpSuggestions?: string[];
  displayMode?: ChatMode;
  createdAt: string;
  sendAt: string | null;
  sentAt: string | null;
};

type ThreadUiState = {
  ambiguousContacts: AmbiguousContact[] | null;
  assistantChoices: AssistantChoice[] | null;
  canvasUiAmbiguity: { action: PuraCanvasUiAction; candidates: CanvasUiCandidate[] } | null;
  canvasUiResumeActions: PuraCanvasUiAction[] | null;
};

type ThreadDraftState = {
  input: string;
  pendingAttachments: Attachment[];
  contextServiceSlugs?: string[];
};

type ComposerPhraseMatch = {
  phrase: string;
  start: number;
  end: number;
  source: "title" | "slug" | "keyword";
  priority: number;
};

type ComposerServiceSuggestion = {
  service: PortalService;
  matchedPhrase: string | null;
  match: ComposerPhraseMatch | null;
  score: number;
};

type ComposerScheduleSuggestion = {
  matchedPhrase: string | null;
  match: ComposerPhraseMatch | null;
};

type ComposerConnectedHighlight = {
  service: PortalService;
  match: ComposerPhraseMatch;
};

type DictationPlaybackState = {
  messageId: string;
  audios: HTMLAudioElement[];
  objectUrls: string[];
  stopped: boolean;
};

type ChatMode = "plan" | "work";

const DRAFT_THREAD_KEY = "__draft__";
const PURA_CHAT_DEFAULT_MODE_STORAGE_KEY = "pura.chat.defaultMode";
const PURA_CHAT_DEFAULT_PROFILE_STORAGE_KEY = "pura.chat.defaultProfile";
const PURA_CHAT_WELCOME_PROMPT_HISTORY_STORAGE_KEY = "pura.chat.welcomePromptHistory";
const PURA_CHAT_WELCOME_PROMPT_ROTATION_STORAGE_KEY = "pura.chat.welcomePromptRotation";

function createEmptyThreadUiState(): ThreadUiState {
  return {
    ambiguousContacts: null,
    assistantChoices: null,
    canvasUiAmbiguity: null,
    canvasUiResumeActions: null,
  };
}

function createEmptyThreadDraftState(): ThreadDraftState {
  return {
    input: "",
    pendingAttachments: [],
    contextServiceSlugs: [],
  };
}

const PORTAL_CONTEXT_SERVICES = PORTAL_SERVICES.filter((service) => !service.hidden);

const COMPOSER_SERVICE_KEYWORDS: Record<string, string[]> = {
  "funnel-builder": [
    "funnel builder",
    "funnel",
    "landing page",
    "checkout page",
    "upsell page",
    "downsell page",
    "thank you page",
    "page builder",
    "website",
    "website page",
    "website settings",
    "funnel settings",
    "page settings",
    "site",
  ],
  inbox: ["inbox", "sms", "text thread", "reply", "conversation", "email inbox", "email thread", "messages", "messaging", "inbox settings"],
  newsletter: ["newsletter", "email campaign", "broadcast", "email blast", "email marketing", "campaign", "newsletter settings", "email settings", "audience"],
  booking: ["booking", "calendar", "appointment", "availability", "scheduler", "booking settings", "calendar settings", "appointment settings", "bookings"],
  "media-library": ["media library", "asset library", "image library", "video library", "upload", "uploads", "assets", "files", "photos", "videos"],
  tasks: ["task", "to do", "todo", "follow up task", "reminder", "checklist", "action item", "follow-up reminder"],
  automations: ["automation", "workflow", "sequence", "automated follow up", "trigger", "logic", "automation settings", "workflow settings"],
  blogs: ["blog", "article", "seo blog", "blog post", "content", "seo content", "post"],
  reviews: ["reviews", "review", "testimonial", "google review", "rating", "reputation", "trust", "social proof", "credibility", "customer feedback", "review settings"],
  "ai-receptionist": ["ai receptionist", "missed call", "voicemail", "call handling", "phone", "incoming call", "calls", "receptionist", "answer calls", "phone settings"],
  "ai-outbound-calls": ["outbound", "outbound call", "call", "calls", "call campaign", "dial", "dialing", "phone outreach", "cold call", "follow up call"],
  "lead-scraping": ["lead scraping", "leads", "lead", "prospects", "prospect", "lead list", "prospect list", "target leads", "scrape leads"],
  "nurture-campaigns": ["nurture campaigns", "nurture campaign", "nurture", "lead nurture", "drip campaign", "drip", "re-engagement", "long-term follow up", "follow-up campaign"],
  reporting: ["reporting", "report", "reports", "analytics", "metrics", "dashboard", "performance", "tracking", "reporting settings"],
};

const COMPOSER_SCHEDULE_KEYWORDS = [
  "schedule",
  "scheduled",
  "schedule task",
  "remind me",
  "set a reminder",
  "every day",
  "every week",
  "every month",
  "daily",
  "weekly",
  "monthly",
  "recurring",
  "repeat this",
  "run this later",
  "automatically every",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeContextServiceSlugs(raw: unknown): string[] {
  const allowed = new Set(PORTAL_CONTEXT_SERVICES.map((service) => service.slug));
  const values = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const slug = String(value || "").trim();
    if (!slug || seen.has(slug) || !allowed.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= 6) break;
  }
  return out;
}

function findPortalContextService(slug: string): PortalService | null {
  return PORTAL_CONTEXT_SERVICES.find((service) => service.slug === slug) || null;
}

function parseAttachedPortalSurface(raw: string | null | undefined): VisibleContextBadge | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value, ASSISTANT_LINK_ORIGIN);
    const path = String(url.pathname || "").trim();
    if (!path || path === "/portal/app/ai-chat") return null;

    const hostedEditorMatch = /^\/portal\/app\/services\/(booking|newsletter|reviews|blogs)\/page-editor(?:\/|$)/i.exec(path);
    if (hostedEditorMatch?.[1]) {
      const service = `${hostedEditorMatch[1].slice(0, 1).toUpperCase()}${hostedEditorMatch[1].slice(1).toLowerCase()}`;
      return { kind: "page", label: `${service} hosted page editor` };
    }

    if (/^\/portal\/app\/services\/funnel-builder\/funnels\/[^/]+\/edit(?:\/|$)/i.test(path)) {
      return { kind: "page", label: "Funnel Builder editor" };
    }

    if (/^\/portal\/app\/services\/booking\/settings(?:\/|$)/i.test(path)) {
      return { kind: "page", label: "Booking settings" };
    }

    const serviceMatch = /^\/portal\/app\/services\/([^/]+)(?:\/|$)/i.exec(path);
    if (serviceMatch?.[1]) {
      const service = findPortalContextService(String(serviceMatch[1]).trim());
      if (service) return { kind: "page", label: `${service.title} workspace` };
    }
  } catch {
    return null;
  }
  return null;
}

function buildVisibleContextBadges(opts: {
  text: string;
  contextKeys: string[];
  canvasUrl?: string | null;
  pageUrl?: string | null;
}): VisibleContextBadge[] {
  const badges: VisibleContextBadge[] = [];
  const seen = new Set<string>();

  for (const slug of normalizeContextServiceSlugs(opts.contextKeys)) {
    const service = findPortalContextService(slug);
    if (!service) continue;
    const label = String(service.title || "").trim();
    const key = `service:${label.toLowerCase()}`;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    badges.push({ kind: "service", label });
  }

  const surfaceBadge = parseAttachedPortalSurface(opts.canvasUrl || opts.pageUrl || null);
  if (surfaceBadge) {
    const key = `${surfaceBadge.kind}:${surfaceBadge.label.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      badges.push(surfaceBadge);
    }
  }

  return badges.slice(0, 4);
}

function attachVisibleContextBadges(message: Message, badges: VisibleContextBadge[]): Message {
  return badges.length ? { ...message, visibleContextBadges: badges } : message;
}

function mergeVisibleContextBadges(message: Message, fallback: Message | null | undefined, badges?: VisibleContextBadge[]): Message {
  const nextBadges =
    (Array.isArray(message.visibleContextBadges) && message.visibleContextBadges.length ? message.visibleContextBadges : null) ||
    (fallback && Array.isArray(fallback.visibleContextBadges) && fallback.visibleContextBadges.length ? fallback.visibleContextBadges : null) ||
    (Array.isArray(badges) && badges.length ? badges : null);
  return nextBadges ? { ...message, visibleContextBadges: nextBadges } : message;
}

function formatVisibleContextBadgeLine(badges: VisibleContextBadge[] | null | undefined): string {
  const items = Array.isArray(badges)
    ? badges
        .map((badge) => String(badge?.label || "").trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
  return items.length ? `Attached context: ${items.join(" • ")}` : "";
}

function findComposerPhraseMatch(inputRaw: string, phraseRaw: string): { phrase: string; start: number; end: number } | null {
  const input = String(inputRaw || "");
  const phrase = String(phraseRaw || "").trim();
  if (!input.trim() || !phrase) return null;

  const escaped = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "i");
  const match = pattern.exec(input);
  if (!match) return null;

  const prefix = match[1] || "";
  const body = match[2] || "";
  const start = match.index + prefix.length;
  const end = start + body.length;
  return { phrase: input.slice(start, end), start, end };
}

function findComposerServiceMatch(inputRaw: string, service: PortalService): ComposerPhraseMatch | null {
  const input = String(inputRaw || "");
  if (!input.trim()) return null;

  const candidatePhrases = [
    { phrase: service.title, source: "title" as const, weight: 120 },
    { phrase: service.slug.replace(/[-/]/g, " "), source: "slug" as const, weight: 96 },
    ...(COMPOSER_SERVICE_KEYWORDS[service.slug] || []).map((phrase) => ({ phrase, source: "keyword" as const, weight: 72 })),
  ];

  const seen = new Set<string>();
  const uniqueCandidates = candidatePhrases.filter((value) => {
    const stable = value.phrase.toLowerCase();
    if (!stable || seen.has(stable)) return false;
    seen.add(stable);
    return true;
  });

  let bestMatch: ComposerPhraseMatch | null = null;
  for (const phrase of uniqueCandidates) {
    const match = findComposerPhraseMatch(input, phrase.phrase);
    if (!match) continue;
    const priority = phrase.weight + phrase.phrase.length;
    if (!bestMatch || priority > bestMatch.priority || (priority === bestMatch.priority && match.start < bestMatch.start)) {
      bestMatch = {
        phrase: match.phrase,
        start: match.start,
        end: match.end,
        source: phrase.source,
        priority,
      };
    }
  }

  return bestMatch;
}

function findComposerServiceMatchedPhrase(inputRaw: string, service: PortalService): string | null {
  return findComposerServiceMatch(inputRaw, service)?.phrase?.trim() || null;
}

function findComposerKeywordSuggestion(inputRaw: string, phrases: string[], weight = 84): ComposerPhraseMatch | null {
  const input = String(inputRaw || "");
  if (!input.trim()) return null;

  const uniquePhrases = Array.from(new Set(phrases.map((phrase) => String(phrase || "").trim().toLowerCase()).filter(Boolean)));
  let bestMatch: ComposerPhraseMatch | null = null;
  for (const phrase of uniquePhrases) {
    const match = findComposerPhraseMatch(input, phrase);
    if (!match) continue;
    const priority = weight + phrase.length;
    if (!bestMatch || priority > bestMatch.priority || (priority === bestMatch.priority && match.start < bestMatch.start)) {
      bestMatch = {
        phrase: match.phrase,
        start: match.start,
        end: match.end,
        source: "keyword",
        priority,
      };
    }
  }
  return bestMatch;
}

function findComposerScheduleSuggestion(inputRaw: string): ComposerScheduleSuggestion | null {
  const match = findComposerKeywordSuggestion(inputRaw, COMPOSER_SCHEDULE_KEYWORDS, 90);
  if (!match) return null;
  return {
    matchedPhrase: match.phrase.trim() || null,
    match,
  };
}

function measureComposerMatchAnchor(
  composer: HTMLElement | HTMLTextAreaElement,
  range?: { start: number; end: number } | null,
) {
  if (composer instanceof HTMLTextAreaElement) {
    const value = composer.value || "";
    const start = Math.max(0, Math.min(range?.start ?? 0, value.length));
    const end = Math.max(start, Math.min(range?.end ?? start, value.length));
    if (end <= start) {
      return {
        left: composer.clientWidth / 2,
        top: 0,
      };
    }

    const computed = window.getComputedStyle(composer);
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.position = "fixed";
    mirror.style.left = "-9999px";
    mirror.style.top = "0";
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.boxSizing = "border-box";
    mirror.style.width = `${composer.clientWidth}px`;
    mirror.style.padding = computed.padding;
    mirror.style.border = "0";
    mirror.style.font = computed.font;
    mirror.style.fontKerning = computed.fontKerning;
    mirror.style.fontFeatureSettings = computed.fontFeatureSettings;
    mirror.style.fontVariationSettings = computed.fontVariationSettings;
    mirror.style.letterSpacing = computed.letterSpacing;
    mirror.style.lineHeight = computed.lineHeight;
    mirror.style.textAlign = computed.textAlign;
    mirror.style.textTransform = computed.textTransform;
    mirror.style.textIndent = computed.textIndent;
    mirror.style.tabSize = computed.tabSize;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";

    const before = document.createTextNode(value.slice(0, start));
    const marker = document.createElement("span");
    marker.textContent = value.slice(start, end) || "\u200b";
    const after = document.createTextNode(value.slice(end) || "\u200b");
    mirror.append(before, marker, after);
    document.body.appendChild(mirror);

    const left = marker.offsetLeft + marker.offsetWidth / 2 - composer.scrollLeft;
    const top = marker.offsetTop - composer.scrollTop;

    document.body.removeChild(mirror);
    return { left, top };
  }

  const marker = composer.querySelector<HTMLElement>("[data-composer-match-anchor='true']");
  if (!marker) {
    return {
      left: composer.clientWidth / 2,
      top: 0,
    };
  }

  const composerRect = composer.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  return {
    left: markerRect.left - composerRect.left + markerRect.width / 2 + composer.scrollLeft,
    top: markerRect.top - composerRect.top + composer.scrollTop,
  };
}

function normalizeComposerPlainText(value: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\u200b/g, "");
}

function getComposerSelectionOffsets(root: HTMLElement | HTMLTextAreaElement): { start: number; end: number } | null {
  if (root instanceof HTMLTextAreaElement) {
    return {
      start: root.selectionStart ?? 0,
      end: root.selectionEnd ?? root.selectionStart ?? 0,
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const startRange = document.createRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: normalizeComposerPlainText(startRange.toString()).length,
    end: normalizeComposerPlainText(endRange.toString()).length,
  };
}

function setComposerSelectionOffsets(root: HTMLElement | HTMLTextAreaElement, start: number, end = start) {
  if (root instanceof HTMLTextAreaElement) {
    root.setSelectionRange(start, end);
    return;
  }

  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentStart = 0;
  let startNode: Node | null = null;
  let endNode: Node | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const textLength = normalizeComposerPlainText(node.textContent || "").length;
    const nextEnd = currentStart + textLength;

    if (!startNode && start <= nextEnd) {
      startNode = node;
      startOffset = Math.max(0, Math.min(start - currentStart, node.textContent?.length || 0));
    }
    if (!endNode && end <= nextEnd) {
      endNode = node;
      endOffset = Math.max(0, Math.min(end - currentStart, node.textContent?.length || 0));
      break;
    }

    currentStart = nextEnd;
  }

  if (!startNode || !endNode) {
    root.focus();
    return;
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function renderComposerInlineText(
  value: string,
  ranges: Array<{
    start: number;
    end: number;
    key: string;
    isAnchor?: boolean;
    interactive?: boolean;
    className?: string;
    style?: CSSProperties;
    onClick?: () => void;
  }>,
) {
  if (!value) return null;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const start = Math.max(0, Math.min(range.start, value.length));
    const end = Math.max(start, Math.min(range.end, value.length));
    if (cursor < start) nodes.push(value.slice(cursor, start));
    const text = value.slice(start, end);
    const className = range.className || "text-brand-blue";
    if (range.interactive) {
      nodes.push(
        <button
          key={`${range.key}:${index}:${start}:${end}`}
          type="button"
          data-composer-match-anchor={range.isAnchor ? "true" : undefined}
          className={`pointer-events-auto rounded-lg bg-transparent p-0 text-left align-baseline ${className}`}
          style={range.style}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => range.onClick?.()}
        >
          {text}
        </button>,
      );
    } else {
      nodes.push(
        <span
          key={`${range.key}:${index}:${start}:${end}`}
          data-composer-match-anchor={range.isAnchor ? "true" : undefined}
          className={className}
          style={range.style}
        >
          {text}
        </span>,
      );
    }
    cursor = end;
  });
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function inferComposerServiceSuggestions(opts: {
  input: string;
  canvasUrl?: string | null;
  serviceUsageCounts: Record<string, number>;
  selectedSlugs: string[];
}): ComposerServiceSuggestion[] {
  const haystack = `${String(opts.input || "")} ${String(opts.canvasUrl || "")}`.toLowerCase();
  const selected = new Set(opts.selectedSlugs);
  const ranked = PORTAL_CONTEXT_SERVICES.map((service) => {
    if (selected.has(service.slug)) return { service, score: -1 };
    const match = findComposerServiceMatch(opts.input, service);
    let score = Number(opts.serviceUsageCounts[service.slug] || 0);
    if (match?.source === "title") score += 8;
    else if (match?.source === "slug") score += 7;
    else if (match?.source === "keyword") score += 5;
    const canvasPath = String(opts.canvasUrl || "").toLowerCase();
    if (service.slug === "funnel-builder" && /\/funnel|\/funnels|\/website|\/builder/.test(canvasPath)) score += 5;
    if (service.slug === "booking" && /\/booking|\/calendar/.test(canvasPath)) score += 5;
    if (service.slug === "inbox" && /\/inbox/.test(canvasPath)) score += 5;
    if (!match && !score) return { service, score: -1, match: null };
    if (match && haystack.includes(match.phrase.toLowerCase())) score += Math.min(match.phrase.length, 12);
    return { service, score, match };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.service.title.localeCompare(b.service.title)));

  return ranked.slice(0, 4).map((entry) => ({
    service: entry.service,
    matchedPhrase: entry.match?.phrase?.trim() || null,
    match: entry.match || null,
    score: entry.score,
  }));
}

function seededHash(input: string) {
  let hash = 2166136261;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inferPromptServiceWeights(threads: Thread[], serviceUsageCounts: Record<string, number>) {
  const weights: Record<string, number> = {};
  for (const [slug, count] of Object.entries(serviceUsageCounts)) {
    const numeric = Number(count);
    if (Number.isFinite(numeric) && numeric > 0) weights[slug] = (weights[slug] || 0) + numeric * 2;
  }

  const threadHaystack = threads
    .slice(0, 18)
    .map((thread) => `${thread.title || ""}`.toLowerCase())
    .join(" \n ");

  for (const service of PORTAL_SERVICES) {
    const title = service.title.toLowerCase();
    const slugWords = service.slug.replace(/[-/]/g, " ").toLowerCase();
    let score = 0;
    if (threadHaystack.includes(title)) score += 3;
    if (threadHaystack.includes(slugWords)) score += 2;
    if (score > 0) weights[service.slug] = (weights[service.slug] || 0) + score;
  }

  return weights;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function IconVolumeGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M19.7479 4.99993C21.1652 6.97016 22 9.38756 22 11.9999C22 14.6123 21.1652 17.0297 19.7479 18.9999M15.7453 7.99993C16.5362 9.13376 17 10.5127 17 11.9999C17 13.4872 16.5362 14.8661 15.7453 15.9999M9.63432 4.36561L6.46863 7.5313C6.29568 7.70425 6.2092 7.79073 6.10828 7.85257C6.01881 7.9074 5.92127 7.9478 5.81923 7.9723C5.70414 7.99993 5.58185 7.99993 5.33726 7.99993H3.6C3.03995 7.99993 2.75992 7.99993 2.54601 8.10892C2.35785 8.20479 2.20487 8.35777 2.10899 8.54594C2 8.75985 2 9.03987 2 9.59993V14.3999C2 14.96 2 15.24 2.10899 15.4539C2.20487 15.6421 2.35785 15.7951 2.54601 15.8909C2.75992 15.9999 3.03995 15.9999 3.6 15.9999H5.33726C5.58185 15.9999 5.70414 15.9999 5.81923 16.0276C5.92127 16.0521 6.01881 16.0925 6.10828 16.1473C6.2092 16.2091 6.29568 16.2956 6.46863 16.4686L9.63431 19.6342C10.0627 20.0626 10.2769 20.2768 10.4608 20.2913C10.6203 20.3038 10.7763 20.2392 10.8802 20.1175C11 19.9773 11 19.6744 11 19.0686V4.9313C11 4.32548 11 4.02257 10.8802 3.88231C10.7763 3.76061 10.6203 3.69602 10.4608 3.70858C10.2769 3.72305 10.0627 3.93724 9.63432 4.36561Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRedoGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2 10C2 10 2.12132 9.15076 5.63604 5.63604C9.15076 2.12132 14.8492 2.12132 18.364 5.63604C19.6092 6.88131 20.4133 8.40072 20.7762 10M2 10V4M2 10H8M22 14C22 14 21.8787 14.8492 18.364 18.364C14.8492 21.8787 9.15076 21.8787 5.63604 18.364C4.39076 17.1187 3.58669 15.5993 3.22383 14M22 14V20M22 14H16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="animate-spin"
    >
      <path
        d="M21 12a9 9 0 11-2.64-6.36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type FixedMenuStyle = { left: number; top: number; width: number; maxHeight: number };

function computeFixedMenuStyle(opts: {
  rect: DOMRect;
  width: number;
  estHeight: number;
  alignX: "left" | "right";
  minHeight?: number;
  gapPx?: number;
}) {
  const VIEWPORT_PAD = 12;
  const GAP = typeof opts.gapPx === "number" && Number.isFinite(opts.gapPx) ? Math.max(0, opts.gapPx) : 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const width = Math.max(160, Math.min(opts.width, viewportW - VIEWPORT_PAD * 2));
  const estHeight = Math.max(120, opts.estHeight);

  let left = opts.alignX === "right" ? opts.rect.right - width : opts.rect.left;
  left = Math.max(VIEWPORT_PAD, Math.min(viewportW - VIEWPORT_PAD - width, left));

  const spaceBelow = viewportH - opts.rect.bottom - GAP - VIEWPORT_PAD;
  const spaceAbove = opts.rect.top - GAP - VIEWPORT_PAD;
  const placeDown = spaceBelow >= Math.min(estHeight, 240) || spaceBelow >= spaceAbove;

  const available = placeDown ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(opts.minHeight ?? 140, Math.min(estHeight, available));
  const usedHeight = Math.min(estHeight, maxHeight);

  const rawTop = placeDown ? opts.rect.bottom + GAP : opts.rect.top - GAP - usedHeight;
  const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

  return { left, top, width, maxHeight } satisfies FixedMenuStyle;
}

function fmtShortTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function safeHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return null;
  const internalPath = extractInternalAssistantPath(raw);
  if (internalPath) return new URL(internalPath, ASSISTANT_LINK_ORIGIN).toString();
  if (raw.startsWith("www.")) return `https://${raw}`;
  try {
    const u = new URL(raw);
    if (!["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) return null;

    if (u.protocol === "http:" || u.protocol === "https:") {
      const path = `${u.pathname || ""}${u.search || ""}${u.hash || ""}`;
      if (isInternalAssistantPath(u.pathname || "")) return new URL(path, ASSISTANT_LINK_ORIGIN).toString();
    }

    return u.toString();
  } catch {
    return null;
  }
}

function newClientId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function ThinkingDots() {
  return (
    <div className="inline-flex items-center gap-1" aria-label="Thinking">
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-400/80 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-400/80 animate-bounce" style={{ animationDelay: "100ms" }} />
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-400/80 animate-bounce" style={{ animationDelay: "200ms" }} />
    </div>
  );
}

function formatLocalDateTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function MessageBubble({
  msg,
  onRunAction,
  runningActionKey,
  onOpenLink,
  footerLeft,
  footerRight,
}: {
  msg: Message;
  onRunAction?: (action: AssistantAction) => void;
  runningActionKey?: string | null;
  onOpenLink?: (href: string) => void;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}) {
  const isUser = msg.role === "user";
  const isThinking = msg.id.startsWith("optimistic-assistant-") && msg.role === "assistant";
  const actions = !isUser && !isThinking && Array.isArray(msg.assistantActions) ? msg.assistantActions : [];
  const scheduledEnv = tryParseScheduledEnvelopeForUi(msg.text);

  const bubble = (
    <div
      data-message-role={isUser ? "user" : "assistant"}
      className={classNames(
        isUser ? "rounded-3xl bg-brand-blue px-4 py-3 text-sm leading-relaxed text-white" : "px-1 py-1 text-sm leading-relaxed text-zinc-900",
      )}
    >
      {isUser ? (
        scheduledEnv ? (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Scheduled task</div>
            <div className="whitespace-pre-wrap font-semibold">{scheduledEnv.title}</div>
            {scheduledEnv.stepsCount > 0 ? (
              <div className="text-[11px] text-white/80">{scheduledEnv.stepsCount} step{scheduledEnv.stepsCount === 1 ? "" : "s"}</div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.isArray(msg.visibleContextBadges) && msg.visibleContextBadges.length ? (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
                {formatVisibleContextBadgeLine(msg.visibleContextBadges)}
              </div>
            ) : null}
            <div className="whitespace-pre-wrap">{msg.text}</div>
          </div>
        )
      ) : isThinking ? (
        <ThinkingDots />
      ) : (
        <div className="prose prose-sm max-w-none prose-zinc">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a({ href, children }: { href?: string; children?: ReactNode }) {
                const safe = safeHref(String(href || ""));
                if (!safe) return <span>{children}</span>;
                const internalPath = extractInternalAssistantPath(safe);
                const external = /^https?:\/\//i.test(safe) && !internalPath;
                return (
                  <a
                    href={safe}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer noopener" : undefined}
                    className={classNames(
                      "font-semibold underline underline-offset-2",
                      "text-brand-blue",
                    )}
                    onClick={(e) => {
                      if (external) return;
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      if (!internalPath) return;
                      if (!onOpenLink) return;
                      e.preventDefault();
                      onOpenLink(internalPath);
                    }}
                  >
                    {children}
                  </a>
                );
              },
              p({ children }: { children?: ReactNode }) {
                return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
              },
              ul({ children }: { children?: ReactNode }) {
                return <ul className="my-2 list-disc pl-5">{children}</ul>;
              },
              ol({ children }: { children?: ReactNode }) {
                return <ol className="my-2 list-decimal pl-5">{children}</ol>;
              },
              li({ children }: { children?: ReactNode }) {
                return <li className="my-1">{children}</li>;
              },
              h1({ children }: { children?: ReactNode }) {
                return <h1 className="my-2 text-base font-semibold">{children}</h1>;
              },
              h2({ children }: { children?: ReactNode }) {
                return <h2 className="my-2 text-sm font-semibold">{children}</h2>;
              },
              h3({ children }: { children?: ReactNode }) {
                return <h3 className="my-2 text-sm font-semibold">{children}</h3>;
              },
              code({ children }: { children?: ReactNode }) {
                return <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">{children}</code>;
              },
              pre({ children }: { children?: ReactNode }) {
                return <pre className="my-2 overflow-x-auto rounded-2xl bg-zinc-100 p-3 text-[12px]">{children}</pre>;
              },
            }}
          >
            {scheduledEnv ? `Scheduled task: ${scheduledEnv.title}` : msg.text || ""}
          </ReactMarkdown>
        </div>
      )}

      {Array.isArray(msg.attachmentsJson) && msg.attachmentsJson.length ? (
        <div className={classNames("mt-3 flex flex-wrap gap-2", isUser ? "text-white/90" : "text-zinc-700")}>
          {msg.attachmentsJson.map((a: any, idx: number) => {
            const href = safeHref(String(a?.url || "")) || "#";
            const isImg = looksLikeImageAttachment(a);
            const src = isImg ? safeImgSrc(String(a?.url || "")) : null;

            if (isImg && src) {
              return (
                <a
                  key={idx}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={classNames(
                    "group flex max-w-full items-center gap-3 rounded-2xl border p-2",
                    isUser ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-zinc-200 bg-zinc-50 hover:bg-white",
                  )}
                  title={String(a?.fileName || "Image")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={String(a?.fileName || "Image")}
                    className="h-16 w-16 shrink-0 rounded-xl border border-black/10 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{String(a?.fileName || "Image")}</div>
                    <div className={classNames("mt-0.5 text-[11px]", isUser ? "text-white/70" : "text-zinc-500")}>
                      Click to open
                    </div>
                  </div>
                </a>
              );
            }

            return (
              <a
                key={idx}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className={classNames(
                  "inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold",
                  isUser ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-zinc-200 bg-zinc-50 hover:bg-white",
                )}
              >
                <span className="truncate">{String(a?.fileName || "Attachment")}</span>
              </a>
            );
          })}
        </div>
      ) : null}

      {actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a, idx) => {
            const busy = Boolean(runningActionKey) && runningActionKey === a.key;
            return (
              <button
                key={`${a.key}-${idx}`}
                type="button"
                onClick={() => onRunAction?.(a)}
                disabled={!onRunAction || busy}
                className={classNames(
                  "rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60",
                  busy && "cursor-wait",
                )}
                title={a.confirmLabel ? `${a.title} - ${a.confirmLabel}` : a.title}
              >
                <div className="truncate">{busy ? "Running…" : a.title}</div>
              </button>
            );
          })}
        </div>
      ) : null}

      {!isUser && !isThinking && msg.runTrace?.steps?.length ? (
        <div className={classNames("mt-3 rounded-2xl px-3 py-2", runTraceCardTone(msg.runTrace.steps).cardClassName)}>
          <div className={classNames("flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide", runTraceCardTone(msg.runTrace.steps).headerClassName)}>
            <span>{msg.runTrace.workTitle || "Pura work trace"}</span>
            <span>{msg.runTrace.steps.length} step{msg.runTrace.steps.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-2 space-y-2">
            {msg.runTrace.steps.slice(0, 4).map((step, idx) => {
              return (
                <div key={`${step.key}-${idx}`} className="rounded-2xl px-3 py-2.5 text-[12px] leading-5">
                  <span className={classNames("block min-w-0 font-medium", runTraceCardTone(msg.runTrace.steps).textClassName)}>{step.title || step.key}</span>
                </div>
              );
            })}
            {msg.runTrace.steps.length > 4 ? (
              <div className={classNames("pl-4 text-[11px]", runTraceCardTone(msg.runTrace.steps).moreClassName)}>
                +{msg.runTrace.steps.length - 4} more step{msg.runTrace.steps.length - 4 === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  const hasFooter = Boolean(footerLeft) || Boolean(footerRight);

  return (
    <div className={classNames("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={classNames("inline-flex max-w-[min(980px,100%)] flex-col", isUser ? "ml-10" : "mr-10")}>
        {bubble}
        {hasFooter ? (
          <div className={classNames("mt-1 flex items-center gap-2", isUser ? "justify-end" : "justify-between")}>
            <div className="flex items-center gap-1">{footerLeft}</div>
            <div className="flex items-center justify-end gap-1">{footerRight}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function applyAssistantDisplayMode(message: Message, mode: ChatMode | null | undefined): Message {
  if (!message || message.role !== "assistant") return message;
  return { ...message, displayMode: mode || message.displayMode };
}

function normalizeRunTrace(raw: unknown): RunTrace | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stepsRaw = Array.isArray((raw as any).steps) ? ((raw as any).steps as unknown[]) : [];
  const steps: RunTraceStep[] = [];
  for (const step of stepsRaw) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const key = typeof (step as any).key === "string" ? String((step as any).key).trim().slice(0, 120) : "";
    const title = typeof (step as any).title === "string" ? String((step as any).title).trim().slice(0, 200) : "";
    if (!key && !title) continue;
    steps.push({
      key,
      title: title || key,
      ok: Boolean((step as any).ok),
      linkUrl: typeof (step as any).linkUrl === "string" ? String((step as any).linkUrl).trim().slice(0, 1200) : null,
    });
    if (steps.length >= 12) break;
  }

  if (!steps.length) return null;

  return {
    at: typeof (raw as any).at === "string" ? String((raw as any).at).trim().slice(0, 80) : null,
    workTitle: typeof (raw as any).workTitle === "string" ? String((raw as any).workTitle).trim().slice(0, 200) : null,
    assistantMessageId: typeof (raw as any).assistantMessageId === "string" ? String((raw as any).assistantMessageId).trim().slice(0, 200) : null,
    canvasUrl: typeof (raw as any).canvasUrl === "string" ? String((raw as any).canvasUrl).trim().slice(0, 1200) : null,
    steps,
  };
}

function attachRunTraceToMessage(message: Message, rawTrace: unknown): Message {
  const trace = normalizeRunTrace(rawTrace);
  if (!trace) return message;
  return { ...message, runTrace: { ...trace, assistantMessageId: message.id } };
}

function normalizeFollowUpSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeRunLedgerEntry(raw: unknown): RunLedgerEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = typeof (raw as any).id === "string" ? String((raw as any).id).trim().slice(0, 200) : "";
  const createdAt = typeof (raw as any).createdAt === "string" ? String((raw as any).createdAt).trim().slice(0, 80) : "";
  if (!id || !createdAt) return null;
  return {
    id,
    runId: typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null,
    triggerKind: typeof (raw as any).triggerKind === "string" ? String((raw as any).triggerKind).trim().slice(0, 40) : "chat",
    status: typeof (raw as any).status === "string" ? String((raw as any).status).trim().slice(0, 40) : "completed",
    workTitle: typeof (raw as any).workTitle === "string" ? String((raw as any).workTitle).trim().slice(0, 200) : null,
    canvasUrl: typeof (raw as any).canvasUrl === "string" ? String((raw as any).canvasUrl).trim().slice(0, 1200) : null,
    summaryText: typeof (raw as any).summaryText === "string" ? String((raw as any).summaryText).trim().slice(0, 4000) : null,
    assistantMessageId: typeof (raw as any).assistantMessageId === "string" ? String((raw as any).assistantMessageId).trim().slice(0, 200) : null,
    scheduledMessageId: typeof (raw as any).scheduledMessageId === "string" ? String((raw as any).scheduledMessageId).trim().slice(0, 200) : null,
    createdAt,
    completedAt: typeof (raw as any).completedAt === "string" ? String((raw as any).completedAt).trim().slice(0, 80) : null,
    interruptedAt: typeof (raw as any).interruptedAt === "string" ? String((raw as any).interruptedAt).trim().slice(0, 80) : null,
    steps: normalizeRunTrace({ steps: (raw as any).steps, at: createdAt, workTitle: (raw as any).workTitle, assistantMessageId: (raw as any).assistantMessageId, canvasUrl: (raw as any).canvasUrl })?.steps || [],
    followUpSuggestions: normalizeFollowUpSuggestions((raw as any).followUpSuggestions),
  };
}

function normalizeThreadRunStatus(raw: unknown): ThreadRunStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = typeof (raw as any).status === "string" ? String((raw as any).status).trim().slice(0, 40) : "";
  if (!status) return null;
  return {
    status,
    runId: typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null,
    updatedAt: typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : null,
  };
}

function normalizeThreadChatMode(raw: unknown): ChatMode {
  return raw === "work" ? "work" : "plan";
}

function normalizeThreadResponseProfile(raw: unknown): PuraAiProfile {
  return normalizePuraAiProfile(raw);
}

function threadRunBadgeMeta(thread: Thread, liveStatus: LiveStatus | null) {
  if (liveStatus?.label) {
    return {
      label: "Running",
      title: liveStatus.label || "Pura is working",
      dotClassName: "bg-brand-blue animate-pulse",
      badgeClassName: "border-brand-blue/15 bg-blue-50 text-brand-blue",
    };
  }
  const status = String(thread.latestRunStatus?.status || "").trim().toLowerCase();
  if (status === "needs_input") {
    return {
      label: "Waiting on you",
      title: "Pura is waiting for your input",
      dotClassName: "bg-orange-500",
      badgeClassName: "border-orange-200 bg-orange-50 text-orange-900",
    };
  }
  if (status === "failed") {
    return {
      label: "Failed",
      title: "The last run failed",
      dotClassName: "bg-red-500",
      badgeClassName: "border-red-200 bg-red-50 text-red-800",
    };
  }
  if (status === "interrupted") {
    return {
      label: "Stopped",
      title: "The last run was stopped",
      dotClassName: "bg-zinc-400",
      badgeClassName: "border-zinc-200 bg-zinc-100 text-zinc-700",
    };
  }
  return null;
}

function nextStepBadgeMeta(nextStepContext: NextStepContext | null) {
  if (!nextStepContext) return null;
  return {
    label: "Ready next",
    title: nextStepContext.workTitle || nextStepContext.objective || "This chat has a ready next step",
    dotClassName: "bg-emerald-500",
    badgeClassName: "bg-emerald-100 text-emerald-800",
  };
}

function nextStepPreviewText(nextStepContext: NextStepContext | null): string | null {
  if (!nextStepContext) return null;
  const raw =
    nextStepContext.suggestedPrompt?.trim() ||
    nextStepContext.summaryText?.trim() ||
    nextStepContext.objective?.trim() ||
    nextStepContext.workTitle?.trim() ||
    "";
  if (!raw) return null;
  return raw.slice(0, 120);
}

function normalizeAssistantComparableText(raw: string | null | undefined) {
  return String(raw || "")
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, "$1")
    .replace(/https?:\/\/purelyautomation\.com/gi, "")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function textsLookEquivalent(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeAssistantComparableText(a);
  const right = normalizeAssistantComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= 48 && longer.includes(shorter);
}

function isDuplicateNextStepCard(nextStepContext: NextStepContext | null, lastAssistantMessage: Message | null) {
  if (!nextStepContext || !lastAssistantMessage) return false;
  const assistantText = lastAssistantMessage.text;
  if (!String(assistantText || "").trim()) return false;
  if (textsLookEquivalent(nextStepContext.summaryText, assistantText)) return true;

  const title = normalizeAssistantComparableText(nextStepContext.workTitle || nextStepContext.objective || null);
  const prompt = normalizeAssistantComparableText(nextStepContext.suggestedPrompt || nextStepContext.suggestions[0] || null);
  const assistantComparable = normalizeAssistantComparableText(assistantText);
  return Boolean(title && prompt && assistantComparable.includes(title) && assistantComparable.includes(prompt));
}

function formatRunStatusLabel(statusRaw: string | null | undefined): string {
  const status = String(statusRaw || "completed").trim().toLowerCase();
  if (status === "needs_input") return "Needs input";
  return status ? `${status.slice(0, 1).toUpperCase()}${status.slice(1).replace(/_/g, " ")}` : "Completed";
}

function formatRunTriggerLabel(triggerRaw: string | null | undefined): string {
  const trigger = String(triggerRaw || "chat").trim().toLowerCase();
  if (trigger === "assistant_action") return "Assistant action";
  if (trigger === "scheduled") return "Scheduled";
  return "Chat";
}

function attachFollowUpSuggestionsToMessage(message: Message, rawSuggestions: unknown): Message {
  const suggestions = normalizeFollowUpSuggestions(rawSuggestions);
  if (!suggestions.length) return message;
  return { ...message, followUpSuggestions: suggestions };
}

function applyRunTracesToMessages(messages: Message[], runsRaw: unknown): Message[] {
  const runs = Array.isArray(runsRaw) ? runsRaw : [];
  const traceByMessageId = new Map<string, RunTrace>();
  for (const raw of runs) {
    const trace = normalizeRunTrace(raw);
    if (!trace?.assistantMessageId) continue;
    traceByMessageId.set(trace.assistantMessageId, trace);
  }

  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    const trace = traceByMessageId.get(message.id);
    return trace ? { ...message, runTrace: trace } : message;
  });
}

function normalizeLiveStatus(raw: unknown): LiveStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const phase = typeof (raw as any).phase === "string" ? String((raw as any).phase).trim().slice(0, 80) : "";
  const label = typeof (raw as any).label === "string" ? String((raw as any).label).trim().slice(0, 200) : "";
  const actionKey = typeof (raw as any).actionKey === "string" ? String((raw as any).actionKey).trim().slice(0, 120) : "";
  const title = typeof (raw as any).title === "string" ? String((raw as any).title).trim().slice(0, 200) : "";
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : "";
  const runId = typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : "";
  const canInterrupt = Boolean((raw as any).canInterrupt);
  const round = Number.isFinite(Number((raw as any).round)) ? Math.max(1, Math.min(99, Math.floor(Number((raw as any).round)))) : null;
  const completedSteps = Number.isFinite(Number((raw as any).completedSteps)) ? Math.max(0, Math.min(99, Math.floor(Number((raw as any).completedSteps)))) : null;
  const lastCompletedTitle =
    typeof (raw as any).lastCompletedTitle === "string" ? String((raw as any).lastCompletedTitle).trim().slice(0, 200) : "";
  if (!phase && !label && !actionKey && !title && !updatedAt && !runId && !canInterrupt && round == null && completedSteps == null && !lastCompletedTitle) return null;
  return {
    phase: phase || null,
    label: label || null,
    actionKey: actionKey || null,
    title: title || null,
    updatedAt: updatedAt || null,
    runId: runId || null,
    canInterrupt,
    round,
    completedSteps,
    lastCompletedTitle: lastCompletedTitle || null,
  };
}

function normalizeUnresolvedRun(raw: unknown): UnresolvedRun | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const statusRaw = typeof (raw as any).status === "string" ? String((raw as any).status).trim().toLowerCase() : "";
  const status =
    statusRaw === "needs_input" || statusRaw === "failed" || statusRaw === "interrupted" || statusRaw === "partial"
      ? (statusRaw as UnresolvedRunStatus)
      : null;
  if (!status) return null;
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : "";
  const workTitle = typeof (raw as any).workTitle === "string" ? String((raw as any).workTitle).trim().slice(0, 200) : "";
  const summaryText = typeof (raw as any).summaryText === "string" ? String((raw as any).summaryText).trim().slice(0, 1200) : "";
  const userRequest = typeof (raw as any).userRequest === "string" ? String((raw as any).userRequest).trim().slice(0, 2000) : "";
  const lastCompletedTitle = typeof (raw as any).lastCompletedTitle === "string" ? String((raw as any).lastCompletedTitle).trim().slice(0, 200) : "";
  const runId = typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : "";
  const canvasUrl = typeof (raw as any).canvasUrl === "string" ? String((raw as any).canvasUrl).trim().slice(0, 1200) : "";

  return {
    status,
    updatedAt: updatedAt || null,
    workTitle: workTitle || null,
    summaryText: summaryText || null,
    userRequest: userRequest || null,
    lastCompletedTitle: lastCompletedTitle || null,
    runId: runId || null,
    canvasUrl: canvasUrl || null,
  };
}

function normalizeNextStepContext(raw: unknown): NextStepContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const suggestions = normalizeFollowUpSuggestions((raw as any).suggestions);
  const suggestedPrompt =
    typeof (raw as any).suggestedPrompt === "string" && (raw as any).suggestedPrompt.trim()
      ? String((raw as any).suggestedPrompt).trim().slice(0, 180)
      : suggestions[0] || null;
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : "";
  const objective = typeof (raw as any).objective === "string" ? String((raw as any).objective).trim().slice(0, 2000) : "";
  const workTitle = typeof (raw as any).workTitle === "string" ? String((raw as any).workTitle).trim().slice(0, 200) : "";
  const summaryText = typeof (raw as any).summaryText === "string" ? String((raw as any).summaryText).trim().slice(0, 1200) : "";
  const canvasUrl = typeof (raw as any).canvasUrl === "string" ? String((raw as any).canvasUrl).trim().slice(0, 1200) : "";
  if (!suggestedPrompt && !objective && !workTitle && !summaryText && !suggestions.length) return null;
  return {
    updatedAt: updatedAt || null,
    objective: objective || null,
    workTitle: workTitle || null,
    summaryText: summaryText || null,
    suggestedPrompt: suggestedPrompt || null,
    suggestions,
    canvasUrl: canvasUrl || null,
  };
}

function normalizeThreadSummary(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const summary = String(raw).trim().replace(/\s+/g, " ").slice(0, 1200);
  return summary || null;
}

function normalizeWorkingMemory(raw: unknown): WorkingMemory | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const threadSummary = normalizeThreadSummary((raw as any).threadSummary);
  const threadSummaryUpdatedAt =
    typeof (raw as any).threadSummaryUpdatedAt === "string" && (raw as any).threadSummaryUpdatedAt.trim()
      ? String((raw as any).threadSummaryUpdatedAt).trim().slice(0, 80)
      : null;
  const recentRuns = Array.isArray((raw as any).runs)
    ? ((raw as any).runs as unknown[]).map((run) => normalizeRunTrace(run)).filter(Boolean) as RunTrace[]
    : [];
  if (!threadSummary && !recentRuns.length) return null;
  return {
    threadSummary,
    threadSummaryUpdatedAt,
    recentRuns: recentRuns.slice(-3).reverse(),
  };
}

function sameLiveStatus(a: LiveStatus | null, b: LiveStatus | null): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.phase === b.phase &&
    a.label === b.label &&
    a.actionKey === b.actionKey &&
    a.title === b.title &&
    a.updatedAt === b.updatedAt &&
    a.runId === b.runId &&
    Boolean(a.canInterrupt) === Boolean(b.canInterrupt) &&
    a.round === b.round &&
    a.completedSteps === b.completedSteps &&
    a.lastCompletedTitle === b.lastCompletedTitle
  );
}

function describeLiveStatusMeta(status: LiveStatus | null): string | null {
  if (!status) return null;
  const parts: string[] = [];
  if (typeof status.round === "number" && Number.isFinite(status.round) && status.round > 1) {
    parts.push(`Round ${status.round}`);
  }
  if (typeof status.completedSteps === "number" && Number.isFinite(status.completedSteps) && status.completedSteps > 0) {
    parts.push(`${status.completedSteps} step${status.completedSteps === 1 ? "" : "s"} done`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function LiveProgressCard({ status, onInterrupt, interrupting }: { status: LiveStatus; onInterrupt?: (() => void) | null; interrupting?: boolean }) {
  const meta = describeLiveStatusMeta(status);
  const lastCompletedTitle = status.lastCompletedTitle?.trim() || null;
  return (
    <div className="rounded-3xl border border-brand-blue/15 bg-blue-50/70 px-4 py-3 text-zinc-800 shadow-[0_8px_30px_rgba(29,78,216,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">
          <ThinkingDots />
          <span>Pura working</span>
        </div>
        {onInterrupt ? (
          <button
            type="button"
            className="rounded-2xl border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            onClick={onInterrupt}
            disabled={Boolean(interrupting)}
          >
            {interrupting ? "Stopping…" : "Stop"}
          </button>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-900">{status.label || status.title || "Working on it"}</div>
      {meta ? <div className="mt-1 text-xs font-medium text-zinc-600">{meta}</div> : null}
      {lastCompletedTitle ? <div className="mt-2 text-xs text-zinc-600">Last completed: {lastCompletedTitle}</div> : null}
    </div>
  );
}

function unresolvedRunCta(status: UnresolvedRunStatus): { label: string; prompt: string } {
  if (status === "needs_input") {
    return {
      label: "Continue",
      prompt: "Continue this chat and ask me only for the missing input you actually need.",
    };
  }
  if (status === "interrupted") {
    return {
      label: "Resume",
      prompt: "Continue this chat from where you left off and finish the remaining work.",
    };
  }
  return {
    label: "Retry",
    prompt: "Retry the last unfinished work in this chat, fix the issue, and keep going until it is done.",
  };
}

function UnresolvedRunCard({ unresolvedRun, onContinue, onOpenCanvas, sending }: { unresolvedRun: UnresolvedRun; onContinue: (prompt: string) => void; onOpenCanvas?: (() => void) | null; sending?: boolean }) {
  const cta = unresolvedRunCta(unresolvedRun.status);
  const title = unresolvedRun.workTitle?.trim() || formatRunStatusLabel(unresolvedRun.status);
  const summary = unresolvedRun.summaryText?.trim() || unresolvedRun.userRequest?.trim() || null;
  const needsInput = unresolvedRun.status === "needs_input";

  return (
    <div className={classNames(
      "rounded-3xl px-4 py-3 text-zinc-800",
      needsInput
        ? "border border-orange-300 bg-orange-50/95 shadow-[0_8px_30px_rgba(234,88,12,0.12)]"
        : "border border-amber-200 bg-amber-50/80 shadow-[0_8px_30px_rgba(217,119,6,0.08)]",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className={classNames("flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]", needsInput ? "text-orange-700" : "text-amber-700")}>
          <ThinkingDots />
          <span>{needsInput ? "Waiting on you" : "Unfinished work"}</span>
        </div>
        <div className={classNames("rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold", needsInput ? "border border-orange-200 text-orange-800" : "border border-amber-200 text-amber-800")}>
          {needsInput ? "Needs your reply" : formatRunStatusLabel(unresolvedRun.status)}
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-900">{needsInput ? `Need your input: ${title}` : title}</div>
      {needsInput ? <div className="mt-1 text-xs font-medium text-orange-800">I paused and I’m waiting for the missing detail before doing anything else.</div> : null}
      {summary ? <div className="mt-1 text-sm leading-6 text-zinc-700">{summary}</div> : null}
      {unresolvedRun.lastCompletedTitle ? <div className="mt-2 text-xs text-zinc-600">Last completed: {unresolvedRun.lastCompletedTitle}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          disabled={Boolean(sending)}
          onClick={() => onContinue(cta.prompt)}
        >
          {cta.label}
        </button>
        {onOpenCanvas ? (
          <button
            type="button"
            className={classNames(frostedBlueButtonClassName(), "text-xs")}
            onClick={onOpenCanvas}
          >
            Open related page
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NextStepCard({ nextStepContext, onContinue, onOpenCanvas, sending }: { nextStepContext: NextStepContext; onContinue: (prompt: string) => void; onOpenCanvas?: (() => void) | null; sending?: boolean }) {
  const primaryPrompt = nextStepContext.suggestedPrompt?.trim() || nextStepContext.suggestions[0] || "Keep going with the next best step in this chat.";
  const title = nextStepContext.workTitle?.trim() || nextStepContext.objective?.trim() || "Ready next step";
  const summary = nextStepContext.summaryText?.trim() || nextStepContext.objective?.trim() || null;
  const extraSuggestions = nextStepContext.suggestions.filter((suggestion) => suggestion !== primaryPrompt).slice(0, 2);

  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-zinc-800 shadow-[0_8px_30px_rgba(5,150,105,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
          <ThinkingDots />
          <span>Ready next step</span>
        </div>
        <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
          Continue
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-900">{title}</div>
      {summary ? <div className="mt-1 text-sm leading-6 text-zinc-700">{summary}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          disabled={Boolean(sending)}
          onClick={() => onContinue(primaryPrompt)}
          title={primaryPrompt}
        >
          Keep going
        </button>
        {onOpenCanvas ? (
          <button
            type="button"
            className={classNames(frostedBlueButtonClassName(), "text-xs")}
            onClick={onOpenCanvas}
          >
            Open related page
          </button>
        ) : null}
        {extraSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            disabled={Boolean(sending)}
            onClick={() => onContinue(suggestion)}
            title={suggestion}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

type ActivityView =
  | { kind: "list" }
  | { kind: "run"; runId: string }
  | { kind: "thread-memory" };

function threadMemorySignature(memory: WorkingMemory | null | undefined): string {
  if (!memory) return "";
  const summary = String(memory.threadSummary || "").trim();
  const updatedAt = String(memory.threadSummaryUpdatedAt || "").trim();
  const runs = memory.recentRuns
    .map((run) => [run.assistantMessageId || "", run.at || "", run.workTitle || "", run.steps.map((step) => `${step.key}:${step.title}:${step.ok ? 1 : 0}`).join("|")].join("::"))
    .join("~~");
  return `${updatedAt}##${summary}##${runs}`;
}

function activityStatusPillClass(statusRaw: string | null | undefined, active = false) {
  if (active) return "bg-blue-50 text-brand-blue";
  const status = String(statusRaw || "").trim().toLowerCase();
  if (status === "running") return "bg-blue-50 text-brand-blue";
  if (status === "completed") return "bg-emerald-50 text-emerald-800";
  if (status === "interrupted") return "bg-zinc-100 text-zinc-700";
  if (status === "partial" || status === "needs_input") return "bg-amber-50 text-amber-900";
  return "bg-red-50 text-red-800";
}

function traceStepTone(ok: boolean) {
  return ok
    ? {
        cardClassName: "bg-emerald-100 text-emerald-800",
        textClassName: "text-emerald-900",
      }
    : {
        cardClassName: "bg-red-50 text-red-800",
        textClassName: "text-red-900",
      };
}

function runTraceCardTone(steps: RunTraceStep[]) {
  const total = steps.length;
  const okCount = steps.filter((step) => step.ok).length;
  if (!total || okCount === total) {
    return {
      cardClassName: "bg-emerald-100/95 text-emerald-900",
      headerClassName: "text-emerald-800",
      textClassName: "text-emerald-900",
      moreClassName: "text-emerald-800/80",
    };
  }
  if (!okCount) {
    return {
      cardClassName: "bg-red-50 text-red-900",
      headerClassName: "text-red-800",
      textClassName: "text-red-900",
      moreClassName: "text-red-800/80",
    };
  }
  return {
    cardClassName: "bg-amber-50/95 text-amber-900",
    headerClassName: "text-amber-800",
    textClassName: "text-amber-900",
    moreClassName: "text-amber-800/80",
  };
}

function PuraMarkdownBlock({ text, className }: { text: string; className?: string }) {
  const value = String(text || "").trim();
  if (!value) return null;
  return (
    <div className={classNames("prose prose-sm max-w-none wrap-break-word prose-zinc prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:mb-2 prose-headings:mt-3 prose-code:rounded prose-code:bg-white/70 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.92em] prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-2xl prose-pre:bg-zinc-950 prose-pre:text-zinc-50", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }: { href?: string; children?: ReactNode }) {
            const safe = safeHref(String(href || ""));
            if (!safe) return <span>{children}</span>;
            const external = /^https?:\/\//i.test(safe);
            return (
              <a
                href={safe}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer noopener" : undefined}
                className="font-semibold text-brand-blue underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          p({ children }: { children?: ReactNode }) {
            return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
          },
          ul({ children }: { children?: ReactNode }) {
            return <ul className="my-2 list-disc pl-5">{children}</ul>;
          },
          ol({ children }: { children?: ReactNode }) {
            return <ol className="my-2 list-decimal pl-5">{children}</ol>;
          },
          li({ children }: { children?: ReactNode }) {
            return <li className="my-1">{children}</li>;
          },
          h1({ children }: { children?: ReactNode }) {
            return <h1 className="text-base font-semibold text-zinc-900">{children}</h1>;
          },
          h2({ children }: { children?: ReactNode }) {
            return <h2 className="text-sm font-semibold text-zinc-900">{children}</h2>;
          },
          h3({ children }: { children?: ReactNode }) {
            return <h3 className="text-sm font-semibold text-zinc-900">{children}</h3>;
          },
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

function frostedBlueButtonClassName(size: "compact" | "regular" = "regular") {
  return classNames(
    "inline-flex items-center justify-center gap-1 rounded-2xl bg-[rgba(29,78,216,0.12)] text-brand-blue backdrop-blur-md shadow-[0_10px_24px_rgba(29,78,216,0.14)] transition-colors duration-150 hover:bg-[rgba(29,78,216,0.18)]",
    size === "compact" ? "px-2 py-1 text-[11px] font-semibold" : "px-3 py-2 text-sm font-semibold",
  );
}

function conciseActivitySummary(raw: string | null | undefined): string | null {
  const normalized = String(raw || "")
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, "$1")
    .replace(/^[#>*\-\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const firstSentence = normalized.match(/^(.{1,220}?[.!?])(\s|$)/)?.[1]?.trim() || normalized.slice(0, 220).trim();
  return firstSentence || null;
}

function activityStepTone(statusRaw: string | null | undefined, ok: boolean) {
  if (ok) {
    return {
      cardClassName: "bg-emerald-100 text-emerald-800 shadow-[0_8px_24px_rgba(16,185,129,0.08)]",
      textClassName: "text-emerald-900",
      pillClassName: "bg-white/55 text-emerald-800",
      label: "OK",
    };
  }

  const status = String(statusRaw || "").trim().toLowerCase();
  if (status === "needs_input" || status === "interrupted" || status === "partial" || status === "running") {
    return {
      cardClassName: "bg-amber-50/95 text-amber-950 shadow-[0_8px_24px_rgba(245,158,11,0.12)]",
      textClassName: "text-amber-900",
      pillClassName: "bg-amber-600/10 text-amber-800",
      label: status === "needs_input" ? "Needs input" : status === "running" ? "Working" : "Paused",
    };
  }

  return {
    cardClassName: "bg-red-50 text-red-800 shadow-[0_8px_24px_rgba(244,63,94,0.1)]",
    textClassName: "text-red-900",
    pillClassName: "bg-white/60 text-red-800",
    label: "Failed",
  };
}

function summarizeRunForActivity(run: RunLedgerEntry): string {
  const aiSummary = String(run.aiSummaryText || "").trim();
  if (aiSummary) return aiSummary;

  const title = String(run.workTitle || "Pura run").trim() || "Pura run";
  const recap = conciseActivitySummary(run.summaryText);
  const totalSteps = run.steps.length;
  const completedSteps = run.steps.filter((step) => step.ok).length;
  const failedSteps = Math.max(0, totalSteps - completedSteps);
  const topSteps = run.steps
    .map((step) => String(step.title || step.key || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  const parts: string[] = [];
  const status = String(run.status || "completed").trim().toLowerCase();
  if (status === "completed") {
    parts.push(recap && !textsLookEquivalent(recap, title) ? `All set. ${recap}` : `${title} is wrapped up.`);
  } else if (status === "running") {
    parts.push(`Still working on ${title}.`);
  } else if (status === "needs_input") {
    parts.push(`I got part of ${title} done, and I need one more detail to keep going.`);
  } else if (status === "interrupted") {
    parts.push(`I made progress on ${title}, then the run paused before it could finish.`);
  } else if (status === "partial") {
    parts.push(`I made a solid start on ${title}, and there is still a bit left to finish.`);
  } else if (status === "failed") {
    parts.push(`I hit a snag while working on ${title}.`);
  } else {
    parts.push(`${formatRunStatusLabel(run.status)}: ${title}.`);
  }

  if (recap && !textsLookEquivalent(recap, title) && status !== "completed") {
    parts.push(recap);
  }

  if (totalSteps > 0) {
    if (failedSteps > 0) {
      parts.push(`${completedSteps} of ${totalSteps} step${totalSteps === 1 ? " is" : "s are"} done so far.`);
    } else {
      parts.push(`All ${totalSteps} step${totalSteps === 1 ? " is" : "s are"} complete.`);
    }
  }

  if (topSteps.length) {
    parts.push(`Main pieces: ${topSteps.join(", ")}.`);
  }

  return parts.join(" ");
}

function ThreadMemoryUpdatedCard({
  memory,
  onOpen,
}: {
  memory: WorkingMemory;
  onOpen: () => void;
}) {
  const updatedLabel = memory.threadSummaryUpdatedAt ? formatLocalDateTime(new Date(memory.threadSummaryUpdatedAt)) : null;
  return (
    <button
      type="button"
      className="inline-flex max-w-fit items-center gap-3 rounded-3xl bg-[rgba(29,78,216,0.12)] px-4 py-3 text-left text-brand-blue shadow-[0_8px_24px_rgba(29,78,216,0.14)] transition-colors duration-150 hover:bg-[rgba(29,78,216,0.18)]"
      onClick={onOpen}
    >
      <span className="text-sm font-semibold text-brand-blue">Thread Memory updated</span>
      {updatedLabel ? <span className="text-[11px] font-medium text-brand-blue/70">{updatedLabel}</span> : null}
    </button>
  );
}

function ThreadMemoryDetail({
  memory,
  unresolvedRun,
  nextStepContext,
}: {
  memory: WorkingMemory;
  unresolvedRun?: UnresolvedRun | null;
  nextStepContext?: NextStepContext | null;
}) {
  const summary = memory.threadSummary?.trim() || null;
  const recentRuns = memory.recentRuns.filter((run) => run.workTitle?.trim() || run.steps.length).slice(0, 3);
  const statusLine = unresolvedRun
    ? `Blocked on ${unresolvedRun.workTitle?.trim() || formatRunStatusLabel(unresolvedRun.status)}`
    : nextStepContext
      ? `Ready next: ${nextStepContext.workTitle?.trim() || nextStepContext.suggestedPrompt?.trim() || nextStepContext.objective?.trim() || "next step queued"}`
      : null;
  const updatedLabel = fmtShortTime(memory.threadSummaryUpdatedAt);

  return (
    <div className="rounded-3xl bg-[rgba(29,78,216,0.12)] px-4 py-4 text-zinc-800 shadow-[0_8px_24px_rgba(29,78,216,0.14)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue/80">
          <span>Thread Memory</span>
        </div>
        {updatedLabel ? <div className="text-[11px] font-medium text-brand-blue/70">Updated {updatedLabel}</div> : null}
      </div>
      {summary ? <PuraMarkdownBlock text={summary} className="mt-2 text-zinc-800" /> : null}
      {statusLine ? <div className="mt-2 text-xs font-medium text-brand-blue/80">{statusLine}</div> : null}
      {recentRuns.length ? (
        <div className="mt-4 space-y-2">
          {recentRuns.map((run, index) => {
            const label = run.workTitle?.trim() || run.steps[run.steps.length - 1]?.title?.trim() || `Recent work ${index + 1}`;
            const subtitle = run.steps.length ? `${run.steps.length} step${run.steps.length === 1 ? "" : "s"}` : null;
            return (
              <div key={`${run.assistantMessageId || run.at || index}:${label}`} className="rounded-2xl bg-white/65 px-3 py-2.5">
                <div className="text-xs font-semibold text-zinc-900">{label}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                  {subtitle ? <span>{subtitle}</span> : null}
                  {run.at ? <span>{fmtShortTime(run.at)}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function describeLiveWorkLabel(opts: {
  text: string;
  canvasUrl?: string | null;
  actionKey?: string | null;
  mode: ChatMode;
  isRetry?: boolean;
}): string | null {
  const haystack = [String(opts.actionKey || ""), String(opts.text || ""), String(opts.canvasUrl || "")]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (!haystack.trim()) return null;

  const prefix = opts.mode === "work" ? (opts.isRetry ? "Reworking" : "Working") : opts.isRetry ? "Rethinking" : "Thinking through";

  if (/\bbooking\.calendars\.get\b|\bcalendar|booking|appointment|availability|meeting\b/.test(haystack)) return `${prefix} booking context`;
  if (/\btasks?\.|task|todo|checklist|follow[-\s]?up\b/.test(haystack)) return `${prefix} task context`;
  if (/\binbox\.|\binbox|email|sms|text message|conversation|thread\b/.test(haystack)) return `${prefix} inbox context`;
  if (/\bcontacts?\.|\bcontact|lead|customer|client|prospect\b/.test(haystack)) return `${prefix} contact context`;
  if (/\bpeople\.users\.list\b|\bteam|staff|employee|member|owner|user\b/.test(haystack)) return `${prefix} team context`;
  if (/\bmedia\.|\bmedia|asset|image|photo|video|upload|folder|library\b/.test(haystack)) return `${prefix} media context`;
  if (/\breporting\.|\breporting|dashboard|analytics|metrics|revenue|sales|stripe|payment\b/.test(haystack)) return `${prefix} reporting context`;
  if (/\bai_chat\.|\bai chat|chat thread|conversation history\b/.test(haystack)) return `${prefix} chat context`;
  if (/\bfunnel|landing page|page builder|website|checkout|upsell|downsell|thank you\b/.test(haystack) || String(opts.canvasUrl || "").toLowerCase().includes("/funnel")) {
    return `${prefix} funnel context`;
  }

  return null;
}

export function PortalAiChatClient({
  basePath = "/portal",
  initialThreadRef = null,
}: {
  basePath?: string;
  initialThreadRef?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialRequestedThreadId = useMemo(() => {
    const fromRoute = parsePortalAiChatThreadRef(initialThreadRef);
    if (fromRoute) return fromRoute;
    return (searchParams?.get("thread") || "").trim() || null;
  }, [initialThreadRef, searchParams]);
  const [requestedThreadIdState, setRequestedThreadIdState] = useState<string | null>(initialRequestedThreadId);
  // Threads sidebar is resize-only (no close control).
  const [canvasOpen, setCanvasOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("puraCanvasOpen");
      return raw === null ? true : raw === "true";
    }
    return true;
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(320);

  useEffect(() => {
    window.localStorage.setItem("puraCanvasOpen", String(canvasOpen));
    try {
      window.dispatchEvent(new CustomEvent("puraCanvasOpenChanged", { detail: { open: canvasOpen } }));
    } catch {
      // ignore
    }
  }, [canvasOpen]);

  const [threadUiStateById, setThreadUiStateById] = useState<Record<string, ThreadUiState>>(() => ({
    [DRAFT_THREAD_KEY]: createEmptyThreadUiState(),
  }));

  const toast = useToast();

  const clientTimeZone = useMemo(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return typeof tz === "string" && tz.trim() ? tz.trim() : null;
    } catch {
      return null;
    }
  }, []);

  const clientTimeZoneHeaders = useMemo(() => {
    return clientTimeZone ? ({ "x-client-timezone": clientTimeZone } as Record<string, string>) : ({} as Record<string, string>);
  }, [clientTimeZone]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingComposerSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    try {
      const cs = window.getComputedStyle(el);
      const lineHeight = Number.parseFloat(cs.lineHeight || "20") || 20;
      const padTop = Number.parseFloat(cs.paddingTop || "0") || 0;
      const padBottom = Number.parseFloat(cs.paddingBottom || "0") || 0;
      const maxLines = 5;
      const maxHeight = Math.ceil(lineHeight * maxLines + padTop + padBottom);

      el.style.height = "auto";
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = `${Math.max(next, 44)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    } catch {
      // ignore
    }
  }, []);

  const focusComposer = useCallback((selection: "end" | { start: number; end: number } = "end") => {
    const composer = inputRef.current;
    if (!composer) return;
    composer.focus();
    const nextSelection = selection === "end"
      ? { start: normalizeComposerPlainText(composer.value || "").length, end: normalizeComposerPlainText(composer.value || "").length }
      : selection;
    pendingComposerSelectionRef.current = nextSelection;
    setComposerSelectionSnapshot(nextSelection);
    requestAnimationFrame(() => {
      const currentComposer = inputRef.current;
      const pendingSelection = pendingComposerSelectionRef.current;
      if (!currentComposer || !pendingSelection) return;
      setComposerSelectionOffsets(currentComposer, pendingSelection.start, pendingSelection.end);
    });
  }, []);

  const openCanvasInNewTab = useCallback((url: string | null) => {
    const u = typeof url === "string" ? url.trim() : "";
    if (!u) return;
    try {
      window.open(u, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  }, []);

  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(520);
  const [canvasModalOpen, setCanvasModalOpen] = useState(false);
  const [canvasDragging, setCanvasDragging] = useState(false);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasIframeRef = useRef<HTMLIFrameElement | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const canvasUi = usePuraCanvasUiBridgeClient(canvasIframeRef);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("puraCanvasWidthPx");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) setCanvasWidth(Math.max(320, Math.min(980, Math.floor(n))));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("puraSidebarWidthPx");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) setSidebarWidth(Math.max(240, Math.min(520, Math.floor(n))));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("puraCanvasWidthPx", String(canvasWidth));
    } catch {
      // ignore
    }
  }, [canvasWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem("puraSidebarWidthPx", String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const container = canvasContainerRef.current;
        const containerW = container?.getBoundingClientRect().width ?? 0;
        const dx = drag.startX - e.clientX;
        const next = drag.startWidth + dx;
        const max = containerW ? Math.max(360, Math.min(980, containerW - 360)) : 980;
        setCanvasWidth(Math.max(320, Math.min(max, Math.floor(next))));
      }

      const sideDrag = sidebarDragRef.current;
      if (sideDrag) {
        const dx = e.clientX - sideDrag.startX;
        const next = sideDrag.startWidth + dx;
        setSidebarWidth(Math.max(240, Math.min(520, Math.floor(next))));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      sidebarDragRef.current = null;
      setCanvasDragging(false);
      setSidebarDragging(false);
      try {
        canvasIframeRef.current?.style.removeProperty("pointer-events");
      } catch {
        // ignore
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Intentionally no local chat command interception.
  // Every user message should go through the server AI pipeline.

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialRequestedThreadId);

  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>(() => ({ [DRAFT_THREAD_KEY]: [] }));
  const [threadLiveStatusById, setThreadLiveStatusById] = useState<Record<string, LiveStatus | null>>(() => ({}));
  const [threadUnresolvedRunById, setThreadUnresolvedRunById] = useState<Record<string, UnresolvedRun | null>>(() => ({}));
  const [threadNextStepContextById, setThreadNextStepContextById] = useState<Record<string, NextStepContext | null>>(() => ({}));
  const [threadWorkingMemoryById, setThreadWorkingMemoryById] = useState<Record<string, WorkingMemory | null>>(() => ({}));
  const [loadingThreadIds, setLoadingThreadIds] = useState<Set<string>>(() => {
    const next = new Set<string>();
    if (initialRequestedThreadId) next.add(initialRequestedThreadId);
    return next;
  });
  const [serviceUsageCounts, setServiceUsageCounts] = useState<Record<string, number>>({});
  // Must be stable for SSR + hydration. We randomize it after mount.
  const [welcomePromptSeed, setWelcomePromptSeed] = useState(() => "0");
  const [welcomePromptRotationSnapshot, setWelcomePromptRotationSnapshot] = useState(0);
  const [welcomePromptHistorySnapshot, setWelcomePromptHistorySnapshot] = useState<string[]>([]);

  const [threadDraftsById, setThreadDraftsById] = useState<Record<string, ThreadDraftState>>(() => ({
    [DRAFT_THREAD_KEY]: createEmptyThreadDraftState(),
  }));
  const [editingMessageIdByThread, setEditingMessageIdByThread] = useState<Record<string, string | null>>(() => ({}));
  const [sendingThreadIds, setSendingThreadIds] = useState<Set<string>>(() => new Set());
  const [draftSending, setDraftSending] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictatingMessageId, setDictatingMessageId] = useState<string | null>(null);
  const [dictationPlayingMessageId, setDictationPlayingMessageId] = useState<string | null>(null);
  const dictationRef = useRef<DictationPlaybackState | null>(null);
  const [regeneratingTarget, setRegeneratingTarget] = useState<null | { threadId: string; messageId: string }>(null);
  const [chatMode, setChatMode] = useState<ChatMode>(() => readStoredDraftChatMode());
  const [responseProfile, setResponseProfile] = useState<PuraAiProfile>(() => readStoredDraftResponseProfile());
  const [modeControlsOpen, setModeControlsOpen] = useState(false);
  const [messageDisplayModesById, setMessageDisplayModesById] = useState<Record<string, ChatMode>>(() => ({}));
  const welcomePromptRotationRef = useRef(0);
  const welcomePromptHistoryRef = useRef<string[]>([]);
  const lastWelcomePromptSelectionRef = useRef("");

  const [scheduleTaskOpen, setScheduleTaskOpen] = useState(false);
  const [scheduleTaskText, setScheduleTaskText] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const storedRotation = readStoredWelcomePromptRotation();
    const storedHistory = readStoredWelcomePromptHistory();
    welcomePromptRotationRef.current = storedRotation;
    welcomePromptHistoryRef.current = storedHistory;
    setWelcomePromptRotationSnapshot(storedRotation);
    setWelcomePromptHistorySnapshot(storedHistory.slice(0, 12));
  }, []);

  const [attachMenu, setAttachMenu] = useState<FixedMenuStyle | null>(null);
  const [attachMenuAnchorRect, setAttachMenuAnchorRect] = useState<DOMRect | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const attachMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerTextareaWrapRef = useRef<HTMLDivElement | null>(null);
  const composerSuggestionPopoverRef = useRef<HTMLDivElement | null>(null);
  const composerDisconnectPopoverRef = useRef<HTMLDivElement | null>(null);
  const [dismissedComposerPopoverSignatures, setDismissedComposerPopoverSignatures] = useState<string[]>([]);
  const [composerSuggestionPopoverLayout, setComposerSuggestionPopoverLayout] = useState<{ left: number; arrowLeft: number } | null>(null);
  const [composerDisconnectPopover, setComposerDisconnectPopover] = useState<{
    slug: string;
    title: string;
    anchorLeft: number;
  } | null>(null);
  const [composerDisconnectPopoverLayout, setComposerDisconnectPopoverLayout] = useState<{ left: number; arrowLeft: number } | null>(null);
  const [composerSelectionSnapshot, setComposerSelectionSnapshot] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [composerScrollSnapshot, setComposerScrollSnapshot] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const [threadMenu, setThreadMenu] = useState<FixedMenuStyle | null>(null);
  const [threadMenuAnchorRect, setThreadMenuAnchorRect] = useState<DOMRect | null>(null);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const [threadMenuThreadId, setThreadMenuThreadId] = useState<string | null>(null);

  const closeThreadMenu = useCallback(() => {
    setThreadMenu(null);
    setThreadMenuAnchorRect(null);
    setThreadMenuThreadId(null);
  }, []);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const [interruptingThreadIds, setInterruptingThreadIds] = useState<Set<string>>(() => new Set());

  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmModal, setConfirmModal] = useState<
    | null
    | {
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        destructive?: boolean;
      }
  >(null);

  const closeConfirm = useCallback((ok: boolean) => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmModal(null);
    resolve?.(ok);
  }, []);

  const askConfirm = useCallback(
    async (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    }) => {
      if (confirmResolveRef.current) return false;
      return await new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmModal({
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel,
          cancelLabel: opts.cancelLabel,
          destructive: opts.destructive,
        });
      });
    },
    [],
  );

  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);

  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledRows, setScheduledRows] = useState<
    Array<{
      id: string;
      threadId: string;
      threadTitle: string;
      displayText: string;
      sendAt: string | null;
      recurrenceTimeZone?: string | null;
      repeatEveryMinutes: number;
      lastRunAt?: string | null;
      lastRunOk?: boolean | null;
      lastRunSummary?: string | null;
    }>
  >([]);

  type RepeatUnit = "minutes" | "hours" | "days" | "weeks";
  const [scheduledEditing, setScheduledEditing] = useState<Record<string, { sendAtLocal: string; repeatEvery: string; repeatUnit: RepeatUnit }>>({});
  const [scheduledSavingIds, setScheduledSavingIds] = useState<Set<string>>(() => new Set());
  const [runsOpen, setRunsOpen] = useState(false);
  const [activityView, setActivityView] = useState<ActivityView>({ kind: "list" });
  const [runsLoading, setRunsLoading] = useState(false);
  const [runLedgerRows, setRunLedgerRows] = useState<RunLedgerEntry[]>([]);
  const [acknowledgedThreadMemoryById, setAcknowledgedThreadMemoryById] = useState<Record<string, string>>(() => ({}));

  const [shareOpen, setShareOpen] = useState(false);
  const [shareThread, setShareThread] = useState<Thread | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareMembers, setShareMembers] = useState<ShareMember[]>([]);
  const [shareCreatorUserId, setShareCreatorUserId] = useState<string | null>(null);
  const [shareSelectedUserIds, setShareSelectedUserIds] = useState<Set<string>>(() => new Set());
  const [shareQuery, setShareQuery] = useState("");

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const forceScrollToBottomRef = useRef(false);
  const pendingInitialThreadScrollRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const manualScrollHoldUntilRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const sendInFlightRef = useRef<Set<string>>(new Set());
  const activeThreadIdRef = useRef<string | null>(null);
  const pendingThreadIdsRef = useRef<Set<string>>(new Set());
  const pendingChatModeByThreadRef = useRef<Record<string, ChatMode | undefined>>({});
  const pendingResponseProfileByThreadRef = useRef<Record<string, PuraAiProfile | undefined>>({});
  const threadDraftsRef = useRef<Record<string, ThreadDraftState>>({ [DRAFT_THREAD_KEY]: createEmptyThreadDraftState() });
  const editingMessageIdByThreadRef = useRef<Record<string, string | null>>({});
  const threadsRef = useRef<Thread[]>([]);
  const messagesByThreadRef = useRef<Record<string, Message[]>>({ [DRAFT_THREAD_KEY]: [] });
  const messageDisplayModesByIdRef = useRef<Record<string, ChatMode>>({});
  const threadLiveStatusByIdRef = useRef<Record<string, LiveStatus | null>>({});
  const threadMessageRefreshInFlightRef = useRef<Set<string>>(new Set());

  const activeThreadKey = activeThreadId ?? DRAFT_THREAD_KEY;
  const activeThread = useMemo(() => (activeThreadId ? threads.find((thread) => thread.id === activeThreadId) ?? null : null), [activeThreadId, threads]);
  const messages = useMemo(() => messagesByThread[activeThreadKey] ?? [], [activeThreadKey, messagesByThread]);
  const latestMessageId = useMemo(() => messages[messages.length - 1]?.id ?? null, [messages]);
  const activeLiveStatus = activeThreadId ? threadLiveStatusById[activeThreadId] ?? null : null;
  const activeUnresolvedRun = activeThreadId ? threadUnresolvedRunById[activeThreadId] ?? null : null;
  const activeNextStepContext = activeThreadId ? threadNextStepContextById[activeThreadId] ?? null : null;
  const activeWorkingMemory = activeThreadId ? threadWorkingMemoryById[activeThreadId] ?? null : null;
  const messagesLoading = activeThreadId ? loadingThreadIds.has(activeThreadId) : false;
  const sending = activeThreadId ? sendingThreadIds.has(activeThreadId) : draftSending;
  const regenerating = Boolean(activeThreadId && regeneratingTarget?.threadId === activeThreadId);
  const activeThreadUiState = threadUiStateById[activeThreadKey] ?? createEmptyThreadUiState();
  const activeThreadDraft = threadDraftsById[activeThreadKey] ?? createEmptyThreadDraftState();
  const ambiguousContacts = activeThreadUiState.ambiguousContacts;
  const assistantChoices = activeThreadUiState.assistantChoices;
  const canvasUiAmbiguity = activeThreadUiState.canvasUiAmbiguity;
  const canvasUiResumeActions = activeThreadUiState.canvasUiResumeActions;
  const input = activeThreadDraft.input;
  const pendingAttachments = activeThreadDraft.pendingAttachments;
  const selectedContextServiceSlugs = useMemo(
    () => normalizeContextServiceSlugs(activeThreadDraft.contextServiceSlugs),
    [activeThreadDraft.contextServiceSlugs],
  );
  const selectedContextServices = useMemo(
    () => selectedContextServiceSlugs.map((slug) => findPortalContextService(slug)).filter(Boolean) as PortalService[],
    [selectedContextServiceSlugs],
  );
  const editingMessageId = editingMessageIdByThread[activeThreadKey] ?? null;
  const isEditing = Boolean(editingMessageId);
  const requestedThreadId = requestedThreadIdState;
  const currentHref = useMemo(() => {
    const query = searchParams?.toString();
    return `${pathname || ""}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);
  const effectiveChatMode: ChatMode = activeThread?.chatMode ? normalizeThreadChatMode(activeThread.chatMode) : chatMode;
  const effectiveResponseProfile: PuraAiProfile = activeThread?.responseProfile ? normalizeThreadResponseProfile(activeThread.responseProfile) : responseProfile;
  const effectiveChatModeLabel = effectiveChatMode === "plan" ? "Discuss" : "Work";
  const effectiveResponseProfileLabel = useMemo(
    () => PURA_AI_PROFILE_OPTIONS.find((option) => option.value === effectiveResponseProfile)?.label || "Balanced",
    [effectiveResponseProfile],
  );
  const modeSummaryLabel = `${effectiveChatModeLabel} ${effectiveResponseProfileLabel}`;
  const hasThinkingMessage = messages.some((msg) => msg.role === "assistant" && String(msg.id || "").startsWith("optimistic-assistant-"));
  const latestPendingUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg || msg.role !== "user") continue;
      const text = String(msg.text || "").trim();
      if (!text) continue;
      return text;
    }
    return "";
  }, [messages]);
  const inferredWorkStatusLabel = useMemo(() => {
    return describeLiveWorkLabel({
      text: input || latestPendingUserText,
      canvasUrl,
      actionKey: runningActionKey,
      mode: effectiveChatMode,
      isRetry: regenerating,
    });
  }, [canvasUrl, effectiveChatMode, input, latestPendingUserText, regenerating, runningActionKey]);
  const liveWorkStatusLabel = useMemo(() => {
    return activeLiveStatus?.label?.trim() || null;
  }, [activeLiveStatus]);
  const activeCanInterrupt = useMemo(() => {
    return Boolean(activeThreadId && activeLiveStatus?.canInterrupt && activeLiveStatus?.runId);
  }, [activeLiveStatus?.canInterrupt, activeLiveStatus?.runId, activeThreadId]);
  const chatSurfaceClassName = classNames(
    "relative flex min-w-0 flex-1 bg-white shadow-[inset_12px_0_16px_-16px_rgba(0,0,0,0.22)]",
  );
  const chatScrollerClassName = classNames(
    "relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white",
  );
  const sortedRunLedgerRows = useMemo(() => {
    const rows = [...runLedgerRows];
    const activeRunId = typeof activeLiveStatus?.runId === "string" ? activeLiveStatus.runId.trim() : "";
    rows.sort((a, b) => {
      const aIsActive = Boolean(activeRunId && a.runId === activeRunId);
      const bIsActive = Boolean(activeRunId && b.runId === activeRunId);
      if (aIsActive !== bIsActive) return aIsActive ? -1 : 1;

      const aIsRunning = a.status === "running";
      const bIsRunning = b.status === "running";
      if (aIsRunning !== bIsRunning) return aIsRunning ? -1 : 1;

      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
    return rows;
  }, [activeLiveStatus?.runId, runLedgerRows]);
  const activeRunLedgerRow = useMemo(() => {
    const activeRunId = typeof activeLiveStatus?.runId === "string" ? activeLiveStatus.runId.trim() : "";
    if (!activeRunId) return null;
    return sortedRunLedgerRows.find((row) => row.runId === activeRunId) || null;
  }, [activeLiveStatus?.runId, sortedRunLedgerRows]);
  const selectedActivityRun = useMemo(() => {
    if (activityView.kind !== "run") return null;
    return sortedRunLedgerRows.find((row) => row.id === activityView.runId) || null;
  }, [activityView, sortedRunLedgerRows]);
  const showActiveLiveProgressCard = useMemo(() => {
    if (!activeThreadId || !activeLiveStatus) return false;
    return sending || hasThinkingMessage || regenerating || Boolean(runningActionKey) || Boolean(activeLiveStatus.label);
  }, [activeLiveStatus, activeThreadId, hasThinkingMessage, regenerating, runningActionKey, sending]);
  const activeThreadMemorySignature = useMemo(() => threadMemorySignature(activeWorkingMemory), [activeWorkingMemory]);
  const showThreadMemoryNotice = useMemo(() => {
    if (!activeThreadId || !activeWorkingMemory || !activeThreadMemorySignature) return false;
    return acknowledgedThreadMemoryById[activeThreadId] !== activeThreadMemorySignature;
  }, [acknowledgedThreadMemoryById, activeThreadId, activeThreadMemorySignature, activeWorkingMemory]);
  const workStatusLabel = useMemo(() => {
    if (liveWorkStatusLabel) return liveWorkStatusLabel;
    if (regenerating && regeneratingTarget?.messageId) return inferredWorkStatusLabel || (effectiveChatMode === "work" ? "Reworking that response" : "Redoing that response");
    if (runningActionKey) return inferredWorkStatusLabel || (effectiveChatMode === "work" ? "Working through the next step" : "Thinking through the next step");
    if (sending || hasThinkingMessage) return inferredWorkStatusLabel || (effectiveChatMode === "work" ? "Working on it" : "Thinking it through");
    return null;
  }, [effectiveChatMode, hasThinkingMessage, inferredWorkStatusLabel, liveWorkStatusLabel, regenerating, regeneratingTarget?.messageId, runningActionKey, sending]);

  const closeActivityModal = useCallback(() => {
    setRunsOpen(false);
    setActivityView({ kind: "list" });
  }, []);

  const acknowledgeActiveThreadMemory = useCallback(() => {
    if (!activeThreadId || !activeThreadMemorySignature) return;
    setAcknowledgedThreadMemoryById((prev) => {
      if (prev[activeThreadId] === activeThreadMemorySignature) return prev;
      return { ...prev, [activeThreadId]: activeThreadMemorySignature };
    });
  }, [activeThreadId, activeThreadMemorySignature]);

  const openThreadMemoryActivity = useCallback(() => {
    acknowledgeActiveThreadMemory();
    setActivityView({ kind: "thread-memory" });
    setRunsOpen(true);
  }, [acknowledgeActiveThreadMemory]);

  useEffect(() => {
    if (runsOpen) return;
    setActivityView({ kind: "list" });
  }, [runsOpen]);

  const latestAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (!message || message.role !== "assistant") continue;
      if (String(message.id || "").startsWith("optimistic-assistant-")) continue;
      if (!String(message.text || "").trim()) continue;
      return message;
    }
    return null;
  }, [messages]);

  const showNextStepCard = useMemo(() => {
    if (showActiveLiveProgressCard || activeUnresolvedRun || !activeNextStepContext) return false;
    return !isDuplicateNextStepCard(activeNextStepContext, latestAssistantMessage);
  }, [activeNextStepContext, activeUnresolvedRun, latestAssistantMessage, showActiveLiveProgressCard]);

  useLayoutEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    setRequestedThreadIdState(initialRequestedThreadId);
  }, [initialRequestedThreadId]);

  useLayoutEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useLayoutEffect(() => {
    messagesByThreadRef.current = messagesByThread;
  }, [messagesByThread]);

  useLayoutEffect(() => {
    messageDisplayModesByIdRef.current = messageDisplayModesById;
  }, [messageDisplayModesById]);

  useLayoutEffect(() => {
    threadLiveStatusByIdRef.current = threadLiveStatusById;
  }, [threadLiveStatusById]);

  useLayoutEffect(() => {
    threadDraftsRef.current = threadDraftsById;
  }, [threadDraftsById]);

  useLayoutEffect(() => {
    editingMessageIdByThreadRef.current = editingMessageIdByThread;
  }, [editingMessageIdByThread]);

  const navigateToThread = useCallback(
    (thread: Pick<Thread, "id" | "title"> | null, mode: "push" | "replace" = "push") => {
      const href = buildPortalAiChatThreadHref({
        basePath,
        thread: thread ? { id: thread.id, title: thread.title } : null,
      });
      setRequestedThreadIdState(thread?.id ?? null);
      if (currentHref === href) return;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [basePath, currentHref, router],
  );

  const rememberMessageDisplayMode = useCallback((messageId: string | null | undefined, mode: ChatMode | null | undefined) => {
    if (!messageId || !mode) return;
    setMessageDisplayModesById((prev) => {
      if (prev[messageId] === mode) return prev;
      return { ...prev, [messageId]: mode };
    });
  }, []);

  const persistDraftPreferences = useCallback((nextMode: ChatMode, nextProfile: PuraAiProfile) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PURA_CHAT_DEFAULT_MODE_STORAGE_KEY, nextMode);
      window.localStorage.setItem(PURA_CHAT_DEFAULT_PROFILE_STORAGE_KEY, nextProfile);
    } catch {
      // ignore
    }
  }, []);

  const resolveThreadChatMode = useCallback((threadId: string, nextModeRaw: unknown) => {
    const pending = pendingChatModeByThreadRef.current[threadId];
    return pending ? normalizeThreadChatMode(pending) : normalizeThreadChatMode(nextModeRaw);
  }, []);

  const resolveThreadResponseProfile = useCallback((threadId: string, nextProfileRaw: unknown) => {
    const pending = pendingResponseProfileByThreadRef.current[threadId];
    return pending ? normalizeThreadResponseProfile(pending) : normalizeThreadResponseProfile(nextProfileRaw);
  }, []);

  const loadThreadsRef = useRef<() => Promise<void>>(async () => {});
  const loadThreadStatusRef = useRef<(threadId: string, payloadOverride?: any) => Promise<void>>(async () => {});

  const applyThreadChatMode = useCallback((threadId: string, nextModeRaw: unknown) => {
    const nextMode = resolveThreadChatMode(threadId, nextModeRaw);
    setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, chatMode: nextMode } : thread)));
  }, [resolveThreadChatMode]);

  const applyThreadResponseProfile = useCallback((threadId: string, nextProfileRaw: unknown) => {
    const nextProfile = resolveThreadResponseProfile(threadId, nextProfileRaw);
    setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, responseProfile: nextProfile } : thread)));
  }, [resolveThreadResponseProfile]);

  const setChatModeForCurrentThread = useCallback(
    async (nextMode: ChatMode) => {
      if (activeThreadId && (sending || regenerating || Boolean(runningActionKey) || Boolean(activeLiveStatus?.label))) {
        toast.error("Wait for the current run to finish before changing mode.");
        return;
      }
      setChatMode(nextMode);
      persistDraftPreferences(nextMode, effectiveResponseProfile);
      if (!activeThreadId) return;
      pendingChatModeByThreadRef.current[activeThreadId] = nextMode;
      applyThreadChatMode(activeThreadId, nextMode);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "set_mode", chatMode: nextMode }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Unable to update chat mode");
        delete pendingChatModeByThreadRef.current[activeThreadId];
        applyThreadChatMode(activeThreadId, json.chatMode ?? nextMode);
      } catch (e) {
        delete pendingChatModeByThreadRef.current[activeThreadId];
        void loadThreadsRef.current();
        void loadThreadStatusRef.current(activeThreadId);
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [activeLiveStatus?.label, activeThreadId, applyThreadChatMode, effectiveResponseProfile, persistDraftPreferences, regenerating, runningActionKey, sending, toast],
  );

  const setResponseProfileForCurrentThread = useCallback(
    async (nextProfile: PuraAiProfile) => {
      setResponseProfile(nextProfile);
      persistDraftPreferences(effectiveChatMode, nextProfile);
      if (!activeThreadId) return;
      pendingResponseProfileByThreadRef.current[activeThreadId] = nextProfile;
      applyThreadResponseProfile(activeThreadId, nextProfile);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "set_response_profile", responseProfile: nextProfile }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Unable to update Pura pace");
        delete pendingResponseProfileByThreadRef.current[activeThreadId];
        applyThreadResponseProfile(activeThreadId, json.responseProfile ?? nextProfile);
      } catch (e) {
        delete pendingResponseProfileByThreadRef.current[activeThreadId];
        void loadThreadsRef.current();
        void loadThreadStatusRef.current(activeThreadId);
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [activeThreadId, applyThreadResponseProfile, effectiveChatMode, persistDraftPreferences, toast],
  );

  const setThreadEditingMessageId = useCallback((threadKey: string, messageId: string | null) => {
    setEditingMessageIdByThread((prev) => ({ ...prev, [threadKey]: messageId }));
  }, []);

  const setThreadUiState = useCallback(
    (threadKey: string, updater: (prev: ThreadUiState) => ThreadUiState) => {
      setThreadUiStateById((prev) => {
        const current = prev[threadKey] ?? createEmptyThreadUiState();
        return { ...prev, [threadKey]: updater(current) };
      });
    },
    [],
  );

  const setThreadDraftState = useCallback(
    (threadKey: string, updater: (prev: ThreadDraftState) => ThreadDraftState) => {
      setThreadDraftsById((prev) => {
        const current = prev[threadKey] ?? createEmptyThreadDraftState();
        return { ...prev, [threadKey]: updater(current) };
      });
    },
    [],
  );

  const clearThreadDraftState = useCallback(
    (threadKey: string) => {
      setThreadDraftsById((prev) => ({ ...prev, [threadKey]: createEmptyThreadDraftState() }));
    },
    [],
  );

  const clearThreadUiState = useCallback(
    (threadKey: string) => {
      setThreadUiStateById((prev) => ({ ...prev, [threadKey]: createEmptyThreadUiState() }));
    },
    [],
  );

  const updateThreadMessages = useCallback(
    (threadKey: string, updater: (prev: Message[]) => Message[]) => {
      setMessagesByThread((prev) => {
        const next = {
          ...prev,
          [threadKey]: updater(prev[threadKey] ?? []),
        };
        messagesByThreadRef.current = next;
        return next;
      });
    },
    [],
  );

  const setThreadLoading = useCallback((threadId: string, loading: boolean) => {
    setLoadingThreadIds((prev) => {
      const next = new Set(prev);
      if (loading) next.add(threadId);
      else next.delete(threadId);
      return next;
    });
  }, []);

  const setThreadSending = useCallback((threadId: string, sendingState: boolean) => {
    setSendingThreadIds((prev) => {
      const next = new Set(prev);
      if (sendingState) next.add(threadId);
      else next.delete(threadId);
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-pa-hide-floating-tools", "1");
    return () => {
      root.removeAttribute("data-pa-hide-floating-tools");
    };
  }, []);

  const syncShouldStickToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      shouldStickToBottomRef.current = true;
      return true;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const holdActive = typeof window !== "undefined" && manualScrollHoldUntilRef.current > window.performance.now();
    const shouldStick = !holdActive && distanceFromBottom <= 48;
    shouldStickToBottomRef.current = shouldStick;
    return shouldStick;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (!force && !syncShouldStickToBottom()) return;
    const targetTop = Math.max(0, el.scrollHeight - el.clientHeight);
    if (!force && Math.abs(targetTop - el.scrollTop) <= 2) return;
    el.scrollTo({ top: targetTop, behavior: "auto" });
  }, [syncShouldStickToBottom]);

  const completeInitialThreadScroll = useCallback((threadId: string) => {
    if (typeof window === "undefined") {
      if (activeThreadIdRef.current === threadId) {
        scrollToBottom(true);
        pendingInitialThreadScrollRef.current = null;
      }
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (activeThreadIdRef.current !== threadId) return;
        scrollToBottom(true);
        pendingInitialThreadScrollRef.current = null;
      });
    });
  }, [scrollToBottom]);

  const handleChatScroll = useCallback(() => {
    syncShouldStickToBottom();
  }, [syncShouldStickToBottom]);

  const holdAutoStick = useCallback((ms = 900) => {
    if (typeof window === "undefined") return;
    manualScrollHoldUntilRef.current = window.performance.now() + ms;
  }, []);

  const handleChatWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      shouldStickToBottomRef.current = false;
      holdAutoStick();
    }
  }, [holdAutoStick]);

  const handleChatTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleChatTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    const currentY = event.touches[0]?.clientY ?? null;
    if (startY === null || currentY === null) return;
    if (currentY > startY + 4) {
      shouldStickToBottomRef.current = false;
      holdAutoStick(1100);
    }
  }, [holdAutoStick]);

  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => {
      if (forceScrollToBottomRef.current || shouldStickToBottomRef.current) {
        scrollToBottom(forceScrollToBottomRef.current);
      }
    });
  }, [activeThreadKey, messages, scrollToBottom]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/portal/ai-chat/threads", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Failed to load threads");
      const next = Array.isArray(json.threads)
        ? (json.threads as Array<Thread & { liveStatus?: unknown; latestRunStatus?: unknown; nextStepContext?: unknown; chatMode?: unknown; responseProfile?: unknown }>).map((thread) => ({
            ...thread,
            liveStatus: normalizeLiveStatus(thread?.liveStatus),
            latestRunStatus: normalizeThreadRunStatus(thread?.latestRunStatus),
            nextStepContext: normalizeNextStepContext(thread?.nextStepContext),
            chatMode: resolveThreadChatMode(String(thread.id), thread?.chatMode),
            responseProfile: resolveThreadResponseProfile(String(thread.id), thread?.responseProfile),
          })).sort(compareThreadsForSidebar)
        : [];
      for (const thread of next) pendingThreadIdsRef.current.delete(thread.id);
      setThreads(next);
      threadsRef.current = next;
      setThreadLiveStatusById((prev) => {
        const nextStatuses: Record<string, LiveStatus | null> = {};
        for (const thread of next) {
          nextStatuses[thread.id] = normalizeLiveStatus(thread.liveStatus);
        }
        const activeThreadStatus = activeThreadIdRef.current ? prev[activeThreadIdRef.current] : null;
        if (activeThreadIdRef.current && activeThreadStatus && !nextStatuses[activeThreadIdRef.current]) {
          nextStatuses[activeThreadIdRef.current] = activeThreadStatus;
        }
        return nextStatuses;
      });
      setThreadNextStepContextById((prev) => {
        const nextContexts: Record<string, NextStepContext | null> = {};
        for (const thread of next) {
          nextContexts[thread.id] = normalizeNextStepContext(thread.nextStepContext);
        }
        const activeThreadContext = activeThreadIdRef.current ? prev[activeThreadIdRef.current] ?? null : null;
        if (activeThreadIdRef.current && activeThreadContext && !nextContexts[activeThreadIdRef.current]) {
          nextContexts[activeThreadIdRef.current] = activeThreadContext;
        }
        return nextContexts;
      });

      // Default to a draft "new chat" when opening the page.
      // If an active thread was selected during this session but was deleted,
      // clear it and fall back to draft.
      if (activeThreadId && !next.some((t) => t.id === activeThreadId)) {
        // Never bounce back to draft while the UI has local state for this thread.
        // This covers slow DB replication/eventual-consistency where the thread
        // exists locally but isn't in the server list yet.
        const hasLocalMessages = (messagesByThreadRef.current[activeThreadId] ?? []).length > 0;
        const hasLocalThread = (threadsRef.current ?? []).some((t) => t.id === activeThreadId);
        const hasPendingThread = pendingThreadIdsRef.current.has(activeThreadId);
        const isSending = sendInFlightRef.current.has(activeThreadId);
        if (!isSending && !hasLocalMessages && !hasLocalThread && !hasPendingThread) {
          activeThreadIdRef.current = null;
          setActiveThreadId(null);
          navigateToThread(null, "replace");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setThreadsLoading(false);
    }
  }, [activeThreadId, navigateToThread, resolveThreadChatMode, resolveThreadResponseProfile, toast]);

  loadThreadsRef.current = loadThreads;

  const applyThreadContextSnapshot = useCallback((threadId: string, threadContext: any) => {
    setThreadLiveStatusById((prev) => ({ ...prev, [threadId]: normalizeLiveStatus(threadContext?.liveStatus) }));
    setThreadUnresolvedRunById((prev) => ({ ...prev, [threadId]: normalizeUnresolvedRun(threadContext?.unresolvedRun) }));
    setThreadNextStepContextById((prev) => ({ ...prev, [threadId]: normalizeNextStepContext(threadContext?.nextStepContext) }));
    setThreadWorkingMemoryById((prev) => ({ ...prev, [threadId]: normalizeWorkingMemory(threadContext) }));
    applyThreadChatMode(threadId, threadContext?.chatMode);
    applyThreadResponseProfile(threadId, threadContext?.responseProfile);
    const nextLastCanvasUrl =
      typeof threadContext?.lastCanvasUrl === "string" && threadContext.lastCanvasUrl.trim() ? String(threadContext.lastCanvasUrl).trim() : null;
    if (nextLastCanvasUrl && activeThreadIdRef.current === threadId) {
      setCanvasUrl(nextLastCanvasUrl);
    }
  }, [applyThreadChatMode, applyThreadResponseProfile]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      setThreadLoading(threadId, true);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadId)}/messages`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Failed to load messages");
        const cachedMessages = messagesByThreadRef.current[threadId] ?? [];
        const cachedById = new Map(cachedMessages.map((message) => [message.id, message] as const));
        setMessagesByThread((prev) => {
          const next = {
            ...prev,
            [threadId]: Array.isArray(json.messages)
              ? applyRunTracesToMessages(
                  (json.messages as Message[]).map((message) => {
                    const merged = mergeVisibleContextBadges(
                      message,
                      cachedById.get(String(message.id || "")) || null,
                    );
                    return applyAssistantDisplayMode(merged, messageDisplayModesByIdRef.current[message.id]);
                  }),
                  json?.threadContext?.runs,
                )
              : [],
          };
          messagesByThreadRef.current = next;
          return next;
        });
        pendingThreadIdsRef.current.delete(threadId);
        applyThreadContextSnapshot(threadId, json?.threadContext);
        requestAnimationFrame(() => {
          if (pendingInitialThreadScrollRef.current === threadId) {
            completeInitialThreadScroll(threadId);
            return;
          }
          if (forceScrollToBottomRef.current || shouldStickToBottomRef.current) {
            scrollToBottom(forceScrollToBottomRef.current);
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
      } finally {
        threadMessageRefreshInFlightRef.current.delete(threadId);
        setThreadLoading(threadId, false);
      }
    },
    [applyThreadContextSnapshot, scrollToBottom, setThreadLoading, toast],
  );

  const loadThreadStatus = useCallback(
    async (threadId: string, payloadOverride?: any) => {
      try {
        const json =
          payloadOverride ??
          (await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadId)}/messages?view=status`, {
            cache: "no-store",
          }).then((res) => res.json().catch(() => null)));
        if (!json?.ok) return;
        const prevStatus = threadLiveStatusByIdRef.current[threadId] ?? null;
        const nextStatus = normalizeLiveStatus(json?.threadContext?.liveStatus);
        threadLiveStatusByIdRef.current = { ...threadLiveStatusByIdRef.current, [threadId]: nextStatus };
        setThreadLiveStatusById((prev) => {
          const current = prev[threadId] ?? null;
          if (sameLiveStatus(current, nextStatus)) return prev;
          return { ...prev, [threadId]: nextStatus };
        });
        setThreadUnresolvedRunById((prev) => ({ ...prev, [threadId]: normalizeUnresolvedRun(json?.threadContext?.unresolvedRun) }));
        setThreadNextStepContextById((prev) => ({ ...prev, [threadId]: normalizeNextStepContext(json?.threadContext?.nextStepContext) }));
        setThreadWorkingMemoryById((prev) => ({ ...prev, [threadId]: normalizeWorkingMemory(json?.threadContext) }));
        applyThreadChatMode(threadId, json?.threadContext?.chatMode);
        applyThreadResponseProfile(threadId, json?.threadContext?.responseProfile);
        const nextLastCanvasUrl =
          typeof json?.threadContext?.lastCanvasUrl === "string" && json.threadContext.lastCanvasUrl.trim()
            ? String(json.threadContext.lastCanvasUrl).trim()
            : null;
        if (nextLastCanvasUrl && activeThreadIdRef.current === threadId) {
          setCanvasUrl(nextLastCanvasUrl);
        }
        const shouldRefreshMessages =
          activeThreadIdRef.current === threadId &&
          !sendInFlightRef.current.has(threadId) &&
          !threadMessageRefreshInFlightRef.current.has(threadId) &&
          !nextStatus?.label &&
          (Boolean(prevStatus?.label) ||
            (typeof nextStatus?.updatedAt === "string" && nextStatus.updatedAt !== prevStatus?.updatedAt));
        if (shouldRefreshMessages) {
          threadMessageRefreshInFlightRef.current.add(threadId);
          void loadMessages(threadId);
        }
      } catch {
        // ignore lightweight status refresh failures
      }
    },
    [applyThreadChatMode, applyThreadResponseProfile, loadMessages],
  );

  loadThreadStatusRef.current = loadThreadStatus;

  const loadThreadStatusLegacy = useCallback(
    async (threadId: string) => {
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadId)}/messages?view=status`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) return;
        const nextStatus = normalizeLiveStatus(json?.threadContext?.liveStatus);
        threadLiveStatusByIdRef.current = { ...threadLiveStatusByIdRef.current, [threadId]: nextStatus };
        setThreadLiveStatusById((prev) => {
          const current = prev[threadId] ?? null;
          if (
            current?.phase === nextStatus?.phase &&
            current?.label === nextStatus?.label &&
            current?.actionKey === nextStatus?.actionKey &&
            current?.title === nextStatus?.title &&
            current?.updatedAt === nextStatus?.updatedAt
          ) {
            return prev;
          }
          return { ...prev, [threadId]: nextStatus };
        });
        setThreadUnresolvedRunById((prev) => ({ ...prev, [threadId]: normalizeUnresolvedRun(json?.threadContext?.unresolvedRun) }));
        setThreadNextStepContextById((prev) => ({ ...prev, [threadId]: normalizeNextStepContext(json?.threadContext?.nextStepContext) }));
        setThreadWorkingMemoryById((prev) => ({ ...prev, [threadId]: normalizeWorkingMemory(json?.threadContext) }));
        applyThreadChatMode(threadId, json?.threadContext?.chatMode);
        applyThreadResponseProfile(threadId, json?.threadContext?.responseProfile);
        const nextLastCanvasUrl =
          typeof json?.threadContext?.lastCanvasUrl === "string" && json.threadContext.lastCanvasUrl.trim()
            ? String(json.threadContext.lastCanvasUrl).trim()
            : null;
        if (nextLastCanvasUrl && activeThreadIdRef.current === threadId) {
          setCanvasUrl(nextLastCanvasUrl);
        }
      } catch {
        // ignore lightweight polling failures
      }
    },
    [applyThreadChatMode, applyThreadResponseProfile],
  );

  const applyStreamedThreadsSnapshot = useCallback((threadsRaw: unknown) => {
    const next = Array.isArray(threadsRaw)
      ? (threadsRaw as Array<Thread & { liveStatus?: unknown; latestRunStatus?: unknown; nextStepContext?: unknown; chatMode?: unknown; responseProfile?: unknown }>).map((thread) => ({
          ...thread,
          liveStatus: normalizeLiveStatus(thread?.liveStatus),
          latestRunStatus: normalizeThreadRunStatus(thread?.latestRunStatus),
          nextStepContext: normalizeNextStepContext(thread?.nextStepContext),
          chatMode: resolveThreadChatMode(String(thread.id), thread?.chatMode),
          responseProfile: resolveThreadResponseProfile(String(thread.id), thread?.responseProfile),
        }))
      : [];

    for (const thread of next) pendingThreadIdsRef.current.delete(thread.id);
    setThreads((prev) => {
      const prevById = new Map(prev.map((thread) => [thread.id, thread]));
      const merged = next.map((thread) => ({ ...prevById.get(thread.id), ...thread }));
      const sorted = merged.sort(compareThreadsForSidebar);
      threadsRef.current = sorted;
      return sorted;
    });

    setThreadLiveStatusById((prev) => {
      const nextStatuses: Record<string, LiveStatus | null> = {};
      for (const thread of next) {
        nextStatuses[thread.id] = normalizeLiveStatus(thread.liveStatus);
      }
      const activeThreadStatus = activeThreadIdRef.current ? prev[activeThreadIdRef.current] : null;
      if (activeThreadIdRef.current && activeThreadStatus && !nextStatuses[activeThreadIdRef.current]) {
        nextStatuses[activeThreadIdRef.current] = activeThreadStatus;
      }
      return nextStatuses;
    });
    setThreadNextStepContextById((prev) => {
      const nextContexts: Record<string, NextStepContext | null> = {};
      for (const thread of next) {
        nextContexts[thread.id] = normalizeNextStepContext(thread.nextStepContext);
      }
      const activeThreadContext = activeThreadIdRef.current ? prev[activeThreadIdRef.current] ?? null : null;
      if (activeThreadIdRef.current && activeThreadContext && !nextContexts[activeThreadIdRef.current]) {
        nextContexts[activeThreadIdRef.current] = activeThreadContext;
      }
      return nextContexts;
    });
  }, [resolveThreadChatMode, resolveThreadResponseProfile]);

  const selectThread = useCallback(
    (threadId: string) => {
      pendingInitialThreadScrollRef.current = threadId;
      forceScrollToBottomRef.current = true;
      shouldStickToBottomRef.current = true;
      manualScrollHoldUntilRef.current = 0;
      setThreadLoading(threadId, true);
      activeThreadIdRef.current = threadId;
      setActiveThreadId(threadId);
      setCanvasUrl(null);
      setCanvasModalOpen(false);
      setCanvasOpen(false);
      setMobileThreadsOpen(false);
    },
    [setActiveThreadId, setThreadLoading],
  );

  useEffect(() => {
    if (!forceScrollToBottomRef.current) return;
    if (messagesLoading) return;
    if (!activeThreadId) return;
    forceScrollToBottomRef.current = false;
    if (pendingInitialThreadScrollRef.current === activeThreadId) {
      completeInitialThreadScroll(activeThreadId);
      return;
    }
    requestAnimationFrame(() => scrollToBottom(true));
  }, [activeThreadId, completeInitialThreadScroll, messagesLoading, messages.length, scrollToBottom]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const source = new EventSource("/api/portal/ai-chat/threads/status");

    const onThreads = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      if (!messageEvent.data) return;
      try {
        const json = JSON.parse(messageEvent.data);
        if (!json?.ok) return;
        applyStreamedThreadsSnapshot(json.threads);
      } catch {
        // ignore malformed event payloads
      }
    };

    source.addEventListener("threads", onThreads);
    source.onerror = () => {
      void loadThreads();
    };

    return () => {
      source.removeEventListener("threads", onThreads);
      source.close();
    };
  }, [applyStreamedThreadsSnapshot, loadThreads]);

  useEffect(() => {
    if (messagesLoading || messages.length > 0) return;
    try {
      const raw = window.localStorage.getItem("pa.portal.serviceUsageCounts");
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const next: Record<string, number> = {};
      for (const [slug, value] of Object.entries(parsed || {})) {
        const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
        if (Number.isFinite(numeric) && numeric > 0) next[slug] = Math.max(0, Math.floor(numeric));
      }
      setServiceUsageCounts(next);
    } catch {
      setServiceUsageCounts({});
    }
  }, [activeThreadId, messages.length, messagesLoading]);

  useEffect(() => {
    if (!activeThreadId) return;
    // If we're currently sending in this thread, avoid reloading messages from the server.
    // The server may not have persisted the new message yet, and we'd overwrite optimistic UI.
    if (sendInFlightRef.current.has(activeThreadId)) return;
    const threadExists = threads.some((thread) => thread.id === activeThreadId);
    const hasLocalMessages = (messagesByThreadRef.current[activeThreadId] ?? []).length > 0;
    const hasPendingThread = pendingThreadIdsRef.current.has(activeThreadId);
    if (!threadsLoading && !threadExists && !hasLocalMessages && !hasPendingThread) {
      activeThreadIdRef.current = null;
      setActiveThreadId(null);
      navigateToThread(null, "replace");
      return;
    }
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages, navigateToThread, threads, threadsLoading]);

  useEffect(() => {
    if (!activeThreadId) return;

    const source = new EventSource(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/status`);

    const onStatus = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      if (!messageEvent.data) return;
      try {
        const json = JSON.parse(messageEvent.data);
        void loadThreadStatus(activeThreadId, json);
      } catch {
        // ignore malformed event payloads
      }
    };

    source.addEventListener("status", onStatus);
    source.onerror = () => {
      void loadThreadStatusLegacy(activeThreadId);
    };

    return () => {
      source.removeEventListener("status", onStatus);
      source.close();
    };
  }, [activeThreadId, loadThreadStatus, loadThreadStatusLegacy]);

  useEffect(() => {
    if (!requestedThreadId || threadsLoading) return;
    if (!threads.some((thread) => thread.id === requestedThreadId)) return;
    if (activeThreadId === requestedThreadId) return;
    selectThread(requestedThreadId);
  }, [activeThreadId, requestedThreadId, selectThread, threads, threadsLoading]);

  const createThread = useCallback(() => {
    // "New chat" is a local-only draft until the user sends the first message.
    // This prevents empty threads from being persisted.
    forceScrollToBottomRef.current = true;
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setMessagesByThread((prev) => ({ ...prev, [DRAFT_THREAD_KEY]: [] }));
    clearThreadDraftState(DRAFT_THREAD_KEY);
    clearThreadUiState(DRAFT_THREAD_KEY);
    setCanvasUrl(null);
    setCanvasModalOpen(false);
    setCanvasOpen(false);
    setMobileThreadsOpen(false);
    navigateToThread(null, "push");
  }, [clearThreadDraftState, clearThreadUiState, navigateToThread]);

  const pinThread = useCallback(
    async (thread: Thread) => {
      try {
        const action = thread.isPinned ? "unpin" : "pin";
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(thread.id)}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Unable to update chat");
        toast.success(thread.isPinned ? "Unpinned" : "Pinned");
        closeThreadMenu();
        void loadThreads();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [closeThreadMenu, loadThreads, toast],
  );

  const duplicateThread = useCallback(
    async (thread: Thread) => {
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(thread.id)}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "duplicate" }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Unable to duplicate chat");
        const t = json.newThread as Thread;
        toast.success("Duplicated");
        closeThreadMenu();
        setActiveThreadId(t.id);
        navigateToThread(t, "push");
        void loadThreads();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [closeThreadMenu, loadThreads, navigateToThread, toast],
  );

  const closeShareModal = useCallback(() => {
    setShareOpen(false);
    setShareThread(null);
    setShareMembers([]);
    setShareCreatorUserId(null);
    setShareSelectedUserIds(new Set());
    setShareQuery("");
    setShareLoading(false);
    setShareSaving(false);
  }, []);

  const openShareModal = useCallback(
    async (thread: Thread) => {
      setShareOpen(true);
      setShareThread(thread);
      setShareQuery("");
      setShareMembers([]);
      setShareCreatorUserId(null);
      setShareSelectedUserIds(new Set());
      setShareLoading(true);
      setShareSaving(false);

      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(thread.id)}/share`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!json?.ok) {
          const statusMsg = res.status === 403 ? "Only the chat owner can manage sharing." : "Unable to load sharing";
          throw new Error(json?.error || statusMsg);
        }

        const members = Array.isArray(json.members) ? (json.members as ShareMember[]) : [];
        const creator = json.creatorUserId ? String(json.creatorUserId) : null;
        const selected = new Set<string>(
          (Array.isArray(json.sharedWithUserIds) ? json.sharedWithUserIds : []).map((x: any) => String(x)).filter(Boolean),
        );

        setShareMembers(members);
        setShareCreatorUserId(creator);
        setShareSelectedUserIds(selected);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        closeShareModal();
      } finally {
        setShareLoading(false);
      }
    },
    [closeShareModal, toast],
  );

  const saveShare = useCallback(async () => {
    if (!shareThread) return;
    setShareSaving(true);
    try {
      const userIds = Array.from(shareSelectedUserIds);
      const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(shareThread.id)}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Unable to save sharing");
      toast.success("Sharing updated");
      closeShareModal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setShareSaving(false);
    }
  }, [closeShareModal, shareSelectedUserIds, shareThread, toast]);

  const deleteThread = useCallback(
    async (thread: Thread) => {
      const ok = await askConfirm({
        title: "Delete chat?",
        message: `Delete “${thread.title || "New chat"}”? This cannot be undone.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return;

      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(thread.id)}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete" }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Unable to delete chat");

        closeThreadMenu();
        toast.success("Deleted");

        setThreads((prev) => prev.filter((t) => t.id !== thread.id));

        if (activeThreadId === thread.id) {
          const remaining = threads.filter((t) => t.id !== thread.id);
          if (remaining.length) {
            selectThread(remaining[0]!.id);
            navigateToThread(remaining[0]!, "replace");
          } else {
            activeThreadIdRef.current = null;
            setActiveThreadId(null);
            navigateToThread(null, "replace");
            void loadThreads();
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [activeThreadId, askConfirm, closeThreadMenu, loadThreads, navigateToThread, selectThread, threads, toast],
  );

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      const threadKey = activeThreadIdRef.current ?? DRAFT_THREAD_KEY;
      setUploading(true);
      try {
        const form = new FormData();
        for (const f of Array.from(files)) form.append("files", f);

        const res = await fetch("/api/portal/ai-chat/attachments", { method: "POST", body: form });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Upload failed");

        const next = Array.isArray(json.attachments) ? (json.attachments as Attachment[]) : [];
        setThreadDraftState(threadKey, (prev) => ({
          ...prev,
          pendingAttachments: [...prev.pendingAttachments, ...next].slice(0, 10),
        }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
      }
    },
    [setThreadDraftState, toast],
  );

  const addMediaAttachment = useCallback(
    async (item: PortalMediaPickItem) => {
      const threadKey = activeThreadIdRef.current ?? DRAFT_THREAD_KEY;
      const next: Attachment = {
        id: item.id,
        fileName: item.fileName,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        url: item.shareUrl || item.downloadUrl,
      };
      setThreadDraftState(threadKey, (prev) => ({
        ...prev,
        pendingAttachments: [...prev.pendingAttachments, next].slice(0, 10),
      }));
      setMediaPickerOpen(false);
    },
    [setThreadDraftState],
  );

  const waitForCanvasReady = useCallback(
    async (timeoutMs = 12_000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const ok = await canvasUi.ping();
          if (ok) return;
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error("Canvas is not ready");
    },
    [canvasUi],
  );

  const executeClientUiActions = useCallback(
    async (raw: unknown, threadKey = activeThreadKey) => {
      const list = (Array.isArray(raw) ? raw : [])
        .filter((a) => a && typeof a === "object" && typeof (a as any).kind === "string")
        .slice(0, 20) as PuraCanvasUiAction[];
      if (!list.length) return;

      setThreadUiState(threadKey, (prev) => ({ ...prev, canvasUiAmbiguity: null, canvasUiResumeActions: null }));

      if (threadKey !== (activeThreadIdRef.current ?? DRAFT_THREAD_KEY)) return;
      setCanvasOpen(true);
      setCanvasModalOpen(false);

      try {
        await new Promise((r) => setTimeout(r, 50));
        await waitForCanvasReady();

        for (let i = 0; i < list.length; i++) {
          const action = list[i]!;
          try {
            await canvasUi.run(action);
          } catch (e: any) {
            const candidates = Array.isArray(e?.candidates) ? (e.candidates as CanvasUiCandidate[]) : null;
            if (candidates && candidates.length) {
              setThreadUiState(threadKey, (prev) => ({ ...prev, canvasUiAmbiguity: { action, candidates } }));
              const remaining = list.slice(i + 1);
              setThreadUiState(threadKey, (prev) => ({ ...prev, canvasUiResumeActions: remaining.length ? remaining : null }));
              toast.error(e instanceof Error ? e.message : String(e));
              return;
            }
            throw e;
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [activeThreadKey, canvasUi, setThreadUiState, toast, waitForCanvasReady],
  );

  const handleCanvasUiCandidateSelect = useCallback(
    async (c: CanvasUiCandidate) => {
      const amb = canvasUiAmbiguity;
      if (!amb) return;

      setThreadUiState(activeThreadKey, (prev) => ({ ...prev, canvasUiAmbiguity: null }));

      try {
        setCanvasOpen(true);
        setCanvasModalOpen(false);
        await new Promise((r) => setTimeout(r, 50));
        await waitForCanvasReady();

        const rerun = { ...(amb.action as any), nth: c.nth } as PuraCanvasUiAction;
        await canvasUi.run(rerun);

        const remaining = canvasUiResumeActions;
        setThreadUiState(activeThreadKey, (prev) => ({ ...prev, canvasUiResumeActions: null }));
        if (remaining && remaining.length) {
          await executeClientUiActions(remaining, activeThreadKey);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [activeThreadKey, canvasUi, canvasUiAmbiguity, canvasUiResumeActions, executeClientUiActions, setThreadUiState, toast, waitForCanvasReady],
  );

  const send = useCallback(
    async (
      overrideText?: string,
      choice?:
        | { type: "booking_calendar"; calendarId: string; label?: string }
        | { type: "entity"; kind: string; value: string; label?: string },
    ) => {
      const modeAtSend = effectiveChatMode;
      const profileAtSend = effectiveResponseProfile;
      const initialThreadId = activeThreadIdRef.current;
      const initialThreadKey = initialThreadId ?? DRAFT_THREAD_KEY;
      if (sendInFlightRef.current.has(initialThreadKey)) return;

      const editingIdForSend = editingMessageIdByThreadRef.current[initialThreadKey] ?? null;
      const isEditSend = Boolean(editingIdForSend);

      const draftAtSend = threadDraftsRef.current[initialThreadKey] ?? createEmptyThreadDraftState();
      const text = typeof overrideText === "string" ? overrideText : draftAtSend.input.trim();
      const attachments = draftAtSend.pendingAttachments;
      const contextKeys = normalizeContextServiceSlugs(draftAtSend.contextServiceSlugs);
      const visibleContextBadges = buildVisibleContextBadges({
        text,
        contextKeys,
        canvasUrl,
        pageUrl: typeof window !== "undefined" ? window.location.href : null,
      });
      if (!text && !attachments.length && !choice) return;

      if (isEditSend) {
        if (!initialThreadId) {
          toast.error("No active chat to edit.");
          return;
        }
        if (choice) {
          toast.error("Cannot edit and select a choice.");
          return;
        }
        if (attachments.length) {
          toast.error("Remove attachments before editing.");
          return;
        }
      }

      let threadIdForSend = initialThreadId;
      let createdThread: Thread | null = null;
      let sendLockKey = initialThreadKey;
      const draftRestoreKey = initialThreadKey;
      sendInFlightRef.current.add(sendLockKey);
      if (sendLockKey === DRAFT_THREAD_KEY) setDraftSending(true);
      else setThreadSending(sendLockKey, true);
      if (!threadIdForSend) {
        if (isEditSend) {
          toast.error("No active chat to edit.");
          return;
        }
        try {
          const created = await fetch("/api/portal/ai-chat/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chatMode: modeAtSend, responseProfile: profileAtSend }),
          }).then((r) => r.json().catch(() => null));
          if (!created?.ok || !created?.thread?.id) throw new Error(created?.error || "Failed to create chat");
          createdThread = {
            ...(created.thread as Thread),
            chatMode: normalizeThreadChatMode((created.thread as Thread)?.chatMode ?? modeAtSend),
            responseProfile: normalizeThreadResponseProfile((created.thread as Thread)?.responseProfile ?? profileAtSend),
          };
          threadIdForSend = String(createdThread.id);
          pendingThreadIdsRef.current.add(threadIdForSend);

          // Switch the UI to the newly created thread immediately so the user sees
          // their optimistic message + the thinking indicator right away.
          activeThreadIdRef.current = threadIdForSend;
          setActiveThreadId(threadIdForSend);
          setThreads((prev) => {
            const without = prev.filter((t) => t.id !== threadIdForSend);
            const next = [createdThread as Thread, ...without];
            threadsRef.current = next;
            return next;
          });
          navigateToThread(createdThread as Thread, "replace");
          setMobileThreadsOpen(false);

          sendInFlightRef.current.delete(DRAFT_THREAD_KEY);
          setDraftSending(false);
          sendLockKey = threadIdForSend;
          sendInFlightRef.current.add(sendLockKey);
          setThreadSending(sendLockKey, true);
        } catch (e) {
          sendInFlightRef.current.delete(DRAFT_THREAD_KEY);
          setDraftSending(false);
          throw e;
        }
      }

      const optimisticId = newClientId();
      const nowIso = new Date().toISOString();

      if (isEditSend && editingIdForSend && threadIdForSend) {
        const prevMessagesSnapshot = messagesByThreadRef.current[threadIdForSend] ?? [];

        updateThreadMessages(threadIdForSend, (prev) => {
          const idx = prev.findIndex((m) => m.id === editingIdForSend);
          if (idx < 0) return prev;
          const head = prev.slice(0, idx);
          const current = prev[idx];
          const updated: Message = attachVisibleContextBadges({ ...current, text }, visibleContextBadges);
          return [...head, updated];
        });

        setThreadDraftState(draftRestoreKey, (prev) => ({
          input: typeof overrideText === "string" ? prev.input : "",
          pendingAttachments: [],
          contextServiceSlugs: [],
        }));
        setThreadEditingMessageId(threadIdForSend, null);
        clearThreadUiState(threadIdForSend);

        try {
          const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
            body: JSON.stringify({
              editMessageId: editingIdForSend,
              text,
              url: window.location.href,
              chatMode: modeAtSend,
              responseProfile: profileAtSend,
              ...(canvasUrl ? { canvasUrl } : {}),
              ...(contextKeys.length ? { contextKeys } : {}),
              ...(clientTimeZone ? { clientTimeZone } : {}),
            }),
          });
          const json = await res.json().catch(() => null);
          if (!json?.ok) throw new Error(json?.error || "Send failed");

          setThreadUiState(threadIdForSend, (prev) => ({
            ...prev,
            ambiguousContacts: json.ambiguousContacts && Array.isArray(json.ambiguousContacts) && json.ambiguousContacts.length ? json.ambiguousContacts : null,
            assistantChoices: json.assistantChoices && Array.isArray(json.assistantChoices) && json.assistantChoices.length ? (json.assistantChoices as AssistantChoice[]) : null,
            canvasUiAmbiguity: null,
            canvasUiResumeActions: null,
          }));

          if (json?.needsConfirm?.token) {
            const token = String(json.needsConfirm.token || "").trim();
            const title = String(json.needsConfirm.title || "Confirm").trim() || "Confirm";
            const message = String(json.needsConfirm.message || "").trim() || "Continue?";

            updateThreadMessages(threadIdForSend, (prev) => {
              const next: Message[] = [...prev];
              if (json.userMessage) {
                const existing = next.find((message) => message.id === editingIdForSend) || null;
                const um: Message = mergeVisibleContextBadges(json.userMessage as Message, existing, visibleContextBadges);
                for (let i = 0; i < next.length; i++) {
                  if (next[i].id === um.id) {
                    next[i] = um;
                    break;
                  }
                }
              }
              if (json.assistantMessage) {
                const assistantMessage = attachFollowUpSuggestionsToMessage(
                  attachRunTraceToMessage(applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend), (json as any).runTrace),
                  (json as any).followUpSuggestions,
                );
                rememberMessageDisplayMode(assistantMessage.id, assistantMessage.displayMode);
                next.push(assistantMessage);
              }
              return next;
            });

            const ok = await askConfirm({ title, message, confirmLabel: "Confirm", cancelLabel: "Cancel" });
            if (!ok) {
              void loadThreads();
              void loadThreadStatus(threadIdForSend);
              return;
            }

            const res2 = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
              method: "POST",
              headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
              body: JSON.stringify({
                confirmToken: token,
                url: window.location.href,
                chatMode: modeAtSend,
                responseProfile: profileAtSend,
                ...(canvasUrl ? { canvasUrl } : {}),
                ...(clientTimeZone ? { clientTimeZone } : {}),
              }),
            });
            const json2 = await res2.json().catch(() => null);
            if (!json2?.ok) throw new Error(json2?.error || "Action failed");

            const nextCanvasUrl2 = typeof json2?.canvasUrl === "string" && json2.canvasUrl.trim() ? String(json2.canvasUrl).trim() : null;
            if (nextCanvasUrl2 && activeThreadIdRef.current === threadIdForSend) {
              setCanvasUrl(nextCanvasUrl2);
              setCanvasOpen(true);
              setCanvasModalOpen(false);
            }

            if (Array.isArray((json2 as any)?.clientUiActions) && (json2 as any).clientUiActions.length) {
              void executeClientUiActions((json2 as any).clientUiActions, threadIdForSend);
            }

            const assistantActions2: AssistantAction[] = Array.isArray(json2.assistantActions)
              ? (json2.assistantActions as AssistantAction[])
              : [];

            updateThreadMessages(threadIdForSend, (prev) => {
              const next = [...prev];
              if (json2.assistantMessage) {
                const am = attachFollowUpSuggestionsToMessage(
                  attachRunTraceToMessage(applyAssistantDisplayMode(json2.assistantMessage as Message, modeAtSend), (json2 as any).runTrace),
                  (json2 as any).followUpSuggestions,
                );
                rememberMessageDisplayMode(am.id, am.displayMode);
                next.push({ ...am, assistantActions: assistantActions2.length ? assistantActions2 : undefined });
              }
              return next;
            });

            void loadThreads();
            void loadThreadStatus(threadIdForSend);
            return;
          }

          const nextCanvasUrl = typeof json?.canvasUrl === "string" && json.canvasUrl.trim() ? String(json.canvasUrl).trim() : null;
          if (nextCanvasUrl && activeThreadIdRef.current === threadIdForSend) {
            setCanvasUrl(nextCanvasUrl);
            setCanvasOpen(true);
            setCanvasModalOpen(false);
          }

          if (Array.isArray((json as any)?.clientUiActions) && (json as any).clientUiActions.length) {
            void executeClientUiActions((json as any).clientUiActions, threadIdForSend);
          }

          const assistantActions: AssistantAction[] = Array.isArray(json.assistantActions)
            ? (json.assistantActions as AssistantAction[])
            : [];

          updateThreadMessages(threadIdForSend, (prev) => {
            const next: Message[] = [...prev];
            if (json.userMessage) {
              const existing = next.find((message) => message.id === editingIdForSend) || null;
              const um: Message = mergeVisibleContextBadges(json.userMessage as Message, existing, visibleContextBadges);
              for (let i = 0; i < next.length; i++) {
                if (next[i].id === um.id) {
                  next[i] = um;
                  break;
                }
              }
            }
            if (json.assistantMessage) {
              const am = attachFollowUpSuggestionsToMessage(
                attachRunTraceToMessage(applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend), (json as any).runTrace),
                (json as any).followUpSuggestions,
              );
              rememberMessageDisplayMode(am.id, am.displayMode);
              next.push({ ...am, assistantActions: assistantActions.length ? assistantActions : undefined });
            }
            return next;
          });

          if ((json as any)?.openScheduledTasks) {
            setScheduledOpen(true);
          }

          void loadThreads();
          void loadThreadStatus(threadIdForSend);
          return;
        } catch (e) {
          updateThreadMessages(threadIdForSend, () => prevMessagesSnapshot);
          setThreadEditingMessageId(threadIdForSend, editingIdForSend);
          setThreadDraftState(draftRestoreKey, (prev) => ({
            ...prev,
            input: typeof overrideText === "string" ? prev.input : text,
            pendingAttachments: [],
            contextServiceSlugs: contextKeys,
          }));
          toast.error(e instanceof Error ? e.message : String(e));
        } finally {
          sendInFlightRef.current.delete(sendLockKey);
          if (sendLockKey === DRAFT_THREAD_KEY) setDraftSending(false);
          else setThreadSending(sendLockKey, false);
        }

        return;
      }

      const optimisticUser: Message = {
        id: `optimistic-user-${optimisticId}`,
        role: "user",
        text,
        attachmentsJson: attachments,
        createdAt: nowIso,
        sendAt: null,
        sentAt: nowIso,
      };

      const optimisticUserWithContext = attachVisibleContextBadges(optimisticUser, visibleContextBadges);

      updateThreadMessages(threadIdForSend, (prev) => [...prev, optimisticUserWithContext]);
      setThreadDraftState(draftRestoreKey, (prev) => ({
        input: typeof overrideText === "string" ? prev.input : "",
        pendingAttachments: [],
        contextServiceSlugs: [],
      }));
      clearThreadUiState(threadIdForSend);

      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
          body: JSON.stringify({
            text,
            url: window.location.href,
            chatMode: modeAtSend,
            responseProfile: profileAtSend,
            ...(canvasUrl ? { canvasUrl } : {}),
            attachments,
            ...(contextKeys.length ? { contextKeys } : {}),
            ...(clientTimeZone ? { clientTimeZone } : {}),
            ...(choice ? { choice } : {}),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Send failed");

        if (createdThread) {
          // Thread was already inserted + selected right after creation.
        }
        setThreadUiState(threadIdForSend, (prev) => ({
          ...prev,
          ambiguousContacts: json.ambiguousContacts && Array.isArray(json.ambiguousContacts) && json.ambiguousContacts.length ? json.ambiguousContacts : null,
          assistantChoices: json.assistantChoices && Array.isArray(json.assistantChoices) && json.assistantChoices.length ? (json.assistantChoices as AssistantChoice[]) : null,
          canvasUiAmbiguity: null,
          canvasUiResumeActions: null,
        }));

        if (json?.needsConfirm?.token) {
          const token = String(json.needsConfirm.token || "").trim();
          const title = String(json.needsConfirm.title || "Confirm").trim() || "Confirm";
          const message = String(json.needsConfirm.message || "").trim() || "Continue?";

          updateThreadMessages(threadIdForSend, (prev) => {
            const cleaned = prev.filter((m) => m.id !== optimisticUser.id);
            const next: Message[] = [...cleaned];
            if (json.userMessage) next.push(mergeVisibleContextBadges(json.userMessage as Message, optimisticUserWithContext, visibleContextBadges));
            if (json.assistantMessage) {
              const assistantMessage = attachFollowUpSuggestionsToMessage(
                attachRunTraceToMessage(applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend), (json as any).runTrace),
                (json as any).followUpSuggestions,
              );
              rememberMessageDisplayMode(assistantMessage.id, assistantMessage.displayMode);
              next.push(assistantMessage);
            }
            return next;
          });

          const ok = await askConfirm({
            title,
            message,
            confirmLabel: "Confirm",
            cancelLabel: "Cancel",
          });

          if (!ok) {
            void loadThreads();
            void loadThreadStatus(threadIdForSend);
            return;
          }

          const res2 = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
            body: JSON.stringify({
              confirmToken: token,
              url: window.location.href,
              chatMode: modeAtSend,
              responseProfile: profileAtSend,
              ...(canvasUrl ? { canvasUrl } : {}),
              ...(clientTimeZone ? { clientTimeZone } : {}),
            }),
          });
          const json2 = await res2.json().catch(() => null);
          if (!json2?.ok) throw new Error(json2?.error || "Action failed");

          const nextCanvasUrl2 = typeof json2?.canvasUrl === "string" && json2.canvasUrl.trim() ? String(json2.canvasUrl).trim() : null;
          if (nextCanvasUrl2 && activeThreadIdRef.current === threadIdForSend) {
            setCanvasUrl(nextCanvasUrl2);
            setCanvasOpen(true);
            setCanvasModalOpen(false);
          }

          if (Array.isArray((json2 as any)?.clientUiActions) && (json2 as any).clientUiActions.length) {
            void executeClientUiActions((json2 as any).clientUiActions, threadIdForSend);
          }

          const assistantActions2: AssistantAction[] = Array.isArray(json2.assistantActions)
            ? (json2.assistantActions as AssistantAction[])
            : [];

          updateThreadMessages(threadIdForSend, (prev) => {
            const next = [...prev];
            if (json2.assistantMessage) {
              const am = attachFollowUpSuggestionsToMessage(
                attachRunTraceToMessage(applyAssistantDisplayMode(json2.assistantMessage as Message, modeAtSend), (json2 as any).runTrace),
                (json2 as any).followUpSuggestions,
              );
              rememberMessageDisplayMode(am.id, am.displayMode);
              next.push({ ...am, assistantActions: assistantActions2.length ? assistantActions2 : undefined });
            }
            return next;
          });

          void loadThreads();
          void loadThreadStatus(threadIdForSend);
          return;
        }

        const nextCanvasUrl = typeof json?.canvasUrl === "string" && json.canvasUrl.trim() ? String(json.canvasUrl).trim() : null;
        if (nextCanvasUrl && activeThreadIdRef.current === threadIdForSend) {
          setCanvasUrl(nextCanvasUrl);
          setCanvasOpen(true);
          setCanvasModalOpen(false);
        }

        if (Array.isArray((json as any)?.clientUiActions) && (json as any).clientUiActions.length) {
          void executeClientUiActions((json as any).clientUiActions, threadIdForSend);
        }

        const assistantActions: AssistantAction[] = Array.isArray(json.assistantActions)
          ? (json.assistantActions as AssistantAction[])
          : [];


        updateThreadMessages(threadIdForSend, (prev) => {
          const cleaned = prev.filter((m) => m.id !== optimisticUser.id);
          const next: Message[] = [...cleaned];
          if (json.userMessage) next.push(mergeVisibleContextBadges(json.userMessage as Message, optimisticUserWithContext, visibleContextBadges));
          if (json.assistantMessage) {
            const am = attachFollowUpSuggestionsToMessage(
              attachRunTraceToMessage(applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend), (json as any).runTrace),
              (json as any).followUpSuggestions,
            );
            rememberMessageDisplayMode(am.id, am.displayMode);
            next.push({ ...am, assistantActions: assistantActions.length ? assistantActions : undefined });
          }
          return next;
        });

        if ((json as any)?.openScheduledTasks) {
          setScheduledOpen(true);
        }

        void loadThreads();
        void loadThreadStatus(threadIdForSend);
      } catch (e) {
        updateThreadMessages(threadIdForSend, (prev) => prev.filter((m) => m.id !== optimisticUser.id));
        setThreadDraftState(draftRestoreKey, (prev) => ({
          ...prev,
          input: typeof overrideText === "string" ? prev.input : text,
          pendingAttachments: attachments,
          contextServiceSlugs: contextKeys,
        }));

        // If the first send failed right after creating a brand new thread,
        // proactively delete it so empty chats are never persisted.
        if (createdThread?.id) {
          pendingThreadIdsRef.current.delete(String(createdThread.id));
          void fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(String(createdThread.id))}/actions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "delete" }),
          }).catch(() => null);
          setThreads((prev) => {
            const next = prev.filter((t) => t.id !== String(createdThread?.id));
            threadsRef.current = next;
            return next;
          });

          // Roll back UI state to the draft composer immediately.
          // This avoids a transient "missing thread" state that can bounce later.
          activeThreadIdRef.current = null;
          setActiveThreadId(null);
          navigateToThread(null, "replace");
          setMessagesByThread((prev) => {
            const next = { ...prev };
            delete (next as any)[String(createdThread?.id)];
            messagesByThreadRef.current = next;
            return next;
          });
        }

        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        sendInFlightRef.current.delete(sendLockKey);
        if (sendLockKey === DRAFT_THREAD_KEY) setDraftSending(false);
        else setThreadSending(sendLockKey, false);
      }
    },
    [askConfirm, canvasUrl, clearThreadUiState, clientTimeZone, clientTimeZoneHeaders, effectiveChatMode, effectiveResponseProfile, executeClientUiActions, loadThreadStatus, loadThreads, navigateToThread, rememberMessageDisplayMode, setThreadDraftState, setThreadEditingMessageId, setThreadSending, setThreadUiState, toast, updateThreadMessages],
  );

  // Handler for ambiguous contact selection (must be after send is defined)
  const handleAmbiguousContactSelect = useCallback((contact: AmbiguousContact) => {
    // Prefer email, then phone, then name
    const value = contact.email || contact.phone || contact.name;
    if (value) {
      void send(value);
    }
  }, [send]);

  const handleAssistantChoiceSelect = useCallback(
    (c: AssistantChoice) => {
      if (c.type === "booking_calendar" && c.calendarId) {
        void send(c.label || "Selected calendar", { type: "booking_calendar", calendarId: c.calendarId, label: c.label });
        return;
      }

      if (c.type === "entity" && c.kind && c.value) {
        void send(c.label || "Selected", { type: "entity", kind: c.kind, value: c.value, label: c.label });
      }
    },
    [send],
  );

  const executeAgentAction = useCallback(
    async (action: string, args: Record<string, unknown>) => {
      if (!activeThreadId) throw new Error("No active chat");
      const res = await fetch("/api/portal/ai-chat/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
        body: JSON.stringify({ threadId: activeThreadId, action, args }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Action failed");
      return json as {
        assistantMessage?: Message;
        assistantChoices?: AssistantChoice[];
        ambiguousContacts?: AmbiguousContact[];
        linkUrl?: string | null;
        runTrace?: RunTrace | null;
        followUpSuggestions?: string[];
        clientUiActions?: unknown[];
        openScheduledTasks?: boolean;
      };
    },
    [activeThreadId, clientTimeZoneHeaders],
  );

  const interruptActiveRun = useCallback(async () => {
    if (!activeThreadId) return;
    if (!activeCanInterrupt) return;

    setInterruptingThreadIds((prev) => {
      const next = new Set(prev);
      next.add(activeThreadId);
      return next;
    });

    try {
      const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "interrupt" }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Unable to stop run");
      setThreadLiveStatusById((prev) => ({
        ...prev,
        [activeThreadId]: normalizeLiveStatus(json?.liveStatus) || prev[activeThreadId] || null,
      }));
      toast.success(json?.interrupted ? "Stopping run" : "No active run to stop");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInterruptingThreadIds((prev) => {
        const next = new Set(prev);
        next.delete(activeThreadId);
        return next;
      });
      void loadThreads();
      void loadThreadStatus(activeThreadId);
    }
  }, [activeCanInterrupt, activeThreadId, loadThreadStatus, loadThreads, toast]);

  const runAssistantAction = useCallback(
    async (a: AssistantAction) => {
      if (!a?.key) return;
      if (runningActionKey) return;
      const modeAtAction = effectiveChatMode;

      if (a.confirmLabel) {
        const ok = await askConfirm({
          title: a.title,
          message: a.confirmLabel,
          confirmLabel: "Confirm",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
      }

      setRunningActionKey(a.key);
      const threadIdForAction = activeThreadId;
      try {
        const json = await executeAgentAction(a.key, a.args || {});

        if (threadIdForAction) {
          setThreadUiState(threadIdForAction, (prev) => ({
            ...prev,
            ambiguousContacts:
              (json as any)?.ambiguousContacts && Array.isArray((json as any).ambiguousContacts) && (json as any).ambiguousContacts.length
                ? ((json as any).ambiguousContacts as AmbiguousContact[])
                : null,
            assistantChoices:
              (json as any)?.assistantChoices && Array.isArray((json as any).assistantChoices) && (json as any).assistantChoices.length
                ? ((json as any).assistantChoices as AssistantChoice[])
                : null,
            canvasUiAmbiguity: null,
            canvasUiResumeActions: null,
          }));
        }

        if (json.assistantMessage && threadIdForAction) {
          const assistantMessage = attachFollowUpSuggestionsToMessage(
            attachRunTraceToMessage(applyAssistantDisplayMode(json.assistantMessage as Message, modeAtAction), (json as any).runTrace),
            (json as any).followUpSuggestions,
          );
          rememberMessageDisplayMode(assistantMessage.id, assistantMessage.displayMode);
          updateThreadMessages(threadIdForAction, (prev) => [...prev, assistantMessage]);
        }
        if ((json as any)?.openScheduledTasks) {
          setScheduledOpen(true);
        }
        const nextCanvasUrl = typeof json?.linkUrl === "string" && json.linkUrl.trim() ? String(json.linkUrl).trim() : null;
        if (nextCanvasUrl && activeThreadIdRef.current === threadIdForAction) {
          setCanvasUrl(nextCanvasUrl);
          setCanvasOpen(true);
          setCanvasModalOpen(false);
        }

        if (Array.isArray((json as any)?.clientUiActions) && (json as any).clientUiActions.length) {
          void executeClientUiActions((json as any).clientUiActions, threadIdForAction ?? DRAFT_THREAD_KEY);
        }

        void loadThreads();
        if (threadIdForAction) void loadThreadStatus(threadIdForAction);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setRunningActionKey(null);
      }
    },
    [activeThreadId, askConfirm, effectiveChatMode, executeAgentAction, executeClientUiActions, loadThreadStatus, loadThreads, rememberMessageDisplayMode, runningActionKey, setThreadUiState, toast, updateThreadMessages],
  );

  const openInCanvas = useCallback(
    (href: string) => {
      const internalPath = extractInternalAssistantPath(String(href || ""));
      const safe = internalPath || safeHref(href);
      if (!safe) return;
      setCanvasUrl(internalPath || extractInternalAssistantPath(safe) || safe);
      setCanvasOpen(true);
      setCanvasModalOpen(false);
    },
    [],
  );

  const openLatestCanvas = useCallback(
    (_opts?: { modal?: boolean }) => {
      void _opts;
      if (!canvasUrl) {
        toast.error("No canvas to open yet.");
        return;
      }
      setCanvasOpen(true);
      setCanvasModalOpen(false);
    },
    [canvasUrl, toast],
  );

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  useEffect(() => {
    return () => {
      try {
        for (const audio of dictationRef.current?.audios || []) {
          audio.pause();
          audio.currentTime = 0;
        }
      } catch {
        // ignore
      }
      try {
        for (const objectUrl of dictationRef.current?.objectUrls || []) {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        // ignore
      }
      dictationRef.current = null;
      setDictationPlayingMessageId(null);
    };
  }, []);

  const releaseDictationPlayback = useCallback((playback: DictationPlaybackState | null) => {
    if (!playback) return;
    playback.stopped = true;
    for (const audio of playback.audios) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.onerror = null;
      } catch {
        // ignore
      }
    }
    for (const objectUrl of playback.objectUrls) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    }
    if (dictationRef.current === playback) dictationRef.current = null;
    setDictationPlayingMessageId((prev) => (prev === playback.messageId ? null : prev));
  }, []);

  const dictateAssistantMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId) return;

      const current = dictationRef.current;
      if (current && current.messageId === messageId) {
        const isPlaying = current.audios.some((audio) => !audio.paused && !audio.ended);

        if (isPlaying) {
          releaseDictationPlayback(current);
          return;
        }

        try {
          current.stopped = false;
          for (const audio of current.audios) {
            audio.currentTime = 0;
          }
          await current.audios[0]!.play();
          setDictationPlayingMessageId(messageId);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : String(e));
          setDictationPlayingMessageId(null);
        }
        return;
      }

      if (dictating) return;

      setDictating(true);
      setDictatingMessageId(messageId);
      try {
        releaseDictationPlayback(dictationRef.current);

        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/dictate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || "Dictation failed");
        }

        const json = await res.json().catch(() => null);
        const chunks = Array.isArray(json?.chunks) ? (json.chunks as Array<{ audioBase64?: string; contentType?: string }>) : [];
        if (!chunks.length) throw new Error("Dictation returned no audio.");

        const objectUrls: string[] = [];
        const audios = chunks.map((chunk) => {
          const blob = decodeBase64AudioBlob(String(chunk.audioBase64 || ""), String(chunk.contentType || "audio/mpeg"));
          const objectUrl = URL.createObjectURL(blob);
          objectUrls.push(objectUrl);
          const audio = new Audio(objectUrl);
          audio.preload = "auto";
          return audio;
        });

        const playback: DictationPlaybackState = {
          messageId,
          audios,
          objectUrls,
          stopped: false,
        };

        audios.forEach((audio, index) => {
          audio.onplay = () => setDictationPlayingMessageId(messageId);
          audio.onerror = () => {
            releaseDictationPlayback(playback);
            toast.error("Dictation playback failed.");
          };
          audio.onended = () => {
            if (playback.stopped) return;
            const nextAudio = audios[index + 1] ?? null;
            if (!nextAudio) {
              setDictationPlayingMessageId((prev) => (prev === messageId ? null : prev));
              return;
            }
            nextAudio.currentTime = 0;
            void nextAudio.play().catch((error) => {
              releaseDictationPlayback(playback);
              toast.error(error instanceof Error ? error.message : String(error));
            });
          };
        });

        dictationRef.current = playback;
        await audios[0]!.play();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setDictating(false);
        setDictatingMessageId(null);
      }
    },
    [activeThreadId, dictating, releaseDictationPlayback, toast],
  );

  const redoAssistantMessage = useCallback(
    async (assistantMessageId: string) => {
      if (!activeThreadId) return;
      if (!assistantMessageId) return;
      if (regeneratingTarget?.threadId === activeThreadId) return;
      const threadIdAtStart = activeThreadId;

      const prevMessagesSnapshot = messagesByThreadRef.current[threadIdAtStart] ?? [];

      setRegeneratingTarget({ threadId: threadIdAtStart, messageId: assistantMessageId });
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdAtStart)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
          body: JSON.stringify({
            redoMessageId: assistantMessageId,
            url: typeof window !== "undefined" ? window.location.href : undefined,
            chatMode: effectiveChatMode,
            responseProfile: effectiveResponseProfile,
            ...(canvasUrl ? { canvasUrl } : {}),
            ...(clientTimeZone ? { clientTimeZone } : {}),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Redo failed");
        void loadMessages(threadIdAtStart);
        void loadThreads();
      } catch (e) {
        updateThreadMessages(threadIdAtStart, () => prevMessagesSnapshot);
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setRegeneratingTarget((prev) => (prev?.threadId === threadIdAtStart ? null : prev));
      }
    },
    [activeThreadId, canvasUrl, clientTimeZone, clientTimeZoneHeaders, effectiveChatMode, effectiveResponseProfile, loadMessages, loadThreads, regeneratingTarget?.threadId, toast, updateThreadMessages],
  );

  const copyMessageText = useCallback(
    async (textRaw: string) => {
      const text = String(textRaw || "");
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied");
      } catch {
        toast.error("Unable to copy");
      }
    },
    [toast],
  );

  const editUserMessage = useCallback(
    (messageId: string, textRaw: string) => {
      const text = String(textRaw || "");
      setThreadEditingMessageId(activeThreadKey, messageId);
      setThreadDraftState(activeThreadKey, (prev) => ({ ...prev, input: text, pendingAttachments: [] }));
      requestAnimationFrame(() => {
        resizeInput();
        focusComposer({ start: text.length, end: text.length });
      });
    },
    [activeThreadKey, focusComposer, resizeInput, setThreadDraftState, setThreadEditingMessageId],
  );

  const left = useMemo(
    () => (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chats</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-transparent text-zinc-700 transition-all duration-100 hover:scale-105 hover:bg-zinc-50"
              onClick={() => {
                setScheduledOpen(true);
              }}
              aria-label="Scheduled tasks"
              title="Scheduled tasks"
            >
              <IconSchedule size={18} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-blue text-white transition-all duration-100 hover:scale-105 hover:opacity-95"
              onClick={createThread}
              aria-label="New chat"
              title="New chat"
            >
              <span className="text-lg font-semibold leading-none">＋</span>
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2">
        {threadsLoading ? (
          <div className="p-3 text-sm text-zinc-500">Loading…</div>
        ) : !threads.length ? (
          <div className="p-3 text-sm text-zinc-500">No chats yet.</div>
        ) : (
          <div className="space-y-1">
            {threads.map((t) => {
              const active = t.id === activeThreadId;
              const threadLiveStatus = threadLiveStatusById[t.id] ?? null;
              const threadNextStep = threadNextStepContextById[t.id] ?? null;
              const threadLiveMeta = describeLiveStatusMeta(threadLiveStatus);
              const isWorking = Boolean(threadLiveStatus?.label);
              const threadBadge = threadRunBadgeMeta(t, threadLiveStatus);
              const continuityBadge = !isWorking && !threadBadge ? nextStepBadgeMeta(threadNextStep) : null;
              const continuityPreview = !isWorking && !threadBadge ? nextStepPreviewText(threadNextStep) : null;
              return (
                <div
                  key={t.id}
                  className={classNames(
                    "group relative w-full rounded-2xl",
                    active ? "bg-[rgba(29,78,216,0.10)]" : "hover:bg-zinc-50",
                  )}
                >
                  <button
                    type="button"
                    data-thread-id={t.id}
                    onClick={() => {
                      selectThread(t.id);
                      navigateToThread(t, "push");
                    }}
                    className="w-full rounded-2xl px-3 py-2 pr-10 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={classNames("block truncate text-sm font-semibold", active ? "text-zinc-900" : "text-zinc-800")}>
                          {t.title || "New chat"}
                          {t.isPinned ? <span className="ml-2 text-[11px] font-bold text-zinc-500">PINNED</span> : null}
                        </span>
                        {!isWorking && threadBadge ? (
                          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                            <span className={classNames("inline-flex h-2 w-2 rounded-full", threadBadge.dotClassName)} />
                            <span className={classNames("rounded-full px-2 py-0.5", threadBadge.badgeClassName)} title={threadBadge.title}>{threadBadge.label}</span>
                          </div>
                        ) : null}
                        {!isWorking && !threadBadge && continuityBadge ? (
                          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                            <span className={classNames("inline-flex h-2 w-2 rounded-full", continuityBadge.dotClassName)} />
                            <span className={classNames("rounded-full px-2 py-0.5", continuityBadge.badgeClassName)} title={continuityBadge.title}>{continuityBadge.label}</span>
                          </div>
                        ) : null}
                        {isWorking ? (
                          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                            <span className="inline-flex h-2 w-2 rounded-full bg-brand-blue animate-pulse" />
                            <span className="truncate">{threadLiveStatus?.label}</span>
                            {threadLiveMeta ? <span className="hidden truncate text-zinc-500 md:inline">· {threadLiveMeta}</span> : null}
                          </div>
                        ) : null}
                        {!isWorking && continuityPreview ? <div className="mt-1 truncate text-[11px] text-zinc-500">{continuityPreview}</div> : null}
                      </div>
                      <div className="shrink-0 text-xs font-semibold text-zinc-500">{fmtShortTime(t.lastMessageAt || t.updatedAt)}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={classNames(
                      "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-xl text-zinc-500",
                      "opacity-0 transition-all duration-100 group-hover:opacity-100 hover:scale-105 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                      active && "opacity-100",
                    )}
                    aria-label="Chat options"
                    title="Chat options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (threadMenu && threadMenuThreadId === t.id) {
                        closeThreadMenu();
                        return;
                      }
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setThreadMenuAnchorRect(rect);
                      setThreadMenuThreadId(t.id);
                      setThreadMenu(
                        computeFixedMenuStyle({ rect, width: 220, estHeight: 170, alignX: "right", minHeight: 140, gapPx: 4 }),
                      );
                    }}
                  >
                    <span className="text-lg font-semibold leading-none">⋯</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    ),
    [activeThreadId, closeThreadMenu, createThread, navigateToThread, selectThread, setScheduledOpen, threadLiveStatusById, threadMenu, threadMenuThreadId, threadNextStepContextById, threads, threadsLoading],
  );

  const mobileSidebar = useMemo(
    () => (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {threadsLoading ? (
            <div className="p-3 text-sm text-zinc-500">Loading…</div>
          ) : !threads.length ? (
            <div className="p-3 text-sm text-zinc-500">No chats yet.</div>
          ) : (
            <div className="space-y-1">
              {threads.map((t) => {
                const active = t.id === activeThreadId;
                const threadLiveStatus = threadLiveStatusById[t.id] ?? null;
                const threadNextStep = threadNextStepContextById[t.id] ?? null;
                const threadLiveMeta = describeLiveStatusMeta(threadLiveStatus);
                const isWorking = Boolean(threadLiveStatus?.label);
                const threadBadge = threadRunBadgeMeta(t, threadLiveStatus);
                const continuityBadge = !isWorking && !threadBadge ? nextStepBadgeMeta(threadNextStep) : null;
                const continuityPreview = !isWorking && !threadBadge ? nextStepPreviewText(threadNextStep) : null;
                return (
                  <div
                    key={t.id}
                    className={classNames(
                      "group relative w-full rounded-2xl",
                      active ? "bg-[rgba(29,78,216,0.10)]" : "hover:bg-zinc-50",
                    )}
                  >
                    <button
                      type="button"
                      data-thread-id={t.id}
                      onClick={() => {
                        selectThread(t.id);
                        navigateToThread(t, "push");
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("pa.portal.mobile-drawer.close"));
                        }
                      }}
                      className="w-full rounded-2xl px-3 py-2 pr-10 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className={classNames("block truncate text-sm font-semibold", active ? "text-zinc-900" : "text-zinc-800")}>
                            {t.title || "New chat"}
                            {t.isPinned ? <span className="ml-2 text-[11px] font-bold text-zinc-500">PINNED</span> : null}
                          </span>
                          {!isWorking && threadBadge ? (
                            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                              <span className={classNames("inline-flex h-2 w-2 rounded-full", threadBadge.dotClassName)} />
                              <span className={classNames("rounded-full px-2 py-0.5", threadBadge.badgeClassName)} title={threadBadge.title}>{threadBadge.label}</span>
                            </div>
                          ) : null}
                          {!isWorking && !threadBadge && continuityBadge ? (
                            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                              <span className={classNames("inline-flex h-2 w-2 rounded-full", continuityBadge.dotClassName)} />
                              <span className={classNames("rounded-full px-2 py-0.5", continuityBadge.badgeClassName)} title={continuityBadge.title}>{continuityBadge.label}</span>
                            </div>
                          ) : null}
                          {isWorking ? (
                            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                              <span className="inline-flex h-2 w-2 rounded-full bg-brand-blue animate-pulse" />
                              <span className="truncate">{threadLiveStatus?.label}</span>
                              {threadLiveMeta ? <span className="truncate text-zinc-500">· {threadLiveMeta}</span> : null}
                            </div>
                          ) : null}
                          {!isWorking && continuityPreview ? <div className="mt-1 truncate text-[11px] text-zinc-500">{continuityPreview}</div> : null}
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-zinc-500">{fmtShortTime(t.lastMessageAt || t.updatedAt)}</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={classNames(
                        "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-xl text-zinc-500",
                        "opacity-100 transition-all duration-100 hover:scale-105 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                      )}
                      aria-label="Chat options"
                      title="Chat options"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (threadMenu && threadMenuThreadId === t.id) {
                          closeThreadMenu();
                          return;
                        }
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setThreadMenuAnchorRect(rect);
                        setThreadMenuThreadId(t.id);
                        setThreadMenu(
                          computeFixedMenuStyle({ rect, width: 220, estHeight: 170, alignX: "right", minHeight: 140, gapPx: 4 }),
                        );
                      }}
                    >
                      <span className="text-lg font-semibold leading-none">⋯</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    ),
    [activeThreadId, closeThreadMenu, navigateToThread, selectThread, threadLiveStatusById, threadMenu, threadMenuThreadId, threadNextStepContextById, threads, threadsLoading],
  );

  const setSidebarOverride = useSetPortalSidebarOverride();
  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: left,
      mobileSidebarContent: mobileSidebar,
    });
  }, [left, mobileSidebar, setSidebarOverride]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  const anyMenuOpen = Boolean(attachMenu || threadMenu);

  const toLocalInputValue = useCallback((iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const REPEAT_UNIT_MINUTES = useMemo<Record<RepeatUnit, number>>(
    () => ({
      minutes: 1,
      hours: 60,
      days: 60 * 24,
      weeks: 60 * 24 * 7,
    }),
    [],
  );

  const splitRepeatEveryMinutes = useCallback(
    (repeatEveryMinutes: number): { repeatEvery: string; repeatUnit: RepeatUnit } => {
      const mins =
        typeof repeatEveryMinutes === "number" && Number.isFinite(repeatEveryMinutes)
          ? Math.max(0, Math.floor(repeatEveryMinutes))
          : 0;
      if (!mins) return { repeatEvery: "", repeatUnit: "days" };
      if (mins % REPEAT_UNIT_MINUTES.weeks === 0) return { repeatEvery: String(mins / REPEAT_UNIT_MINUTES.weeks), repeatUnit: "weeks" };
      if (mins % REPEAT_UNIT_MINUTES.days === 0) return { repeatEvery: String(mins / REPEAT_UNIT_MINUTES.days), repeatUnit: "days" };
      if (mins % REPEAT_UNIT_MINUTES.hours === 0) return { repeatEvery: String(mins / REPEAT_UNIT_MINUTES.hours), repeatUnit: "hours" };
      return { repeatEvery: String(mins), repeatUnit: "minutes" };
    },
    [REPEAT_UNIT_MINUTES],
  );

  const computeRepeatEveryMinutes = useCallback(
    (edit: { repeatEvery: string; repeatUnit: RepeatUnit }): number => {
      const raw = String(edit.repeatEvery || "").trim();
      if (!raw) return 0;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      const every = Math.max(0, Math.floor(n));
      if (!every) return 0;
      const unitMinutes = REPEAT_UNIT_MINUTES[edit.repeatUnit] || 1;
      return every * unitMinutes;
    },
    [REPEAT_UNIT_MINUTES],
  );

  const loadScheduled = useCallback(async () => {
    setScheduledLoading(true);
    try {
      const res = await fetch("/api/portal/ai-chat/scheduled", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      // Calm UX: if there are no scheduled tasks (or the endpoint returns non-ok), show empty state.
      // Avoid flashing scary "Failed to load" errors for a normal empty state.
      if (!json?.ok) {
        setScheduledRows([]);
        setScheduledEditing({});
        return;
      }
      const rows = Array.isArray(json.scheduled) ? (json.scheduled as any[]) : [];
      const normalized = rows
        .map((r) => ({
          id: String(r.id),
          threadId: String(r.threadId),
          threadTitle: String(r.threadTitle || "Chat"),
          displayText: String(r.displayText || ""),
          sendAt: r.sendAt ? String(r.sendAt) : null,
          recurrenceTimeZone: r.recurrenceTimeZone ? String(r.recurrenceTimeZone) : null,
          repeatEveryMinutes:
            typeof r.repeatEveryMinutes === "number" && Number.isFinite(r.repeatEveryMinutes)
              ? Math.max(0, Math.floor(r.repeatEveryMinutes))
              : 0,
          lastRunAt: r.lastRunAt ? String(r.lastRunAt) : null,
          lastRunOk: typeof r.lastRunOk === "boolean" ? r.lastRunOk : null,
          lastRunSummary: r.lastRunSummary ? String(r.lastRunSummary) : null,
        }))
        .slice(0, 200);

      setScheduledRows(normalized);

      const nextEditing: Record<string, { sendAtLocal: string; repeatEvery: string; repeatUnit: RepeatUnit }> = {};
      for (const r of normalized) {
        const split = splitRepeatEveryMinutes(r.repeatEveryMinutes);
        nextEditing[r.id] = {
          sendAtLocal: toLocalInputValue(r.sendAt),
          repeatEvery: split.repeatEvery,
          repeatUnit: split.repeatUnit,
        };
      }
      setScheduledEditing(nextEditing);
    } catch {
      setScheduledRows([]);
      setScheduledEditing({});
    } finally {
      setScheduledLoading(false);
    }
  }, [splitRepeatEveryMinutes, toLocalInputValue]);

  const loadRuns = useCallback(async (opts?: { silent?: boolean }) => {
    if (!activeThreadId) {
      setRunLedgerRows([]);
      return;
    }
    if (!opts?.silent) setRunsLoading(true);
    try {
      const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/runs`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setRunLedgerRows([]);
        return;
      }
      const rows = Array.isArray(json.runs) ? (json.runs as unknown[]).map((row) => normalizeRunLedgerEntry(row)).filter(Boolean) as RunLedgerEntry[] : [];
      setRunLedgerRows(rows.slice(0, 40));
    } catch {
      setRunLedgerRows([]);
    } finally {
      if (!opts?.silent) setRunsLoading(false);
    }
  }, [activeThreadId]);

  useEffect(() => {
    if (!scheduledOpen) return;
    void loadScheduled();
  }, [scheduledOpen, loadScheduled]);

  useEffect(() => {
    if (!runsOpen) return;
    void loadRuns();
  }, [runsOpen, loadRuns]);

  useEffect(() => {
    if (!runsOpen || !activeThreadId) return;
    const intervalId = window.setInterval(() => {
      void loadRuns({ silent: true });
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [activeThreadId, loadRuns, runsOpen]);

  useEffect(() => {
    if (!attachMenu || !attachMenuAnchorRect) return;
    const el = attachMenuRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (!Number.isFinite(h) || h <= 0) return;

    const liveAnchorRect = attachMenuButtonRef.current?.getBoundingClientRect() || attachMenuAnchorRect;

    const next = computeFixedMenuStyle({
      rect: liveAnchorRect,
      width: 260,
      estHeight: h,
      alignX: "left",
      minHeight: 120,
      gapPx: 12,
    });
    if (Math.abs(next.top - attachMenu.top) > 2 || Math.abs(next.left - attachMenu.left) > 2) {
      setAttachMenuAnchorRect(liveAnchorRect);
      setAttachMenu(next);
    }
  }, [attachMenu, attachMenuAnchorRect]);

  useEffect(() => {
    if (!threadMenu || !threadMenuAnchorRect) return;
    const el = threadMenuRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (!Number.isFinite(h) || h <= 0) return;

    const next = computeFixedMenuStyle({
      rect: threadMenuAnchorRect,
      width: 220,
      estHeight: h,
      alignX: "right",
      minHeight: 140,
      gapPx: 4,
    });
    if (Math.abs(next.top - threadMenu.top) > 2 || Math.abs(next.left - threadMenu.left) > 2) {
      setThreadMenu(next);
    }
  }, [threadMenu, threadMenuAnchorRect]);

  const activeThreadForMenu = useMemo(
    () => (threadMenuThreadId ? threads.find((t) => t.id === threadMenuThreadId) || null : null),
    [threads, threadMenuThreadId],
  );

  const saveScheduledRow = useCallback(
    async (id: string) => {
      const edit = scheduledEditing[id];
      if (!edit) return;

      setScheduledSavingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      const sendAtIso = edit.sendAtLocal ? new Date(edit.sendAtLocal).toISOString() : null;
      const repeatEveryMinutes = computeRepeatEveryMinutes({ repeatEvery: edit.repeatEvery, repeatUnit: edit.repeatUnit });

      try {
        const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
        const res = await fetch(`/api/portal/ai-chat/scheduled/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sendAtIso, repeatEveryMinutes, clientTimeZone }),
          },
        );
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Unable to save schedule");
        toast.success("Saved");
        void loadScheduled();
      } finally {
        setScheduledSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [computeRepeatEveryMinutes, loadScheduled, scheduledEditing, toast],
  );

  const cancelScheduledRow = useCallback(
    async (id: string) => {
      const ok = await askConfirm({
        title: "Stop scheduled task?",
        message: "This will prevent it from running again.",
        confirmLabel: "Stop",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return;
      const res = await fetch(`/api/portal/ai-chat/scheduled/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Unable to stop scheduled task");
      toast.success("Stopped");
      void loadScheduled();
    },
    [askConfirm, loadScheduled, toast],
  );

  const showWelcomeComposer = !requestedThreadId && !activeThreadId && !messagesLoading && messages.length === 0;

  const composerServiceSuggestions = useMemo(
    () =>
      inferComposerServiceSuggestions({
        input,
        canvasUrl,
        serviceUsageCounts,
        selectedSlugs: selectedContextServiceSlugs,
      }),
    [canvasUrl, input, selectedContextServiceSlugs, serviceUsageCounts],
  );

  const composerSuggestedContextEntries = useMemo(
    () => composerServiceSuggestions.filter((entry) => Boolean(entry.match)).slice(0, 3),
    [composerServiceSuggestions],
  );

  const composerScheduleSuggestion = useMemo(() => findComposerScheduleSuggestion(input), [input]);

  const composerCaretOffset = useMemo(
    () => Math.max(0, Math.min(composerSelectionSnapshot.end ?? 0, input.length)),
    [composerSelectionSnapshot.end, input.length],
  );

  const composerScheduleSuggestionSignature = useMemo(() => {
    const phrase = String(composerScheduleSuggestion?.matchedPhrase || "").trim().toLowerCase();
    return phrase ? `schedule:${phrase}` : null;
  }, [composerScheduleSuggestion]);

  const composerSuggestedContextEntriesWithSignature = useMemo(
    () => composerSuggestedContextEntries.map((entry) => ({
      ...entry,
      signature: `suggested:${entry.service.slug}:${String(entry.matchedPhrase || entry.service.title || "").trim().toLowerCase()}`,
    })),
    [composerSuggestedContextEntries],
  );

  const composerActiveTrigger = useMemo(() => {
    const candidates = [
      ...composerSuggestedContextEntriesWithSignature.map((entry) => ({
        kind: "service" as const,
        signature: entry.signature,
        start: entry.match?.start ?? -1,
        end: entry.match?.end ?? -1,
        priority: entry.match?.priority ?? 0,
      })),
      ...(composerScheduleSuggestion && composerScheduleSuggestionSignature
        ? [{
            kind: "schedule" as const,
            signature: composerScheduleSuggestionSignature,
            start: composerScheduleSuggestion.match?.start ?? -1,
            end: composerScheduleSuggestion.match?.end ?? -1,
            priority: composerScheduleSuggestion.match?.priority ?? 0,
          }]
        : []),
    ].filter((entry) => entry.start >= 0 && entry.end > entry.start);

    if (!candidates.length) return null;

    const ranked = [...candidates]
      .map((entry) => {
        const distance = composerCaretOffset < entry.start
          ? entry.start - composerCaretOffset
          : composerCaretOffset > entry.end
            ? composerCaretOffset - entry.end
            : 0;
        return { ...entry, distance };
      })
      .filter((entry) => entry.distance <= 1)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.start !== b.start) return a.start - b.start;
        return a.end - b.end;
      });

    return ranked[0] ?? null;
  }, [composerCaretOffset, composerScheduleSuggestion, composerScheduleSuggestionSignature, composerSuggestedContextEntriesWithSignature]);

  const composerConnectedHighlights = useMemo(() => {
    const matches = selectedContextServices
      .map((service) => ({ service, match: findComposerServiceMatch(input, service) }))
      .filter((entry): entry is ComposerConnectedHighlight => Boolean(entry.match))
      .sort((a, b) => {
        if (a.match.start !== b.match.start) return a.match.start - b.match.start;
        if (b.match.end !== a.match.end) return b.match.end - a.match.end;
        return b.match.priority - a.match.priority;
      });

    const accepted: ComposerConnectedHighlight[] = [];
    let lastEnd = -1;
    matches.forEach((entry) => {
      if (entry.match.start < lastEnd) return;
      accepted.push(entry);
      lastEnd = entry.match.end;
    });
    return accepted;
  }, [input, selectedContextServices]);

  const visibleComposerSuggestedContextEntries = useMemo(
    () => composerSuggestedContextEntriesWithSignature.filter((entry) => {
      if (!composerActiveTrigger || composerActiveTrigger.kind !== "service") return false;
      if (dismissedComposerPopoverSignatures.includes(entry.signature)) return false;
      return entry.match?.start === composerActiveTrigger.start && entry.match?.end === composerActiveTrigger.end;
    }),
    [composerActiveTrigger, composerSuggestedContextEntriesWithSignature, dismissedComposerPopoverSignatures],
  );

  const visibleComposerScheduleSuggestion = useMemo(() => {
    if (!composerScheduleSuggestion) return null;
    if (!composerActiveTrigger || composerActiveTrigger.kind !== "schedule") return null;
    if (composerScheduleSuggestion.match?.start !== composerActiveTrigger.start || composerScheduleSuggestion.match?.end !== composerActiveTrigger.end) return null;
    if (composerScheduleSuggestionSignature && dismissedComposerPopoverSignatures.includes(composerScheduleSuggestionSignature)) return null;
    return composerScheduleSuggestion;
  }, [composerActiveTrigger, composerScheduleSuggestion, composerScheduleSuggestionSignature, dismissedComposerPopoverSignatures]);

  const activeComposerPopoverSignatures = useMemo(() => {
    const next = visibleComposerSuggestedContextEntries.map((entry) => entry.signature);
    if (composerScheduleSuggestionSignature && visibleComposerScheduleSuggestion) next.unshift(composerScheduleSuggestionSignature);
    return next;
  }, [composerScheduleSuggestionSignature, visibleComposerScheduleSuggestion, visibleComposerSuggestedContextEntries]);

  const composerTriggerHighlightRanges = useMemo(() => {
    const matches = [
      ...visibleComposerSuggestedContextEntries.map(({ service, match }) => ({
        key: service.slug,
        start: match?.start ?? -1,
        end: match?.end ?? -1,
        priority: match?.priority ?? 0,
      })),
      ...(visibleComposerScheduleSuggestion?.match
        ? [
            {
              key: "schedule-task",
              start: visibleComposerScheduleSuggestion.match.start,
              end: visibleComposerScheduleSuggestion.match.end,
              priority: visibleComposerScheduleSuggestion.match.priority,
            },
          ]
        : []),
    ]
      .filter((entry) => entry.start >= 0 && entry.end > entry.start)
      .sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        if (b.end !== a.end) return b.end - a.end;
        return b.priority - a.priority;
      });

    const accepted: Array<{ key: string; start: number; end: number; isAnchor?: boolean }> = [];
    let lastEnd = -1;
    matches.forEach((item) => {
      if (item.start < lastEnd) return;
      accepted.push({
        key: item.key,
        start: item.start,
        end: item.end,
        isAnchor: accepted.length === 0,
      });
      lastEnd = item.end;
    });
    return accepted;
  }, [visibleComposerScheduleSuggestion, visibleComposerSuggestedContextEntries]);

  const composerContextPopoverSignature = useMemo(() => {
    const suggestedSignature = visibleComposerSuggestedContextEntries.map(({ signature }) => signature);
    const scheduleSignature = composerScheduleSuggestionSignature && visibleComposerScheduleSuggestion ? [composerScheduleSuggestionSignature] : [];
    return [...scheduleSignature, ...suggestedSignature].join("|");
  }, [composerScheduleSuggestionSignature, visibleComposerScheduleSuggestion, visibleComposerSuggestedContextEntries]);

  const showComposerContextPopover = Boolean(
    !isEditing &&
      composerContextPopoverSignature &&
      activeComposerPopoverSignatures.length &&
      !composerDisconnectPopover,
  );

  const attachMenuServiceOptions = useMemo(() => {
    const bySlug = new Map<string, PortalService>();
    for (const service of selectedContextServices) bySlug.set(service.slug, service);
    for (const suggestion of composerServiceSuggestions) bySlug.set(suggestion.service.slug, suggestion.service);
    const remainingServices = [...PORTAL_CONTEXT_SERVICES].sort((a, b) => {
      if (a.slug === "funnel-builder") return 1;
      if (b.slug === "funnel-builder") return -1;
      return a.title.localeCompare(b.title);
    });
    for (const service of remainingServices) {
      bySlug.set(service.slug, service);
    }
    return Array.from(bySlug.values());
  }, [composerServiceSuggestions, selectedContextServices]);

  useLayoutEffect(() => {
    if (!showComposerContextPopover || !composerTriggerHighlightRanges.length) {
      setComposerSuggestionPopoverLayout(null);
      return;
    }

    const anchorRange = composerTriggerHighlightRanges.find((range) => range.isAnchor) || composerTriggerHighlightRanges[0];

    const measure = () => {
      const composer = inputRef.current;
      const wrap = composerTextareaWrapRef.current;
      const popover = composerSuggestionPopoverRef.current;
      if (!composer || !wrap) return;

      const anchor = measureComposerMatchAnchor(composer, anchorRange);
      const wrapRect = wrap.getBoundingClientRect();
      const popoverWidth = popover?.getBoundingClientRect().width || 240;
      const left = Math.max(8, Math.min(anchor.left - popoverWidth / 2, wrapRect.width - popoverWidth - 8));
      const arrowLeft = Math.max(18, Math.min(anchor.left - left, popoverWidth - 18));
      setComposerSuggestionPopoverLayout({ left, arrowLeft });
    };

    const rafId = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
    };
  }, [composerSuggestedContextEntries, composerTriggerHighlightRanges, input, showComposerContextPopover]);

  useLayoutEffect(() => {
    if (!composerDisconnectPopover) {
      setComposerDisconnectPopoverLayout(null);
      return;
    }

    const measure = () => {
      const wrap = composerTextareaWrapRef.current;
      const popover = composerDisconnectPopoverRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      const popoverWidth = popover?.getBoundingClientRect().width || 240;
      const left = Math.max(8, Math.min(composerDisconnectPopover.anchorLeft - popoverWidth / 2, wrapRect.width - popoverWidth - 8));
      const arrowLeft = Math.max(18, Math.min(composerDisconnectPopover.anchorLeft - left, popoverWidth - 18));
      setComposerDisconnectPopoverLayout({ left, arrowLeft });
    };

    const rafId = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
    };
  }, [composerDisconnectPopover]);

  useEffect(() => {
    if (!composerDisconnectPopover) return;
    const stillVisible = composerConnectedHighlights.some((entry) => entry.service.slug === composerDisconnectPopover.slug);
    if (!stillVisible) setComposerDisconnectPopover(null);
  }, [composerConnectedHighlights, composerDisconnectPopover]);

  useEffect(() => {
    setDismissedComposerPopoverSignatures((prev) => {
      if (!prev.length) return prev;
      const active = new Set([
        ...composerSuggestedContextEntriesWithSignature.map((entry) => entry.signature),
        ...(composerScheduleSuggestionSignature ? [composerScheduleSuggestionSignature] : []),
      ]);
      const next = prev.filter((signature) => active.has(signature));
      return next.length === prev.length ? prev : next;
    });
  }, [composerScheduleSuggestionSignature, composerSuggestedContextEntriesWithSignature]);

  useEffect(() => {
    if (!showWelcomeComposer) return;
    const nextRotation = welcomePromptRotationRef.current + 1;
    welcomePromptRotationRef.current = nextRotation;
    writeStoredWelcomePromptRotation(nextRotation);
    setWelcomePromptRotationSnapshot(nextRotation);
    setWelcomePromptHistorySnapshot(welcomePromptHistoryRef.current.slice(0, 12));
    setWelcomePromptSeed(`${Date.now()}-${Math.random()}-${activeThreadId || "new"}`);
  }, [activeThreadId, showWelcomeComposer]);

  useLayoutEffect(() => {
    const composer = inputRef.current;
    if (!composer) return;
    const domValue = normalizeComposerPlainText(composer.value || "");
    if (domValue !== input) {
      composer.value = input;
    }
    resizeInput();
    const pendingSelection = pendingComposerSelectionRef.current;
    if (pendingSelection && document.activeElement === composer) {
      setComposerSelectionOffsets(composer, pendingSelection.start, pendingSelection.end);
    }
  }, [input, resizeInput]);

  const welcomePromptChipEntries = useMemo(() => {
    const serviceWeights = inferPromptServiceWeights(threads, serviceUsageCounts);
    const threadText = threads
      .slice(0, 18)
      .map((thread) => `${thread.title || ""}`.toLowerCase())
      .join(" \n ");
    const historyPenaltyById = new Map<string, number>();
    welcomePromptHistorySnapshot.forEach((id, index) => {
      historyPenaltyById.set(id, Math.max(1, 12 - index));
    });

    const ranked = WELCOME_PROMPT_LIBRARY.map((item) => {
      let score = 0;
      for (const slug of item.slugs || []) score += serviceWeights[slug] || 0;
      for (const keyword of item.keywords || []) {
        if (threadText.includes(keyword.toLowerCase())) score += 2;
      }
      const recentPenalty = historyPenaltyById.get(item.id) || 0;
      const jitter = (seededHash(`${welcomePromptSeed}:${item.id}`) % 1000) / 1000;
      const effectiveScore = score - recentPenalty * 3 + jitter * 0.35;
      return { item, score, jitter, effectiveScore };
    }).sort((a, b) => (b.effectiveScore !== a.effectiveScore ? b.effectiveScore - a.effectiveScore : b.score !== a.score ? b.score - a.score : b.jitter - a.jitter));

    const selected: PromptChipDefinition[] = [];
    const selectedIds = new Set<string>();
    const recentIds = new Set(welcomePromptHistorySnapshot.slice(0, 6));
    const prioritizedPool = ranked.filter((entry) => entry.score > 0).slice(0, Math.max(6, Math.min(12, ranked.length)));
    const selectionPool = (prioritizedPool.length >= 3 ? prioritizedPool : ranked).slice(0, Math.min(12, ranked.length));
    const startIndex = selectionPool.length ? welcomePromptRotationSnapshot % selectionPool.length : 0;

    const pushEntry = (entry: (typeof ranked)[number] | undefined) => {
      if (!entry || selectedIds.has(entry.item.id)) return;
      selected.push(entry.item);
      selectedIds.add(entry.item.id);
    };

    for (let offset = 0; offset < selectionPool.length && selected.length < 3; offset += 1) {
      const entry = selectionPool[(startIndex + offset) % selectionPool.length];
      if (recentIds.has(entry.item.id)) continue;
      pushEntry(entry);
    }

    for (let offset = 0; offset < selectionPool.length && selected.length < 3; offset += 1) {
      pushEntry(selectionPool[(startIndex + offset) % selectionPool.length]);
    }

    if (selected.length < 3) {
      const fallback = [...WELCOME_PROMPT_LIBRARY]
        .sort((a, b) => seededHash(`${welcomePromptSeed}:${a.id}`) - seededHash(`${welcomePromptSeed}:${b.id}`))
        .map((item) => item);
      for (const prompt of fallback) {
        if (selected.length >= 3) break;
        if (!selectedIds.has(prompt.id)) selected.push(prompt);
      }
    }

    return selected.slice(0, 3);
  }, [serviceUsageCounts, threads, welcomePromptHistorySnapshot, welcomePromptRotationSnapshot, welcomePromptSeed]);

  useEffect(() => {
    if (!showWelcomeComposer || !welcomePromptChipEntries.length) return;
    const shownIds = welcomePromptChipEntries.map((entry) => entry.id);
    const signature = shownIds.join("|");
    if (!signature || lastWelcomePromptSelectionRef.current === signature) return;
    lastWelcomePromptSelectionRef.current = signature;
    const nextHistory = [...shownIds, ...welcomePromptHistoryRef.current.filter((id) => !shownIds.includes(id))].slice(0, 18);
    welcomePromptHistoryRef.current = nextHistory;
    writeStoredWelcomePromptHistory(nextHistory);
  }, [showWelcomeComposer, welcomePromptChipEntries]);

  const composerControlButtonClass =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 transition-all duration-100 hover:border-zinc-300 hover:bg-zinc-50";

  const composerTextareaShellClass =
    "min-h-11 rounded-3xl border border-zinc-200 bg-white focus-within:outline-none focus-within:ring-2 focus-within:ring-[rgba(29,78,216,0.25)]";

  const composerPlaceholder = uploading
    ? "Uploading…"
    : isEditing
      ? "Edit message"
      : showWelcomeComposer
        ? "Tell Pura what you want handled."
        : "Message";

  const composerInputClass =
    "relative z-10 min-h-11 w-full min-w-0 overflow-y-auto rounded-3xl bg-transparent px-4 py-3 text-sm leading-5 text-transparent caret-zinc-900 focus:outline-none whitespace-pre-wrap break-words";

  const canSendComposerMessage = Boolean((input || "").trim() || pendingAttachments.length) && !sending;

  const toggleDraftServiceContext = useCallback(
    (slug: string) => {
      const normalizedSlug = String(slug || "").trim();
      if (!normalizedSlug || !findPortalContextService(normalizedSlug)) return;
      setComposerDisconnectPopover((current) => (current?.slug === normalizedSlug ? null : current));
      setThreadDraftState(activeThreadKey, (prev) => {
        const next = new Set(normalizeContextServiceSlugs(prev.contextServiceSlugs));
        const adding = !next.has(normalizedSlug);
        if (adding) next.add(normalizedSlug);
        else next.delete(normalizedSlug);
        const nextSlugs = Array.from(next).slice(0, 6);
        if (adding) {
          setServiceUsageCounts((current) => {
            const updated = { ...current, [normalizedSlug]: Math.max(1, Number(current[normalizedSlug] || 0) + 1) };
            try {
              window.localStorage.setItem("pa.portal.serviceUsageCounts", JSON.stringify(updated));
            } catch {
              // ignore
            }
            return updated;
          });
        }
        return { ...prev, contextServiceSlugs: nextSlugs };
      });
    },
    [activeThreadKey, setThreadDraftState],
  );

  const openComposerDisconnectPopover = useCallback((highlight: ComposerConnectedHighlight) => {
    const composer = inputRef.current;
    if (!composer) return;
    const anchor = measureComposerMatchAnchor(composer, { start: highlight.match.start, end: highlight.match.end });
    setComposerDisconnectPopover({
      slug: highlight.service.slug,
      title: highlight.service.title,
      anchorLeft: anchor.left,
    });
  }, []);

  const openScheduleTaskFromComposer = useCallback(() => {
    setDismissedComposerPopoverSignatures((prev) => Array.from(new Set([...prev, ...activeComposerPopoverSignatures])));
    setScheduleTaskText(String(input || "").trim());
    setScheduleTaskOpen(true);
  }, [activeComposerPopoverSignatures, input]);

  const composerInner = (
    <>
      {isEditing ? (
        <div className="mb-2 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-xs font-semibold text-amber-900">Editing your last message</div>
          <button
            type="button"
            className="rounded-xl px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            onClick={() => {
              setThreadEditingMessageId(activeThreadKey, null);
              setThreadDraftState(activeThreadKey, (prev) => ({ ...prev, input: "", pendingAttachments: [] }));
              requestAnimationFrame(() => resizeInput());
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {pendingAttachments.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingAttachments.map((a, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
              {looksLikeImageAttachment(a) && safeImgSrc(String(a?.url || "")) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeImgSrc(String(a?.url || ""))!}
                  alt={a.fileName}
                  className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <span className="max-w-72 truncate text-xs font-semibold text-zinc-900">{a.fileName}</span>
              <button
                type="button"
                className="rounded-xl px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                onClick={() =>
                  setThreadDraftState(activeThreadKey, (prev) => ({
                    ...prev,
                    pendingAttachments: prev.pendingAttachments.filter((_, i) => i !== idx),
                  }))
                }
                aria-label="Remove attachment"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <div className="flex items-end gap-2">
        <div className="relative">
          <button
            ref={attachMenuButtonRef}
            type="button"
            className={classNames(
              composerControlButtonClass,
              (uploading || sending || isEditing) && "opacity-60",
            )}
            disabled={uploading || sending || isEditing}
            onClick={(e) => {
              if (attachMenu) {
                setAttachMenu(null);
                setAttachMenuAnchorRect(null);
                return;
              }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setAttachMenuAnchorRect(rect);
              setAttachMenu(computeFixedMenuStyle({ rect, width: 280, estHeight: 264, alignX: "left", minHeight: 204, gapPx: 12 }));
            }}
            aria-label="Add attachment"
            title="Add attachment"
          >
            <span className="text-lg font-semibold">＋</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={uploading || sending || isEditing}
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />

        <div ref={composerTextareaWrapRef} className="relative min-w-0 flex-1">
          {showComposerContextPopover ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+14px)] z-30" data-composer-context-popover>
              <div
                ref={composerSuggestionPopoverRef}
                className="absolute bottom-0 max-w-[calc(100%-12px)]"
                style={{ left: composerSuggestionPopoverLayout?.left ?? 6 }}
              >
                <GlassSurface
                  width="fit-content"
                  height="auto"
                  borderRadius={24}
                  borderWidth={0.04}
                  blur={7}
                  displace={0.22}
                  distortionScale={-72}
                  redOffset={0}
                  greenOffset={2}
                  blueOffset={6}
                  backgroundOpacity={0.16}
                  saturation={1.05}
                  brightness={46}
                  opacity={0.985}
                  mixBlendMode="soft-light"
                  className="pointer-events-auto rounded-3xl"
                  style={{ background: "rgba(219,234,254,0.46)", boxShadow: "none" }}
                >
                  <div className="flex min-w-0 items-center gap-1.5 rounded-[22px] bg-[rgba(219,234,254,0.62)] px-1.5 py-1 backdrop-blur-[2px]">
                    {visibleComposerScheduleSuggestion ? (
                      <button
                        key="schedule-task"
                        type="button"
                        className="inline-flex items-center rounded-2xl bg-transparent px-2.5 py-1.5 text-xs font-semibold text-brand-blue transition-opacity duration-150 hover:opacity-80"
                        onClick={openScheduleTaskFromComposer}
                        title="Schedule this task"
                        aria-label={`Schedule ${visibleComposerScheduleSuggestion.matchedPhrase || "this task"}`}
                      >
                        Schedule this task
                      </button>
                    ) : null}
                    {visibleComposerSuggestedContextEntries.map(({ service }) => (
                      <button
                        key={service.slug}
                        type="button"
                        className="inline-flex items-center rounded-2xl bg-transparent px-2.5 py-1.5 text-xs font-semibold text-brand-blue transition-opacity duration-150 hover:opacity-80"
                        onClick={() => toggleDraftServiceContext(service.slug)}
                        title={`Connect ${service.title}`}
                        aria-label={`Connect ${service.title}`}
                      >
                        {`Connect ${service.title}?`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-2xl bg-transparent text-sm font-semibold text-zinc-500 transition-opacity duration-150 hover:opacity-80"
                      onClick={() => setDismissedComposerPopoverSignatures((prev) => Array.from(new Set([...prev, ...activeComposerPopoverSignatures])))}
                      aria-label="Dismiss connect popover"
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </GlassSurface>
                <div
                  className="pointer-events-none absolute top-full z-10 -translate-y-[30%] drop-shadow-[0_10px_24px_rgba(37,99,235,0.16)]"
                  style={{ left: composerSuggestionPopoverLayout?.arrowLeft ?? 28 }}
                >
                  <GlassSurface
                    width={18}
                    height={18}
                    borderRadius={4}
                    borderWidth={0.04}
                    blur={7}
                    displace={0.22}
                    distortionScale={-72}
                    redOffset={0}
                    greenOffset={2}
                    blueOffset={6}
                    backgroundOpacity={0.16}
                    saturation={1.05}
                    brightness={46}
                    opacity={0.985}
                    mixBlendMode="soft-light"
                    className="rounded-sm rotate-45 opacity-[0.88] ring-1 ring-[rgba(191,219,254,0.65)]"
                    style={{ background: "rgba(219,234,254,0.46)", boxShadow: "none" }}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {composerDisconnectPopover ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+14px)] z-40">
              <div
                ref={composerDisconnectPopoverRef}
                className="absolute bottom-0 max-w-[calc(100%-12px)]"
                style={{ left: composerDisconnectPopoverLayout?.left ?? Math.max(6, composerDisconnectPopover.anchorLeft - 120) }}
              >
                <GlassSurface
                  width="fit-content"
                  height="auto"
                  borderRadius={24}
                  borderWidth={0.04}
                  blur={7}
                  displace={0.22}
                  distortionScale={-72}
                  redOffset={0}
                  greenOffset={2}
                  blueOffset={6}
                  backgroundOpacity={0.16}
                  saturation={1.05}
                  brightness={46}
                  opacity={0.985}
                  mixBlendMode="soft-light"
                  className="pointer-events-auto rounded-3xl"
                  style={{ background: "rgba(219,234,254,0.46)", boxShadow: "none" }}
                >
                  <div className="flex min-w-0 items-center gap-1.5 rounded-[22px] bg-[rgba(219,234,254,0.62)] px-1.5 py-1 backdrop-blur-[2px]">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-2xl bg-transparent px-2.5 py-1.5 text-xs font-semibold text-brand-blue transition-opacity duration-150 hover:opacity-80"
                      onClick={() => {
                        toggleDraftServiceContext(composerDisconnectPopover.slug);
                        setComposerDisconnectPopover(null);
                      }}
                      title={`Disconnect ${composerDisconnectPopover.title}`}
                      aria-label={`Disconnect ${composerDisconnectPopover.title}`}
                    >
                      {`Disconnect ${composerDisconnectPopover.title}?`}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-2xl bg-transparent text-sm font-semibold text-zinc-500 transition-opacity duration-150 hover:opacity-80"
                      onClick={() => setComposerDisconnectPopover(null)}
                      aria-label="Dismiss disconnect popover"
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </GlassSurface>
                <div
                  className="pointer-events-none absolute top-full z-10 -translate-y-[30%] drop-shadow-[0_10px_24px_rgba(37,99,235,0.16)]"
                  style={{ left: composerDisconnectPopoverLayout?.arrowLeft ?? 28 }}
                >
                  <GlassSurface
                    width={18}
                    height={18}
                    borderRadius={4}
                    borderWidth={0.04}
                    blur={7}
                    displace={0.22}
                    distortionScale={-72}
                    redOffset={0}
                    greenOffset={2}
                    blueOffset={6}
                    backgroundOpacity={0.16}
                    saturation={1.05}
                    brightness={46}
                    opacity={0.985}
                    mixBlendMode="soft-light"
                    className="rounded-sm rotate-45 opacity-[0.88] ring-1 ring-[rgba(191,219,254,0.65)]"
                    style={{ background: "rgba(219,234,254,0.46)", boxShadow: "none" }}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <div className={composerTextareaShellClass}>
            {!input ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-0 px-4 py-3 text-sm leading-5 text-zinc-400">{composerPlaceholder}</div>
            ) : null}
            {input ? (
              <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-3xl">
                <div
                  className="px-4 py-3 text-sm leading-5 text-zinc-900 whitespace-pre-wrap wrap-break-word"
                  style={{ transform: `translate(${-composerScrollSnapshot.left}px, ${-composerScrollSnapshot.top}px)` }}
                >
                  {renderComposerInlineText(
                    input,
                    composerConnectedHighlights.map((highlight, index) => ({
                      key: `connected:${highlight.service.slug}:${index}`,
                      start: highlight.match.start,
                      end: highlight.match.end,
                      interactive: true,
                      className: "text-brand-blue underline underline-offset-[0.16em] hover:bg-[rgba(191,219,254,0.32)]",
                      style: { textShadow: "0.0125em 0 0 currentColor, -0.0125em 0 0 currentColor" },
                      onClick: () => openComposerDisconnectPopover(highlight),
                    })),
                  )}
                </div>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              role="textbox"
              aria-label={isEditing ? "Edit message" : "Message Pura"}
              aria-multiline="true"
              data-composer-input="true"
              className={composerInputClass}
              value={input}
              disabled={sending}
              rows={1}
              onChange={(e) => {
                const nextValue = normalizeComposerPlainText(e.currentTarget.value || "");
                const nextSelection = getComposerSelectionOffsets(e.currentTarget) || { start: 0, end: 0 };
                pendingComposerSelectionRef.current = nextSelection;
                setComposerSelectionSnapshot(nextSelection);
                setComposerDisconnectPopover(null);
                setThreadDraftState(activeThreadKey, (prev) => ({ ...prev, input: nextValue }));
                requestAnimationFrame(() => {
                  resizeInput();
                });
              }}
              onSelect={(e) => {
                const nextSelection = getComposerSelectionOffsets(e.currentTarget) || { start: 0, end: 0 };
                pendingComposerSelectionRef.current = nextSelection;
                setComposerSelectionSnapshot(nextSelection);
                setComposerDisconnectPopover(null);
              }}
              onClick={() => setComposerDisconnectPopover(null)}
              onScroll={(e) => {
                setComposerScrollSnapshot({ left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              spellCheck
              style={{ resize: "none" }}
            />
          </div>
        </div>

        <button
          type="button"
          className={classNames(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white transition-all duration-100",
            showWelcomeComposer ? "shadow-none" : "",
            canSendComposerMessage ? "group hover:opacity-95" : "cursor-default opacity-60",
          )}
          onClick={() => void send()}
          disabled={!canSendComposerMessage}
          aria-label={isEditing ? "Save edit" : "Send"}
          title={isEditing ? "Save edit" : "Send"}
        >
          {canSendComposerMessage ? (
            <>
              <span className="group-hover:hidden">
                <IconSend />
              </span>
              <span className="hidden group-hover:inline">
                <IconSendHover />
              </span>
            </>
          ) : (
            <IconSend />
          )}
        </button>
      </div>
      </div>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
      <div className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-90 flex flex-col gap-2 sm:hidden">
        <button
          type="button"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white/95 text-zinc-700 shadow-sm backdrop-blur hover:bg-zinc-50"
          onClick={() => setScheduledOpen(true)}
          aria-label="Scheduled tasks"
          title="Scheduled tasks"
        >
          <IconSchedule size={18} />
        </button>
        <button
          type="button"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-sm transition-all duration-100 hover:opacity-95"
          onClick={createThread}
          aria-label="New chat"
          title="New chat"
        >
          <span className="text-lg font-semibold leading-none">＋</span>
        </button>
      </div>

      {anyMenuOpen ? (
        <div
          className="fixed inset-0 z-12041"
          onMouseDown={() => {
            setAttachMenu(null);
            closeThreadMenu();
          }}
          onTouchStart={() => {
            setAttachMenu(null);
            closeThreadMenu();
          }}
          aria-hidden
        />
      ) : null}

      {attachMenu ? (
        <div
          ref={attachMenuRef}
          className="fixed z-12045"
          style={{ left: attachMenu.left, top: attachMenu.top, width: attachMenu.width, maxHeight: attachMenu.maxHeight }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <GlassSurface
            width="100%"
            height="auto"
            borderRadius={26}
            borderWidth={0.04}
            blur={8}
            displace={0.22}
            distortionScale={-72}
            redOffset={0}
            greenOffset={2}
            blueOffset={6}
            backgroundOpacity={0.2}
            saturation={1.05}
            brightness={46}
            opacity={0.985}
            mixBlendMode="soft-light"
            className="rounded-3xl border border-[rgba(96,165,250,0.2)] shadow-[0_18px_44px_rgba(37,99,235,0.16),0_10px_28px_rgba(15,23,42,0.14)]"
            style={{ background: "rgba(219,234,254,0.56)", boxShadow: "none" }}
          >
            <div
              className="overflow-auto rounded-3xl bg-[linear-gradient(180deg,rgba(239,246,255,0.5),rgba(255,255,255,0.24))] p-1.5 backdrop-blur-[2px]"
              style={{ maxHeight: attachMenu.maxHeight }}
            >
              <button
                type="button"
                className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-ink transition-colors hover:bg-[rgba(219,234,254,0.5)]"
                onClick={() => {
                  setAttachMenu(null);
                  fileInputRef.current?.click();
                }}
              >
                Upload from device
              </button>
              <button
                type="button"
                className="mt-1 w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-ink transition-colors hover:bg-[rgba(219,234,254,0.5)]"
                onClick={() => {
                  setAttachMenu(null);
                  setMediaPickerOpen(true);
                }}
              >
                Add from media library
              </button>
              <button
                type="button"
                className="mt-1 w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-ink transition-colors hover:bg-[rgba(219,234,254,0.5)]"
                onClick={() => {
                  setAttachMenu(null);
                  setScheduleTaskText("");
                  setScheduleTaskOpen(true);
                }}
              >
                Schedule task
              </button>
              <div className="mt-2 border-t border-[rgba(191,219,254,0.7)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Connect</div>
              {attachMenuServiceOptions.map((service) => {
                const selected = selectedContextServiceSlugs.includes(service.slug);
                return (
                  <button
                    key={service.slug}
                    type="button"
                    className={classNames(
                      "mt-1 w-full rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors",
                      selected
                        ? "bg-[rgba(29,78,216,0.22)] text-brand-blue"
                        : "text-brand-ink hover:bg-[rgba(219,234,254,0.5)]",
                    )}
                    onClick={() => {
                      toggleDraftServiceContext(service.slug);
                    }}
                    aria-pressed={selected}
                  >
                    <span className="block min-w-0 truncate">{service.title}</span>
                  </button>
                );
              })}
            </div>
          </GlassSurface>
        </div>
      ) : null}

      {scheduleTaskOpen ? (
        <div
          className="fixed inset-0 z-12060 flex items-end justify-center bg-[rgba(15,23,42,0.22)] p-4 sm:items-center"
          onMouseDown={() => setScheduleTaskOpen(false)}
          onTouchStart={() => setScheduleTaskOpen(false)}
          aria-hidden
        >
          <GlassSurface
            width="min(100%, 40rem)"
            height="auto"
            borderRadius={28}
            borderWidth={0}
            blur={8}
            displace={0.24}
            distortionScale={-78}
            redOffset={0}
            greenOffset={2}
            blueOffset={6}
            backgroundOpacity={0.18}
            saturation={1.06}
            brightness={48}
            opacity={0.99}
            mixBlendMode="soft-light"
            className="w-full max-w-xl rounded-[28px]"
            style={{ background: "rgba(219,234,254,0.42)", boxShadow: "none" }}
          >
            <div
              className="w-full rounded-[28px] bg-[linear-gradient(180deg,rgba(239,246,255,0.58),rgba(255,255,255,0.32))] p-4"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Schedule task"
            >
              <div className="text-base font-semibold text-zinc-900">Schedule task</div>
              <div className="mt-1 text-sm text-zinc-600">Describe what should run and when.</div>

              <textarea
                className="mt-3 h-28 w-full resize-none rounded-2xl border border-[rgba(191,219,254,0.72)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm text-zinc-900 outline-none backdrop-blur-[2px] focus:border-[rgba(29,78,216,0.28)] focus:ring-2 focus:ring-[rgba(29,78,216,0.14)]"
                placeholder="Example: Every weekday at 9am, send Chester a unique good-morning text to get the conversation started."
                value={scheduleTaskText}
                onChange={(e) => setScheduleTaskText(e.target.value)}
                autoFocus
              />

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-2xl border border-[rgba(191,219,254,0.7)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm font-semibold text-zinc-800 backdrop-blur-[2px] hover:bg-[rgba(255,255,255,0.84)]"
                  onClick={() => setScheduleTaskOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-[rgba(29,78,216,0.92)] px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(29,78,216,0.18)] hover:bg-[rgba(29,78,216,0.98)] disabled:opacity-50"
                  disabled={!scheduleTaskText.trim() || sending}
                  onClick={() => {
                    const t = scheduleTaskText.trim();
                    setScheduleTaskOpen(false);
                    if (!t) return;
                    setScheduledOpen(true);
                    void send(t).then(() => loadScheduled());
                  }}
                >
                  Schedule
                </button>
              </div>
            </div>
          </GlassSurface>
        </div>
      ) : null}

      {threadMenu ? (
        <div
          ref={threadMenuRef}
          className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
          style={{ left: threadMenu.left, top: threadMenu.top, width: threadMenu.width, maxHeight: threadMenu.maxHeight }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            onClick={() => {
              if (!activeThreadForMenu) return;
              void pinThread(activeThreadForMenu);
            }}
          >
            {activeThreadForMenu?.isPinned ? "Unpin" : "Pin to top"}
          </button>
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            onClick={() => {
              if (!activeThreadForMenu) return;
              void duplicateThread(activeThreadForMenu);
            }}
          >
            Branch
          </button>
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            onClick={() => {
              if (!activeThreadForMenu) return;
              closeThreadMenu();
              void openShareModal(activeThreadForMenu);
            }}
          >
            Share with team
          </button>
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
            onClick={() => {
              if (!activeThreadForMenu) return;
              void deleteThread(activeThreadForMenu);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {null}

      <div ref={canvasContainerRef} className={chatSurfaceClassName}>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-3 sm:px-4 sm:pt-4">
            <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-3">
              <GlassSurface
                width="fit-content"
                height="auto"
                borderRadius={24}
                borderWidth={0.04}
                blur={7}
                displace={0.22}
                distortionScale={-72}
                redOffset={0}
                greenOffset={2}
                blueOffset={6}
                backgroundOpacity={0.16}
                saturation={1.05}
                brightness={46}
                opacity={0.985}
                mixBlendMode="soft-light"
                className="pointer-events-auto max-w-[calc(100%-5rem)] rounded-3xl"
                style={{
                  background: "rgba(255,255,255,0.46)",
                  boxShadow: "none",
                }}
              >
                <div className="flex min-w-0 flex-col items-start gap-1.5 rounded-[22px] bg-[rgba(255,255,255,0.62)] px-1.5 py-1 backdrop-blur-[2px]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-2xl bg-transparent px-1 py-0.5 text-[13px] font-semibold text-brand-blue transition-opacity duration-150 hover:opacity-80"
                    onClick={() => setModeControlsOpen((prev) => !prev)}
                    aria-label={modeControlsOpen ? "Collapse chat modes" : "Expand chat modes"}
                    title={modeControlsOpen ? "Collapse chat modes" : "Expand chat modes"}
                  >
                    <span>{modeSummaryLabel}</span>
                    <span
                      className={classNames(
                        "inline-flex text-zinc-500 transition-transform duration-200",
                        modeControlsOpen ? "-rotate-90" : "rotate-90",
                      )}
                    >
                      <IconChevron />
                    </span>
                  </button>

                  {modeControlsOpen ? (
                    <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                      <div className="inline-flex shrink-0 rounded-2xl bg-transparent p-0.5">
                        <button
                          type="button"
                          className={classNames(
                            "rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all",
                            effectiveChatMode === "plan"
                              ? "bg-[rgba(37,99,235,0.14)] text-brand-blue backdrop-blur-sm"
                              : "text-zinc-700 hover:text-zinc-900",
                          )}
                          onClick={() => void setChatModeForCurrentThread("plan")}
                        >
                          Discuss
                        </button>
                        <button
                          type="button"
                          className={classNames(
                            "rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all",
                            effectiveChatMode === "work"
                              ? "bg-[rgba(37,99,235,0.14)] text-brand-blue backdrop-blur-sm"
                              : "text-zinc-700 hover:text-zinc-900",
                          )}
                          onClick={() => void setChatModeForCurrentThread("work")}
                        >
                          Work
                        </button>
                      </div>

                      <div className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-transparent p-0.5">
                        {PURA_AI_PROFILE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={classNames(
                              "rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all",
                              effectiveResponseProfile === option.value
                                ? "bg-[rgba(251,113,133,0.16)] text-(--color-brand-pink) backdrop-blur-sm"
                                : "text-zinc-700 hover:text-zinc-900",
                            )}
                            onClick={() => void setResponseProfileForCurrentThread(option.value)}
                            title={option.description}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </GlassSurface>

              <div className="pointer-events-auto ml-auto flex items-center gap-2">
                {workStatusLabel ? (
                  <div className="hidden items-center gap-2 rounded-2xl border border-brand-blue/15 bg-white/95 px-3 py-2 text-xs font-medium text-zinc-700 shadow-[0_10px_24px_rgba(0,0,0,0.06)] sm:inline-flex">
                    <ThinkingDots />
                    <span>{workStatusLabel}</span>
                  </div>
                ) : null}

                {activeCanInterrupt && activeThreadId ? (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:bg-zinc-50 disabled:opacity-60"
                    onClick={() => void interruptActiveRun()}
                    disabled={interruptingThreadIds.has(activeThreadId)}
                  >
                    {interruptingThreadIds.has(activeThreadId) ? "Stopping…" : "Stop"}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="inline-flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:bg-zinc-50 sm:hidden"
                  onClick={() => setMobileThreadsOpen(true)}
                >
                  Chats
                </button>
              </div>
            </div>
          </div>

          <div
            ref={scrollerRef}
            className={chatScrollerClassName}
            onScroll={handleChatScroll}
            onWheelCapture={handleChatWheel}
            onTouchStart={handleChatTouchStart}
            onTouchMove={handleChatTouchMove}
          >

          <div className="relative z-10 mx-auto w-full max-w-5xl space-y-3 px-3 pb-16 pt-24 sm:px-4 sm:pb-18 sm:pt-24">
            {messagesLoading && !messages.length ? (
              <div className="space-y-3 pt-1">
                <div className="h-24 rounded-3xl border border-zinc-200 bg-zinc-50 animate-pulse" />
                <div className="ml-auto h-16 w-[72%] rounded-3xl bg-zinc-100 animate-pulse" />
                <div className="h-28 rounded-3xl border border-zinc-200 bg-zinc-50 animate-pulse" />
              </div>
            ) : messages.length ? (
              <>
                {(() => {
                  const lastAssistantIndexForFooter = (() => {
                    // When regenerating, we insert an optimistic "thinking" assistant bubble at the end.
                    // Anchor the footer controls to that bubble so they don't jump up to a prior message.
                    if (regenerating) {
                      for (let i = messages.length - 1; i >= 0; i--) {
                        const m = messages[i];
                        if (m?.role !== "assistant") continue;
                        return i;
                      }
                      return -1;
                    }

                    // Normal case: anchor to the last real assistant message.
                    for (let i = messages.length - 1; i >= 0; i--) {
                      const m = messages[i];
                      if (m?.role !== "assistant") continue;
                      if (String(m.id || "").startsWith("optimistic-assistant-")) continue;
                      return i;
                    }
                    return -1;
                  })();
                  const lastUserIndex = (() => {
                    for (let i = messages.length - 1; i >= 0; i--) {
                      const m = messages[i];
                      if (m?.role !== "user") continue;
                      if (!String(m.text || "").trim()) continue;
                      return i;
                    }
                    return -1;
                  })();
                  return messages.map((m, i) => {
                    const isThinking = m.id.startsWith("optimistic-assistant-") && m.role === "assistant";
                    const isLastAssistant = m.role === "assistant" && i === lastAssistantIndexForFooter;
                    const isLastUser = m.role === "user" && i === lastUserIndex;
                    const isRedoTarget = regenerating && regeneratingTarget?.messageId === m.id;
                    const showAmbiguousContacts = isLastAssistant && Boolean(ambiguousContacts && ambiguousContacts.length);
                    const showChoices = isLastAssistant && Boolean(assistantChoices && assistantChoices.length);
                    const showCanvasUiAmbiguity =
                      isLastAssistant && Boolean(canvasUiAmbiguity && Array.isArray(canvasUiAmbiguity.candidates) && canvasUiAmbiguity.candidates.length);

                    const canCopy = m.role === "assistant" && Boolean(String(m.text || "").trim());
                    const canDictate = m.role === "assistant" && !isThinking && Boolean(String(m.text || "").trim());
                    const canRedo = m.role === "assistant" && !isThinking && !String(m.id || "").startsWith("optimistic-assistant-");
                    const assistantActionVisibilityClass = isLastAssistant
                      ? ""
                      : "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 focus-visible:opacity-100";
                    return (
                      <div key={m.id} className="group/message">
                        <MessageBubble
                          msg={m}
                          onRunAction={(a) => void runAssistantAction(a)}
                          runningActionKey={runningActionKey}
                          onOpenLink={openInCanvas}
                          footerLeft={
                            m.role === "assistant" ? (
                              <>
                                <button
                                  type="button"
                                  className={classNames(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-100 hover:scale-105 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                                    assistantActionVisibilityClass,
                                    (!canDictate || dictating || regenerating || sending) && "opacity-60",
                                  )}
                                  onClick={() => void dictateAssistantMessage(m.id)}
                                  disabled={!canDictate || dictating || regenerating || sending}
                                  aria-label={dictationPlayingMessageId === m.id ? "Stop dictation" : "Dictate assistant message"}
                                  title={
                                    !canDictate
                                      ? "Nothing to dictate"
                                      : dictating && dictatingMessageId === m.id
                                      ? "Dictating…"
                                      : dictationPlayingMessageId === m.id
                                        ? "Stop dictation"
                                        : "Dictate"
                                  }
                                >
                                  {dictating && dictatingMessageId === m.id ? (
                                    <IconSpinner size={16} />
                                  ) : dictationPlayingMessageId === m.id ? (
                                    <span className="text-[14px] font-bold leading-none">■</span>
                                  ) : (
                                    <IconVolumeGlyph size={16} />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  className={classNames(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-100 hover:scale-105 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                                    assistantActionVisibilityClass,
                                    (!canRedo || dictating || regenerating || sending) && "opacity-60",
                                  )}
                                  onClick={() => void redoAssistantMessage(m.id)}
                                  disabled={!canRedo || dictating || regenerating || sending}
                                  aria-label="Redo assistant response"
                                  title={isRedoTarget ? "Redoing…" : "Redo from here"}
                                >
                                  {isRedoTarget ? <IconSpinner size={16} /> : <IconRedoGlyph size={16} />}
                                </button>
                              </>
                            ) : null
                          }
                          footerRight={
                            <>
                              {isLastUser ? (
                                <button
                                  type="button"
                                  className={classNames(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-transparent text-zinc-600 opacity-0 transition-all duration-100 group-hover/message:opacity-100 group-focus-within/message:opacity-100 hover:scale-105 hover:bg-zinc-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                                    (dictating || regenerating || sending) && "opacity-60",
                                  )}
                                  onClick={() => editUserMessage(m.id, m.text)}
                                  disabled={dictating || regenerating || sending}
                                  aria-label="Edit last user message"
                                  title="Edit"
                                >
                                  <IconEdit size={16} />
                                </button>
                              ) : null}
                              {m.role === "assistant" && !isThinking ? (
                                <button
                                  type="button"
                                  className={classNames(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-100 hover:scale-105 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                                    assistantActionVisibilityClass,
                                    !canCopy && "opacity-40",
                                  )}
                                  onClick={() => void copyMessageText(m.text)}
                                  disabled={!canCopy}
                                  aria-label="Copy message"
                                  title={canCopy ? "Copy" : "Nothing to copy"}
                                >
                                  <IconCopy size={16} />
                                </button>
                              ) : null}
                            </>
                          }
                        />
                        {showAmbiguousContacts && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {ambiguousContacts?.map((c, idx) => (
                              <button
                                key={c.email || c.phone || c.name || idx}
                                type="button"
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                                onClick={() => handleAmbiguousContactSelect(c)}
                              >
                                {c.name}
                                {c.email ? ` (${c.email})` : c.phone ? ` (${c.phone})` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                        {showChoices && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {assistantChoices?.map((c, idx) => (
                              <button
                                key={`${c.type}:${c.type === "booking_calendar" ? c.calendarId : c.type === "entity" ? `${c.kind}:${c.value}` : idx}`}
                                type="button"
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                                onClick={() => handleAssistantChoiceSelect(c)}
                                title={c.description || c.label}
                              >
                                {c.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                              onClick={() => void send("No preference.")}
                              title="No preference - pick a reasonable default"
                            >
                              No preference
                            </button>
                          </div>
                        )}
                        {showCanvasUiAmbiguity && (
                          <div className="mt-2">
                            <div className="mb-2 text-xs font-semibold text-zinc-500">Which UI element did you mean?</div>
                            <div className="flex flex-wrap gap-2">
                              {canvasUiAmbiguity?.candidates?.map((c, idx) => (
                                <button
                                  key={`${c.role}:${c.tag}:${c.nth}:${idx}`}
                                  type="button"
                                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                                  onClick={() => void handleCanvasUiCandidateSelect(c)}
                                  title={`${c.role || ""}${c.tag ? ` (${c.tag})` : ""}`.trim()}
                                >
                                  {c.name || `${c.role || "element"} #${c.nth}`}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {m.role === "assistant" && m.id === latestMessageId && Array.isArray(m.followUpSuggestions) && m.followUpSuggestions.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.followUpSuggestions.map((suggestion) => (
                              <button
                                key={`${m.id}:${suggestion}`}
                                type="button"
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                                onClick={() => void send(suggestion)}
                                title={suggestion}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  });
                })()}
                {showActiveLiveProgressCard && activeLiveStatus ? (
                  <div className="mt-3">
                    <LiveProgressCard
                      status={activeLiveStatus}
                      onInterrupt={activeCanInterrupt ? () => void interruptActiveRun() : null}
                      interrupting={Boolean(activeThreadId && interruptingThreadIds.has(activeThreadId))}
                    />
                  </div>
                ) : null}
                {showThreadMemoryNotice && activeWorkingMemory ? (
                  <div className="mt-3">
                    <ThreadMemoryUpdatedCard memory={activeWorkingMemory} onOpen={openThreadMemoryActivity} />
                  </div>
                ) : null}
                {!showActiveLiveProgressCard && activeUnresolvedRun ? (
                  <div className="mt-3">
                    <UnresolvedRunCard
                      unresolvedRun={activeUnresolvedRun}
                      sending={sending}
                      onContinue={(prompt) => void send(prompt)}
                      onOpenCanvas={activeUnresolvedRun.canvasUrl ? () => openInCanvas(activeUnresolvedRun.canvasUrl || "") : null}
                    />
                  </div>
                ) : null}
                {showNextStepCard && activeNextStepContext ? (
                  <div className="mt-3">
                    <NextStepCard
                      nextStepContext={activeNextStepContext}
                      sending={sending}
                      onContinue={(prompt) => void send(prompt)}
                      onOpenCanvas={activeNextStepContext.canvasUrl ? () => openInCanvas(activeNextStepContext.canvasUrl || "") : null}
                    />
                  </div>
                ) : null}
                <div ref={endRef} />
              </>
            ) : showWelcomeComposer ? (
              <div className="flex min-h-[calc(100dvh-10rem-env(safe-area-inset-top))] items-center justify-center sm:min-h-[60vh]">
                <div className="w-full max-w-2xl -translate-y-8 sm:translate-y-0">
                  <div className="mb-5 px-1 text-center sm:mb-6 sm:px-0">
                    <div className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 sm:text-3xl">Let Pura work for you</div>
                    <div className="mt-2 text-sm leading-relaxed text-zinc-500">Start with a question, a task, or the next workflow you want off your plate.</div>
                  </div>
                  <div className="mb-4 hidden grid-cols-1 gap-3 md:grid md:grid-cols-3">
                    {welcomePromptChipEntries.map((entry) => {
                      const prompt = entry.prompt;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className="flex min-h-28 items-start rounded-3xl border border-zinc-200 bg-white p-4 text-left text-sm font-semibold text-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-1 hover:border-zinc-300 hover:bg-zinc-50"
                          onClick={() => {
                            setThreadDraftState(activeThreadKey, (prev) => ({ ...prev, input: prompt }));
                            requestAnimationFrame(() => {
                              resizeInput();
                              focusComposer({ start: prompt.length, end: prompt.length });
                            });
                          }}
                        >
                          <span className="block leading-relaxed">{prompt}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-[28px] bg-transparent p-0 shadow-none sm:rounded-3xl sm:bg-transparent sm:p-0 sm:shadow-none">
                    {composerInner}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-400">&nbsp;</div>
            )}
          </div>
          </div>

        {!showWelcomeComposer ? (
          <div className="relative z-20 shrink-0 border-t border-zinc-200 bg-white px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-2 px-3 sm:px-4">
              <div className="mx-auto flex w-full max-w-5xl justify-end">
                <div className="pointer-events-auto flex flex-col items-end gap-2">
                  {!canvasOpen && Boolean(canvasUrl) ? (
                    <button
                      className={classNames(frostedBlueButtonClassName(), "h-10 px-3 py-2 text-xs font-bold lg:hidden")}
                      title="Open canvas"
                      onClick={() => openLatestCanvas({ modal: false })}
                    >
                      <span className="leading-none">Open work</span>
                      <span className="text-base leading-none">↗</span>
                    </button>
                  ) : null}

                  {activeThreadId ? (
                    <GlassSurface
                      width="fit-content"
                      height="auto"
                      borderRadius={20}
                      borderWidth={0.04}
                      blur={7}
                      displace={0.22}
                      distortionScale={-72}
                      redOffset={0}
                      greenOffset={2}
                      blueOffset={6}
                      backgroundOpacity={0.16}
                      saturation={1.05}
                      brightness={46}
                      opacity={0.985}
                      mixBlendMode="soft-light"
                      className="rounded-2xl"
                      style={{ background: "rgba(255,255,255,0.46)", boxShadow: "none" }}
                    >
                      <button
                        type="button"
                        className="inline-flex h-10 items-center rounded-2xl bg-[rgba(255,255,255,0.62)] px-3 text-xs font-semibold text-zinc-700 backdrop-blur-[2px] hover:bg-[rgba(255,255,255,0.72)]"
                        onClick={() => {
                          setActivityView({ kind: "list" });
                          setRunsOpen(true);
                        }}
                      >
                        Activity
                      </button>
                    </GlassSurface>
                  ) : null}
                </div>
              </div>
            </div>

            {canvasOpen && canvasUrl ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 lg:hidden relative">
                <div className="min-w-0 truncate">
                  Working on <span className="font-semibold">{canvasUrl}</span>
                </div>
                <button
                  type="button"
                  className={classNames(frostedBlueButtonClassName("compact"), "shrink-0")}
                  onClick={() => openCanvasInNewTab(canvasUrl)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="absolute top-1 right-1 rounded-full bg-zinc-100 hover:bg-zinc-200 p-1 text-xs font-bold"
                  title="Close canvas"
                  onClick={() => {
                    setCanvasOpen(false);
                    setCanvasUrl(null);
                    setCanvasModalOpen(false);
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}

            {composerInner}
          </div>
        ) : null}

        {!canvasOpen && Boolean(canvasUrl) ? (
          <button
            className="hidden lg:absolute lg:right-0 lg:top-32 lg:z-30 lg:inline-flex lg:h-10 lg:items-center lg:gap-1 lg:rounded-l-2xl lg:rounded-r-none lg:border lg:border-[rgba(29,78,216,0.18)] lg:bg-[rgba(29,78,216,0.12)] lg:px-3 lg:py-2 lg:text-xs lg:font-bold lg:text-brand-blue lg:backdrop-blur-md lg:shadow-[0_10px_24px_rgba(29,78,216,0.14)] lg:hover:bg-[rgba(29,78,216,0.18)]"
            title="Open canvas"
            onClick={() => openLatestCanvas({ modal: false })}
          >
            <span className="leading-none">Open work</span>
            <span className="text-base leading-none">‹</span>
          </button>
        ) : null}
        </div>

        {canvasOpen && canvasUrl ? (
          <>
            <div
              className="hidden w-2 shrink-0 cursor-col-resize bg-transparent hover:bg-zinc-100 lg:block"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(e) => {
                e.preventDefault();
                dragRef.current = { startX: e.clientX, startWidth: canvasWidth };
                try {
                  canvasIframeRef.current?.style.setProperty("pointer-events", "none");
                } catch {
                  // ignore
                }
                setCanvasDragging(true);
              }}
              title="Drag to resize"
            />

            <div className="hidden shrink-0 border-l border-zinc-200 bg-white lg:block" style={{ width: canvasWidth }}>
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
                  <div className="min-w-0 truncate text-xs font-semibold text-zinc-900">Work</div>
                  <div className="flex items-center gap-2">
                    <a
                      href={canvasUrl}
                      className={frostedBlueButtonClassName("compact")}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => {
                        setCanvasUrl(null);
                        setCanvasModalOpen(false);
                        setCanvasOpen(false);
                      }}
                      aria-label="Close canvas"
                      title="Close"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <iframe
                  ref={canvasIframeRef}
                  title="Work canvas"
                  src={canvasUrl}
                  className={classNames("min-h-0 flex-1 bg-white", canvasDragging ? "pointer-events-none" : "")}
                />
              </div>
            </div>
          </>
        ) : null}

        {(canvasDragging || sidebarDragging) ? (
          <div className="fixed inset-0 z-13000 hidden cursor-col-resize lg:block" aria-hidden />
        ) : null}
      </div>

      <PortalMediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onPick={addMediaAttachment}
        title="Media library"
        confirmLabel="Attach"
        accept="any"
      />

      <AppModal
        open={runsOpen}
        title="Activity"
        description="Inspect recent work and thread memory for this chat."
        onClose={closeActivityModal}
        headerActions={
          <>
            {activityView.kind !== "list" ? (
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-lg font-semibold text-zinc-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-colors duration-150 hover:bg-zinc-50"
                aria-label="Back"
                onClick={() => setActivityView({ kind: "list" })}
              >
                ←
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-brand-blue shadow-[0_8px_24px_rgba(29,78,216,0.14)] transition-colors duration-150 hover:bg-[rgba(29,78,216,0.18)]"
              onClick={() => {
                acknowledgeActiveThreadMemory();
                setActivityView({ kind: "thread-memory" });
              }}
            >
              Thread Memory
            </button>
          </>
        }
        widthClassName="w-[min(900px,calc(100vw-32px))]"
        closeVariant="x"
        hideHeaderDivider
      >
        {runsLoading ? (
          <div className="text-sm text-zinc-600">Loading…</div>
        ) : (
          <div>
            {activityView.kind === "thread-memory" ? (
              activeWorkingMemory ? (
                <ThreadMemoryDetail memory={activeWorkingMemory} unresolvedRun={activeUnresolvedRun} nextStepContext={activeNextStepContext} />
              ) : (
                <div className="text-sm text-zinc-600">No thread memory yet. Keep chatting to form a thread memory.</div>
              )
            ) : activityView.kind === "run" ? (
              selectedActivityRun ? (
                <div className="rounded-3xl border border-brand-blue/20 bg-white p-4 shadow-[0_0_0_1px_rgba(37,99,235,0.08)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{selectedActivityRun.workTitle || "Pura run"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        {Boolean(activeRunLedgerRow && activeRunLedgerRow.id === selectedActivityRun.id) ? <span className={classNames("rounded-full px-2 py-0.5 font-semibold", activityStatusPillClass("running", true))}>Active</span> : null}
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">{formatRunTriggerLabel(selectedActivityRun.triggerKind)}</span>
                        <span className={classNames("rounded-full px-2 py-0.5", activityStatusPillClass(selectedActivityRun.status))}>{formatRunStatusLabel(selectedActivityRun.status)}</span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">Started: {formatLocalDateTime(new Date(selectedActivityRun.createdAt))}</span>
                        {selectedActivityRun.completedAt ? <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">Completed: {formatLocalDateTime(new Date(selectedActivityRun.completedAt))}</span> : null}
                      </div>
                    </div>
                    {selectedActivityRun.canvasUrl ? (
                      <button
                        type="button"
                        className={frostedBlueButtonClassName()}
                        onClick={() => openInCanvas(selectedActivityRun.canvasUrl!)}
                      >
                        Open work
                      </button>
                    ) : null}
                  </div>

                  {selectedActivityRun.summaryText || selectedActivityRun.steps.length || selectedActivityRun.workTitle ? (
                    <div className="mt-4 rounded-2xl bg-zinc-50 px-4 py-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Summary</div>
                      <PuraMarkdownBlock text={summarizeRunForActivity(selectedActivityRun)} className="text-zinc-700" />
                    </div>
                  ) : null}

                  {selectedActivityRun.steps.length ? (
                    <div className="mt-4 rounded-2xl bg-zinc-50 px-4 py-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Steps</div>
                      <div className="space-y-3">
                        {selectedActivityRun.steps.map((step, idx) => {
                          const tone = activityStepTone(selectedActivityRun.status, step.ok);
                          return (
                            <div key={`${selectedActivityRun.id}:${step.key}:${idx}`} className={classNames("flex items-start justify-between gap-3 rounded-2xl px-3 py-3", tone.cardClassName)}>
                              <div className={classNames("min-w-0 flex-1 text-sm", tone.textClassName)}>
                                <PuraMarkdownBlock text={step.title || step.key} className={tone.textClassName} />
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className={classNames("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone.pillClassName)}>{tone.label}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {selectedActivityRun.followUpSuggestions?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedActivityRun.followUpSuggestions.map((suggestion) => (
                        <button
                          key={`${selectedActivityRun.id}:${suggestion}`}
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                          onClick={() => {
                            closeActivityModal();
                            void send(suggestion);
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedActivityRun.status === "needs_input" || selectedActivityRun.status === "interrupted" || selectedActivityRun.status === "failed" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(selectedActivityRun.status === "needs_input" || selectedActivityRun.status === "interrupted") ? (
                        <button
                          type="button"
                          className="rounded-2xl border border-brand-blue/20 bg-blue-50 px-3 py-2 text-xs font-semibold text-brand-blue hover:bg-blue-100"
                          onClick={() => {
                            closeActivityModal();
                            void send(selectedActivityRun.status === "needs_input" ? "Continue this chat and ask me only for the missing input you actually need." : "Continue this chat from where you left off and finish the remaining work.");
                          }}
                        >
                          {selectedActivityRun.status === "needs_input" ? "Continue" : "Resume"}
                        </button>
                      ) : null}
                      {selectedActivityRun.status === "failed" ? (
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                          onClick={() => {
                            closeActivityModal();
                            void send("Retry the last failed work in this chat, fix the issue, and keep going until it is done.");
                          }}
                        >
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">That run is no longer available.</div>
              )
            ) : !sortedRunLedgerRows.length ? (
              <div className="text-sm text-zinc-600">No runs yet for this chat.</div>
            ) : (
              <div className="space-y-3">
                {sortedRunLedgerRows.map((run) => {
                  const isActiveRun = Boolean(activeRunLedgerRow && activeRunLedgerRow.id === run.id);
                  const stepsPreview = run.steps.length ? `${run.steps.length} step${run.steps.length === 1 ? "" : "s"}` : null;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      className={classNames("block w-full rounded-3xl border bg-white p-4 text-left transition-colors hover:bg-zinc-50", isActiveRun ? "border-brand-blue/30 shadow-[0_0_0_1px_rgba(37,99,235,0.08)]" : "border-zinc-200")}
                      onClick={() => setActivityView({ kind: "run", runId: run.id })}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{run.workTitle || "Pura run"}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          {isActiveRun ? <span className={classNames("rounded-full px-2 py-0.5 font-semibold", activityStatusPillClass("running", true))}>Active</span> : null}
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">{formatRunTriggerLabel(run.triggerKind)}</span>
                          <span className={classNames("rounded-full px-2 py-0.5", activityStatusPillClass(run.status))}>{formatRunStatusLabel(run.status)}</span>
                          {stepsPreview ? <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">{stepsPreview}</span> : null}
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">Started: {formatLocalDateTime(new Date(run.createdAt))}</span>
                        </div>
                        {run.summaryText || run.steps.length || run.workTitle ? (
                          <div className="mt-3 max-h-24 overflow-hidden text-sm text-zinc-600">
                            <PuraMarkdownBlock text={summarizeRunForActivity(run)} className="text-zinc-600" />
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </AppModal>

      <AppModal
        open={scheduledOpen}
        title="Scheduled tasks"
        description="Manage upcoming scheduled chat runs."
        onClose={() => setScheduledOpen(false)}
        widthClassName="w-[min(900px,calc(100vw-32px))]"
        closeVariant="x"
        hideHeaderDivider
      >
        {scheduledLoading ? (
          <div className="text-sm text-zinc-600">Loading…</div>
        ) : !scheduledRows.length ? (
          <div className="text-sm text-zinc-600">No scheduled tasks.</div>
        ) : (
          <div className="space-y-3">
            {scheduledRows.map((r) => {
              const defaults = (() => {
                const split = splitRepeatEveryMinutes(r.repeatEveryMinutes || 0);
                return {
                  sendAtLocal: toLocalInputValue(r.sendAt),
                  repeatEvery: split.repeatEvery,
                  repeatUnit: split.repeatUnit,
                };
              })();

              const edit = scheduledEditing[r.id] || defaults;
              const saving = scheduledSavingIds.has(r.id);
              const nextRepeatEveryMinutes = computeRepeatEveryMinutes({ repeatEvery: edit.repeatEvery, repeatUnit: edit.repeatUnit });
              const isDirty = edit.sendAtLocal !== defaults.sendAtLocal || nextRepeatEveryMinutes !== (r.repeatEveryMinutes || 0);
              const isRepeating = (r.repeatEveryMinutes || 0) > 0;
              return (
                <div key={r.id} className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{r.threadTitle}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-zinc-600">{r.displayText || "(scheduled task)"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                          Next: {r.sendAt ? formatLocalDateTime(new Date(r.sendAt)) : "-"}
                        </span>
                        {r.recurrenceTimeZone ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">TZ: {r.recurrenceTimeZone}</span>
                        ) : null}
                        <span
                          className={classNames(
                            "rounded-full border px-2 py-0.5",
                            r.lastRunOk === true
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : r.lastRunOk === false
                                ? "border-amber-200 bg-amber-50 text-amber-900"
                                : "border-zinc-200 bg-zinc-50",
                          )}
                        >
                          Last result: {r.lastRunSummary || "Not run yet"}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                          Last run: {r.lastRunAt ? formatLocalDateTime(new Date(r.lastRunAt)) : "Not run yet"}
                        </span>
                        {isRepeating ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">Repeats</span>
                        ) : (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">One-time</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <button
                        type="button"
                        className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => void cancelScheduledRow(r.id)}
                      >
                        Stop
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>

                      <div className="text-xs font-semibold text-zinc-500">Schedule</div>
                      <LocalDateTimePicker
                        value={edit.sendAtLocal}
                        onChange={(v) =>
                          setScheduledEditing((prev) => ({
                            ...prev,
                            [r.id]: { ...edit, sendAtLocal: v },
                          }))
                        }
                        disablePast
                        buttonClassName="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-900 hover:bg-zinc-50"
                      />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-zinc-500">Frequency</div>
                      <div className="mt-1 flex gap-2">
                        <input
                          inputMode="numeric"
                          value={edit.repeatEvery}
                          onChange={(e) =>
                            setScheduledEditing((prev) => ({
                              ...prev,
                              [r.id]: { ...edit, repeatEvery: e.target.value },
                            }))
                          }
                          placeholder="Leave blank for one-time"
                          className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        />
                        <select
                          value={edit.repeatUnit}
                          onChange={(e) =>
                            setScheduledEditing((prev) => ({
                              ...prev,
                              [r.id]: { ...edit, repeatUnit: e.target.value as RepeatUnit },
                            }))
                          }
                          className="h-11 w-36 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        >
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                          <option value="weeks">weeks</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        className="h-11 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                        onClick={() => void saveScheduledRow(r.id)}
                        disabled={!isDirty || saving}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppModal>

      <AppModal
        open={shareOpen && Boolean(shareThread)}
        title="Share with team"
        description="This chat is private until you share it with specific teammates."
        onClose={closeShareModal}
        widthClassName="w-[min(720px,calc(100vw-32px))]"
        closeVariant="x"
        hideHeaderDivider
        hideFooterDivider
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              onClick={() => void saveShare()}
              disabled={shareLoading || shareSaving}
            >
              {shareSaving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        {shareLoading ? (
          <div className="text-sm text-zinc-600">Loading…</div>
        ) : (
          (() => {
            const q = shareQuery.trim().toLowerCase();
            const creator = shareCreatorUserId;
            const visible = shareMembers
              .filter((m) => m && m.userId)
              .filter((m) => (creator ? String(m.userId) !== creator : true))
              .filter((m) => {
                if (!q) return true;
                return (
                  String(m.name || "").toLowerCase().includes(q) ||
                  String(m.email || "").toLowerCase().includes(q)
                );
              });

            return (
              <div className="space-y-4">
                <input
                  value={shareQuery}
                  onChange={(e) => setShareQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                />

                {!visible.length ? (
                  <div className="text-sm text-zinc-600">No teammates found.</div>
                ) : (
                  <div className="space-y-2">
                    {visible.map((m) => {
                      const selected = shareSelectedUserIds.has(String(m.userId));
                      return (
                        <button
                          key={String(m.userId)}
                          type="button"
                          className={classNames(
                            "w-full rounded-3xl border px-4 py-3 text-left",
                            selected ? "border-brand-blue bg-blue-50/60" : "border-zinc-200 bg-white hover:bg-zinc-50",
                          )}
                          onClick={() => {
                            const id = String(m.userId);
                            setShareSelectedUserIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            });
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={classNames(
                                "grid h-6 w-6 place-items-center rounded-lg border",
                                selected ? "border-brand-blue bg-brand-blue text-white" : "border-zinc-300 bg-white text-transparent",
                              )}
                              aria-hidden
                            >
                              ✓
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-zinc-900">{m.name || m.email}</div>
                              <div className="truncate text-sm text-zinc-600">{m.email}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </AppModal>

      <AppModal
        open={mobileThreadsOpen}
        title="Chats"
        description="Pick a conversation"
        onClose={() => setMobileThreadsOpen(false)}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        closeVariant="x"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              onClick={createThread}
            >
              New chat
            </button>
          </div>
        }
      >
        {left}
      </AppModal>

      <AppConfirmModal
        open={Boolean(confirmModal)}
        title={confirmModal?.title || "Confirm"}
        message={confirmModal?.message || ""}
        confirmLabel={confirmModal?.confirmLabel}
        cancelLabel={confirmModal?.cancelLabel}
        destructive={confirmModal?.destructive}
        onConfirm={() => closeConfirm(true)}
        onClose={() => closeConfirm(false)}
      />

      <AppModal
        open={canvasModalOpen && Boolean(canvasUrl)}
        title="Work"
        description={canvasUrl ? "Pura is working here." : ""}
        onClose={() => setCanvasModalOpen(false)}
        widthClassName="w-[min(1200px,calc(100vw-32px))]"
        closeVariant="x"
        hideHeaderDivider
      >
        {canvasUrl ? (
          <div className="h-[min(78vh,820px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <iframe title="Work canvas" src={canvasUrl} className="h-full w-full bg-white" />
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
