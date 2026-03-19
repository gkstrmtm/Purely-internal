"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function isSafeHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return false;
  if (raw.startsWith("/")) return true;
  try {
    const u = new URL(raw);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol);
  } catch {
    return false;
  }
}

function normalizeHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("www.")) return `https://${raw}`;
  return raw;
}

function renderInlineMarkdownish(text: string): Array<string | { t: "code" | "strong" | "em"; v: string }> {
  const out: Array<string | { t: "code" | "strong" | "em"; v: string }> = [];
  let s = text;

  const pushText = (v: string) => {
    if (!v) return;
    out.push(v);
  };

  while (s.length) {
    const idxCode = s.indexOf("`");
    const idxStrong = s.indexOf("**");
    const idxEm = s.indexOf("*");

    const candidates = [
      { idx: idxCode, kind: "code" as const },
      { idx: idxStrong, kind: "strong" as const },
      { idx: idxEm, kind: "em" as const },
    ].filter((c) => c.idx >= 0);

    if (candidates.length === 0) {
      pushText(s);
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const next = candidates[0]!;

    if (next.idx > 0) {
      pushText(s.slice(0, next.idx));
      s = s.slice(next.idx);
      continue;
    }

    if (next.kind === "code") {
      const end = s.indexOf("`", 1);
      if (end > 1) {
        out.push({ t: "code", v: s.slice(1, end) });
        s = s.slice(end + 1);
      } else {
        pushText(s);
        break;
      }
      continue;
    }

    if (next.kind === "strong") {
      const end = s.indexOf("**", 2);
      if (end > 2) {
        out.push({ t: "strong", v: s.slice(2, end) });
        s = s.slice(end + 2);
      } else {
        pushText(s);
        break;
      }
      continue;
    }

    if (s.startsWith("**")) {
      pushText(s.slice(0, 2));
      s = s.slice(2);
      continue;
    }
    const end = s.indexOf("*", 1);
    if (end > 1) {
      out.push({ t: "em", v: s.slice(1, end) });
      s = s.slice(end + 1);
    } else {
      pushText(s);
      break;
    }
  }

  return out;
}

function renderInlineTokens(tokens: ReturnType<typeof renderInlineMarkdownish>): React.ReactNode {
  return (
    <>
      {tokens.map((p, j) => {
        if (typeof p === "string") return <span key={j}>{p}</span>;
        if (p.t === "code") {
          return (
            <code key={j} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.95em]">
              {p.v}
            </code>
          );
        }
        if (p.t === "strong") return <strong key={j}>{p.v}</strong>;
        return <em key={j}>{p.v}</em>;
      })}
    </>
  );
}

