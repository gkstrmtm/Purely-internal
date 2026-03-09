"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

function toTelHref(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.startsWith("+") || digits.startsWith("tel:")) return raw;
  return `tel:${raw}`;
}

export function AiReceptionistWidget() {
  const pathname = usePathname() || "";

  // Customer-facing widget only: never show in the portal (portal has its own Chat + Report tool).
  const hidden =
    pathname.startsWith("/portal") ||
    pathname === "/login" ||
    pathname === "/portal/login" ||
    pathname === "/ads/login" ||
    pathname.startsWith("/ads/app");

  const phone = process.env.NEXT_PUBLIC_AI_RECEPTIONIST_PHONE || "980-238-3381";
  const telHref = useMemo(() => toTelHref(phone), [phone]);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("pa_help_widget_open");
    if (saved === "1") setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pa_help_widget_open", open ? "1" : "0");
  }, [open]);

  if (hidden) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="mb-3 w-[min(92vw,420px)] overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-zinc-900">Need help?</div>
              <div className="mt-0.5 text-xs font-semibold text-zinc-600">Tap Call to talk to us.</div>
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

          <div className="px-4 py-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              For support, the fastest way is a quick call.
            </div>
          </div>

          <div className="border-t border-zinc-200 bg-white p-3">
            <a
              href={telHref}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-4 text-sm font-bold text-white hover:opacity-95"
            >
              Call
            </a>
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
          <div className="text-xs font-semibold text-zinc-600">Tap to call</div>
        </span>
      </button>
    </div>
  );
}
