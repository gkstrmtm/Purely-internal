"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { AppModal } from "@/components/AppModal";
import { IconCopy } from "@/app/portal/PortalIcons";

type ToastKind = "error" | "success" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  push: (toast: { kind: ToastKind; message: string }) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, any>>(new Map());

  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);
  const [errorDetailsMessage, setErrorDetailsMessage] = useState("");

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: { kind: ToastKind; message: string }) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const item: ToastItem = { id, kind: toast.kind, message: String(toast.message || "").slice(0, 4000) };

      setToasts((prev) => [item, ...prev].slice(0, 3));

      const timeout = setTimeout(() => remove(id), toast.kind === "error" ? 6000 : 3500);
      timeoutsRef.current.set(id, timeout);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      error: (message) => push({ kind: "error", message }),
      success: (message) => push({ kind: "success", message }),
      info: (message) => push({ kind: "info", message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <AppModal
        open={errorDetailsOpen}
        title="Error details"
        description="Click Copy to share or inspect the full error."
        onClose={() => setErrorDetailsOpen(false)}
        widthClassName="w-[min(720px,calc(100vw-32px))]"
        closeVariant="x"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(String(errorDetailsMessage || ""));
                  push({ kind: "success", message: "Copied" });
                } catch {
                  push({ kind: "error", message: "Unable to copy" });
                }
              }}
            >
              <IconCopy size={18} />
              Copy
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              onClick={() => setErrorDetailsOpen(false)}
            >
              Close
            </button>
          </div>
        }
      >
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <pre className="whitespace-pre-wrap wrap-break-word text-xs text-zinc-800">{String(errorDetailsMessage || "")}</pre>
        </div>
      </AppModal>

      <div className="pointer-events-none fixed left-0 right-0 top-3 z-9999 flex justify-center px-3">
        <div className="flex w-full max-w-lg flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={classNames(
                "pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
                t.kind === "error"
                  ? "border-rose-200 bg-rose-50/95 text-rose-900"
                  : t.kind === "success"
                    ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
                    : "border-zinc-200 bg-white/95 text-zinc-900",
              )}
              role="status"
              aria-live="polite"
              onClick={() => {
                if (t.kind === "error") {
                  setErrorDetailsMessage(t.message);
                  setErrorDetailsOpen(true);
                }
                remove(t.id);
              }}
            >
              <div className="font-semibold">
                {t.kind === "error" ? "Error" : t.kind === "success" ? "Success" : "Notice"}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{t.message}</div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
