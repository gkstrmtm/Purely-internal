"use client";

import React from "react";

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  accent = "blue",
  ariaLabel,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  accent?: "blue" | "pink" | "ink";
  ariaLabel?: string;
  className?: string;
}) {
  const checkedBgClass =
    accent === "pink"
      ? "peer-checked:bg-(--color-brand-pink)"
      : accent === "ink"
        ? "peer-checked:bg-brand-ink"
        : "peer-checked:bg-(--color-brand-blue)";

  return (
    <span className={"relative inline-flex h-6 w-11 shrink-0 items-center " + (className ?? "")}>
      <input
        type="checkbox"
        aria-label={ariaLabel}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 rounded-full bg-zinc-200 transition " +
          checkedBgClass +
          " peer-disabled:opacity-60"
        }
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-60"
      />
    </span>
  );
}
