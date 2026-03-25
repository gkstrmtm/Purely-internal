"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppModal } from "@/components/AppModal";
import { useToast } from "@/components/ToastProvider";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { IconSchedule, IconSend, IconSendHover } from "@/app/portal/PortalIcons";

type Thread = {
  id: string;
  title: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Attachment = {
  id?: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  url: string;
};

type AssistantAction = {
  key: string;
  title: string;
  confirmLabel?: string;
  args: Record<string, unknown>;
};

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

type FixedMenuStyle = { left: number; top: number; width: number; maxHeight: number };

function computeFixedMenuStyle(opts: {
  rect: DOMRect;
  width: number;
  estHeight: number;
  alignX: "left" | "right";
  minHeight?: number;
}) {
  const VIEWPORT_PAD = 12;
  const GAP = 8;
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
  onRunAction,
  runningActionKey,
}: {
  msg: Message;
  onRunAction?: (action: AssistantAction) => void;
  runningActionKey?: string | null;
}) {
  const isUser = msg.role === "user";
  const isThinking = msg.id.startsWith("optimistic-assistant-") && msg.role === "assistant";
  const actions = !isUser && !isThinking && Array.isArray(msg.assistantActions) ? msg.assistantActions : [];

  const bubble = (
    <div
      className={classNames(
        "rounded-3xl px-4 py-3 text-sm leading-relaxed",
        isUser ? "bg-brand-blue text-white" : "bg-white text-zinc-900 border border-zinc-200",
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
          {msg.attachmentsJson.map((a: any, idx: number) => (
            <a
              key={idx}
              href={safeHref(String(a?.url || "")) || "#"}
              target="_blank"
              rel="noreferrer noopener"
              className={classNames(
                "inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold",
                isUser ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-zinc-200 bg-zinc-50 hover:bg-white",
              )}
            >
              <span className="truncate">{String(a?.fileName || "Attachment")}</span>
            </a>
          ))}
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
  const toast = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const [attachMenu, setAttachMenu] = useState<FixedMenuStyle | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);

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

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

      if (!activeThreadId) {
        if (next.length) {
          setActiveThreadId(next[0]!.id);
        } else {
          const created = await fetch("/api/portal/ai-chat/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          }).then((r) => r.json());
          if (created?.ok && created?.thread?.id) {
            setThreads([created.thread]);
            setActiveThreadId(created.thread.id);
          }
        }
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
        scrollToBottom(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
      } finally {
        setMessagesLoading(false);
      }
    },
    [toast, scrollToBottom],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  const createThread = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/ai-chat/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Failed to create thread");
      const t = json.thread as Thread;
      setThreads((prev) => [t, ...prev]);
      setActiveThreadId(t.id);
      setMobileThreadsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [toast]);

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

  const send = useCallback(
    async () => {
      if (!activeThreadId) return;
      const text = input.trim();
      const attachments = pendingAttachments;
      if (!text && !attachments.length) return;

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
      setInput("");
      setPendingAttachments([]);

      setSending(true);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            url: window.location.href,
            attachments,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Send failed");

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
          if (json.autoActionMessage) next.push(json.autoActionMessage as Message);
          return next;
        });

        void loadThreads();
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id));
        setInput(text);
        setPendingAttachments(attachments);
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
      }
    },
    [activeThreadId, input, pendingAttachments, toast, loadThreads],
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
      return json as { assistantMessage?: Message };
    },
    [activeThreadId],
  );

  const runAssistantAction = useCallback(
    async (a: AssistantAction) => {
      if (!a?.key) return;
      if (runningActionKey) return;

      if (a.confirmLabel) {
        const ok = window.confirm(`${a.title}\n\n${a.confirmLabel}`);
        if (!ok) return;
      }

      setRunningActionKey(a.key);
      try {
        const json = await executeAgentAction(a.key, a.args || {});
        if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
        void loadThreads();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setRunningActionKey(null);
      }
    },
    [executeAgentAction, loadThreads, runningActionKey, toast],
  );

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
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveThreadId(t.id);
                    setMobileThreadsOpen(false);
                  }}
                  className={classNames(
                    "w-full rounded-2xl px-3 py-2 text-left",
                    active ? "bg-[rgba(29,78,216,0.10)]" : "hover:bg-zinc-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={classNames("min-w-0 text-sm font-semibold", active ? "text-zinc-900" : "text-zinc-800")}>
                      <span className="block truncate">{t.title || "New chat"}</span>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-zinc-500">{fmtShortTime(t.lastMessageAt || t.updatedAt)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const anyMenuOpen = Boolean(attachMenu);

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
      if (!json?.ok) throw new Error(json?.error || "Failed to load scheduled tasks");
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setScheduledLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!scheduledOpen) return;
    void loadScheduled();
  }, [scheduledOpen, loadScheduled]);

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
      const ok = window.confirm("Stop this scheduled task?");
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
    [loadScheduled, toast],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
      {anyMenuOpen ? (
        <div
          className="fixed inset-0 z-12041"
          onMouseDown={() => {
            setAttachMenu(null);
          }}
          onTouchStart={() => {
            setAttachMenu(null);
          }}
          aria-hidden
        />
      ) : null}

      {attachMenu ? (
        <div
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
        </div>
      ) : null}

      <div className="hidden h-full w-[320px] shrink-0 border-r border-zinc-200 bg-white lg:flex">{left}</div>

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
          </div>
        </div>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[#0b1220]">
          <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-6">
            {messagesLoading ? (
              <div className="text-sm text-white/70">Loading messages…</div>
            ) : messages.length ? (
              <>
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    onRunAction={(a) => void runAssistantAction(a)}
                    runningActionKey={runningActionKey}
                  />
                ))}
                <div ref={endRef} />
              </>
            ) : (
              <div className="text-sm text-white/60">&nbsp;</div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-3">
          {pendingAttachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingAttachments.map((a, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
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
                    return;
                  }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setAttachMenu(computeFixedMenuStyle({ rect, width: 260, estHeight: 160, alignX: "left", minHeight: 120 }));
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
    </div>
  );
}
