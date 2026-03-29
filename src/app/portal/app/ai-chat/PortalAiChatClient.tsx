"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { useToast } from "@/components/ToastProvider";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { IconSchedule, IconSend, IconSendHover } from "@/app/portal/PortalIcons";
import { usePuraCanvasUiBridgeClient, type PuraCanvasUiAction } from "@/lib/puraCanvasUiBridge.client";

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
  createdAt: string;
  sendAt: string | null;
  sentAt: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function IconVolumeGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M11 5L6.5 9H3v6h3.5L11 19V5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 8.5a5 5 0 010 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17.8 6.2a8.5 8.5 0 010 11.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRedoGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M3 12a9 9 0 0115.3-6.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 3v6h-6"
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

function MessageBubble({
  msg,
  assistantVariant,
  onRunAction,
  runningActionKey,
  onOpenLink,
}: {
  msg: Message;
  assistantVariant?: "light" | "dark";
  onRunAction?: (action: AssistantAction) => void;
  runningActionKey?: string | null;
  onOpenLink?: (href: string) => void;
}) {
  const isUser = msg.role === "user";
  const isThinking = msg.id.startsWith("optimistic-assistant-") && msg.role === "assistant";
  const actions = !isUser && !isThinking && Array.isArray(msg.assistantActions) ? msg.assistantActions : [];

  const assistantBg =
    assistantVariant === "dark" ? "bg-zinc-100" : assistantVariant === "light" ? "bg-zinc-50" : "bg-zinc-50";

  const bubble = (
    <div
      className={classNames(
        "rounded-3xl px-4 py-3 text-sm leading-relaxed",
        isUser ? "bg-brand-blue text-white" : classNames(assistantBg, "text-zinc-900 border border-zinc-200"),
      )}
    >
      {isUser ? (
        <div className="whitespace-pre-wrap">{msg.text}</div>
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
                const external = /^https?:\/\//i.test(safe);
                return (
                  <a
                    href={safe}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer noopener" : undefined}
                    className="font-semibold underline underline-offset-2 text-brand-blue"
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
                return <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">{children}</code>;
              },
              pre({ children }: { children?: ReactNode }) {
                return <pre className="my-2 overflow-x-auto rounded-2xl bg-zinc-100 p-3 text-[12px]">{children}</pre>;
              },
            }}
          >
            {msg.text || ""}
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

  return (
    <div className={classNames("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={classNames("max-w-[min(980px,100%)]", isUser ? "ml-10" : "mr-10")}>{bubble}</div>
    </div>
  );
}

export function PortalAiChatClient() {
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
  }, [canvasOpen]);

  const [ambiguousContacts, setAmbiguousContacts] = useState<AmbiguousContact[] | null>(null);
  const [assistantChoices, setAssistantChoices] = useState<AssistantChoice[] | null>(null);
  const [canvasUiAmbiguity, setCanvasUiAmbiguity] = useState<{ action: PuraCanvasUiAction; candidates: CanvasUiCandidate[] } | null>(null);
  const [canvasUiResumeActions, setCanvasUiResumeActions] = useState<PuraCanvasUiAction[] | null>(null);

  const toast = useToast();

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
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictatingMessageId, setDictatingMessageId] = useState<string | null>(null);
  const [dictationPlayingMessageId, setDictationPlayingMessageId] = useState<string | null>(null);
  const dictationRef = useRef<{ audio: HTMLAudioElement; objectUrl: string; messageId: string } | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
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
      text: string;
      sendAt: string | null;
      repeatEveryMinutes: number;
    }>
  >([]);
  const [scheduledEditing, setScheduledEditing] = useState<Record<string, { sendAtLocal: string; repeatMinutes: string }>>({});

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
  const sendInFlightRef = useRef(false);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) || null, [threads, activeThreadId]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-pa-hide-floating-tools", "1");
    return () => {
      root.removeAttribute("data-pa-hide-floating-tools");
    };
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && scrollerRef.current) {
      const el = scrollerRef.current;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 200) return;
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
        setActiveThreadId(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setThreadsLoading(false);
    }
  }, [toast, activeThreadId]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      setMessagesLoading(true);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadId)}/messages`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Failed to load messages");
        setMessages(Array.isArray(json.messages) ? (json.messages as Message[]) : []);
        const nextLastCanvasUrl =
          typeof json?.threadContext?.lastCanvasUrl === "string" && json.threadContext.lastCanvasUrl.trim()
            ? String(json.threadContext.lastCanvasUrl).trim()
            : null;
        if (nextLastCanvasUrl) {
          setCanvasUrl(nextLastCanvasUrl);
        }
        // Ensure we scroll after the new messages have actually rendered.
        requestAnimationFrame(() => scrollToBottom(true));
        setTimeout(() => scrollToBottom(true), 0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
      } finally {
        setMessagesLoading(false);
      }
    },
    [toast, scrollToBottom],
  );

  const selectThread = useCallback(
    (threadId: string) => {
      forceScrollToBottomRef.current = true;
      setActiveThreadId(threadId);
      setCanvasUrl(null);
      setCanvasModalOpen(false);
      setCanvasOpen(false);
      setMobileThreadsOpen(false);
    },
    [setActiveThreadId],
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
    if (!activeThreadId) return;
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  const createThread = useCallback(() => {
    // "New chat" is a local-only draft until the user sends the first message.
    // This prevents empty threads from being persisted.
    forceScrollToBottomRef.current = true;
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setPendingAttachments([]);
    setAmbiguousContacts(null);
    setAssistantChoices(null);
    setCanvasUiAmbiguity(null);
    setCanvasUiResumeActions(null);
    setCanvasUrl(null);
    setCanvasModalOpen(false);
    setCanvasOpen(false);
    setMobileThreadsOpen(false);
  }, []);

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
        void loadThreads();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [closeThreadMenu, loadThreads, toast],
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
          } else {
            setActiveThreadId(null);
            void loadThreads();
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [activeThreadId, askConfirm, closeThreadMenu, loadThreads, selectThread, threads, toast],
  );

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      setUploading(true);
      try {
        const form = new FormData();
        for (const f of Array.from(files)) form.append("files", f);

        const res = await fetch("/api/portal/ai-chat/attachments", { method: "POST", body: form });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Upload failed");

        const next = Array.isArray(json.attachments) ? (json.attachments as Attachment[]) : [];
        setPendingAttachments((prev) => [...prev, ...next].slice(0, 10));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
      }
    },
    [toast],
  );

  const addMediaAttachment = useCallback(
    async (item: PortalMediaPickItem) => {
      const next: Attachment = {
        id: item.id,
        fileName: item.fileName,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        url: item.shareUrl || item.downloadUrl,
      };
      setPendingAttachments((prev) => [...prev, next].slice(0, 10));
      setMediaPickerOpen(false);
    },
    [],
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
    async (raw: unknown) => {
      const list = (Array.isArray(raw) ? raw : [])
        .filter((a) => a && typeof a === "object" && typeof (a as any).kind === "string")
        .slice(0, 20) as PuraCanvasUiAction[];
      if (!list.length) return;

      setCanvasUiAmbiguity(null);
      setCanvasUiResumeActions(null);

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
              setCanvasUiAmbiguity({ action, candidates });
              const remaining = list.slice(i + 1);
              setCanvasUiResumeActions(remaining.length ? remaining : null);
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
    [canvasUi, toast, waitForCanvasReady],
  );

  const handleCanvasUiCandidateSelect = useCallback(
    async (c: CanvasUiCandidate) => {
      const amb = canvasUiAmbiguity;
      if (!amb) return;

      setCanvasUiAmbiguity(null);

      try {
        setCanvasOpen(true);
        setCanvasModalOpen(false);
        await new Promise((r) => setTimeout(r, 50));
        await waitForCanvasReady();

        const rerun = { ...(amb.action as any), nth: c.nth } as PuraCanvasUiAction;
        await canvasUi.run(rerun);

        const remaining = canvasUiResumeActions;
        setCanvasUiResumeActions(null);
        if (remaining && remaining.length) {
          await executeClientUiActions(remaining);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [canvasUi, canvasUiAmbiguity, canvasUiResumeActions, executeClientUiActions, toast, waitForCanvasReady],
  );

  const send = useCallback(
    async (
      overrideText?: string,
      choice?:
        | { type: "booking_calendar"; calendarId: string; label?: string }
        | { type: "entity"; kind: string; value: string; label?: string },
    ) => {
      if (sendInFlightRef.current) return;

      const text = typeof overrideText === "string" ? overrideText : input.trim();
      const attachments = pendingAttachments;
      if (!text && !attachments.length && !choice) return;

      let threadIdForSend = activeThreadId;
      let createdThread: Thread | null = null;
      if (!threadIdForSend) {
        const created = await fetch("/api/portal/ai-chat/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }).then((r) => r.json().catch(() => null));
        if (!created?.ok || !created?.thread?.id) throw new Error(created?.error || "Failed to create chat");
        createdThread = created.thread as Thread;
        threadIdForSend = String(createdThread.id);
      }

      const optimisticId = newClientId();
      const nowIso = new Date().toISOString();

      const optimisticUser: Message = {
        id: `optimistic-user-${optimisticId}`,
        role: "user",
        text,
        attachmentsJson: attachments,
        createdAt: nowIso,
        sendAt: null,
        sentAt: nowIso,
      };

      const optimisticAssistant: Message = {
        id: `optimistic-assistant-${optimisticId}`,
        role: "assistant",
        text: "",
        attachmentsJson: [],
        createdAt: nowIso,
        sendAt: null,
        sentAt: nowIso,
      };

      setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);
      if (!overrideText) setInput("");
      setPendingAttachments([]);
      setAmbiguousContacts(null);
      setAssistantChoices(null);
      setCanvasUiAmbiguity(null);
      setCanvasUiResumeActions(null);

      sendInFlightRef.current = true;
      setSending(true);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            url: window.location.href,
            ...(canvasUrl ? { canvasUrl } : {}),
            attachments,
            ...(choice ? { choice } : {}),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Send failed");

        if (createdThread) {
          setThreads((prev) => [createdThread as Thread, ...prev]);
          setActiveThreadId(threadIdForSend);
          setMobileThreadsOpen(false);
        }
        if (json.ambiguousContacts && Array.isArray(json.ambiguousContacts) && json.ambiguousContacts.length) {
          setAmbiguousContacts(json.ambiguousContacts);
        } else {
          setAmbiguousContacts(null);
        }

        if (json.assistantChoices && Array.isArray(json.assistantChoices) && json.assistantChoices.length) {
          setAssistantChoices(json.assistantChoices as AssistantChoice[]);
        } else {
          setAssistantChoices(null);
        }

        if (json?.needsConfirm?.token) {
          const token = String(json.needsConfirm.token || "").trim();
          const title = String(json.needsConfirm.title || "Confirm").trim() || "Confirm";
          const message = String(json.needsConfirm.message || "").trim() || "Continue?";

          setMessages((prev) => {
            const cleaned = prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id);
            const next: Message[] = [...cleaned];
            if (json.userMessage) next.push(json.userMessage);
            if (json.assistantMessage) next.push(json.assistantMessage);
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
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              confirmToken: token,
              url: window.location.href,
              ...(canvasUrl ? { canvasUrl } : {}),
            }),
          });
          const json2 = await res2.json().catch(() => null);
          if (!json2?.ok) throw new Error(json2?.error || "Action failed");

          const nextCanvasUrl2 = typeof json2?.canvasUrl === "string" && json2.canvasUrl.trim() ? String(json2.canvasUrl).trim() : null;
          if (nextCanvasUrl2) {
            setCanvasUrl(nextCanvasUrl2);
            setCanvasOpen(true);
            setCanvasModalOpen(false);
          }

          if (Array.isArray((json2 as any)?.clientUiActions) && (json2 as any).clientUiActions.length) {
            void executeClientUiActions((json2 as any).clientUiActions);
          }

          const assistantActions2: AssistantAction[] = Array.isArray(json2.assistantActions)
            ? (json2.assistantActions as AssistantAction[])
            : [];

          setMessages((prev) => {
            const next = [...prev];
            if (json2.assistantMessage) {
              const am: Message = json2.assistantMessage as Message;
              next.push({ ...am, assistantActions: assistantActions2.length ? assistantActions2 : undefined });
            }
            return next;
          });

          void loadThreads();
          return;
        }

        const nextCanvasUrl = typeof json?.canvasUrl === "string" && json.canvasUrl.trim() ? String(json.canvasUrl).trim() : null;
        if (nextCanvasUrl) {
          setCanvasUrl(nextCanvasUrl);
          setCanvasOpen(true);
          setCanvasModalOpen(false);
        }

        if (Array.isArray((json as any)?.clientUiActions) && (json as any).clientUiActions.length) {
          void executeClientUiActions((json as any).clientUiActions);
        }

        const assistantActions: AssistantAction[] = Array.isArray(json.assistantActions)
          ? (json.assistantActions as AssistantAction[])
          : [];


        setMessages((prev) => {
          const cleaned = prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id);
          const next: Message[] = [...cleaned];
          if (json.userMessage) next.push(json.userMessage);
          if (json.assistantMessage) {
            const am: Message = json.assistantMessage as Message;
            next.push({ ...am, assistantActions: assistantActions.length ? assistantActions : undefined });
          }
          return next;
        });

        if ((json as any)?.openScheduledTasks) {
          setScheduledOpen(true);
        }

        void loadThreads();
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id));
        setInput(text);
        setPendingAttachments(attachments);

        // If the first send failed right after creating a brand new thread,
        // proactively delete it so empty chats are never persisted.
        if (createdThread?.id) {
          void fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(String(createdThread.id))}/actions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "delete" }),
          }).catch(() => null);
          setThreads((prev) => prev.filter((t) => t.id !== String(createdThread?.id)));
        }

        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    },
    [activeThreadId, askConfirm, canvasUrl, executeClientUiActions, input, pendingAttachments, toast, loadThreads],
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, action, args }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Action failed");
      return json as { assistantMessage?: Message; linkUrl?: string | null; clientUiActions?: unknown[]; openScheduledTasks?: boolean };
    },
    [activeThreadId],
  );

  const runAssistantAction = useCallback(
    async (a: AssistantAction) => {
      if (!a?.key) return;
      if (runningActionKey) return;

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
      try {
        const json = await executeAgentAction(a.key, a.args || {});
        if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
        if ((json as any)?.openScheduledTasks) {
          setScheduledOpen(true);
        }
        const nextCanvasUrl = typeof json?.linkUrl === "string" && json.linkUrl.trim() ? String(json.linkUrl).trim() : null;
        if (nextCanvasUrl) {
          setCanvasUrl(nextCanvasUrl);
          setCanvasOpen(true);
          setCanvasModalOpen(false);
        }

        if (Array.isArray((json as any)?.clientUiActions) && (json as any).clientUiActions.length) {
          void executeClientUiActions((json as any).clientUiActions);
        }

        void loadThreads();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setRunningActionKey(null);
      }
    },
    [askConfirm, executeAgentAction, executeClientUiActions, loadThreads, runningActionKey, toast],
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

  const redoLastAssistant = useCallback(async () => {
    if (!activeThreadId) return;
    if (regenerating) return;

    setRegenerating(true);
    try {
      const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redoLastAssistant: true,
          url: typeof window !== "undefined" ? window.location.href : undefined,
          ...(canvasUrl ? { canvasUrl } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Redo failed");
      void loadMessages(activeThreadId);
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }, [activeThreadId, canvasUrl, loadMessages, loadThreads, regenerating, toast]);

  const left = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chats</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-blue text-white hover:opacity-95"
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
                      "opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/70 hover:text-zinc-700",
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
  );

  const anyMenuOpen = Boolean(attachMenu || threadMenu);

  const toLocalInputValue = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

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
          text: String(r.text || ""),
          sendAt: r.sendAt ? String(r.sendAt) : null,
          repeatEveryMinutes:
            typeof r.repeatEveryMinutes === "number" && Number.isFinite(r.repeatEveryMinutes)
              ? Math.max(0, Math.floor(r.repeatEveryMinutes))
              : 0,
        }))
        .slice(0, 200);

      setScheduledRows(normalized);

      const nextEditing: Record<string, { sendAtLocal: string; repeatMinutes: string }> = {};
      for (const r of normalized) {
        nextEditing[r.id] = {
          sendAtLocal: toLocalInputValue(r.sendAt),
          repeatMinutes: r.repeatEveryMinutes ? String(r.repeatEveryMinutes) : "",
        };
      }
      setScheduledEditing(nextEditing);
    } catch {
      setScheduledRows([]);
      setScheduledEditing({});
    } finally {
      setScheduledLoading(false);
    }
  }, []);

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

      const sendAtIso = edit.sendAtLocal ? new Date(edit.sendAtLocal).toISOString() : null;
      const repeatEveryMinutes = edit.repeatMinutes.trim() ? Math.max(0, Math.floor(Number(edit.repeatMinutes.trim()))) : 0;

      const res = await fetch(`/api/portal/ai-chat/scheduled/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sendAtIso, repeatEveryMinutes }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Unable to save schedule");
      toast.success("Saved");
      void loadScheduled();
    },
    [loadScheduled, scheduledEditing, toast],
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

      <div
        className="hidden h-full shrink-0 border-r border-zinc-200 bg-white shadow-[2px_0_12px_rgba(0,0,0,0.06)] lg:flex relative"
        style={{ width: sidebarWidth }}
      >
        {left}

        <div
          className="absolute right-0 top-0 hidden h-full w-2 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-zinc-100 lg:block"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            e.preventDefault();
            sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
            setSidebarDragging(true);
          }}
          title="Drag to resize sidebar"
        />
      </div>

      <div ref={canvasContainerRef} className="flex min-w-0 flex-1 bg-white shadow-[inset_12px_0_16px_-16px_rgba(0,0,0,0.22)] relative">
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-zinc-200 bg-white lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => setMobileThreadsOpen(true)}
            >
              Threads
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-semibold text-zinc-900">{activeThread?.title || "Chat"}</div>
            </div>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-blue text-white hover:opacity-95"
              onClick={createThread}
              aria-label="New chat"
              title="New chat"
            >
              <span className="text-lg font-semibold leading-none">＋</span>
            </button>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              onClick={() => setScheduledOpen(true)}
              aria-label="Scheduled tasks"
              title="Scheduled tasks"
            >
              <IconSchedule size={18} />
            </button>

            {canvasOpen && canvasUrl ? (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-brand-blue/20 bg-brand-blue px-3 text-sm font-semibold text-white hover:opacity-95 lg:hidden"
                onClick={() => openCanvasInNewTab(canvasUrl)}
                aria-label="Open work"
                title="Open work"
              >
                Work
              </button>
            ) : canvasUrl ? (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-brand-blue/20 bg-brand-blue px-3 text-sm font-semibold text-white hover:opacity-95 lg:hidden"
                onClick={() => openCanvasInNewTab(canvasUrl)}
                aria-label="Open work"
                title="Open work"
              >
                Work
              </button>
            ) : null}
          </div>
        </div>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white">
          <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-6">
            {messagesLoading ? (
              <div className="text-sm text-zinc-500">Loading messages…</div>
            ) : messages.length ? (
              <>
                {(() => {
                  let assistantIdx = 0;
                  const lastAssistantIndex = (() => {
                    for (let i = messages.length - 1; i >= 0; i--) {
                      const m = messages[i];
                      if (m?.role !== "assistant") continue;
                      if (String(m.id || "").startsWith("optimistic-assistant-")) continue;
                      return i;
                    }
                    return -1;
                  })();
                  return messages.map((m, i) => {
                    const variant = m.role === "assistant" ? (assistantIdx++ % 2 === 0 ? "dark" : "light") : undefined;
                    const isThinking = m.id.startsWith("optimistic-assistant-") && m.role === "assistant";
                    const isLastAssistant = !isThinking && m.role === "assistant" && i === lastAssistantIndex;
                    const showAmbiguousContacts = isLastAssistant && Boolean(ambiguousContacts && ambiguousContacts.length);
                    const showChoices = isLastAssistant && Boolean(assistantChoices && assistantChoices.length);
                    const showCanvasUiAmbiguity =
                      isLastAssistant && Boolean(canvasUiAmbiguity && Array.isArray(canvasUiAmbiguity.candidates) && canvasUiAmbiguity.candidates.length);
                    return (
                      <div key={m.id}>
                        <MessageBubble
                          msg={m}
                          assistantVariant={variant}
                          onRunAction={(a) => void runAssistantAction(a)}
                          runningActionKey={runningActionKey}
                          onOpenLink={openInCanvas}
                        />
                        {isLastAssistant ? (
                          <div className="mt-1 flex items-center justify-start gap-1">
                            <button
                              type="button"
                              className={classNames(
                                "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                                (dictating || regenerating || sending) && "opacity-60",
                              )}
                              onClick={() => void dictateAssistantMessage(m.id)}
                              disabled={dictating || regenerating || sending}
                              aria-label={dictationPlayingMessageId === m.id ? "Stop dictation" : "Dictate last assistant message"}
                              title={
                                dictating && dictatingMessageId === m.id
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
                                "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                                (dictating || regenerating || sending) && "opacity-60",
                              )}
                              onClick={() => void redoLastAssistant()}
                              disabled={dictating || regenerating || sending}
                              aria-label="Redo last assistant response"
                              title={regenerating ? "Redoing…" : "Redo"}
                            >
                              {regenerating ? <IconSpinner size={16} /> : <IconRedoGlyph size={16} />}
                            </button>
                          </div>
                        ) : null}
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
                              onClick={() => void send("doesn't matter")}
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
            ) : (
              <div className="text-sm text-zinc-400">&nbsp;</div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-3 shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
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
          {!canvasOpen && (
            <button
              className="absolute right-0 top-2 z-20 inline-flex items-center gap-1 rounded-l-2xl border border-brand-blue/20 bg-brand-blue px-3 py-2 text-xs font-bold text-white hover:opacity-95"
              style={{ height: 40 }}
              title="Open canvas"
              onClick={() => openLatestCanvas({ modal: false })}
            >
              <span className="leading-none">Open</span>
              <span className="text-base leading-none">‹</span>
            </button>
          )}

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
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove attachment"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <div className="relative">
              <button
                type="button"
                className={classNames(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  (uploading || sending) && "opacity-60",
                )}
                disabled={uploading || sending}
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
              disabled={uploading || sending}
              onChange={(e) => {
                void uploadFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Ensure the element has the latest value before measuring.
                requestAnimationFrame(() => resizeInput());
              }}
              rows={1}
              placeholder={uploading ? "Uploading…" : "Message"}
              className="min-h-11 flex-1 resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[rgba(29,78,216,0.25)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={sending}
            />

            <button
              type="button"
              className={classNames(
                "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white hover:opacity-95",
                (!input.trim() && !pendingAttachments.length) || sending ? "opacity-60" : "",
              )}
              onClick={() => void send()}
              disabled={(!input.trim() && !pendingAttachments.length) || sending}
              aria-label="Send"
              title="Send"
            >
              <span className="group-hover:hidden">
                <IconSend />
              </span>
              <span className="hidden group-hover:inline">
                <IconSendHover />
              </span>
            </button>

          </div>
        </div>
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
              const edit = scheduledEditing[r.id] || { sendAtLocal: "", repeatMinutes: "" };
              const isRepeating = (r.repeatEveryMinutes || 0) > 0;
              return (
                <div key={r.id} className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{r.threadTitle}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-zinc-600">{r.text || "(empty)"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                          Next: {r.sendAt ? new Date(r.sendAt).toLocaleString() : "-"}
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

                    {(canvasDragging || sidebarDragging) && (
                      <div
                        className="fixed inset-0 z-9999 cursor-col-resize"
                        style={{ background: "transparent" }}
                        onMouseDown={(e) => {
                          // Prevent iframe/text selection from interrupting the drag.
                          e.preventDefault();
                        }}
                      />
                    )}
                      <div className="text-xs font-semibold text-zinc-500">Schedule</div>
                      <input
                        type="datetime-local"
                        value={edit.sendAtLocal}
                        onChange={(e) =>
                          setScheduledEditing((prev) => ({
                            ...prev,
                            [r.id]: { ...edit, sendAtLocal: e.target.value },
                          }))
                        }
                        className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-zinc-500">Frequency (minutes)</div>
                      <input
                        inputMode="numeric"
                        value={edit.repeatMinutes}
                        onChange={(e) =>
                          setScheduledEditing((prev) => ({
                            ...prev,
                            [r.id]: { ...edit, repeatMinutes: e.target.value },
                          }))
                        }
                        placeholder="Leave blank for one-time"
                        className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      />
                    </div>

                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        className="h-11 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95"
                        onClick={() => void saveScheduledRow(r.id)}
                      >
                        Save
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
