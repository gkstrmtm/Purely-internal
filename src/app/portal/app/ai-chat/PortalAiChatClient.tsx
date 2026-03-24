"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppModal } from "@/components/AppModal";
import { DateTimePicker } from "@/components/DateTimePicker";
import { useToast } from "@/components/ToastProvider";
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

type Message = {
  id: string;
  role: "user" | "assistant" | string;
  text: string;
  attachmentsJson: any;
  createdAt: string;
  sendAt: string | null;
  sentAt: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtShortTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function renderTextWithLinks(text: string): Array<string | { t: "link"; href: string; label: string }> {
  const s = String(text || "");
  const parts: Array<string | { t: "link"; href: string; label: string }> = [];

  // Markdown-style links.
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > lastIdx) parts.push(s.slice(lastIdx, start));
    parts.push({ t: "link", label: m[1] || m[2], href: m[2] || "" });
    lastIdx = end;
  }
  if (lastIdx < s.length) parts.push(s.slice(lastIdx));

  return parts;
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const scheduled = Boolean(msg.sendAt && !msg.sentAt);

  const bubble = (
    <div
      className={classNames(
        "rounded-3xl px-4 py-3 text-sm leading-relaxed",
        isUser ? "bg-brand-ink text-white" : "bg-white text-zinc-900 border border-zinc-200",
      )}
    >
      <div className="whitespace-pre-wrap">
        {isUser ? (
          msg.text
        ) : (
          <>
            {renderTextWithLinks(msg.text).map((p, i) => {
              if (typeof p === "string") return <span key={i}>{p}</span>;
              const href = safeHref(p.href);
              if (!href) return <span key={i}>{p.label}</span>;
              const external = /^https?:\/\//i.test(href);
              return (
                <a
                  key={i}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer noopener" : undefined}
                  className={classNames(
                    "font-semibold underline underline-offset-2",
                    isUser ? "text-white/95" : "text-brand-blue",
                  )}
                >
                  {p.label}
                </a>
              );
            })}
          </>
        )}
      </div>

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

      {scheduled ? (
        <div className={classNames("mt-2 text-xs font-semibold", isUser ? "text-white/75" : "text-zinc-500")}>
          Scheduled for {new Date(msg.sendAt as string).toLocaleString()}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={classNames("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={classNames("max-w-[min(720px,100%)]", isUser ? "ml-10" : "mr-10")}>{bubble}</div>
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

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState<Date | null>(null);

  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

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

  const flushDue = useCallback(
    async (threadId: string) => {
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadId)}/flush`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: window.location.href }),
        });
        const json = await res.json().catch(() => null);
        if (json?.ok && json?.processed > 0) {
          await loadMessages(threadId);
        }
      } catch {
        // best-effort
      }
    },
    [loadMessages],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    if (!activeThreadId) return;
    void flushDue(activeThreadId);
    const id = window.setInterval(() => {
      void flushDue(activeThreadId);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [activeThreadId, flushDue]);

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

  const send = useCallback(
    async (opts?: { sendAt?: Date | null }) => {
      if (!activeThreadId) return;
      const text = input.trim();
      if (!text) return;

      setSending(true);
      try {
        const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(activeThreadId)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            url: window.location.href,
            sendAtIso: opts?.sendAt ? opts.sendAt.toISOString() : undefined,
            attachments: pendingAttachments,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Send failed");

        if (json.userMessage) setMessages((prev) => [...prev, json.userMessage]);
        if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage]);

        setInput("");
        setPendingAttachments([]);

        void loadThreads();

        if (opts?.sendAt) {
          const ms = Math.max(0, opts.sendAt.getTime() - Date.now() + 1_000);
          if (ms <= 2_147_000_000) {
            window.setTimeout(() => {
              void flushDue(activeThreadId);
            }, ms);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
      }
    },
    [activeThreadId, input, pendingAttachments, toast, loadThreads, flushDue],
  );

  const left = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 p-3">
        <button
          type="button"
          className="w-full rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          onClick={createThread}
        >
          New chat
        </button>
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

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
      <div className="grid min-h-[70vh] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden border-r border-zinc-200 bg-white lg:block">{left}</div>

        <div className="flex min-w-0 flex-col">
          <div className="shrink-0 border-b border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">AI Chat</div>
                <div className="mt-0.5 truncate text-xs text-zinc-500">{activeThread?.title || ""}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 lg:hidden"
                  onClick={() => setMobileThreadsOpen(true)}
                >
                  Threads
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                  onClick={createThread}
                >
                  New
                </button>
              </div>
            </div>
          </div>

          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-brand-mist p-4">
            {messagesLoading ? (
              <div className="text-sm text-zinc-500">Loading messages…</div>
            ) : messages.length ? (
              <div className="space-y-3">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                <div ref={endRef} />
              </div>
            ) : (
              <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
                Ask anything about your portal setup, services, or troubleshooting.
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-200 bg-white p-3">
            {pendingAttachments.length ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingAttachments.map((a, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    title="Remove"
                  >
                    <span className="truncate">{a.fileName}</span>
                    <span className="text-zinc-400">×</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <label className={classNames(
                "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                uploading && "opacity-60",
              )}>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={uploading || sending}
                  onChange={(e) => void uploadFiles(e.target.files)}
                />
                <span className="text-lg font-semibold">＋</span>
              </label>

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
                  "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                  (!input.trim() || sending) && "opacity-60",
                )}
                onClick={() => void send()}
                disabled={!input.trim() || sending}
                aria-label="Send"
                title="Send"
              >
                <span className="group-hover:hidden"><IconSend /></span>
                <span className="hidden group-hover:inline"><IconSendHover /></span>
              </button>

              <button
                type="button"
                className={classNames(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                  (!input.trim() || sending) && "opacity-60",
                )}
                onClick={() => {
                  setScheduleValue(new Date(Date.now() + 15 * 60 * 1000));
                  setScheduleOpen(true);
                }}
                disabled={!input.trim() || sending}
                aria-label="Schedule"
                title="Schedule"
              >
                <IconSchedule />
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">
              Enter to send • Shift+Enter for newline
              {uploading ? " • Uploading" : ""}
            </div>
          </div>
        </div>
      </div>

      <AppModal
        open={scheduleOpen}
        title="Schedule message"
        description="Pick a date and time to send this message."
        onClose={() => setScheduleOpen(false)}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => setScheduleOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95",
                !scheduleValue && "opacity-60",
              )}
              onClick={() => {
                const when = scheduleValue;
                setScheduleOpen(false);
                void send({ sendAt: when });
              }}
              disabled={!scheduleValue}
            >
              Schedule
            </button>
          </div>
        }
      >
        <DateTimePicker value={scheduleValue} onChange={setScheduleValue} min={new Date()} />
      </AppModal>

      <AppModal
        open={mobileThreadsOpen}
        title="Chats"
        description="Pick a conversation"
        onClose={() => setMobileThreadsOpen(false)}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
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
