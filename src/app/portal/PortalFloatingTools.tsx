"use client";

import { useEffect, useMemo, useState } from "react";

type VersionPayload = {
  ok?: boolean;
  buildSha?: string | null;
  commitRef?: string | null;
  deploymentId?: string | null;
  nodeEnv?: string | null;
  now?: string;
};

type BugReportResponse = { ok?: boolean; reportId?: string; emailed?: boolean; error?: string };

type SupportChatMessage = { role: "assistant" | "user"; text: string };
type SupportChatResponse = { ok?: boolean; reply?: string; error?: string };

function shortSha(sha: string | null | undefined) {
  const s = (sha ?? "").trim();
  if (!s) return "unknown";
  return s.length > 10 ? s.slice(0, 10) : s;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalFloatingTools() {
  const [minimized, setMinimized] = useState(true);
  const [version, setVersion] = useState<VersionPayload | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<SupportChatMessage[]>([
    {
      role: "assistant",
      text: "Tell me what you’re trying to do in the portal and what went wrong. If it’s urgent, use Report bug.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("pa_portal_floating_tools_minimized");
    if (saved === "0") setMinimized(false);
    else setMinimized(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pa_portal_floating_tools_minimized", minimized ? "1" : "0");
  }, [minimized]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/version", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) {
        setVersion({ ok: false });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as VersionPayload;
      setVersion(json);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const versionLabel = useMemo(() => {
    const sha = shortSha(version?.buildSha);
    return `v ${sha}`;
  }, [version?.buildSha]);

  function persistMinimized(next: boolean) {
    setMinimized(next);
  }

  async function submit() {
    const text = message.trim();
    if (!text) {
      setNote("Please describe the issue.");
      window.setTimeout(() => setNote(null), 2000);
      return;
    }

    setSending(true);
    setNote(null);

    const payload = {
      message: text,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      area: "portal",
      meta: {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        buildSha: version?.buildSha ?? null,
        commitRef: version?.commitRef ?? null,
        deploymentId: version?.deploymentId ?? null,
        nodeEnv: version?.nodeEnv ?? null,
        clientTime: new Date().toISOString(),
      },
    };

    const res = await fetch("/api/portal/bug-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null as any);

    if (!res?.ok) {
      setNote("Could not send bug report.");
      setSending(false);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as BugReportResponse;
    if (!json?.ok) {
      setNote(json?.error ?? "Could not send bug report.");
      setSending(false);
      return;
    }

    setMessage("");
    setReportOpen(false);
    setSending(false);

    setNote(json.emailed ? "Bug report sent. Thanks!" : "Bug report saved (email not configured).");
    window.setTimeout(() => setNote(null), 3500);
  }

  async function sendSupportChat() {
    const text = chatInput.trim();
    if (!text || chatSending) return;

    setChatInput("");
    setChatSending(true);
    setChatMessages((cur) => [...cur, { role: "user", text }]);

    const payload = {
      message: text,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      meta: {
        buildSha: version?.buildSha ?? null,
        commitRef: version?.commitRef ?? null,
        deploymentId: version?.deploymentId ?? null,
        nodeEnv: version?.nodeEnv ?? null,
        clientTime: new Date().toISOString(),
      },
      context: {
        recentMessages: chatMessages.slice(-10),
      },
    };

    const res = await fetch("/api/portal/support-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null as any);

    if (!res?.ok) {
      setChatMessages((cur) => [...cur, { role: "assistant", text: "Chat is unavailable right now. Please use Report bug." }]);
      setChatSending(false);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as SupportChatResponse;
    if (!json?.ok || !json.reply) {
      setChatMessages((cur) => [...cur, { role: "assistant", text: json?.error ?? "Chat failed. Please use Report bug." }]);
      setChatSending(false);
      return;
    }

    setChatMessages((cur) => [...cur, { role: "assistant", text: json.reply ?? "" }]);
    setChatSending(false);
  }

  return (
    <>
      {note ? (
        <div className="fixed bottom-24 right-4 z-9999 max-w-sm rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg ring-1 ring-[rgba(29,78,216,0.14)]">
          {note}
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-9998">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close"
            onClick={() => (!sending ? setReportOpen(false) : null)}
          />

          <div className="absolute bottom-6 right-4 w-[min(520px,calc(100vw-2rem))] rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report a bug</div>
                <div className="mt-1 text-xs text-zinc-500">{versionLabel}</div>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setReportOpen(false)}
                disabled={sending}
              >
                ×
              </button>
            </div>

            <div className="mt-4">
              <textarea
                className="min-h-30 w-full rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue)"
                placeholder="What happened? What did you expect?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
              />
              <div className="mt-2 text-xs text-zinc-500">Includes your current page URL and version automatically.</div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">We’ll notify the team by email.</div>
              <button
                type="button"
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void submit()}
                disabled={sending}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chatOpen ? (
        <div className="fixed bottom-6 right-4 z-9998 w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Chat</div>
                <div className="mt-1 text-xs text-zinc-500">{versionLabel}</div>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setChatOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="mt-4 max-h-[55vh] space-y-3 overflow-auto">
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed " +
                    (m.role === "user" ? "ml-10 bg-zinc-900 text-white" : "mr-10 bg-zinc-100 text-zinc-900")
                  }
                >
                  {m.text}
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Describe the issue…"
                className="h-11 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendSupportChat();
                }}
                disabled={chatSending}
              />
              <button
                type="button"
                className="h-11 rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void sendSupportChat()}
                disabled={chatSending}
              >
                {chatSending ? "Sending…" : "Send"}
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">If it looks like a bug, use Report bug so we get the details.</div>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-9997">
        {minimized ? (
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-lg ring-1 ring-[rgba(29,78,216,0.14)] hover:bg-zinc-50"
            onClick={() => persistMinimized(false)}
            aria-label="Open tools"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(251,113,133,0.55))] text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M7 18.4 4.6 20c-.4.3-1 .1-1-.4V6.4C3.6 5.1 4.7 4 6 4h12c1.3 0 2.4 1.1 2.4 2.4v7.2c0 1.3-1.1 2.4-2.4 2.4H8.8c-.2 0-.4 0-.6.2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-sm font-semibold text-zinc-900">Chat and Report</span>
          </button>
        ) : (
          <div className="w-[min(320px,calc(100vw-2rem))] rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 h-1.5 w-14 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(29,78,216,0.25))]" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-zinc-500">Version</div>
                <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{versionLabel}</div>
              </div>
              <button
                type="button"
                className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => persistMinimized(true)}
                aria-label="Minimize"
              >
                ×
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                className={classNames(
                  "rounded-2xl px-3 py-2 text-sm font-semibold",
                  "bg-(--color-brand-blue) text-white hover:opacity-95",
                )}
                onClick={() => setReportOpen(true)}
              >
                Report bug
              </button>

              <button
                type="button"
                className={classNames(
                  "rounded-2xl px-3 py-2 text-sm font-semibold",
                  "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                )}
                onClick={() => setChatOpen(true)}
              >
                Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
