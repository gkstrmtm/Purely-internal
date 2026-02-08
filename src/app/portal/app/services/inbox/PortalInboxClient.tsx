"use client";

import { useEffect, useMemo, useState } from "react";

type Channel = "email" | "sms";

type Thread = {
  id: string;
  channel: "EMAIL" | "SMS";
  peerAddress: string;
  subject: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageDirection: "IN" | "OUT";
  lastMessageFrom: string;
  lastMessageTo: string;
  lastMessageSubject: string | null;
};

type Message = {
  id: string;
  channel: "EMAIL" | "SMS";
  direction: "IN" | "OUT";
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  bodyText: string;
  createdAt: string;
};

type SettingsRes = {
  ok: true;
  settings: { webhookToken: string };
  twilio: { configured: boolean; fromNumberE164: string | null };
  webhooks: { twilioInboundSmsUrl: string; sendgridInboundEmailUrl: string };
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PortalInboxClient() {
  const [tab, setTab] = useState<Channel>("email");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsRes | null>(null);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const [composeTo, setComposeTo] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState<string>("");
  const [composeBody, setComposeBody] = useState<string>("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/inbox/settings", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) return;
      setSettings((await res.json()) as SettingsRes);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function loadThreads(nextTab: Channel) {
    setLoadingThreads(true);
    setError(null);
    setThreads([]);
    setMessages([]);
    setActiveThreadId(null);

    const res = await fetch(`/api/portal/inbox/threads?channel=${nextTab}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      setLoadingThreads(false);
      setError("Failed to load threads");
      return;
    }

    const json = (await res.json()) as { ok: true; threads: Thread[] };
    setThreads(json.threads);
    setLoadingThreads(false);

    if (json.threads.length) {
      setActiveThreadId(json.threads[0].id);
    }
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true);
    setError(null);

    const res = await fetch(`/api/portal/inbox/threads/${threadId}/messages?take=250`, {
      cache: "no-store",
    });

    if (!res.ok) {
      setLoadingMessages(false);
      setError("Failed to load messages");
      return;
    }

    const json = (await res.json()) as { ok: true; messages: Message[] };
    setMessages(json.messages);
    setLoadingMessages(false);
  }

  useEffect(() => {
    loadThreads(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadMessages(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  useEffect(() => {
    // When switching threads, prefill compose-to/subject.
    if (!activeThread) return;
    setComposeTo(activeThread.peerAddress);
    if (tab === "email") setComposeSubject(activeThread.subject ?? "");
  }, [activeThread, tab]);

  async function onSend() {
    if (sending) return;
    setError(null);

    const to = composeTo.trim();
    const body = composeBody.trim();
    const subject = composeSubject.trim();

    if (!to || !body) {
      setError("To and message are required");
      return;
    }

    setSending(true);
    const res = await fetch("/api/portal/inbox/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: tab,
        to,
        subject: tab === "email" ? subject : undefined,
        body,
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
      }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setSending(false);
      setError(typeof json?.error === "string" ? json.error : "Send failed");
      return;
    }

    const threadId = typeof json.threadId === "string" ? json.threadId : activeThreadId;

    setComposeBody("");
    setSending(false);

    // Refresh threads + messages.
    await loadThreads(tab);
    if (threadId) setActiveThreadId(threadId);
  }

  async function regenToken() {
    const res = await fetch("/api/portal/inbox/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerateToken: true }),
    });
    if (!res.ok) return;
    setSettings((await res.json()) as SettingsRes);
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Inbox / Outbox</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Email and SMS threads in one place.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700">
          <div className="text-xs font-semibold text-zinc-900">Inbound setup</div>
          <div className="mt-2 space-y-1">
            <div>
              <span className="font-semibold">Twilio SMS webhook:</span>{" "}
              <span className="break-all text-zinc-600">{settings?.webhooks.twilioInboundSmsUrl ?? "Loading…"}</span>
            </div>
            <div>
              <span className="font-semibold">SendGrid inbound parse:</span>{" "}
              <span className="break-all text-zinc-600">{settings?.webhooks.sendgridInboundEmailUrl ?? "Loading…"}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[11px] text-zinc-500">
              Twilio configured: {settings?.twilio?.configured ? "Yes" : "No"}
            </div>
            <button
              type="button"
              onClick={regenToken}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Regenerate token
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 inline-flex rounded-2xl border border-zinc-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("email")}
          className={classNames(
            "rounded-2xl px-4 py-2 text-sm font-semibold",
            tab === "email" ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50",
          )}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setTab("sms")}
          className={classNames(
            "rounded-2xl px-4 py-2 text-sm font-semibold",
            tab === "sms" ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50",
          )}
        >
          SMS
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-3 lg:col-span-4">
          <div className="px-2 py-2 text-sm font-semibold text-zinc-900">Threads</div>
          {loadingThreads ? (
            <div className="px-2 py-3 text-sm text-zinc-600">Loading…</div>
          ) : threads.length ? (
            <div className="max-h-[70vh] overflow-y-auto">
              {threads.map((t) => {
                const active = t.id === activeThreadId;
                const title = tab === "sms" ? t.peerAddress : t.subject || "(no subject)";
                const subtitle = tab === "sms" ? t.lastMessagePreview : t.peerAddress;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveThreadId(t.id)}
                    className={classNames(
                      "w-full rounded-2xl px-3 py-2 text-left",
                      active ? "bg-zinc-100" : "hover:bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                        <div className="mt-0.5 truncate text-xs text-zinc-600">{subtitle}</div>
                      </div>
                      <div className="shrink-0 text-[11px] text-zinc-500">{formatWhen(t.lastMessageAt)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-2 py-3 text-sm text-zinc-600">
              No threads yet.
              <div className="mt-2 text-xs text-zinc-500">Send something, or enable inbound webhooks.</div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-3 lg:col-span-8">
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">
                {activeThread ? (tab === "sms" ? activeThread.peerAddress : activeThread.subject || "(no subject)") : "Compose"}
              </div>
              <div className="truncate text-xs text-zinc-500">
                {activeThread ? (tab === "sms" ? "SMS thread" : activeThread.peerAddress) : "Start a new conversation"}
              </div>
            </div>
          </div>

          <div className="h-[46vh] overflow-y-auto rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
            {loadingMessages ? (
              <div className="text-sm text-zinc-600">Loading…</div>
            ) : messages.length ? (
              <div className="space-y-3">
                {messages.map((m) => {
                  if (tab === "sms") {
                    const mine = m.direction === "OUT";
                    return (
                      <div key={m.id} className={classNames("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={classNames(
                            "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                            mine ? "bg-[color:var(--color-brand-blue)] text-white" : "bg-white text-zinc-900",
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words">{m.bodyText}</div>
                          <div className={classNames("mt-1 text-[11px]", mine ? "text-white/80" : "text-zinc-500")}> {formatWhen(m.createdAt)} </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-zinc-800">
                          {m.direction === "OUT" ? "You" : m.fromAddress}
                        </div>
                        <div className="text-[11px] text-zinc-500">{formatWhen(m.createdAt)}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-800">{m.bodyText}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-zinc-600">No messages yet.</div>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-zinc-700">To</div>
                <input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder={tab === "sms" ? "+15551234567" : "name@company.com"}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>

              {tab === "email" ? (
                <div>
                  <div className="text-xs font-semibold text-zinc-700">Subject</div>
                  <input
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Subject"
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-zinc-700">Message</div>
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                rows={4}
                placeholder={tab === "sms" ? "Type a text…" : "Type an email…"}
                className="mt-1 w-full resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={onSend}
                disabled={sending}
                className={classNames(
                  "rounded-2xl bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:opacity-95",
                  sending && "opacity-60",
                )}
              >
                {sending ? "Sending…" : tab === "sms" ? "Send SMS" : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
