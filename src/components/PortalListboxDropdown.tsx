"use client";

import { useEffect, useRef, useState } from "react";

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
}) {
  const { value, options, onChange, className } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const current = options.find((o) => o.value === value) ?? { value, label: value };

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className={"relative " + (className || "")}> 
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current.label}</span>
        <span className="shrink-0 text-xs text-zinc-500">▾</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
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
      ) : null}
    </div>
  );
}
