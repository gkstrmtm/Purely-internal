"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BASE_POPUP_Z_INDEX, popupZIndexForAnchor } from "@/components/popupLayering";

export type PortalSingleSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeValue(v: string) {
  return v.trim();
}

export function PortalSingleSelectDropdown(props: {
  label?: string;
  value: string;
  options: PortalSingleSelectOption[];
  onChange: (next: string) => void;
  allowCustom?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  portal?: boolean;
  disabled?: boolean;
  buttonClassName?: string;
}) {
  const {
    value,
    options,
    onChange,
    allowCustom = true,
    placeholder,
    emptyLabel = "No matches",
    portal = true,
    disabled = false,
    buttonClassName,
  } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [menuRect, setMenuRect] = useState<null | { left: number; top: number; width: number; placement: "down" | "up" }>(null);
  const [menuZIndex, setMenuZIndex] = useState(BASE_POPUP_Z_INDEX);

  const updateMenuRect = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    setMenuZIndex(popupZIndexForAnchor(btn));
    const r = btn.getBoundingClientRect();
    const vw = Math.max(0, window.innerWidth || 0);
    const vh = Math.max(0, window.innerHeight || 0);

    const width = Math.min(Math.max(240, r.width), vw - 16);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
    const spaceBelow = vh - r.bottom;
    const placement: "down" | "up" = spaceBelow >= 280 ? "down" : "up";
    const top = placement === "down" ? Math.min(r.bottom + 8, vh - 8) : Math.max(8, r.top - 8);

    setMenuRect({ left, top, width, placement });
  };

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const current = useMemo(() => {
    const v = normalizeValue(String(value || ""));
    if (!v) return null;
    return options.find((o) => normalizeValue(o.value) === v) ?? { value: v, label: v };
  }, [options, value]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.value}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [options, q]);

  const select = useCallback(
    (vRaw: string) => {
      const v = normalizeValue(vRaw);
      onChange(v);
      setOpen(false);
      setQ("");
    },
    [onChange],
  );

  const addCustom = useCallback(() => {
    const v = normalizeValue(q);
    if (!v) return;
    select(v);
  }, [q, select]);

  const menuNode = useMemo(() => {
    if (!open) return null;

    const qNorm = normalizeValue(q);
    const showAddCustom =
      allowCustom &&
      qNorm &&
      !options.some((o) => normalizeValue(o.value).toLowerCase() === qNorm.toLowerCase());

    const menu = (
      <div
        ref={menuRef}
        className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
        style={{
          position: portal ? "fixed" : ("absolute" as any),
          zIndex: menuZIndex,
          left: portal ? (menuRect?.left ?? 0) : undefined,
          top: portal ? (menuRect?.top ?? 0) : undefined,
          transform: portal && menuRect?.placement === "up" ? "translateY(-100%)" : undefined,
          width: portal ? (menuRect?.width ?? 0) : undefined,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="border-b border-zinc-100 p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder || "Search…"}
            className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (showAddCustom) addCustom();
              }
            }}
            autoFocus
          />
          {showAddCustom ? (
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-(--color-brand-blue) px-3 py-2 text-left text-sm font-semibold text-white hover:opacity-95"
              onClick={() => addCustom()}
            >
              Select “{qNorm}”
            </button>
          ) : null}
        </div>

        <div className="max-h-65 overflow-auto p-1">
          {filtered.length ? (
            filtered.map((o) => {
              const isSel = normalizeValue(o.value) === normalizeValue(value);
              const isDisabled = Boolean(o.disabled);
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={isDisabled}
                  className={
                    "w-full rounded-xl px-3 py-2 text-left text-sm transition " +
                    (isDisabled
                      ? "cursor-not-allowed text-zinc-400"
                      : isSel
                        ? "bg-(--color-brand-blue) text-white"
                        : "hover:bg-zinc-50 text-zinc-900")
                  }
                  onClick={() => {
                    if (isDisabled) return;
                    select(o.value);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-semibold">{o.label}</div>
                    <div className="text-xs">{isSel ? "✓" : ""}</div>
                  </div>
                  {o.hint ? (
                    <div
                      className={
                        "mt-0.5 text-xs " + (isDisabled ? "text-zinc-400" : isSel ? "text-white/80" : "text-zinc-500")
                      }
                    >
                      {o.hint}
                    </div>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm text-zinc-500">{emptyLabel}</div>
          )}
        </div>
      </div>
    );

    if (!portal) return <div className="absolute mt-2 w-full" style={{ zIndex: menuZIndex }}>{menu}</div>;
    if (typeof document === "undefined") return null;
    return createPortal(menu, document.body);
  }, [addCustom, allowCustom, emptyLabel, filtered, menuRect, menuZIndex, open, options, placeholder, portal, q, select, value]);

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
  }, [open, portal]);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      const menuEl = menuRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
      if (ev.target && menuEl && menuEl.contains(ev.target as Node)) return;
      setOpen(false);
      setQ("");
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const buttonLabel = current ? current.label : placeholder ? placeholder : "Select";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={
          (buttonClassName ||
            "flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none hover:bg-zinc-50 focus:border-zinc-400") +
          (disabled ? " cursor-not-allowed opacity-60" : "")
        }
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
        <span className={classNames("truncate", current ? "" : "text-zinc-500")}>{buttonLabel}</span>
        <span className="shrink-0 text-xs text-zinc-500">▾</span>
      </button>

      {open ? menuNode : null}
    </div>
  );
}
