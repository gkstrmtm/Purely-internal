"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  buttonId?: string;
  className?: string;
  buttonClassName?: string;
  portal?: boolean;
  disabled?: boolean;
  placeholder?: string;
  getOptionStyle?: (opt: PortalListboxOption<T>) => CSSProperties | undefined;
  getButtonLabelStyle?: (opt: PortalListboxOption<T> | null) => CSSProperties | undefined;
  renderOptionRight?: (opt: PortalListboxOption<T>, state: { selected: boolean; disabled: boolean }) => ReactNode;
}) {
  const {
    value,
    options,
    onChange,
    buttonId,
    className,
    buttonClassName,
    portal = true,
    disabled = false,
    placeholder,
    getOptionStyle,
    getButtonLabelStyle,
    renderOptionRight,
  } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [menuRect, setMenuRect] = useState<null | {
    left: number;
    top: number;
    width: number;
    placement: "down" | "up";
    maxHeight: number;
  }>(null);
  const [menuHeightPx, setMenuHeightPx] = useState<number | null>(null);

  const current = options.find((o) => o.value === value) ?? null;
  const currentLabel = current ? current.label : placeholder ? placeholder : String(value ?? "");

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const updateMenuRect = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = Math.max(0, window.innerWidth || 0);
    const vh = Math.max(0, window.innerHeight || 0);

    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    const estimatedMenuHeight = 280;
    const menuH = Number.isFinite(menuHeightPx as number) ? Math.max(0, menuHeightPx as number) : estimatedMenuHeight;

    // Keep menus usable even for very tall option lists.
    const desiredH = Math.min(menuH, 360);

    const width = Math.min(Math.max(180, r.width), vw - 16);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;

    const wantsDown = spaceBelow >= desiredH + 16 || spaceBelow >= spaceAbove;
    const placement: "down" | "up" = wantsDown ? "down" : "up";

    const available = (placement === "down" ? spaceBelow : spaceAbove) - 16;
    const maxHeight = clamp(Number.isFinite(available) ? available : desiredH, 120, desiredH);
    const menuPosH = Math.min(desiredH, maxHeight);
    const top =
      placement === "down"
        ? clamp(r.bottom + 8, 8, vh - 8 - menuPosH)
        : clamp(r.top - 8 - menuPosH, 8, vh - 8 - menuPosH);

    setMenuRect({ left, top, width, placement, maxHeight });
  }, [menuHeightPx]);

  const menuNode = useMemo(() => {
    if (!open) return null;

    const menu = (
      <div
        ref={menuRef}
        className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
        style={{
          position: portal ? "fixed" : ("static" as any),
          zIndex: 120100,
          left: portal ? (menuRect?.left ?? 0) : undefined,
          top: portal ? (menuRect?.top ?? 0) : undefined,
          width: portal ? (menuRect?.width ?? 0) : undefined,
          marginTop: portal ? 0 : undefined,
        }}
        onMouseDown={(e) => {
          // Avoid parent mousedown handlers (e.g. canvas drag / outside click) firing first.
          e.stopPropagation();
        }}
      >
        <div className="overflow-auto p-1" style={{ maxHeight: menuRect?.maxHeight ?? 280 }}>
          {options.map((o) => {
            const isSel = o.value === value;
            const disabled = Boolean(o.disabled);
            const hintClassName = disabled ? "text-zinc-400" : isSel ? "text-white/80" : "text-zinc-600";
            return (
              <button
                key={o.value}
                type="button"
                title={o.label}
                className={
                  "w-full rounded-xl px-3 py-2 text-left text-sm transition " +
                  (disabled
                    ? "cursor-not-allowed text-zinc-400"
                    : isSel
                      ? "bg-(--color-brand-blue) text-white"
                      : "hover:bg-zinc-50 text-zinc-900")
                }
                onClick={() => {
                  if (disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-semibold" title={o.label} style={getOptionStyle?.(o)}>
                    {o.label}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {renderOptionRight ? renderOptionRight(o, { selected: isSel, disabled }) : null}
                    {isSel ? <div className="text-xs">✓</div> : null}
                  </div>
                </div>
                {o.hint ? (
                  <div className={"mt-0.5 text-xs " + hintClassName}>{o.hint}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );

    if (!portal) {
      const placement = menuRect?.placement ?? "down";
      return (
        <div className={"absolute z-50 w-full " + (placement === "up" ? "bottom-full mb-2" : "top-full mt-2")}>{menu}</div>
      );
    }

    if (typeof document === "undefined") return null;
    return createPortal(menu, document.body);
  }, [getOptionStyle, menuRect, onChange, open, options, portal, renderOptionRight, value]);

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
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
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
    window.setTimeout(() => updateMenuRect(), 0);
    const onResize = () => updateMenuRect();
    const onScroll = () => updateMenuRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, portal, menuHeightPx, updateMenuRect]);

  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setMenuHeightPx(Number.isFinite(h) ? Math.max(0, Math.ceil(h)) : null);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [open, options.length]);

  return (
    <div ref={rootRef} className={"relative z-120000 " + (className || "")}> 
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        disabled={disabled}
        className={
          (buttonClassName ||
            "flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50") +
          (disabled ? " cursor-not-allowed opacity-60" : "")
        }
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => {
            const next = !v;
            if (next) window.setTimeout(() => updateMenuRect(), 0);
            return next;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={
            "truncate " +
            (!current && placeholder
              ? "text-zinc-500"
              : current
                ? "font-semibold text-(--color-brand-blue)"
                : "")
          }
          title={typeof currentLabel === "string" ? currentLabel : String(currentLabel)}
          style={current ? (getButtonLabelStyle ? getButtonLabelStyle(current) : getOptionStyle?.(current)) : undefined}
        >
          {currentLabel}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">▾</span>
      </button>

      {open ? menuNode : null}
    </div>
  );
}
