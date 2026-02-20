"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function AppModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const body = useMemo(() => {
    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[80]" aria-hidden>
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-black/30"
          onClick={onClose}
          aria-label="Close modal"
        />

        <div
          className={classNames(
            "fixed left-1/2 top-1/2 z-[90] max-h-[calc(100vh-32px)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl",
            widthClassName,
          )}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-5">
            <div className="min-w-0">
              <div className="text-base font-semibold text-zinc-900">{title}</div>
              {description ? <div className="mt-1 text-sm text-zinc-600">{description}</div> : null}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="max-h-[calc(100vh-32px-78px-72px)] overflow-y-auto p-5">{children}</div>

          {footer ? <div className="border-t border-zinc-100 p-4">{footer}</div> : null}
        </div>
      </div>
    );
  }, [children, description, footer, onClose, open, title, widthClassName]);

  if (!mounted) return null;
  if (!body) return null;
  return createPortal(body, document.body);
}

export function AppConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <AppModal
      open={open}
      title={title}
      description={message}
      onClose={onClose}
      widthClassName="w-[min(520px,calc(100vw-32px))]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            onClick={onClose}
          >
            {cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-brand-ink hover:opacity-95",
            )}
            onClick={onConfirm}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      }
    >
      <div />
    </AppModal>
  );
}