function renderInlineWithLinks(text: string): React.ReactNode {
  const s = String(text || "");
  const hasMarkdownLinks = /\[[^\]]+\]\([^)\s]+\)/.test(s);

  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;

    if (start > lastIdx) {
      const chunk = s.slice(lastIdx, start);
      parts.push(
        <span key={`t_${lastIdx}_${start}`}>{renderInlineTokens(renderInlineMarkdownish(chunk))}</span>,
      );
    }

    const label = m[1] ?? "";
    const href = normalizeHref(m[2] ?? "");
    if (isSafeHref(href)) {
      const external = /^https?:\/\//i.test(href);
      parts.push(
        <a
          key={`link_${start}_${end}`}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          className="font-semibold text-brand-blue underline underline-offset-2 hover:opacity-90"
        >
          {renderInlineTokens(renderInlineMarkdownish(label))}
        </a>,
      );
    } else {
      parts.push(
        <span key={`bad_${start}_${end}`}>{renderInlineTokens(renderInlineMarkdownish(m[0]))}</span>,
      );
    }

    lastIdx = end;
  }

  if (lastIdx < s.length) {
    parts.push(
      <span key={`t_${lastIdx}_${s.length}`}>{renderInlineTokens(renderInlineMarkdownish(s.slice(lastIdx)))}</span>,
    );
  }

  if (!hasMarkdownLinks) {
    const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const nodes: React.ReactNode[] = [];
    let matchedAny = false;
    let li = 0;
    let um: RegExpExecArray | null;
    while ((um = urlRe.exec(s))) {
      matchedAny = true;
      const start = um.index;
      const end = start + um[0].length;
      if (start > li) {
        nodes.push(
          <span key={`u_${li}_${start}`}>{renderInlineTokens(renderInlineMarkdownish(s.slice(li, start)))}</span>,
        );
      }
      const href = normalizeHref(um[0]);
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`url_${start}_${end}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-brand-blue underline underline-offset-2 hover:opacity-90"
          >
            {um[0]}
          </a>,
        );
      } else {
        nodes.push(
          <span key={`ubad_${start}_${end}`}>{renderInlineTokens(renderInlineMarkdownish(um[0]))}</span>,
        );
      }
      li = end;
    }
    if (li < s.length) {
      nodes.push(
        <span key={`u_${li}_${s.length}`}>{renderInlineTokens(renderInlineMarkdownish(s.slice(li)))}</span>,
      );
    }
    if (matchedAny) return <>{nodes}</>;
  }

  return <>{parts}</>;
}

function renderMarkdownish(text: string): React.ReactNode {
  const lines = String(text || "").split(/\r?\n/);
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, i) => {
        const line = rawLine.trimEnd();
        if (!line) return <div key={i} />;

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const bullet = line.match(/^[-*]\s+(.*)$/);
        const ordered = line.match(/^\d+\.\s+(.*)$/);

        const body = heading ? heading[2] : bullet ? bullet[1] : ordered ? ordered[1] : line;
        const prefix = bullet ? "• " : ordered ? `${line.match(/^\d+/)?.[0] ?? ""}. ` : "";

        const content = (
          <>
            {prefix}
            {renderInlineWithLinks(body)}
          </>
        );

        if (heading) {
          return (
            <div key={i} className="font-semibold text-zinc-900">
              {content}
            </div>
          );
        }

        return (
          <div key={i} className="whitespace-pre-wrap">
            {content}
          </div>
        );
      })}
    </div>
  );
}

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

  const chatMessagesRef = useRef<SupportChatMessage[]>(chatMessages);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const chatScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  function scheduleChatScrollToBottom(force = false) {
    if (typeof window === "undefined") return;
    if (!force && !shouldAutoScrollRef.current) return;
    if (chatScrollRafRef.current) window.cancelAnimationFrame(chatScrollRafRef.current);
    chatScrollRafRef.current = window.requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }

  useEffect(() => {
    if (chatOpen) {
      shouldAutoScrollRef.current = true;
      scheduleChatScrollToBottom(true);
    }
  }, [chatOpen]);

  useEffect(() => {
    scheduleChatScrollToBottom();
  }, [chatMessages.length]);

  useEffect(() => {
    return () => {
      if (chatScrollRafRef.current) {
        window.cancelAnimationFrame(chatScrollRafRef.current);
        chatScrollRafRef.current = null;
      }
    };
  }, []);

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
    const nextRecentMessages: SupportChatMessage[] = [...chatMessagesRef.current, { role: "user" as const, text }].slice(-12);
    setChatMessages(nextRecentMessages);
    shouldAutoScrollRef.current = true;
    scheduleChatScrollToBottom(true);

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
        recentMessages: nextRecentMessages.slice(-10),
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
      scheduleChatScrollToBottom(true);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as SupportChatResponse;
    if (!json?.ok || !json.reply) {
      setChatMessages((cur) => [...cur, { role: "assistant", text: json?.error ?? "Chat failed. Please use Report bug." }]);
      setChatSending(false);
      scheduleChatScrollToBottom(true);
      return;
    }

    setChatMessages((cur) => [...cur, { role: "assistant", text: json.reply ?? "" }]);
    setChatSending(false);
    scheduleChatScrollToBottom(true);
  }

  return (
    <>
      {note ? (
        <div className="fixed bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+6rem)] right-4 z-[11003] max-w-sm rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg ring-1 ring-[rgba(29,78,216,0.14)]">
          {note}
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-[11002]">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close"
            onClick={() => (!sending ? setReportOpen(false) : null)}
          />

          <div className="absolute bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1.5rem)] right-4 w-[min(520px,calc(100vw-2rem))] rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
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
                className="min-h-30 w-full rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-[color:var(--color-brand-blue)]"
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
        <div className="fixed bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1.5rem)] right-4 z-[11001] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
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

            <div
              ref={chatScrollRef}
              onScroll={() => {
                const el = chatScrollRef.current;
                if (!el) return;
                const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                shouldAutoScrollRef.current = distanceFromBottom < 140;
              }}
              className="mt-4 max-h-[55vh] space-y-3 overflow-auto"
            >
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed " +
                    (m.role === "user"
                      ? "ml-10 bg-brand-blue font-semibold text-white"
                      : "mr-10 border border-zinc-200 bg-white text-zinc-800")
                  }
                >
                  {m.role === "assistant" ? renderMarkdownish(m.text) : m.text}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Describe the issue…"
                className="h-11 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-[color:var(--color-brand-blue)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendSupportChat();
                }}
                disabled={chatSending}
              />
              <button
                type="button"
                className="h-11 rounded-2xl bg-linear-to-r from-[color:var(--color-brand-blue)] to-[color:var(--color-brand-pink)] px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void sendSupportChat()}
                disabled={chatSending}
              >
                {chatSending ? "Sending…" : "Send"}
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">If it looks like a bug, use Report bug so we get the details.</div>
        </div>
      ) : null}

      <div className="fixed bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1rem)] right-4 z-[11000]">
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
                  "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                )}
                onClick={() => setReportOpen(true)}
              >
                Report bug
              </button>

              <button
                type="button"
                className={classNames(
                  "rounded-2xl px-3 py-2 text-sm font-semibold",
                  "bg-linear-to-r from-[color:var(--color-brand-blue)] to-[color:var(--color-brand-pink)] text-white hover:opacity-95",
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
