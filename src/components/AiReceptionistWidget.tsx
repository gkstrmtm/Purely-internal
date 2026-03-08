"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ChatMessage = { role: "assistant" | "user"; text: string };

function formatPrettyPhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const n = digits.slice(1);
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return raw;
}

function toTelHref(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.startsWith("+") || digits.startsWith("tel:")) return raw;
  return `tel:${raw}`;
}

export function AiReceptionistWidget() {
  const pathname = usePathname() || "";

  // Hide on portal marketing and onboarding pages. Keep it available inside the logged-in portal app.
  const hideOnPortal = pathname.startsWith("/portal") && !pathname.startsWith("/portal/app");
  const hideOnLogin = pathname === "/login" || pathname === "/portal/login";
  const hidden = hideOnPortal || hideOnLogin;

  const phone = process.env.NEXT_PUBLIC_AI_RECEPTIONIST_PHONE || "980-238-3381";
  const telHref = useMemo(() => toTelHref(phone), [phone]);
  const prettyPhone = useMemo(() => formatPrettyPhone(phone), [phone]);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text:
        "Hi, I am Purely Automation's AI receptionist. Tell me what you are trying to automate and I will point you to the right place. You can also call me if you want voice.",
    },
  ]);

  function addAssistant(text: string) {
    setMessages((cur) => [...cur, { role: "assistant", text }]);
  }

  function sendText(raw: string) {
    const text = String(raw || "").trim();
    if (!text) return;

    setMessages((cur) => [...cur, { role: "user", text }]);

    const t = text.toLowerCase();
    if (t.includes("price") || t.includes("pricing") || t.includes("package")) {
      addAssistant(
        "We have three common packages. The Brand Builder is for building trust and staying visible. The Sales Loop is for converting leads faster with less work. The Launch Kit is for getting established quickly with a strong funnel and a clean foundation. If you tell me your industry and goal, I will recommend one.",
      );
      return;
    }

    if (t.includes("book") || t.includes("call") || t.includes("demo")) {
      addAssistant("You can book a call here, or tap Call to talk now.");
      return;
    }

    addAssistant(
      "Got it. If you share your current tools and what you want to happen automatically, I will suggest the fastest path. For voice, tap Call.",
    );
  }

  function onSend() {
    const text = String(input || "").trim();
    if (!text) return;
    setInput("");
    sendText(text);
  }

  if (hidden) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="mb-3 w-[min(92vw,380px)] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-zinc-900">AI receptionist</div>
              <div className="mt-0.5 text-xs font-semibold text-zinc-600">Call our AI receptionist: {prettyPhone}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Close
            </button>
          </div>

          <div className="max-h-[340px] space-y-3 overflow-auto px-4 py-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={
                  "rounded-2xl px-3 py-2 text-sm leading-relaxed " +
                  (m.role === "user" ? "ml-8 bg-zinc-900 text-white" : "mr-8 bg-zinc-100 text-zinc-900")
                }
              >
                {m.text}
              </div>
            ))}

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
              <div className="font-semibold text-zinc-900">Quick picks</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  "I want more booked calls",
                  "I need faster lead follow up",
                  "I want automated blogs",
                  "What package should I pick",
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      sendText(t);
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 bg-white p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message"
                className="h-11 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSend();
                }}
              />
              <button
                type="button"
                onClick={onSend}
                className="h-11 rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95"
              >
                Send
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={telHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-4 text-sm font-bold text-white hover:opacity-95"
              >
                Call
              </a>
              <Link
                href="/book-a-call"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Book a call
              </Link>
            </div>

            <div className="mt-2 text-center text-[11px] text-zinc-500">
              ElevenLabs agent wiring is coming soon.
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-3 shadow-lg hover:bg-zinc-50"
        aria-label="Open AI receptionist"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7.5 3.5h2.2c.6 0 1 .4 1 1 0 1 .2 2 .6 2.9.2.4.1.9-.2 1.2l-1.6 1.6c1.4 2.6 3.5 4.7 6.1 6.1l1.6-1.6c.3-.3.8-.4 1.2-.2.9.4 1.9.6 2.9.6.6 0 1 .4 1 1v2.2c0 .8-.7 1.5-1.5 1.5C10.2 21.8 2.2 13.8 2.2 5c0-.8.7-1.5 1.5-1.5H7.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <span className="text-left">
          <div className="text-sm font-bold text-zinc-900">Call our AI receptionist</div>
          <div className="text-xs font-semibold text-zinc-600">{prettyPhone}</div>
        </span>
      </button>
    </div>
  );
}
