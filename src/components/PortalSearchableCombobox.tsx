"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PortalSearchableOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  keywords?: string[];
};

function normalize(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function PortalSearchableCombobox(props: {
  query: string;
  onQueryChange: (value: string) => void;
  options: PortalSearchableOption[];
  onSelect: (option: PortalSearchableOption) => void;
  selectedValue?: string;
  placeholder?: string;
  disabled?: boolean;
  emptyLabel?: string;
  inputClassName?: string;
  menuClassName?: string;
}) {
  const {
    query,
    onQueryChange,
    options,
    onSelect,
    selectedValue,
    placeholder,
    disabled = false,
    emptyLabel = "No matches",
    inputClassName,
    menuClassName,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = [option.label, option.hint || "", ...(option.keywords || [])]
        .map((part) => normalize(part))
        .join(" ");
      return haystack.includes(needle);
    });
  }, [options, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  const selectOption = (option: PortalSearchableOption) => {
    if (option.disabled) return;
    onSelect(option);
    setOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className={
            (inputClassName ||
              "pa-portal-combobox-input w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm text-zinc-900 outline-none focus:border-zinc-300") +
            (disabled ? " cursor-not-allowed opacity-60" : "")
          }
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onQueryChange(event.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
              setOpen(true);
              return;
            }
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.min(filteredOptions.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter") {
              const option = filteredOptions[highlightedIndex];
              if (!option) return;
              event.preventDefault();
              selectOption(option);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (disabled) return;
            setOpen((value) => !value);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-xs text-zinc-500"
          aria-label="Toggle options"
        >
          ▾
        </button>
      </div>

      {open ? (
        <div
          className={
            (menuClassName || "pa-portal-combobox-menu absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg")
          }
        >
          <div className="max-h-64 overflow-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">{emptyLabel}</div>
            ) : (
              filteredOptions.map((option, index) => {
                const selected = option.value === selectedValue;
                const highlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option)}
                    className={
                      "pa-portal-combobox-option flex w-full items-start justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition " +
                      (option.disabled
                        ? "cursor-not-allowed text-zinc-400"
                        : selected
                          ? "bg-(--color-brand-blue) text-white"
                          : highlighted
                            ? "bg-zinc-50 text-zinc-900"
                            : "text-zinc-900")
                    }
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{option.label}</div>
                      {option.hint ? (
                        <div className={"mt-0.5 truncate text-xs " + (selected ? "text-white/80" : "text-zinc-500")}>
                          {option.hint}
                        </div>
                      ) : null}
                    </div>
                    {selected ? <div className="shrink-0 text-xs">✓</div> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
