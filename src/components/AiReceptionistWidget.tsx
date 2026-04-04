"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type OutgoingEvent =
  | {
      type: "conversation_initiation_client_data";
      conversation_config_override?: {
        conversation?: { text_only?: boolean };
      };
    }
  | { type: "contextual_update"; text: string }
  | { type: "user_message"; text: string };

type IncomingEvent = {
  type?: string;
  [k: string]: unknown;
};

function toTelHref(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (String(raw || "").startsWith("+") || String(raw || "").startsWith("tel:")) return String(raw || "");
  return `tel:${raw}`;
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

    // em
    if (s.startsWith("**")) {
      // handled above
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

  // Support standard markdown links: [label](url)
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
      // Unsafe/invalid href, render as plain text.
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

  // If there were no markdown links, try a light autolink pass for plain URLs.
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
    <div className="space-y-2">
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

export function AiReceptionistWidget() {
  const pathname = usePathname() || "";

  const [hostname, setHostname] = useState<string>("");
  useEffect(() => {
    try {
      setHostname(String(window.location.hostname || "").trim().toLowerCase());
    } catch {
      setHostname("");
    }
  }, []);

  const allowedHosts = useMemo(() => {
    const out = new Set<string>();

    const add = (raw: unknown) => {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return;
      try {
        const u = new URL(s);
        const h = u.hostname.trim().toLowerCase();
        if (h) out.add(h);
      } catch {
        // ignore
      }
    };

    add(process.env.NEXT_PUBLIC_APP_CANONICAL_URL);
    add(process.env.NEXT_PUBLIC_APP_URL);
    out.add("purelyautomation.com");
    out.add("www.purelyautomation.com");
    out.add("localhost");
    out.add("127.0.0.1");
    return out;
  }, []);

  const isPlatformHost = useMemo(() => {
    if (!hostname) return true; // avoid flicker: assume platform until we know
    if (allowedHosts.has(hostname)) return true;
    // Allow Vercel preview domains for internal testing.
    if (hostname.endsWith(".vercel.app")) return true;
    return false;
  }, [allowedHosts, hostname]);

  // Customer-facing widget:
  // - show on marketing pages and /portal
  // - never show inside /portal/app (portal app has its own Chat + Report tools)
  const hiddenByPublicBusinessPath = useMemo(() => {
    // Hide on platform-hosted business public pages like:
    // - /{siteSlug}/blogs
    // - /{siteSlug}/newsletters
    // - /{siteSlug}/internal-newsletters
    // - /{siteSlug}/reviews
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    const section = parts[1] || "";
    return ["blogs", "newsletters", "internal-newsletters", "reviews"].includes(section);
  }, [pathname]);

  const hiddenByPath =
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/portal/app") ||
    pathname.startsWith("/credit/app") ||
    pathname === "/f" ||
    pathname.startsWith("/f/") ||
    pathname === "/portal/f" ||
    pathname.startsWith("/portal/f/") ||
    pathname === "/credit/f" ||
    pathname.startsWith("/credit/f/") ||
    pathname === "/login" ||
    pathname === "/ads/login" ||
    pathname.startsWith("/ads/app") ||
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    hiddenByPublicBusinessPath;

  // Never show the Purely marketing chat widget on customer custom-domain pages.
  const hidden = hiddenByPath || !isPlatformHost;

  const phone = process.env.NEXT_PUBLIC_AI_RECEPTIONIST_PHONE || "980-238-3381";
  const telHref = useMemo(() => toTelHref(phone), [phone]);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => []);
  const [input, setInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket | null> | null>(null);
  const readyRef = useRef(false);
  const queuedRef = useRef<OutgoingEvent[]>([]);
  const streamMessageIdByEventIdRef = useRef(new Map<string, string>());
  const streamSessionNonceRef = useRef<string>(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  );
  const sawAnyAgentTextSinceLastSendRef = useRef(false);
  const awaitingAgentRef = useRef(false);
  const pendingResponseTimeoutRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const reconnectAttemptCountRef = useRef(0);
  const lastUserMessageRef = useRef<string | null>(null);
  const lastSendAtRef = useRef<number>(0);
  const lastInboundAtRef = useRef<number>(Date.now());

  const canSend = useMemo(() => status !== "connecting", [status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("pa_help_widget_open");
    if (saved === "1") setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pa_help_widget_open", open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // When the widget opens, snap to the bottom.
    if (open) {
      shouldAutoScrollRef.current = true;
      if (typeof window !== "undefined") {
        if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = window.requestAnimationFrame(() => {
          endRef.current?.scrollIntoView({ block: "end" });
        });
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pendingResponseTimeoutRef.current) {
        window.clearTimeout(pendingResponseTimeoutRef.current);
        pendingResponseTimeoutRef.current = null;
      }
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      try {
        wsRef.current?.close(1000, "unmount");
      } catch {
        // ignore
      }
      wsRef.current = null;
      readyRef.current = false;
    };
  }, []);

  function appendAssistantError(text: string) {
    awaitingAgentRef.current = false;
    // AI-first: avoid rendering deterministic/non-model error text as an assistant message.
    setStatus("error");
  }

  function appendAssistantText(text: string) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return;
    // Avoid rendering placeholder-y responses.
    if (cleaned === "..." || cleaned === "…") return;
    awaitingAgentRef.current = false;
    setMessages((prev) => [
      ...prev,
      {
        id: `agent_${Date.now()}`,
        role: "assistant",
        text: cleaned,
      },
    ]);
    scheduleScrollToBottom();
  }

  function upsertStreamChunk(eventId: string, chunk: string) {
    const text = String(chunk || "");
    if (!text) return;
    if (text === "..." || text === "…") return;

    sawAnyAgentTextSinceLastSendRef.current = true;
    awaitingAgentRef.current = false;

    // ElevenLabs event_id values can repeat across new conversations.
    // Prefix with a per-connection nonce so we never merge new session text into an old bubble.
    const scopedEventId = `${streamSessionNonceRef.current}:${eventId}`;
    const messageId = streamMessageIdByEventIdRef.current.get(scopedEventId) ?? `agent_${scopedEventId}`;
    streamMessageIdByEventIdRef.current.set(scopedEventId, messageId);

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) {
        return [...prev, { id: messageId, role: "assistant", text }];
      }
      const next = prev.slice();
      next[idx] = { ...next[idx], text: (next[idx].text || "") + text };
      return next;
    });

    // Streaming updates don't change message count, so ensure we still follow.
    scheduleScrollToBottom();
  }

  function scheduleScrollToBottom(force = false) {
    if (typeof window === "undefined") return;
    if (!force && !shouldAutoScrollRef.current) return;
    if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end" });
    });
  }

  function buildReconnectContext() {
    const recent = messagesRef.current
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => {
        const compact = String(m.text || "").replace(/\s+/g, " ").trim();
        if (
          /^connection dropped\./i.test(compact) ||
          /^chat timed out\./i.test(compact) ||
          /^chat is unavailable/i.test(compact)
        ) {
          return "";
        }
        const clipped = compact.length > 280 ? `${compact.slice(0, 277)}…` : compact;
        return `${m.role === "user" ? "User" : "Assistant"}: ${clipped}`;
      })
      .filter(Boolean)
      .join("\n");

    return [
      "Continuing an existing chat session that was interrupted.",
      "Do not greet or introduce yourself again. Continue naturally and answer the latest user message.",
      recent ? `Recent transcript:\n${recent}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 1800);
  }

  function flushQueue(ws: WebSocket) {
    if (!readyRef.current) return;
    while (queuedRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
      const ev = queuedRef.current.shift();
      if (!ev) break;
      ws.send(JSON.stringify(ev));
    }
  }

  async function ensureConnected(): Promise<WebSocket | null> {
    const existing = wsRef.current;
    const existingIsLive =
      existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING);

    // If the websocket is very old/stale (common after idle), start a new backend session silently.
    // Keep UI transcript unchanged.
    const STALE_INBOUND_MS = 2 * 60_000;
    const isStale = existingIsLive && Date.now() - lastInboundAtRef.current > STALE_INBOUND_MS;
    if (existingIsLive && !isStale) return existing;

    if (isStale) {
      try {
        existing?.close(1000, "stale");
      } catch {
        // ignore
      }
      if (wsRef.current === existing) wsRef.current = null;
      readyRef.current = false;
    }

    if (connectPromiseRef.current) return await connectPromiseRef.current;

    connectPromiseRef.current = (async () => {
      setStatus("connecting");

      const res = await fetch("/api/public/elevenlabs/convai/help-widget-signed-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }).catch(() => null);

      const data = await res?.json?.().catch(() => null);
      const signedUrl = data && typeof data.signedUrl === "string" ? data.signedUrl : null;

      if (!res || !res.ok || !signedUrl) {
        setStatus("error");
        const err = data && typeof data.error === "string" ? data.error : "";
        appendAssistantError(err);
        return null;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(signedUrl, ["convai"]);
      } catch {
        setStatus("error");
        return null;
      }

      wsRef.current = ws;
      readyRef.current = false;
      lastInboundAtRef.current = Date.now();
      streamMessageIdByEventIdRef.current.clear();
      streamSessionNonceRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      ws.addEventListener(
        "open",
        () => {
          try {
            const init: OutgoingEvent = {
              type: "conversation_initiation_client_data",
              conversation_config_override: {
                conversation: { text_only: true },
              },
            };
            ws.send(JSON.stringify(init));
          } catch {
            // ignore
          }
        },
        { once: true },
      );

      ws.addEventListener("message", (event) => {
        lastInboundAtRef.current = Date.now();
        let msg: IncomingEvent;
        try {
          msg = JSON.parse(String((event as MessageEvent).data ?? "")) as IncomingEvent;
        } catch {
          return;
        }

      if (msg?.type === "conversation_initiation_metadata") {
        readyRef.current = true;
        setStatus("connected");
        flushQueue(ws);
        return;
      }

      if (msg?.type === "agent_chat_response_part" && (msg as any)?.text_response_part) {
        const part = (msg as any).text_response_part as any;
        const eventId = typeof part?.event_id === "string" ? part.event_id : String(part?.event_id ?? "");
        const partType = typeof part?.type === "string" ? part.type : "";
        const text = typeof part?.text === "string" ? part.text : "";

        if (!eventId) return;

        // Only create/display an assistant bubble once we receive real text.
        if (partType === "delta" || partType === "end" || (partType === "start" && text)) {
          upsertStreamChunk(eventId, text);
        }
        return;
      }

      // Some convai payloads include a single full-text response event.
      // Best-effort: capture it if present.
      const fullText =
        typeof (msg as any)?.text === "string"
          ? (msg as any).text
          : typeof (msg as any)?.agent_response_event?.text === "string"
            ? (msg as any).agent_response_event.text
            : null;
      if (fullText) {
        sawAnyAgentTextSinceLastSendRef.current = true;
        appendAssistantText(fullText);
        return;
      }

      if (msg?.type === "error" || msg?.type === "error_message") {
        const err =
          typeof msg?.message === "string"
            ? msg.message
            : typeof msg?.detail === "string"
              ? msg.detail
              : "";
        appendAssistantError(err);
      }
      });

      ws.addEventListener("close", (event) => {
        readyRef.current = false;
        if (wsRef.current === ws) wsRef.current = null;
        setStatus((s) => (s === "error" ? s : "idle"));

        const wasClean = typeof (event as CloseEvent)?.wasClean === "boolean" ? (event as CloseEvent).wasClean : true;
        const code = typeof (event as CloseEvent)?.code === "number" ? (event as CloseEvent).code : 0;
        const reason = typeof (event as CloseEvent)?.reason === "string" ? (event as CloseEvent).reason : "";

        // ElevenLabs sessions can end after idle; treat that as a recoverable backend event.
        const recentlySent = Date.now() - lastSendAtRef.current < 5 * 60_000;
        const isIntentional = reason === "unmount" || reason === "timeout" || reason === "stale";
        const shouldRetry =
          recentlySent &&
          awaitingAgentRef.current &&
          !sawAnyAgentTextSinceLastSendRef.current &&
          reconnectAttemptCountRef.current < 2 &&
          (queuedRef.current.length > 0 || !!lastUserMessageRef.current);

        if (shouldRetry) {
          reconnectAttemptCountRef.current += 1;

          // Keep the UI transcript unchanged; just re-send the latest user message on the new backend session.
          if (queuedRef.current.length === 0 && lastUserMessageRef.current) {
            queuedRef.current.push({ type: "user_message", text: lastUserMessageRef.current });
          }

          queuedRef.current.unshift({ type: "contextual_update", text: buildReconnectContext() });
          void ensureConnected();
          return;
        }

        // Only surface an error if we could not recover silently.
        if (recentlySent && !sawAnyAgentTextSinceLastSendRef.current && !isIntentional) {
          awaitingAgentRef.current = false;
          setStatus("error");
        }
      });

      ws.addEventListener("error", () => {
        setStatus("error");
      });

      return ws;
    })();

    try {
      return await connectPromiseRef.current;
    } finally {
      connectPromiseRef.current = null;
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: "user",
        text: trimmed,
      },
    ]);

    const ev: OutgoingEvent = { type: "user_message", text: trimmed };
    queuedRef.current.push(ev);
    setInput("");

    lastUserMessageRef.current = trimmed;
    lastSendAtRef.current = Date.now();
    reconnectAttemptCountRef.current = 0;
    shouldAutoScrollRef.current = true;
    scheduleScrollToBottom(true);

    sawAnyAgentTextSinceLastSendRef.current = false;
    awaitingAgentRef.current = true;
    if (pendingResponseTimeoutRef.current) {
      window.clearTimeout(pendingResponseTimeoutRef.current);
      pendingResponseTimeoutRef.current = null;
    }
    pendingResponseTimeoutRef.current = window.setTimeout(() => {
      // If the agent didn't answer, silently restart the backend session and re-send.
      // Keep all UI messages exactly as-is.
      if (!sawAnyAgentTextSinceLastSendRef.current && awaitingAgentRef.current) {
        try {
          wsRef.current?.close(1006, "timeout");
        } catch {
          // ignore
        }
      }
    }, 45000);

    // If we haven't received anything recently (idle timeout likely), force a fresh backend session.
    // Keep UI transcript unchanged; we still send the exact same user message.
    const INBOUND_IDLE_BEFORE_SEND_MS = 2 * 60_000;
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN && Date.now() - lastInboundAtRef.current > INBOUND_IDLE_BEFORE_SEND_MS) {
      queuedRef.current.unshift({ type: "contextual_update", text: buildReconnectContext() });
      try {
        existing.close(1000, "stale");
      } catch {
        // ignore
      }
    }

    const ws = await ensureConnected();
    if (!ws) return;
    flushQueue(ws);
  }

  if (hidden) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="mb-3 w-[min(92vw,420px)] overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-zinc-900">Need help?</div>
              <div className="mt-0.5 text-xs font-semibold text-zinc-600">
                {status === "error" ? "Chat unavailable" : status === "connected" ? "Chat with us" : status === "connecting" ? "Connecting…" : "Message us"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-transparent bg-white text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={() => {
              const el = scrollContainerRef.current;
              if (!el) return;
              const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
              shouldAutoScrollRef.current = distanceFromBottom < 120;
            }}
            className="max-h-[50vh] overflow-y-auto px-4 py-4"
          >
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white"
                        : "max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                    }
                  >
                    {m.role === "assistant" ? renderMarkdownish(m.text) : m.text}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-zinc-200 bg-white p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                placeholder="Type a message…"
                className="min-h-11 flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-brand-blue"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-4 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
              <a
                href={telHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                Call
              </a>
            </form>
          </div>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-3 shadow-lg hover:bg-zinc-50"
          aria-label="Open help"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 18.4 4.6 20c-.4.3-1 .1-1-.4V6.4C3.6 5.1 4.7 4 6 4h12c1.3 0 2.4 1.1 2.4 2.4v7.2c0 1.3-1.1 2.4-2.4 2.4H8.8c-.2 0-.4 0-.6.2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M7.6 8.8h8.8M7.6 12h6.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-left">
            <div className="text-sm font-bold text-zinc-900">Need help?</div>
            <div className="text-xs font-semibold text-zinc-600">Chat with us</div>
          </span>
        </button>
      ) : null}
    </div>
  );
}
