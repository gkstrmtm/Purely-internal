"use client";

import { useEffect, useMemo } from "react";

export type LightboxImage = {
  src: string;
  alt?: string;
};

export function Lightbox({
  open,
  images,
  index,
  onClose,
  onIndexChange,
}: {
  open: boolean;
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const count = images.length;
  const safeIndex = useMemo(() => {
    if (!count) return 0;
    if (!Number.isFinite(index)) return 0;
    return ((Math.floor(index) % count) + count) % count;
  }, [count, index]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!count) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange((safeIndex - 1 + count) % count);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange((safeIndex + 1) % count);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, count, safeIndex, onClose, onIndexChange]);

  if (!open) return null;
  if (!count) return null;

  const img = images[safeIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-zoom-out"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative z-[101] w-full max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl bg-transparent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.alt || ""}
            className="mx-auto max-h-[85vh] w-auto max-w-full select-none object-contain"
            draggable={false}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white hover:bg-black/65"
          >
            ✕
          </button>

          {count > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={() => onIndexChange((safeIndex - 1 + count) % count)}
                className="absolute left-3 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white hover:bg-black/65"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={() => onIndexChange((safeIndex + 1) % count)}
                className="absolute right-3 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white hover:bg-black/65"
              >
                →
              </button>
            </>
          ) : null}

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
            {safeIndex + 1} / {count}
          </div>
        </div>
      </div>
    </div>
  );
}
