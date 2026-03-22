import React from "react";

export function InlineSpinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2" aria-label={label}>
      <svg
        className={className ?? "h-4 w-4 animate-spin"}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
      </svg>
    </span>
  );
}
