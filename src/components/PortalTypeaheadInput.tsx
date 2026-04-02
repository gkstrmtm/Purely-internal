"use client";

import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { popupZIndexForAnchor } from "@/components/popupLayering";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  suggestions: string[];
  maxSuggestions?: number;
  onBlur?: () => void;
};

function uniqLower(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of xs) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export function PortalTypeaheadInput(props: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [popupZIndex, setPopupZIndex] = useState(() => popupZIndexForAnchor(null));

  const list = useMemo(() => {
    const q = (props.value || "").trim().toLowerCase();
    const base = uniqLower(props.suggestions);
    const filtered = q
      ? base.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      : base;
    return filtered.slice(0, Math.max(1, Math.min(20, props.maxSuggestions ?? 8)));
  }, [props.suggestions, props.value, props.maxSuggestions]);

  function recomputePos() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setPopupZIndex(popupZIndexForAnchor(el));
  }

  useEffect(() => {
    if (!open) return;
    recomputePos();

    const onScroll = () => recomputePos();
    const onResize = () => recomputePos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        className={props.className}
        onFocus={() => {
          setOpen(true);
          queueMicrotask(() => recomputePos());
        }}
        onBlur={() => {
          props.onBlur?.();
          // Delay so click can select an item.
          window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          props.onChange(e.target.value);
          if (!open) setOpen(true);
          queueMicrotask(() => recomputePos());
        }}
      />

      {open && pos && list.length > 0
        ? createPortal(
            <div
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: popupZIndex,
              }}
              className="rounded-xl border border-zinc-200 bg-white shadow-xl"
              onMouseDown={(e) => {
                // Prevent input blur from closing before click.
                e.preventDefault();
              }}
            >
              <div className="max-h-55 overflow-auto p-1">
                {list.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-50"
                    onClick={() => {
                      props.onChange(s);
                      setOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
