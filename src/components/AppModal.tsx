"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

import { portalGlassBackdropClass, portalGlassButtonClass, portalGlassPanelClass } from "@/components/portalGlass";

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
  headerActions,
  widthClassName,
  zIndex,
  closeVariant = "x",
  hideHeaderDivider = true,
  hideFooterDivider = true,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  widthClassName?: string;
  zIndex?: number;
  closeVariant?: "text" | "x";
  hideHeaderDivider?: boolean;
  hideFooterDivider?: boolean;
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

    const baseZ = Number.isFinite(zIndex as number) ? (zIndex as number) : 8000;

    return (
      <div className="fixed inset-0" style={{ zIndex: baseZ }} aria-hidden>
        <button
          type="button"
          className={classNames("absolute inset-0 cursor-default", portalGlassBackdropClass)}
          onClick={onClose}
          aria-label="Close modal"
        />

        <div
          className={classNames(
            "fixed inset-0 flex items-start justify-center px-4",
            "pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]",
            "sm:items-center",
          )}
          style={{ zIndex: baseZ + 10 }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          data-overlay-root="true"
        >
          <div
            className={classNames(
              "flex w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl",
              "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)]",
              portalGlassPanelClass,
              widthClassName,
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className={classNames("shrink-0 p-5", hideHeaderDivider ? "" : "border-b border-white/30")}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-zinc-900">{title}</div>
                  {description ? <div className="mt-1 text-sm text-zinc-600">{description}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {headerActions}
                  <button
                    type="button"
                    className={classNames(
                      "shrink-0 select-none transition-all duration-150 hover:-translate-y-0.5",
                      closeVariant === "x"
                        ? classNames(
                            "grid h-10 w-10 place-items-center rounded-full text-lg leading-none font-semibold text-zinc-500 hover:scale-105 hover:bg-white/80 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]",
                            portalGlassButtonClass,
                          )
                        : classNames("rounded-2xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-white/80", portalGlassButtonClass)
                    )}
                    onClick={onClose}
                    aria-label="Close"
                  >
                    {closeVariant === "x" ? "×" : "Close"}
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

            {footer ? <div className={classNames("shrink-0 p-4", hideFooterDivider ? "" : "border-t border-white/30")}>{footer}</div> : null}
          </div>
        </div>
      </div>
    );
  }, [children, closeVariant, description, footer, headerActions, hideFooterDivider, hideHeaderDivider, onClose, open, title, widthClassName, zIndex]);

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
            className={classNames("rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-white/80", portalGlassButtonClass)}
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
