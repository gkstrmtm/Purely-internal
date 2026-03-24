"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppModal } from "@/components/AppModal";
import { useToast } from "@/components/ToastProvider";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { IconSend, IconSendHover } from "@/app/portal/PortalIcons";

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

function fmtShortTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function slugify(raw: string) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
  if (!s) return null;
  if (s.length < 2 || s.length > 60) return null;
  return s;
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

  const [attachOpen, setAttachOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [funnelName, setFunnelName] = useState("");
  const [newsletterKind, setNewsletterKind] = useState<"external" | "internal">("external");
  const [automationId, setAutomationId] = useState("");
  const [automationContactName, setAutomationContactName] = useState("");
  const [automationContactEmail, setAutomationContactEmail] = useState("");
  const [automationContactPhone, setAutomationContactPhone] = useState("");
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);

  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);

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

  const createTaskFromDraft = useCallback(async () => {
    const title = (taskTitle || input).trim().slice(0, 160);
    if (!title) {
      toast.error("Enter a task title");
      return;
    }

    setActionBusy(true);
    try {
      const json = await executeAgentAction("tasks.create", {
        title,
        description: input.trim().slice(0, 5000) || undefined,
      });
      if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
      setActionsOpen(false);
      setTaskTitle("");
      toast.success("Task created");
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }, [toast, taskTitle, input, executeAgentAction, loadThreads]);

  const createFunnelFromDraft = useCallback(async () => {
    const name = (funnelName || input).trim().slice(0, 120);
    if (!name) {
      toast.error("Enter a funnel name");
      return;
    }

    const slug = slugify(name);
    if (!slug) {
      toast.error("Funnel name must produce a valid slug");
      return;
    }

    setActionBusy(true);
    try {
      const json = await executeAgentAction("funnel.create", { name, slug });
      if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
      setActionsOpen(false);
      setFunnelName("");
      toast.success("Funnel created");
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }, [toast, funnelName, input, executeAgentAction, loadThreads]);

  const generateBlogNow = useCallback(async () => {
    setActionBusy(true);
    try {
      const json = await executeAgentAction("blogs.generate_now", {});
      if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
      setActionsOpen(false);
      toast.success("Blog generation started");
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }, [executeAgentAction, loadThreads, toast]);

  const generateNewsletterNow = useCallback(async () => {
    setActionBusy(true);
    try {
      const json = await executeAgentAction("newsletter.generate_now", { kind: newsletterKind });
      if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
      setActionsOpen(false);
      toast.success("Newsletter generation started");
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }, [executeAgentAction, loadThreads, newsletterKind, toast]);

  const runAutomationNow = useCallback(async () => {
    const id = automationId.trim();
    if (!id) {
      toast.error("Enter an automation id");
      return;
    }

    const contactPayload: Record<string, string> = {};
    if (automationContactName.trim()) contactPayload.name = automationContactName.trim().slice(0, 200);
    if (automationContactEmail.trim()) contactPayload.email = automationContactEmail.trim().slice(0, 200);
    if (automationContactPhone.trim()) contactPayload.phone = automationContactPhone.trim().slice(0, 32);

    setActionBusy(true);
    try {
      const args: Record<string, unknown> = { automationId: id };
      if (Object.keys(contactPayload).length) args.contact = contactPayload;
      const json = await executeAgentAction("automations.run", args);
      if (json.assistantMessage) setMessages((prev) => [...prev, json.assistantMessage as Message]);
      setActionsOpen(false);
      toast.success("Automation triggered");
      void loadThreads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }, [automationContactEmail, automationContactName, automationContactPhone, automationId, executeAgentAction, loadThreads, toast]);

  const left = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chats</div>
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
    <div className="w-full overflow-hidden">
      <div className="grid min-h-[75vh] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden rounded-3xl border border-zinc-200 bg-white lg:block overflow-hidden">{left}</div>

        <div className="flex min-w-0 flex-col rounded-3xl border border-zinc-200 bg-white overflow-hidden">
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
            </div>
          </div>

          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-brand-mist p-4">
            {messagesLoading ? (
              <div className="text-sm text-zinc-500">Loading messages…</div>
            ) : messages.length ? (
              <div className="space-y-3">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} onRunAction={(a) => void runAssistantAction(a)} runningActionKey={runningActionKey} />
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
              <button
                type="button"
                className={classNames(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  (uploading || sending) && "opacity-60",
                )}
                disabled={uploading || sending}
                onClick={() => setAttachOpen(true)}
                aria-label="Add attachment"
                title="Add attachment"
              >
                <span className="text-lg font-semibold">＋</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                disabled={uploading || sending}
                onChange={(e) => void uploadFiles(e.target.files)}
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
                disabled={((!input.trim() && !pendingAttachments.length) || sending)}
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
                  (sending || uploading) && "opacity-60",
                )}
                onClick={() => {
                  setTaskTitle("");
                  setFunnelName("");
                  setAutomationId("");
                  setAutomationContactName("");
                  setAutomationContactEmail("");
                  setAutomationContactPhone("");
                  setActionsOpen(true);
                }}
                disabled={sending || uploading}
                aria-label="Actions"
                title="Actions"
              >
                <span className="text-xs font-semibold">⋯</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <AppModal
        open={attachOpen}
        title="Add attachment"
        description="Choose where to add a file from."
        onClose={() => setAttachOpen(false)}
        widthClassName="w-[min(520px,calc(100vw-32px))]"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => setAttachOpen(false)}
            >
              Close
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50"
            onClick={() => {
              setAttachOpen(false);
              setMediaPickerOpen(true);
            }}
          >
            <div className="text-sm font-semibold text-zinc-900">From Media Library</div>
            <div className="mt-1 text-xs text-zinc-500">Attach an existing file.</div>
          </button>
          <button
            type="button"
            className="rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50"
            onClick={() => {
              setAttachOpen(false);
              fileInputRef.current?.click();
            }}
          >
            <div className="text-sm font-semibold text-zinc-900">Upload from Device</div>
            <div className="mt-1 text-xs text-zinc-500">Choose a file from your computer.</div>
          </button>
        </div>
      </AppModal>

      <AppModal
        open={actionsOpen}
        title="Actions"
        description="Run real actions in your portal. You can also run suggested actions under AI replies."
        onClose={() => setActionsOpen(false)}
        widthClassName="w-[min(720px,calc(100vw-32px))]"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => setActionsOpen(false)}
              disabled={actionBusy}
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Create Task</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title (defaults to your draft message)"
                className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900"
                disabled={actionBusy}
              />
              <button
                type="button"
                className="h-11 shrink-0 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void createTaskFromDraft()}
                disabled={actionBusy}
              >
                Create
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Create Funnel</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={funnelName}
                onChange={(e) => setFunnelName(e.target.value)}
                placeholder="Funnel name (defaults to your draft message)"
                className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900"
                disabled={actionBusy}
              />
              <button
                type="button"
                className="h-11 shrink-0 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void createFunnelFromDraft()}
                disabled={actionBusy}
              >
                Create
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Generate Blog Draft</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">Runs your blog automation now.</div>
              <button
                type="button"
                className="h-11 shrink-0 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void generateBlogNow()}
                disabled={actionBusy}
              >
                Run
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Generate Newsletter Draft</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <select
                value={newsletterKind}
                onChange={(e) => setNewsletterKind(e.target.value as "external" | "internal")}
                className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 sm:w-auto"
                disabled={actionBusy}
              >
                <option value="external">External</option>
                <option value="internal">Internal</option>
              </select>
              <button
                type="button"
                className="h-11 shrink-0 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void generateNewsletterNow()}
                disabled={actionBusy}
              >
                Run
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Run Automation</div>
            <div className="mt-2 grid gap-3">
              <input
                value={automationId}
                onChange={(e) => setAutomationId(e.target.value)}
                placeholder="Automation id"
                className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900"
                disabled={actionBusy}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={automationContactName}
                  onChange={(e) => setAutomationContactName(e.target.value)}
                  placeholder="Contact name (optional)"
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900"
                  disabled={actionBusy}
                />
                <input
                  value={automationContactEmail}
                  onChange={(e) => setAutomationContactEmail(e.target.value)}
                  placeholder="Contact email (optional)"
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900"
                  disabled={actionBusy}
                />
                <input
                  value={automationContactPhone}
                  onChange={(e) => setAutomationContactPhone(e.target.value)}
                  placeholder="Contact phone (optional)"
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900"
                  disabled={actionBusy}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="h-11 shrink-0 rounded-2xl bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={() => void runAutomationNow()}
                  disabled={actionBusy}
                >
                  Run
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppModal>

      <PortalMediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onPick={addMediaAttachment}
        title="Media library"
        confirmLabel="Attach"
        accept="any"
      />

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
