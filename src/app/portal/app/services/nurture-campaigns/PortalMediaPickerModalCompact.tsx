"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

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

export function PortalMediaPickerModalCompact({
  open,
  onClose,
  onPick,
  title,
  confirmLabel,
  variant,
  accept,
  zIndex,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: PortalMediaPickItem) => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
  variant?: PortalVariant;
  accept?: "any" | "image" | "video";
  zIndex?: number;
}) {
  const router = useRouter();
  const nextBase = `/${variant === "credit" ? "credit" : "portal"}`;
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<PortalMediaPickItem[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(
    async (nextQ: string) => {
      setLoading(true);
      setError(null);

      const url = new URL("/api/portal/media/items", window.location.origin);
      url.searchParams.set("limit", "200");
      if (nextQ.trim()) url.searchParams.set("q", nextQ.trim());

      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: variant ? { [PORTAL_VARIANT_HEADER]: variant } : undefined,
      });
      const json = (await res.json().catch(() => null)) as ItemsRes | null;

      if (!res.ok || !json || json.ok !== true) {
        setLoading(false);
        setItems([]);
        setError(typeof (json as any)?.error === "string" ? (json as any).error : "Media did not load. Retry here or open media library.");
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
      setLoading(false);
    },
    [variant],
  );

  const filteredItems = useMemo(() => {
    const mode = accept || "any";
    if (mode === "any") return items;
    const prefix = mode === "image" ? "image/" : "video/";
    return items.filter((it) => String(it.mimeType || "").startsWith(prefix));
  }, [accept, items]);

  useEffect(() => {
    if (!open) return;
    void load("");
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(q), 200);
    return () => clearTimeout(t);
  }, [q, open, load]);

  const body = useMemo(() => {
    const baseZ = typeof zIndex === "number" && Number.isFinite(zIndex) ? zIndex : 8000;
    return (
      <div className="fixed inset-0" style={{ zIndex: baseZ }} aria-hidden>
        <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} onTouchStart={onClose} />

        <div
          className={classNames(
            "fixed inset-0 flex items-start justify-center px-4",
            "pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]",
            "sm:items-center",
          )}
          style={{ zIndex: baseZ + 10 }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={classNames(
              "flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl",
              "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)]",
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-zinc-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">{title || "Media library"}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {accept === "video" ? "Videos" : accept === "image" ? "Images" : "Files"} from your media library.
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Close media library"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/78 text-base font-semibold text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] transition-colors duration-150 hover:bg-white hover:text-zinc-800"
                  onClick={onClose}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by filename or tag…"
                className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
              />

              {error ? (
                <div className="mt-3 rounded-3xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <div className="font-semibold text-red-900">Media picker needs attention</div>
                  <div className="mt-1">{error}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                      onClick={() => {
                        void load(q);
                      }}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                      onClick={() => {
                        onClose();
                        router.push(`${nextBase}/app/services/media-library`, { scroll: false });
                      }}
                    >
                      Open media library
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                {loading ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : filteredItems.length ? (
                  <div className="space-y-2">
                    {filteredItems.map((it) => {
                      const isImg = it.mimeType.startsWith("image/");
                      const isVideo = it.mimeType.startsWith("video/");
                      return (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {isImg && it.previewUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={it.previewUrl} alt={it.fileName} className="h-10 w-10 rounded-2xl object-cover" />
                            ) : isVideo ? (
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                                VIDEO
                              </div>
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
                            className="shrink-0 rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
                    <div className="font-semibold text-zinc-900">No files found</div>
                    <div className="mt-2 leading-6">
                      {q.trim()
                        ? "Nothing matches this search yet. Clear the filter or open Media Library to upload something new."
                        : "This workspace does not have any files ready yet. Open Media Library to upload assets first."}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {q.trim() ? (
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => setQ("")}
                        >
                          Clear search
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                        onClick={() => {
                          onClose();
                          router.push(`${nextBase}/app/services/media-library`, { scroll: false });
                        }}
                      >
                        Open media library
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }, [accept, busy, confirmLabel, error, filteredItems, load, loading, nextBase, onClose, onPick, q, router, title, zIndex]);

  if (!open || !mounted || typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
