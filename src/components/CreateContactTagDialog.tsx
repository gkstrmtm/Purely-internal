"use client";

import { useEffect, useState } from "react";

import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { useOptionalToast } from "@/components/ToastProvider";
import { portalGlassButtonClass } from "@/components/portalGlass";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";

export type CreateContactTagResult = {
  id: string;
  name: string;
  color: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string | null) => Promise<CreateContactTagResult>;
  onCreated?: (tag: CreateContactTagResult) => void | Promise<void>;
  title?: string;
  description?: string;
  confirmLabel?: string;
  initialName?: string;
  initialColor?: string;
};

export function CreateContactTagDialog({
  open,
  onClose,
  onCreate,
  onCreated,
  title = "Create tag",
  description = "Add a reusable tag you can use anywhere.",
  confirmLabel = "Create tag",
  initialName = "",
  initialColor = "#2563EB",
}: Props) {
  const toast = useOptionalToast();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setColor(initialColor);
    setBusy(false);
  }, [initialColor, initialName, open]);

  async function createTag() {
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) return;

    setBusy(true);
    try {
      const created = await onCreate(clean, color || null);
      await onCreated?.(created);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tag creation did not finish. Retry here or choose a different tag name.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-130110 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
      onMouseDown={() => {
        if (busy) return;
        onClose();
      }}
    >
      <LiquidGlassPopupSurface
        className="relative w-full max-w-md overflow-hidden rounded-4xl p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
        showGlass={false}
        showTopGlow={false}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">{title}</div>
            {description ? <div className="mt-1 text-sm text-zinc-600">{description}</div> : null}
          </div>
          <button
            type="button"
            className={classNames(
              portalGlassButtonClass,
              "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:opacity-60",
            )}
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <input
            className="w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
            placeholder="Tag name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter") {
                e.preventDefault();
                void createTag();
              }
            }}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/60 bg-white/35 px-3 py-3">
            {DEFAULT_TAG_COLORS.slice(0, 10).map((swatch) => {
              const selected = swatch === color;
              return (
                <button
                  key={swatch}
                  type="button"
                  className={classNames("h-7 w-7 rounded-full transition-transform duration-150 hover:scale-105", selected ? "ring-2 ring-zinc-900/20" : "")}
                  style={{ backgroundColor: swatch }}
                  onClick={() => setColor(swatch)}
                  title={swatch}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-brand-blue/15 focus-visible:outline-none disabled:opacity-60"
            onClick={() => void createTag()}
            disabled={busy || !String(name || "").trim()}
          >
            {busy ? "Creating…" : confirmLabel}
          </button>
        </div>
      </LiquidGlassPopupSurface>
    </div>
  );
}