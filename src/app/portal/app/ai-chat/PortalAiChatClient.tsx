"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
import { useToast } from "@/components/ToastProvider";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { IconCopy, IconEdit, IconSchedule, IconSend, IconSendHover } from "@/app/portal/PortalIcons";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
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
};

type ShareMember = { userId: string; email: string; name: string };

type Attachment = {
  id?: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  url: string;
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

type AssistantAction = {
  key: string;
  title: string;
  confirmLabel?: string;
  args: Record<string, unknown>;
};

type CanvasUiCandidate = { role: string; name: string; tag: string; nth: number };

type Message = {
  id: string;
  role: "user" | "assistant" | string;
  text: string;
  attachmentsJson: any;
  assistantActions?: AssistantAction[];
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
};

type ChatMode = "plan" | "work";

const DRAFT_THREAD_KEY = "__draft__";

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
  };
}

type PromptChipDefinition = {
  id: string;
  prompt: string;
  slugs?: string[];
  keywords?: string[];
};

const WELCOME_PROMPT_LIBRARY: PromptChipDefinition[] = [
  { id: "leads-priority", prompt: "Summarize the highest-priority leads I should follow up with today.", slugs: ["lead-scraping", "crm", "inbox", "ai-receptionist"], keywords: ["lead", "follow up", "priority"] },
  { id: "marketing-week", prompt: "Plan three marketing tasks I can finish this week.", slugs: ["blogs", "newsletter", "funnel-builder", "media-library"], keywords: ["marketing", "campaign", "content"] },
  { id: "automation-next", prompt: "Review what Pura can help automate next for this business.", slugs: ["automations", "tasks", "booking", "nurture-campaigns"], keywords: ["automate", "workflow", "system"] },
  { id: "missed-calls", prompt: "Help me tighten our missed-call follow-up flow.", slugs: ["ai-receptionist", "missed-call-textback", "booking"], keywords: ["call", "missed", "text back"] },
  { id: "newsletter-ideas", prompt: "Give me three newsletter ideas I can send this month.", slugs: ["newsletter", "blogs"], keywords: ["newsletter", "email", "audience"] },
  { id: "booking-gaps", prompt: "Find weak spots in our booking flow and suggest fixes.", slugs: ["booking", "funnel-builder", "ai-receptionist"], keywords: ["book", "booking", "appointment"] },
  { id: "task-cleanup", prompt: "Turn my open work into a clean action plan for today.", slugs: ["tasks", "automations"], keywords: ["task", "todo", "plan"] },
  { id: "blog-seo", prompt: "Map out blog topics that could bring in better search traffic.", slugs: ["blogs", "funnel-builder"], keywords: ["blog", "seo", "search"] },
  { id: "review-request", prompt: "Draft a smarter review request flow for recent customers.", slugs: ["reviews", "automations", "inbox"], keywords: ["review", "reputation", "customer"] },
  { id: "nurture-refresh", prompt: "Refresh our nurture campaign so it feels more personal.", slugs: ["nurture-campaigns", "newsletter", "inbox"], keywords: ["nurture", "sequence", "personal"] },
  { id: "reporting-summary", prompt: "Show me what the reporting data is saying we should fix first.", slugs: ["reporting", "automations", "booking"], keywords: ["report", "reporting", "numbers"] },
  { id: "inbox-backlog", prompt: "Help me clear the inbox backlog with the fastest wins first.", slugs: ["inbox", "tasks", "ai-receptionist"], keywords: ["inbox", "reply", "backlog"] },
  { id: "outbound-script", prompt: "Write a tighter outbound script for leads that went cold.", slugs: ["ai-outbound-calls", "lead-scraping", "inbox"], keywords: ["outbound", "cold", "script"] },
  { id: "lead-list", prompt: "Suggest the best kind of leads to scrape next and why.", slugs: ["lead-scraping", "ai-outbound-calls", "reporting"], keywords: ["lead", "scrape", "prospect"] },
  { id: "media-reuse", prompt: "Find ways we can reuse our existing media across more campaigns.", slugs: ["media-library", "newsletter", "blogs", "funnel-builder"], keywords: ["media", "asset", "creative"] },
  { id: "funnel-conversion", prompt: "Audit our funnel and give me three conversion improvements.", slugs: ["funnel-builder", "booking", "reporting"], keywords: ["funnel", "conversion", "landing page"] },
  { id: "appointment-reminders", prompt: "Draft a reminder sequence to reduce appointment no-shows.", slugs: ["booking", "follow-up", "automations"], keywords: ["reminder", "no-show", "appointment"] },
  { id: "team-focus", prompt: "Tell me where my team should focus first this week.", slugs: ["tasks", "reporting", "automations"], keywords: ["team", "focus", "week"] },
  { id: "followup-rewrite", prompt: "Rewrite our follow-up messaging so it gets more replies.", slugs: ["follow-up", "inbox", "newsletter"], keywords: ["follow-up", "reply", "message"] },
  { id: "automation-builder", prompt: "Design an automation that saves the team the most manual work.", slugs: ["automations", "tasks", "inbox"], keywords: ["automation", "manual", "save time"] },
  { id: "receptionist-script", prompt: "Improve our AI receptionist script for higher-quality leads.", slugs: ["ai-receptionist", "booking"], keywords: ["receptionist", "caller", "lead quality"] },
  { id: "sales-story", prompt: "Explain our sales performance in plain English and what to do next.", slugs: ["reporting", "inbox", "booking"], keywords: ["sales", "pipeline", "performance"] },
  { id: "content-calendar", prompt: "Build a simple content calendar around our best offers.", slugs: ["blogs", "newsletter", "media-library"], keywords: ["content", "calendar", "offer"] },
  { id: "new-offer", prompt: "Help me turn one service into a stronger offer people actually respond to.", slugs: ["funnel-builder", "booking", "reporting"], keywords: ["offer", "service", "respond"] },
  { id: "reactivation", prompt: "Create a reactivation plan for leads we have not touched in a while.", slugs: ["nurture-campaigns", "inbox", "ai-outbound-calls"], keywords: ["reactivation", "old leads", "win back"] },
  { id: "reviews-replies", prompt: "Help me turn new reviews into follow-up opportunities.", slugs: ["reviews", "inbox", "tasks"], keywords: ["review", "reply", "opportunity"] },
  { id: "default-systems", prompt: "What are the next three systems I should tighten up in the business?", keywords: ["systems", "business", "next"] },
  { id: "default-team", prompt: "What should I delegate, automate, and personally handle this week?", keywords: ["delegate", "automate", "week"] },
];

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
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("www.")) return `https://${raw}`;
  try {
    const u = new URL(raw);
    if (!["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) return null;

    // If the assistant outputs an absolute URL to an internal portal path,
    // force it to be relative so we never leak/use bogus hosts (e.g. yourportal.com).
    if (u.protocol === "http:" || u.protocol === "https:") {
      const path = u.pathname || "";
      const internal =
        path === "/portal" ||
        path.startsWith("/portal/") ||
        path === "/book" ||
        path.startsWith("/book/") ||
        path === "/api/portal" ||
        path.startsWith("/api/portal/");
      if (internal) return `${path}${u.search}${u.hash}`;
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
  assistantVariant,
  onRunAction,
  runningActionKey,
  onOpenLink,
  footerLeft,
  footerRight,
}: {
  msg: Message;
  assistantVariant?: "light" | "dark" | "work";
  onRunAction?: (action: AssistantAction) => void;
  runningActionKey?: string | null;
  onOpenLink?: (href: string) => void;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}) {
  const isUser = msg.role === "user";
  const isThinking = msg.id.startsWith("optimistic-assistant-") && msg.role === "assistant";
  const isWorkAssistant = !isUser && assistantVariant === "work";
  const actions = !isUser && !isThinking && Array.isArray(msg.assistantActions) ? msg.assistantActions : [];
  const scheduledEnv = tryParseScheduledEnvelopeForUi(msg.text);

  const assistantSurface =
    assistantVariant === "dark"
      ? "border-zinc-200 bg-zinc-100"
      : assistantVariant === "work"
        ? "border-zinc-800 bg-[#262626]"
        : "border-zinc-200 bg-zinc-50";

  const bubble = (
    <div
      className={classNames(
        "rounded-3xl px-4 py-3 text-sm leading-relaxed",
        isUser ? "bg-brand-blue text-white" : classNames(assistantSurface, isWorkAssistant ? "border text-white" : "border text-zinc-900"),
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
          <div className="whitespace-pre-wrap">{msg.text}</div>
        )
      ) : isThinking ? (
        <ThinkingDots />
      ) : (
        <div className={classNames("prose prose-sm max-w-none", isWorkAssistant ? "prose-invert" : "prose-zinc")}>
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
                    className={classNames(
                      "font-semibold underline underline-offset-2",
                      isWorkAssistant ? "text-blue-200" : "text-brand-blue",
                    )}
                    onClick={(e) => {
                      if (external) return;
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      if (!safe.startsWith("/")) return;
                      if (!onOpenLink) return;
                      e.preventDefault();
                      onOpenLink(safe);
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
                return <code className={classNames("rounded px-1 py-0.5 text-[12px]", isWorkAssistant ? "bg-white/10 text-white" : "bg-zinc-100")}>{children}</code>;
              },
              pre({ children }: { children?: ReactNode }) {
                return <pre className={classNames("my-2 overflow-x-auto rounded-2xl p-3 text-[12px]", isWorkAssistant ? "bg-white/10 text-white" : "bg-zinc-100")}>{children}</pre>;
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

      el.style.height = "0px";
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = `${Math.max(next, 44)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    } catch {
      // ignore
    }
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
  const [loadingThreadIds, setLoadingThreadIds] = useState<Set<string>>(() => {
    const next = new Set<string>();
    if (initialRequestedThreadId) next.add(initialRequestedThreadId);
    return next;
  });
  const [serviceUsageCounts, setServiceUsageCounts] = useState<Record<string, number>>({});
  // Must be stable for SSR + hydration. We randomize it after mount.
  const [welcomePromptSeed, setWelcomePromptSeed] = useState(() => "0");

  const [threadDraftsById, setThreadDraftsById] = useState<Record<string, ThreadDraftState>>(() => ({
    [DRAFT_THREAD_KEY]: createEmptyThreadDraftState(),
  }));
  const [editingMessageIdByThread, setEditingMessageIdByThread] = useState<Record<string, string | null>>(() => ({}));
  const [sendingThreadIds, setSendingThreadIds] = useState<Set<string>>(() => new Set());
  const [draftSending, setDraftSending] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictatingMessageId, setDictatingMessageId] = useState<string | null>(null);
  const [dictationPlayingMessageId, setDictationPlayingMessageId] = useState<string | null>(null);
  const dictationRef = useRef<{ audio: HTMLAudioElement; objectUrl: string; messageId: string } | null>(null);
  const [regeneratingTarget, setRegeneratingTarget] = useState<null | { threadId: string; messageId: string }>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("plan");
  const [messageDisplayModesById, setMessageDisplayModesById] = useState<Record<string, ChatMode>>(() => ({}));

  const [scheduleTaskOpen, setScheduleTaskOpen] = useState(false);
  const [scheduleTaskText, setScheduleTaskText] = useState("");
  const [uploading, setUploading] = useState(false);

  const [attachMenu, setAttachMenu] = useState<FixedMenuStyle | null>(null);
  const [attachMenuAnchorRect, setAttachMenuAnchorRect] = useState<DOMRect | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

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
  const sendInFlightRef = useRef<Set<string>>(new Set());
  const activeThreadIdRef = useRef<string | null>(null);
  const threadDraftsRef = useRef<Record<string, ThreadDraftState>>({ [DRAFT_THREAD_KEY]: createEmptyThreadDraftState() });
  const editingMessageIdByThreadRef = useRef<Record<string, string | null>>({});
  const threadsRef = useRef<Thread[]>([]);
  const messagesByThreadRef = useRef<Record<string, Message[]>>({ [DRAFT_THREAD_KEY]: [] });
  const messageDisplayModesByIdRef = useRef<Record<string, ChatMode>>({});

  const activeThreadKey = activeThreadId ?? DRAFT_THREAD_KEY;
  const messages = useMemo(() => messagesByThread[activeThreadKey] ?? [], [activeThreadKey, messagesByThread]);
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
  const editingMessageId = editingMessageIdByThread[activeThreadKey] ?? null;
  const isEditing = Boolean(editingMessageId);
  const requestedThreadId = initialRequestedThreadId;
  const currentHref = useMemo(() => {
    const query = searchParams?.toString();
    return `${pathname || ""}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);
  const effectiveChatMode: ChatMode = chatMode;
  const hasThinkingMessage = messages.some((msg) => msg.role === "assistant" && String(msg.id || "").startsWith("optimistic-assistant-"));
  const workStatusLabel = useMemo(() => {
    if (regenerating && regeneratingTarget?.messageId) return effectiveChatMode === "work" ? "Reworking that response" : "Redoing that response";
    if (runningActionKey) return effectiveChatMode === "work" ? "Working through the next step" : "Thinking through the next step";
    if (sending || hasThinkingMessage) return effectiveChatMode === "work" ? "Working on it" : "Thinking it through";
    return null;
  }, [effectiveChatMode, hasThinkingMessage, regenerating, regeneratingTarget?.messageId, runningActionKey, sending]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    messagesByThreadRef.current = messagesByThread;
  }, [messagesByThread]);

  useEffect(() => {
    messageDisplayModesByIdRef.current = messageDisplayModesById;
  }, [messageDisplayModesById]);

  useEffect(() => {
    threadDraftsRef.current = threadDraftsById;
  }, [threadDraftsById]);

  useEffect(() => {
    editingMessageIdByThreadRef.current = editingMessageIdByThread;
  }, [editingMessageIdByThread]);

  const navigateToThread = useCallback(
    (thread: Pick<Thread, "id" | "title"> | null, mode: "push" | "replace" = "push") => {
      const href = buildPortalAiChatThreadHref({
        basePath,
        thread: thread ? { id: thread.id, title: thread.title } : null,
      });
      if (currentHref === href) return;
      if (mode === "replace") router.replace(href);
      else router.push(href);
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
      setMessagesByThread((prev) => ({
        ...prev,
        [threadKey]: updater(prev[threadKey] ?? []),
      }));
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

  const scrollToBottom = useCallback((force = false) => {
    const el = scrollerRef.current;
    if (!force && el) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 200) return;
    }
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/portal/ai-chat/threads", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Failed to load threads");
      const next = Array.isArray(json.threads) ? (json.threads as Thread[]) : [];
      setThreads(next);

      // Default to a draft "new chat" when opening the page.
      // If an active thread was selected during this session but was deleted,
      // clear it and fall back to draft.
      if (activeThreadId && !next.some((t) => t.id === activeThreadId)) {
        // Never bounce back to draft while the UI has local state for this thread.
        // This covers slow DB replication/eventual-consistency where the thread
        // exists locally but isn't in the server list yet.
        const hasLocalMessages = (messagesByThreadRef.current[activeThreadId] ?? []).length > 0;
        const hasLocalThread = (threadsRef.current ?? []).some((t) => t.id === activeThreadId);
        const isSending = sendInFlightRef.current.has(activeThreadId);
        if (!isSending && !hasLocalMessages && !hasLocalThread) {
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
  }, [toast, activeThreadId, navigateToThread]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      setThreadLoading(threadId, true);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadId)}/messages`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Failed to load messages");
        setMessagesByThread((prev) => ({
          ...prev,
          [threadId]: Array.isArray(json.messages)
            ? (json.messages as Message[]).map((message) => applyAssistantDisplayMode(message, messageDisplayModesByIdRef.current[message.id]))
            : [],
        }));
        const nextLastCanvasUrl =
          typeof json?.threadContext?.lastCanvasUrl === "string" && json.threadContext.lastCanvasUrl.trim()
            ? String(json.threadContext.lastCanvasUrl).trim()
            : null;
        if (nextLastCanvasUrl && activeThreadIdRef.current === threadId) {
          setCanvasUrl(nextLastCanvasUrl);
        }
        // Ensure we scroll after the new messages have actually rendered.
        requestAnimationFrame(() => scrollToBottom(true));
        setTimeout(() => scrollToBottom(true), 0);
        setTimeout(() => scrollToBottom(true), 120);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
      } finally {
        setThreadLoading(threadId, false);
      }
    },
    [scrollToBottom, setThreadLoading, toast],
  );

  const selectThread = useCallback(
    (threadId: string) => {
      forceScrollToBottomRef.current = true;
      setThreadLoading(threadId, true);
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
    forceScrollToBottomRef.current = false;
    requestAnimationFrame(() => scrollToBottom(true));
  }, [activeThreadId, messagesLoading, messages.length, scrollToBottom]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

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
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

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
    setActiveThreadId(null);
    setMessagesByThread((prev) => ({ ...prev, [DRAFT_THREAD_KEY]: [] }));
    clearThreadDraftState(DRAFT_THREAD_KEY);
    clearThreadUiState(DRAFT_THREAD_KEY);
    setCanvasUrl(null);
    setCanvasModalOpen(false);
    setCanvasOpen(false);
    setMobileThreadsOpen(false);
    setChatMode("plan");
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
      const initialThreadId = activeThreadIdRef.current;
      const initialThreadKey = initialThreadId ?? DRAFT_THREAD_KEY;
      if (sendInFlightRef.current.has(initialThreadKey)) return;

      const editingIdForSend = editingMessageIdByThreadRef.current[initialThreadKey] ?? null;
      const isEditSend = Boolean(editingIdForSend);

      const draftAtSend = threadDraftsRef.current[initialThreadKey] ?? createEmptyThreadDraftState();
      const text = typeof overrideText === "string" ? overrideText : draftAtSend.input.trim();
      const attachments = draftAtSend.pendingAttachments;
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
            body: JSON.stringify({}),
          }).then((r) => r.json().catch(() => null));
          if (!created?.ok || !created?.thread?.id) throw new Error(created?.error || "Failed to create chat");
          createdThread = created.thread as Thread;
          threadIdForSend = String(createdThread.id);

          // Switch the UI to the newly created thread immediately so the user sees
          // their optimistic message + the thinking indicator right away.
          if (activeThreadIdRef.current === null) {
            activeThreadIdRef.current = threadIdForSend;
            setActiveThreadId(threadIdForSend);
          }
          setThreads((prev) => {
            const without = prev.filter((t) => t.id !== threadIdForSend);
            return [createdThread as Thread, ...without];
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

      const optimisticAssistant: Message = {
        id: `optimistic-assistant-${optimisticId}`,
        role: "assistant",
        text: "",
        attachmentsJson: [],
        displayMode: modeAtSend,
        createdAt: nowIso,
        sendAt: null,
        sentAt: nowIso,
      };

      if (isEditSend && editingIdForSend && threadIdForSend) {
        const prevMessagesSnapshot = messagesByThreadRef.current[threadIdForSend] ?? [];

        updateThreadMessages(threadIdForSend, (prev) => {
          const idx = prev.findIndex((m) => m.id === editingIdForSend);
          if (idx < 0) return prev;
          const head = prev.slice(0, idx);
          const current = prev[idx];
          const updated: Message = { ...current, text };
          return [...head, updated, optimisticAssistant];
        });

        setThreadDraftState(draftRestoreKey, (prev) => ({
          input: typeof overrideText === "string" ? prev.input : "",
          pendingAttachments: [],
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
              ...(canvasUrl ? { canvasUrl } : {}),
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
              const cleaned = prev.filter((m) => m.id !== optimisticAssistant.id);
              const next: Message[] = [...cleaned];
              if (json.userMessage) {
                const um: Message = json.userMessage as Message;
                for (let i = 0; i < next.length; i++) {
                  if (next[i].id === um.id) {
                    next[i] = um;
                    break;
                  }
                }
              }
              if (json.assistantMessage) {
                const assistantMessage = applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend);
                rememberMessageDisplayMode(assistantMessage.id, assistantMessage.displayMode);
                next.push(assistantMessage);
              }
              return next;
            });

            const ok = await askConfirm({ title, message, confirmLabel: "Confirm", cancelLabel: "Cancel" });
            if (!ok) {
              void loadThreads();
              return;
            }

            const res2 = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
              method: "POST",
              headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
              body: JSON.stringify({
                confirmToken: token,
                url: window.location.href,
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
                const am = applyAssistantDisplayMode(json2.assistantMessage as Message, modeAtSend);
                rememberMessageDisplayMode(am.id, am.displayMode);
                next.push({ ...am, assistantActions: assistantActions2.length ? assistantActions2 : undefined });
              }
              return next;
            });

            void loadThreads();
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
            const cleaned = prev.filter((m) => m.id !== optimisticAssistant.id);
            const next: Message[] = [...cleaned];
            if (json.userMessage) {
              const um: Message = json.userMessage as Message;
              for (let i = 0; i < next.length; i++) {
                if (next[i].id === um.id) {
                  next[i] = um;
                  break;
                }
              }
            }
            if (json.assistantMessage) {
              const am = applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend);
              rememberMessageDisplayMode(am.id, am.displayMode);
              next.push({ ...am, assistantActions: assistantActions.length ? assistantActions : undefined });
            }
            return next;
          });

          if ((json as any)?.openScheduledTasks) {
            setScheduledOpen(true);
          }

          void loadThreads();
          return;
        } catch (e) {
          updateThreadMessages(threadIdForSend, () => prevMessagesSnapshot);
          setThreadEditingMessageId(threadIdForSend, editingIdForSend);
          setThreadDraftState(draftRestoreKey, (prev) => ({
            ...prev,
            input: typeof overrideText === "string" ? prev.input : text,
            pendingAttachments: [],
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

      updateThreadMessages(threadIdForSend, (prev) => [...prev, optimisticUser, optimisticAssistant]);
      setThreadDraftState(draftRestoreKey, (prev) => ({
        input: typeof overrideText === "string" ? prev.input : "",
        pendingAttachments: [],
      }));
      clearThreadUiState(threadIdForSend);

      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
          body: JSON.stringify({
            text,
            url: window.location.href,
            ...(canvasUrl ? { canvasUrl } : {}),
            attachments,
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
            const cleaned = prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id);
            const next: Message[] = [...cleaned];
            if (json.userMessage) next.push(json.userMessage);
            if (json.assistantMessage) {
              const assistantMessage = applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend);
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
            return;
          }

          const res2 = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
            body: JSON.stringify({
              confirmToken: token,
              url: window.location.href,
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
              const am = applyAssistantDisplayMode(json2.assistantMessage as Message, modeAtSend);
              rememberMessageDisplayMode(am.id, am.displayMode);
              next.push({ ...am, assistantActions: assistantActions2.length ? assistantActions2 : undefined });
            }
            return next;
          });

          void loadThreads();
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
          const cleaned = prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id);
          const next: Message[] = [...cleaned];
          if (json.userMessage) next.push(json.userMessage);
          if (json.assistantMessage) {
            const am = applyAssistantDisplayMode(json.assistantMessage as Message, modeAtSend);
            rememberMessageDisplayMode(am.id, am.displayMode);
            next.push({ ...am, assistantActions: assistantActions.length ? assistantActions : undefined });
          }
          return next;
        });

        if ((json as any)?.openScheduledTasks) {
          setScheduledOpen(true);
        }

        void loadThreads();
      } catch (e) {
        updateThreadMessages(threadIdForSend, (prev) => prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id));
        setThreadDraftState(draftRestoreKey, (prev) => ({
          ...prev,
          input: typeof overrideText === "string" ? prev.input : text,
          pendingAttachments: attachments,
        }));

        // If the first send failed right after creating a brand new thread,
        // proactively delete it so empty chats are never persisted.
        if (createdThread?.id) {
          void fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(String(createdThread.id))}/actions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "delete" }),
          }).catch(() => null);
          setThreads((prev) => prev.filter((t) => t.id !== String(createdThread?.id)));

          // Roll back UI state to the draft composer immediately.
          // This avoids a transient "missing thread" state that can bounce later.
          activeThreadIdRef.current = null;
          setActiveThreadId(null);
          navigateToThread(null, "replace");
          setMessagesByThread((prev) => {
            const next = { ...prev };
            delete (next as any)[String(createdThread?.id)];
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
    [askConfirm, canvasUrl, clearThreadUiState, clientTimeZone, clientTimeZoneHeaders, effectiveChatMode, executeClientUiActions, loadThreads, navigateToThread, rememberMessageDisplayMode, setThreadDraftState, setThreadEditingMessageId, setThreadSending, setThreadUiState, toast, updateThreadMessages],
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
        clientUiActions?: unknown[];
        openScheduledTasks?: boolean;
      };
    },
    [activeThreadId, clientTimeZoneHeaders],
  );

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
          const assistantMessage = applyAssistantDisplayMode(json.assistantMessage as Message, modeAtAction);
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setRunningActionKey(null);
      }
    },
    [activeThreadId, askConfirm, effectiveChatMode, executeAgentAction, executeClientUiActions, loadThreads, rememberMessageDisplayMode, runningActionKey, setThreadUiState, toast, updateThreadMessages],
  );

  const openInCanvas = useCallback(
    (href: string) => {
      const safe = safeHref(href);
      if (!safe || !safe.startsWith("/")) return;
      setCanvasUrl(safe);
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
        dictationRef.current?.audio.pause();
        if (dictationRef.current?.audio) dictationRef.current.audio.currentTime = 0;
      } catch {
        // ignore
      }
      try {
        if (dictationRef.current?.objectUrl) URL.revokeObjectURL(dictationRef.current.objectUrl);
      } catch {
        // ignore
      }
      dictationRef.current = null;
      setDictationPlayingMessageId(null);
    };
  }, []);

  const dictateAssistantMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId) return;

      const current = dictationRef.current;
      if (current && current.messageId === messageId) {
        const audio = current.audio;
        const isPlaying = !audio.paused && !audio.ended;

        if (isPlaying) {
          try {
            audio.pause();
            audio.currentTime = 0;
          } catch {
            // ignore
          }
          setDictationPlayingMessageId(null);
          return;
        }

        try {
          audio.currentTime = 0;
          await audio.play();
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
        try {
          dictationRef.current?.audio.pause();
          if (dictationRef.current?.audio) dictationRef.current.audio.currentTime = 0;
        } catch {
          // ignore
        }
        try {
          if (dictationRef.current?.objectUrl) URL.revokeObjectURL(dictationRef.current.objectUrl);
        } catch {
          // ignore
        }
        dictationRef.current = null;
        setDictationPlayingMessageId(null);

        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/dictate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || "Dictation failed");
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        audio.onplay = () => setDictationPlayingMessageId(messageId);
        audio.onpause = () => setDictationPlayingMessageId((prev) => (prev === messageId ? null : prev));
        audio.onended = () => setDictationPlayingMessageId((prev) => (prev === messageId ? null : prev));

        dictationRef.current = { audio, objectUrl, messageId };
        await audio.play();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setDictating(false);
        setDictatingMessageId(null);
      }
    },
    [activeThreadId, dictating, toast],
  );

  const redoAssistantMessage = useCallback(
    async (assistantMessageId: string) => {
      if (!activeThreadId) return;
      if (!assistantMessageId) return;
      if (regeneratingTarget?.threadId === activeThreadId) return;
      const modeAtRedo = effectiveChatMode;
      const threadIdAtStart = activeThreadId;

      const prevMessagesSnapshot = messagesByThreadRef.current[threadIdAtStart] ?? [];
      const optimisticId = newClientId();
      const nowIso = new Date().toISOString();
      const optimisticAssistant: Message = {
        id: `optimistic-assistant-${optimisticId}`,
        role: "assistant",
        text: "",
        attachmentsJson: [],
        displayMode: modeAtRedo,
        createdAt: nowIso,
        sendAt: null,
        sentAt: nowIso,
      };

      updateThreadMessages(threadIdAtStart, (prev) => {
        const idx = prev.findIndex((m) => String(m?.id) === String(assistantMessageId));
        if (idx < 0) return prev;
        const target = prev[idx];
        if (target?.role !== "assistant") return prev;
        const next = [...prev.slice(0, idx)];
        next.push(optimisticAssistant);
        return next;
      });

      setRegeneratingTarget({ threadId: threadIdAtStart, messageId: assistantMessageId });
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdAtStart)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", ...clientTimeZoneHeaders },
          body: JSON.stringify({
            redoMessageId: assistantMessageId,
            url: typeof window !== "undefined" ? window.location.href : undefined,
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
    [activeThreadId, canvasUrl, clientTimeZone, clientTimeZoneHeaders, effectiveChatMode, loadMessages, loadThreads, regeneratingTarget?.threadId, toast, updateThreadMessages],
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
        try {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(text.length, text.length);
        } catch {
          // ignore
        }
      });
    },
    [activeThreadKey, resizeInput, setThreadDraftState, setThreadEditingMessageId],
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-transparent text-zinc-700 transition-all duration-150 hover:scale-110 hover:bg-zinc-50"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-blue text-white transition-transform duration-150 hover:scale-110 hover:opacity-95"
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
                    onClick={() => {
                      selectThread(t.id);
                      navigateToThread(t, "push");
                    }}
                    className="w-full rounded-2xl px-3 py-2 pr-10 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={classNames("min-w-0 text-sm font-semibold", active ? "text-zinc-900" : "text-zinc-800")}>
                        <span className="block truncate">
                          {t.title || "New chat"}
                          {t.isPinned ? <span className="ml-2 text-[11px] font-bold text-zinc-500">PINNED</span> : null}
                        </span>
                      </div>
                      <div className="shrink-0 text-xs font-semibold text-zinc-500">{fmtShortTime(t.lastMessageAt || t.updatedAt)}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={classNames(
                      "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-xl text-zinc-500",
                      "opacity-0 transition-all group-hover:opacity-100 hover:scale-110 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
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
    [activeThreadId, closeThreadMenu, createThread, navigateToThread, selectThread, setScheduledOpen, threadMenu, threadMenuThreadId, threads, threadsLoading],
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
                        <div className={classNames("min-w-0 text-sm font-semibold", active ? "text-zinc-900" : "text-zinc-800")}>
                          <span className="block truncate">
                            {t.title || "New chat"}
                            {t.isPinned ? <span className="ml-2 text-[11px] font-bold text-zinc-500">PINNED</span> : null}
                          </span>
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-zinc-500">{fmtShortTime(t.lastMessageAt || t.updatedAt)}</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={classNames(
                        "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-xl text-zinc-500",
                        "opacity-100 transition-all hover:scale-110 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
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
    [activeThreadId, closeThreadMenu, navigateToThread, selectThread, threadMenu, threadMenuThreadId, threads, threadsLoading],
  );

  const mobileHeaderActions = useMemo(
    () => (
      <>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          onClick={() => setScheduledOpen(true)}
          aria-label="Scheduled tasks"
          title="Scheduled tasks"
        >
          <IconSchedule size={18} />
        </button>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-blue text-white hover:opacity-95"
          onClick={() => {
            createThread();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("pa.portal.mobile-drawer.close"));
            }
          }}
          aria-label="New chat"
          title="New chat"
        >
          <span className="text-lg font-semibold leading-none">＋</span>
        </button>
      </>
    ),
    [createThread],
  );

  const setSidebarOverride = useSetPortalSidebarOverride();
  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: left,
      mobileSidebarContent: mobileSidebar,
      mobileHeaderActions,
    });
  }, [left, mobileHeaderActions, mobileSidebar, setSidebarOverride]);

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

  useEffect(() => {
    if (!scheduledOpen) return;
    void loadScheduled();
  }, [scheduledOpen, loadScheduled]);

  useEffect(() => {
    if (!attachMenu || !attachMenuAnchorRect) return;
    const el = attachMenuRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (!Number.isFinite(h) || h <= 0) return;

    const next = computeFixedMenuStyle({
      rect: attachMenuAnchorRect,
      width: 260,
      estHeight: h,
      alignX: "left",
      minHeight: 120,
      gapPx: 4,
    });
    if (Math.abs(next.top - attachMenu.top) > 2 || Math.abs(next.left - attachMenu.left) > 2) {
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

  useEffect(() => {
    if (!showWelcomeComposer) return;
    setWelcomePromptSeed(`${Date.now()}-${Math.random()}-${activeThreadId || "new"}`);
  }, [activeThreadId, showWelcomeComposer]);

  const welcomePromptChips = useMemo(() => {
    const serviceWeights = inferPromptServiceWeights(threads, serviceUsageCounts);
    const threadText = threads
      .slice(0, 18)
      .map((thread) => `${thread.title || ""}`.toLowerCase())
      .join(" \n ");

    const ranked = WELCOME_PROMPT_LIBRARY.map((item) => {
      let score = 0;
      for (const slug of item.slugs || []) score += serviceWeights[slug] || 0;
      for (const keyword of item.keywords || []) {
        if (threadText.includes(keyword.toLowerCase())) score += 2;
      }
      const jitter = (seededHash(`${welcomePromptSeed}:${item.id}`) % 1000) / 1000;
      return { item, score, jitter };
    }).sort((a, b) => (b.score !== a.score ? b.score - a.score : b.jitter - a.jitter));

    const selected: string[] = [];
    for (const entry of ranked) {
      if (selected.length >= 3) break;
      if (selected.includes(entry.item.prompt)) continue;
      if (selected.length < 3 && (entry.score > 0 || entry.jitter > 0)) {
        selected.push(entry.item.prompt);
      }
    }

    if (selected.length < 3) {
      const fallback = [...WELCOME_PROMPT_LIBRARY]
        .sort((a, b) => seededHash(`${welcomePromptSeed}:${a.id}`) - seededHash(`${welcomePromptSeed}:${b.id}`))
        .map((item) => item.prompt);
      for (const prompt of fallback) {
        if (selected.length >= 3) break;
        if (!selected.includes(prompt)) selected.push(prompt);
      }
    }

    return selected.slice(0, 3);
  }, [serviceUsageCounts, threads, welcomePromptSeed]);

  const composerControlButtonClass =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50";

  const composerTextareaClass =
    "min-h-11 flex-1 resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[rgba(29,78,216,0.25)]";

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

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            className={classNames(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
              effectiveChatMode === "plan" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
            )}
            onClick={() => setChatMode("plan")}
          >
            Discuss
          </button>
          <button
            type="button"
            className={classNames(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
              effectiveChatMode === "work" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
            )}
            onClick={() => setChatMode("work")}
          >
            Work
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {workStatusLabel ? (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-brand-blue/15 bg-blue-50/70 px-3 py-2 text-xs font-medium text-zinc-700">
              <ThinkingDots />
              <span>{workStatusLabel}</span>
            </div>
          ) : null}

          <button
            type="button"
            className="inline-flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 sm:hidden"
            onClick={() => setMobileThreadsOpen(true)}
          >
            Chats
          </button>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="relative">
          <button
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
              setAttachMenu(computeFixedMenuStyle({ rect, width: 260, estHeight: 140, alignX: "left", minHeight: 120, gapPx: 4 }));
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

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            const nextValue = e.target.value;
            setThreadDraftState(activeThreadKey, (prev) => ({ ...prev, input: nextValue }));
            requestAnimationFrame(() => resizeInput());
          }}
          rows={1}
          placeholder={uploading ? "Uploading…" : isEditing ? "Edit message" : showWelcomeComposer ? "Tell Pura what you want handled." : "Message"}
          className={composerTextareaClass}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={false}
        />

        <button
          type="button"
          className={classNames(
            "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95",
            showWelcomeComposer ? "shadow-none" : "",
            (!input.trim() && !pendingAttachments.length) || sending ? "opacity-60" : "",
          )}
          onClick={() => void send()}
          disabled={(!input.trim() && !pendingAttachments.length) || sending}
          aria-label={isEditing ? "Save edit" : "Send"}
          title={isEditing ? "Save edit" : "Send"}
        >
          <span className="group-hover:hidden">
            <IconSend />
          </span>
          <span className="hidden group-hover:inline">
            <IconSendHover />
          </span>
        </button>
      </div>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
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
          className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
          style={{ left: attachMenu.left, top: attachMenu.top, width: attachMenu.width, maxHeight: attachMenu.maxHeight }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            onClick={() => {
              setAttachMenu(null);
              fileInputRef.current?.click();
            }}
          >
            Upload from device
          </button>
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            onClick={() => {
              setAttachMenu(null);
              setMediaPickerOpen(true);
            }}
          >
            Add from media library
          </button>
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            onClick={() => {
              setAttachMenu(null);
              setScheduleTaskText("");
              setScheduleTaskOpen(true);
            }}
          >
            Schedule task
          </button>
        </div>
      ) : null}

      {scheduleTaskOpen ? (
        <div
          className="fixed inset-0 z-12060 flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onMouseDown={() => setScheduleTaskOpen(false)}
          onTouchStart={() => setScheduleTaskOpen(false)}
          aria-hidden
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Schedule task"
          >
            <div className="text-base font-semibold text-zinc-900">Schedule task</div>
            <div className="mt-1 text-sm text-zinc-600">Describe what should run and when (plain English).</div>

            <textarea
              className="mt-3 h-28 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              placeholder="Example: Every day Monday through Friday at 9am, send a text to the contact Chester with a unique good-morning message to get started."
              value={scheduleTaskText}
              onChange={(e) => setScheduleTaskText(e.target.value)}
              autoFocus
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => setScheduleTaskOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
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

      <div ref={canvasContainerRef} className="flex min-w-0 flex-1 bg-white shadow-[inset_12px_0_16px_-16px_rgba(0,0,0,0.22)] relative">
        <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white">
          <div className="mx-auto w-full max-w-5xl space-y-3 px-3 py-4 sm:px-4 sm:py-6">
            {messagesLoading && !messages.length ? (
              <div className="space-y-3 pt-1">
                <div className="h-24 rounded-3xl border border-zinc-200 bg-zinc-50 animate-pulse" />
                <div className="ml-auto h-16 w-[72%] rounded-3xl bg-zinc-100 animate-pulse" />
                <div className="h-28 rounded-3xl border border-zinc-200 bg-zinc-50 animate-pulse" />
              </div>
            ) : messages.length ? (
              <>
                {(() => {
                  let assistantIdx = 0;
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
                    const variant = m.role === "assistant"
                      ? m.displayMode === "work"
                        ? "work"
                        : assistantIdx++ % 2 === 0
                          ? "dark"
                          : "light"
                      : undefined;
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
                          assistantVariant={variant}
                          onRunAction={(a) => void runAssistantAction(a)}
                          runningActionKey={runningActionKey}
                          onOpenLink={openInCanvas}
                          footerLeft={
                            m.role === "assistant" ? (
                              <>
                                <button
                                  type="button"
                                  className={classNames(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-150 hover:scale-110 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
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
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-150 hover:scale-110 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
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
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-transparent text-zinc-600 opacity-0 transition-all duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100 hover:scale-110 hover:bg-zinc-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
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
                                    "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-150 hover:scale-110 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
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
                      </div>
                    );
                  });
                })()}
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
                    {welcomePromptChips.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="flex min-h-28 items-start rounded-3xl border border-zinc-200 bg-white p-4 text-left text-sm font-semibold text-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-1 hover:border-zinc-300 hover:bg-zinc-50"
                        onClick={() => {
                          setThreadDraftState(activeThreadKey, (prev) => ({ ...prev, input: prompt }));
                          requestAnimationFrame(() => {
                            resizeInput();
                            inputRef.current?.focus();
                            inputRef.current?.setSelectionRange(prompt.length, prompt.length);
                          });
                        }}
                      >
                        <span className="block leading-relaxed">{prompt}</span>
                      </button>
                    ))}
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
          <div className="shrink-0 border-t border-zinc-200 bg-white px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
            {canvasOpen && canvasUrl ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 lg:hidden relative">
                <div className="min-w-0 truncate">
                  Working on <span className="font-semibold">{canvasUrl}</span>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-xl border border-brand-blue/20 bg-brand-blue px-2 py-1 font-semibold text-white hover:opacity-95"
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

            {!canvasOpen && Boolean(canvasUrl) ? (
              <div className="mb-2 flex justify-end lg:hidden">
                <button
                  className="inline-flex h-10 items-center gap-1 rounded-2xl border border-brand-blue/20 bg-brand-blue px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
                  title="Open canvas"
                  onClick={() => openLatestCanvas({ modal: false })}
                >
                  <span className="leading-none">Open work</span>
                  <span className="text-base leading-none">↗</span>
                </button>
              </div>
            ) : null}

            {composerInner}
          </div>
        ) : null}

        {!canvasOpen && Boolean(canvasUrl) ? (
          <button
            className="hidden lg:absolute lg:right-0 lg:top-32 lg:inline-flex lg:h-10 lg:items-center lg:gap-1 lg:rounded-l-2xl lg:rounded-r-none lg:border lg:border-brand-blue/20 lg:bg-brand-blue lg:px-3 lg:py-2 lg:text-xs lg:font-bold lg:text-white lg:shadow-none hover:opacity-95"
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
                      className="rounded-xl border border-brand-blue/20 bg-brand-blue px-2 py-1 text-xs font-semibold text-white hover:opacity-95"
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
