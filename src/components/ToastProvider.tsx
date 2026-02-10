"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

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

      setToasts((prev) => [item, ...prev].slice(0, 5));

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
      <div className="pointer-events-none fixed left-0 right-0 top-3 z-[9999] flex justify-center px-3">
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
              onClick={() => remove(t.id)}
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
