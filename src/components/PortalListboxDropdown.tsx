"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type PortalListboxOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
};

export function PortalListboxDropdown<T extends string>(props: {
  value: T;
  options: Array<PortalListboxOption<T>>;
  onChange: (v: T) => void;
  className?: string;
  portal?: boolean;
}) {
  const { value, options, onChange, className, portal = true } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [menuRect, setMenuRect] = useState<null | { left: number; top: number; width: number; placement: "down" | "up" }>(null);

  const current = options.find((o) => o.value === value) ?? { value, label: value };

  const updateMenuRect = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = Math.max(0, window.innerWidth || 0);
    const vh = Math.max(0, window.innerHeight || 0);

    const width = Math.min(Math.max(180, r.width), vw - 16);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));

    const approxMenuHeight = 320;
    const spaceBelow = vh - r.bottom;
    const placement: "down" | "up" = spaceBelow >= 240 ? "down" : "up";
    const top = placement === "down" ? Math.min(r.bottom + 8, vh - 8) : Math.max(8, r.top - 8);

    setMenuRect({ left, top, width, placement });
  };

  const menuNode = useMemo(() => {
    if (!open) return null;

    const menu = (
      <div
        ref={menuRef}
        className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
        style={{
          position: portal ? "fixed" : ("absolute" as any),
          zIndex: 100000,
          left: portal ? (menuRect?.left ?? 0) : undefined,
          top: portal ? (menuRect?.top ?? 0) : undefined,
          transform: portal && menuRect?.placement === "up" ? "translateY(-100%)" : undefined,
          width: portal ? (menuRect?.width ?? 0) : undefined,
          marginTop: portal ? 0 : undefined,
        }}
        onMouseDown={(e) => {
          // Avoid parent mousedown handlers (e.g. canvas drag / outside click) firing first.
          e.stopPropagation();
        }}
      >
        <div className="max-h-[260px] overflow-auto p-1">
          {options.map((o) => {
            const isSel = o.value === value;
            const disabled = Boolean(o.disabled);
            return (
              <button
                key={o.value}
                type="button"
                className={
                  "w-full rounded-xl px-3 py-2 text-left text-sm transition " +
                  (disabled
                    ? "cursor-not-allowed text-zinc-400"
                    : isSel
                      ? "bg-zinc-900 text-white"
                      : "hover:bg-zinc-50 text-zinc-900")
                }
                onClick={() => {
                  if (disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-semibold">{o.label}</div>
                  {isSel ? <div className="text-xs">✓</div> : null}
                </div>
                {o.hint ? (
                  <div className={"mt-0.5 text-xs " + (disabled ? "text-zinc-400" : "text-zinc-500")}>{o.hint}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );

    if (!portal) {
      return <div className="absolute z-50 mt-2 w-full">{menu}</div>;
    }

    if (typeof document === "undefined") return null;
    return createPortal(menu, document.body);
  }, [menuRect, onChange, open, options, portal, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      const menuEl = menuRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
      if (ev.target && menuEl && menuEl.contains(ev.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateMenuRect();
    const onResize = () => updateMenuRect();
    const onScroll = () => updateMenuRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, portal]);

  return (
    <div ref={rootRef} className={"relative " + (className || "")}> 
      <button
        ref={buttonRef}
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) window.setTimeout(() => updateMenuRect(), 0);
            return next;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current.label}</span>
        <span className="shrink-0 text-xs text-zinc-500">▾</span>
      </button>

      {open ? menuNode : null}
    </div>
  );
}
