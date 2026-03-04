"use client";

import { useEffect, useMemo, useState } from "react";

import { AppModal } from "@/components/AppModal";

export function LinkUrlModal({
  open,
  initialUrl,
  onClose,
  onSubmit,
  title,
}: {
  open: boolean;
  initialUrl?: string;
  title?: string;
  onClose: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl || "https://");

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl || "https://");
  }, [open, initialUrl]);

  const canSubmit = useMemo(() => {
    const s = url.trim();
    if (!s) return false;
    // Allow mailto/tel and absolute URLs; keep this permissive.
    if (s.startsWith("mailto:")) return true;
    if (s.startsWith("tel:")) return true;
    try {
      // Accept http/https URLs.
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, [url]);

  return (
    <AppModal
      open={open}
      title={title || "Insert link"}
      description="Paste a full URL (https://...) or use mailto:/tel:."
      onClose={onClose}
      widthClassName="w-[min(520px,calc(100vw-32px))]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            onClick={() => {
              const s = url.trim();
              if (!s) return;
              onSubmit(s);
              onClose();
            }}
          >
            Insert
          </button>
        </div>
      }
    >
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Link URL</div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
          autoFocus
          inputMode="url"
        />
      </label>
    </AppModal>
  );
}
