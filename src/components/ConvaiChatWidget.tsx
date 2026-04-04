"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";

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

function renderInlineWithLinks(text: string): React.ReactNode {
  const s = String(text || "");

  const hasMarkdownLinks = /\[[^\]]+\]\([^\)\s]+\)/.test(s);

  // Support standard markdown links: [label](url)
  const linkRe = /\[([^\]]+)\]\(([^\)\s]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;

    if (start > lastIdx) {
      parts.push(<span key={`t_${lastIdx}_${start}`}>{s.slice(lastIdx, start)}</span>);
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
          className="font-semibold text-(--convai-link) underline underline-offset-2 hover:opacity-90"
        >
          {label}
        </a>,
      );
    } else {
      parts.push(<span key={`bad_${start}_${end}`}>{m[0]}</span>);
    }

    lastIdx = end;
  }

  if (lastIdx < s.length) {
    parts.push(<span key={`t_${lastIdx}_${s.length}`}>{s.slice(lastIdx)}</span>);
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
      if (start > li) nodes.push(<span key={`u_${li}_${start}`}>{s.slice(li, start)}</span>);
      const href = normalizeHref(um[0]);
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`url_${start}_${end}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-(--convai-link) underline underline-offset-2 hover:opacity-90"
          >
            {um[0]}
          </a>,
        );
      } else {
        nodes.push(<span key={`ubad_${start}_${end}`}>{um[0]}</span>);
      }
      li = end;
    }
    if (li < s.length) nodes.push(<span key={`u_${li}_${s.length}`}>{s.slice(li)}</span>);
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

function launcherIcon(style: "bubble" | "dots" | "spark") {
  if (style === "dots") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 18.4 4.6 20c-.4.3-1 .1-1-.4V6.4C3.6 5.1 4.7 4 6 4h12c1.3 0 2.4 1.1 2.4 2.4v7.2c0 1.3-1.1 2.4-2.4 2.4H8.8c-.2 0-.4 0-.6.2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M8 12h.01M12 12h.01M16 12h.01" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (style === "spark") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2l1.8 6.3L20 10l-6.2 1.7L12 18l-1.8-6.3L4 10l6.2-1.7L12 2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M19 14l.9 2.8L22 17l-2.1.2L19 20l-.9-2.8L16 17l2.1-.2L19 14Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // bubble
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 18.4 4.6 20c-.4.3-1 .1-1-.4V6.4C3.6 5.1 4.7 4 6 4h12c1.3 0 2.4 1.1 2.4 2.4v7.2c0 1.3-1.1 2.4-2.4 2.4H8.8c-.2 0-.4 0-.6.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M7.6 8.8h8.8M7.6 12h6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export type ConvaiChatWidgetPlacementX = "left" | "center" | "right";
export type ConvaiChatWidgetPlacementY = "top" | "middle" | "bottom";

export function ConvaiChatWidget({
  agentId,
  signedUrlEndpoint,
  placementX = "right",
  placementY = "bottom",
  positioning = "fixed",
  primaryColor,
  launcherStyle = "bubble",
  launcherImageUrl,
  panelTitle = "Chat",
  panelSubtitle = "Message us",
}: {
  agentId?: string;
  signedUrlEndpoint: string;
  placementX?: ConvaiChatWidgetPlacementX;
  placementY?: ConvaiChatWidgetPlacementY;
  positioning?: "fixed" | "absolute";
  primaryColor?: string;
  launcherStyle?: "bubble" | "dots" | "spark";
  launcherImageUrl?: string;
  panelTitle?: string;
  panelSubtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => []);
  const [input, setInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket | null> | null>(null);
  const readyRef = useRef(false);
  const queuedRef = useRef<OutgoingEvent[]>([]);
  const lastInboundAtRef = useRef<number>(0);
  const lastSendAtRef = useRef<number>(0);

  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const canSend = useMemo(() => status !== "connecting", [status]);

  const cssVars = useMemo(() => {
    const base = String(primaryColor || "").trim();
    const basePrimary = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(base) ? base : "#1d4ed8";

    const theme = deriveHostedBrandTheme({
      brandPrimaryHex: basePrimary,
      brandSecondaryHex: basePrimary,
      brandAccentHex: basePrimary,
      brandTextHex: null,
    });

    return {
      ["--convai-primary" as any]: theme.ctaHex,
      ["--convai-on-primary" as any]: theme.onCtaHex,
      ["--convai-link" as any]: theme.linkHex,
      ["--convai-soft" as any]: theme.softHex,
      ["--convai-border" as any]: theme.borderHex,
    } as Record<string, string>;
  }, [primaryColor]);

  const positionStyle = useMemo(() => {
    const s: Record<string, any> = { position: positioning, zIndex: 50 };

    const transforms: string[] = [];

    if (placementX === "left") s.left = 16;
    if (placementX === "right") s.right = 16;
    if (placementX === "center") {
      s.left = "50%";
      transforms.push("translateX(-50%)");
    }

    if (placementY === "top") s.top = 16;
    if (placementY === "bottom") s.bottom = 16;
    if (placementY === "middle") {
      s.top = "50%";
      transforms.push("translateY(-50%)");
    }

    if (transforms.length) s.transform = transforms.join(" ");
    return s;
  }, [placementX, placementY, positioning]);

  function scrollToBottom(force: boolean) {
    if (!force && !shouldAutoScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  }

  function appendAssistantError(err: string) {
    const safe = String(err || "").trim();
    if (!safe) return;
    const msg: ChatMessage = { id: `a_${Date.now()}`, role: "assistant", text: safe };
    setMessages((xs) => [...xs, msg]);
  }

  function upsertAssistantStreamChunk(eventId: string, text: string) {
    const id = `stream_${eventId}`;
    setMessages((xs) => {
      const idx = xs.findIndex((m) => m.id === id);
      if (idx === -1) return [...xs, { id, role: "assistant", text }];
      const next = xs.slice();
      next[idx] = { ...next[idx], text: String(text || "") };
      return next;
    });
  }

  async function ensureConnected(): Promise<WebSocket | null> {
    if (!agentId) return null;

    const existing = wsRef.current;
    const existingIsLive = existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING);

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

      const res = await fetch(signedUrlEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId }),
      }).catch(() => null);

      const data = await res?.json?.().catch(() => null);
      const signedUrl = data && typeof data.signedUrl === "string" ? data.signedUrl : null;

      if (!res || !res.ok || !signedUrl) {
        setStatus("error");
        const err = data && typeof data.error === "string" ? data.error : "";
        appendAssistantError(err);
        connectPromiseRef.current = null;
        return null;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(signedUrl, ["convai"]);
      } catch {
        setStatus("error");
        connectPromiseRef.current = null;
        return null;
      }

      wsRef.current = ws;
      readyRef.current = false;
      lastInboundAtRef.current = Date.now();

      ws.addEventListener(
        "open",
        () => {
          try {
            const init: OutgoingEvent = {
              type: "conversation_initiation_client_data",
              conversation_config_override: { conversation: { text_only: true } },
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
          return;
        }

        if (msg?.type === "agent_chat_response_part" && (msg as any)?.text_response_part) {
          const part = (msg as any).text_response_part as any;
          const eventId = typeof part?.event_id === "string" ? part.event_id : String(part?.event_id ?? "");
          const partType = typeof part?.type === "string" ? part.type : "";
          const text = typeof part?.text === "string" ? part.text : "";
          if (!eventId) return;

          if (partType === "delta" || partType === "end" || (partType === "start" && text)) {
            upsertAssistantStreamChunk(eventId, text);
          }
          return;
        }

        const fullText =
          typeof (msg as any)?.text === "string"
            ? (msg as any).text
            : typeof (msg as any)?.agent_response_event?.text === "string"
              ? (msg as any).agent_response_event.text
              : null;
        if (fullText) {
          setMessages((xs) => [...xs, { id: `a_${Date.now()}`, role: "assistant", text: fullText }]);
          return;
        }

        if (msg?.type === "error" || msg?.type === "error_message") {
          const err =
            typeof (msg as any)?.message === "string"
              ? String((msg as any).message)
              : typeof (msg as any)?.detail === "string"
                ? String((msg as any).detail)
                : "Chat error";
          appendAssistantError(err);
        }
      });

      ws.addEventListener("close", () => {
        readyRef.current = false;
        if (wsRef.current === ws) wsRef.current = null;
        setStatus((s) => (s === "error" ? s : "idle"));
        connectPromiseRef.current = null;
      });

      return ws;
    })();

    return await connectPromiseRef.current;
  }

  async function send(raw: string) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return;
    if (!agentId) return;

    setInput("");
    setMessages((xs) => [...xs, { id: `u_${Date.now()}`, role: "user", text: trimmed }]);

    queuedRef.current.push({ type: "user_message", text: trimmed });
    lastSendAtRef.current = Date.now();

    const INBOUND_IDLE_BEFORE_SEND_MS = 2 * 60_000;
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN && Date.now() - lastInboundAtRef.current > INBOUND_IDLE_BEFORE_SEND_MS) {
      try {
        existing.close(1000, "stale");
      } catch {
        // ignore
      }
    }

    const ws = await ensureConnected();
    if (!ws) return;

    if (readyRef.current && ws.readyState === WebSocket.OPEN) {
      while (queuedRef.current.length > 0) {
        const ev = queuedRef.current.shift();
        if (!ev) break;
        ws.send(JSON.stringify(ev));
      }
    }

    scrollToBottom(true);
  }

  useEffect(() => {
    if (!open) return;
    scrollToBottom(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollToBottom(false);
  }, [messages, open]);

  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close(1000, "unmount");
      } catch {
        // ignore
      }
    };
  }, []);

  const userBubbleStyle = useMemo(() => {
    return { backgroundColor: "var(--convai-primary)", color: "var(--convai-on-primary)" } as React.CSSProperties;
  }, []);

  const sendButtonStyle = useMemo(() => {
    return { backgroundColor: "var(--convai-primary)", color: "var(--convai-on-primary)" } as React.CSSProperties;
  }, []);

  const panelOpenAbove = placementY !== "top";

  return (
    <div style={{ ...positionStyle, ...(cssVars as any) }} data-funnel-editor-interactive="true">
      {open ? (
        <div
          className={
            "w-[min(92vw,420px)] overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl " +
            (panelOpenAbove ? "mb-3" : "mt-3")
          }
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-zinc-900">{panelTitle}</div>
              <div className="mt-0.5 text-xs font-semibold text-zinc-600">
                {status === "connected" ? "Connected" : status === "connecting" ? "Connecting…" : panelSubtitle}
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
                        ? "max-w-[85%] rounded-2xl px-3 py-2 text-sm font-semibold"
                        : "max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                    }
                    style={m.role === "user" ? userBubbleStyle : undefined}
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
                placeholder={agentId ? "Type a message…" : "Set an Agent ID to chat…"}
                disabled={!agentId}
                className="min-h-11 flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-(--convai-link) disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!canSend || !agentId}
                className="inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-bold hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                style={sendButtonStyle}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void ensureConnected();
          }}
          className="group inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-3 shadow-lg hover:bg-zinc-50"
          aria-label="Open chat"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ backgroundColor: "var(--convai-primary)", color: "var(--convai-on-primary)" } as any}
          >
            {launcherImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={launcherImageUrl} alt="Chat" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              launcherIcon(launcherStyle)
            )}
          </span>
          <span className="text-left">
            <div className="text-sm font-bold text-zinc-900">{panelTitle}</div>
            <div className="text-xs font-semibold text-zinc-600">{panelSubtitle}</div>
          </span>
        </button>
      ) : null}
    </div>
  );
}
