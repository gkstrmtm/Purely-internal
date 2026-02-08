"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

export type PortalMediaPickItem = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tag: string;
  downloadUrl: string;
  shareUrl: string;
  previewUrl?: string;
};

type ItemsRes =
  | { ok: true; items: PortalMediaPickItem[] }
  | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let idx = 0;
  let v = n;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  return `${v.toFixed(v >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function PortalMediaPickerModal({
  open,
  onClose,
  onPick,
  title,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: PortalMediaPickItem) => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PortalMediaPickItem[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function load(nextQ: string) {
    setLoading(true);
    setError(null);

    const url = new URL("/api/portal/media/items", window.location.origin);
    url.searchParams.set("limit", "200");
    if (nextQ.trim()) url.searchParams.set("q", nextQ.trim());

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ItemsRes | null;

    if (!res.ok || !json || json.ok !== true) {
      setLoading(false);
      setItems([]);
      setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load media");
      return;
    }

    setItems(Array.isArray(json.items) ? json.items : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    void load("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(q), 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const body = useMemo(() => {
    return (
      <div className="fixed inset-0 z-[80]" aria-hidden>
        <div
          className="absolute inset-0 bg-black/30"
          onMouseDown={onClose}
          onTouchStart={onClose}
        />

        <div
          className="fixed left-1/2 top-1/2 z-[90] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-5">
            <div>
              <div className="text-base font-semibold text-zinc-900">{title || "Attach from media library"}</div>
              <div className="mt-1 text-sm text-zinc-600">Pick a file to attach.</div>
            </div>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="p-5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by filename or tag…"
              className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm"
            />

            {error ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="mt-4 max-h-[55vh] overflow-auto">
              {loading ? (
                <div className="text-sm text-zinc-600">Loading…</div>
              ) : items.length ? (
                <div className="space-y-2">
                  {items.map((it) => {
                    const isImg = it.mimeType.startsWith("image/");
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {isImg && it.previewUrl ? (
                            <img src={it.previewUrl} alt={it.fileName} className="h-10 w-10 rounded-2xl object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                              FILE
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900">{it.fileName}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                              <span className="font-mono">tag: {it.tag}</span>
                              <span>•</span>
                              <span>{formatBytes(it.fileSize)}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busy}
                          className={classNames(
                            "shrink-0 rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60",
                          )}
                          onClick={async () => {
                            if (busy) return;
                            setBusy(true);
                            try {
                              await onPick(it);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {confirmLabel || "Attach"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                  No files found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }, [busy, confirmLabel, error, items, loading, onClose, onPick, q, title]);

  if (!open || !mounted || typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
