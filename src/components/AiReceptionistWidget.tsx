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
  | { type: "user_message"; text: string };

export function AiReceptionistWidget() {
  const pathname = usePathname() || "";

  // Customer-facing widget:
  // - show on marketing pages and /portal
  // - never show inside /portal/app (portal app has its own Chat + Report tools)
  const hidden = pathname.startsWith("/portal/app") || pathname === "/login" || pathname === "/ads/login" || pathname.startsWith("/ads/app");

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: "Hi — how can we help?",
    },
  ]);
  const [input, setInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef(false);
  const queuedRef = useRef<OutgoingEvent[]>([]);
  const streamMessageIdByEventIdRef = useRef(new Map<string, string>());
  const endRef = useRef<HTMLDivElement | null>(null);

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
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, open]);

  useEffect(() => {
    return () => {
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
    setMessages((prev) => [
      ...prev,
      {
        id: `err_${Date.now()}`,
        role: "assistant",
        text,
      },
    ]);
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
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing;
    }

    setStatus("connecting");

    const res = await fetch("/api/public/elevenlabs/convai/help-widget-signed-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).catch(() => null);

    const data = await res?.json?.().catch(() => null);
    const signedUrl = data && typeof data.signedUrl === "string" ? data.signedUrl : null;

    if (!res || !res.ok || !signedUrl) {
      setStatus("error");
      const err = data && typeof data.error === "string" ? data.error : "Chat is unavailable right now.";
      appendAssistantError(err);
      return null;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(signedUrl, ["convai"]);
    } catch {
      setStatus("error");
      appendAssistantError("Failed to start chat.");
      return null;
    }

    wsRef.current = ws;
    readyRef.current = false;
    streamMessageIdByEventIdRef.current.clear();

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
      let msg: any;
      try {
        msg = JSON.parse(String((event as MessageEvent).data ?? ""));
      } catch {
        return;
      }

      if (msg?.type === "conversation_initiation_metadata") {
        readyRef.current = true;
        setStatus("connected");
        flushQueue(ws);
        return;
      }

      if (msg?.type === "agent_chat_response_part" && msg?.text_response_part) {
        const part = msg.text_response_part;
        const eventId = typeof part.event_id === "string" ? part.event_id : String(part.event_id ?? "");
        const partType = typeof part.type === "string" ? part.type : "";
        const text = typeof part.text === "string" ? part.text : "";

        if (!eventId) return;

        if (partType === "start") {
          const messageId = `agent_${eventId}`;
          streamMessageIdByEventIdRef.current.set(eventId, messageId);
          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              role: "assistant",
              text: "",
            },
          ]);
          return;
        }

        if (partType === "delta") {
          const messageId = streamMessageIdByEventIdRef.current.get(eventId) ?? `agent_${eventId}`;
          streamMessageIdByEventIdRef.current.set(eventId, messageId);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            if (idx === -1) {
              return [...prev, { id: messageId, role: "assistant", text }];
            }
            const next = prev.slice();
            next[idx] = { ...next[idx], text: (next[idx].text || "") + text };
            return next;
          });
          return;
        }

        return;
      }

      if (msg?.type === "error" || msg?.type === "error_message") {
        const err =
          typeof msg?.message === "string"
            ? msg.message
            : typeof msg?.detail === "string"
              ? msg.detail
              : "Chat error";
        appendAssistantError(err);
      }
    });

    ws.addEventListener("close", () => {
      readyRef.current = false;
      if (wsRef.current === ws) wsRef.current = null;
      setStatus((s) => (s === "error" ? s : "idle"));
    });

    ws.addEventListener("error", () => {
      setStatus("error");
    });

    return ws;
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
                {status === "connected" ? "Chat with us" : status === "connecting" ? "Connecting…" : "Message us"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
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
                    {m.text || (m.role === "assistant" ? "…" : "")}
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
                className="min-h-[44px] flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-brand-blue"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-4 text-sm font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
