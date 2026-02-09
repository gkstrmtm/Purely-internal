"use client";

import { useMemo, useState } from "react";

import type { TemplateVariable } from "@/lib/portalTemplateVars";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function groupOrder(group: TemplateVariable["group"]) {
  switch (group) {
    case "Contact":
      return 10;
    case "Lead":
      return 20;
    case "Booking":
      return 25;
    case "Business":
      return 30;
    case "Owner":
      return 40;
    case "User":
      return 50;
    case "Message":
      return 60;
    case "Custom":
      return 70;
    default:
      return 999;
  }
}

export function PortalVariablePickerModal(props: {
  open: boolean;
  title?: string;
  variables: TemplateVariable[];
  onPick: (variableKey: string) => void;
  onClose: () => void;
}) {
  const { open, title, variables, onPick, onClose } = props;
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = Array.isArray(variables) ? variables : [];
    const sorted = base
      .slice()
      .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.label.localeCompare(b.label));

    if (!q) return sorted;
    return sorted.filter((v) => {
      const hay = `${v.label} ${v.key} ${v.group} ${v.appliesTo}`.toLowerCase();
      return hay.includes(q);
    });
  }, [variables, query]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onMouseDown={onClose} aria-hidden />
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" aria-modal role="dialog">
        <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">{title || "Insert variable"}</div>
              <div className="mt-1 text-xs text-zinc-500">Click to insert into your message.</div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="p-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search variables…"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              autoFocus
            />

            <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-2xl border border-zinc-100">
              {filtered.length ? (
                filtered.map((v) => (
                  <button
                    key={`${v.group}:${v.key}`}
                    type="button"
                    onClick={() => {
                      onPick(v.key);
                      onClose();
                    }}
                    className={classNames(
                      "flex w-full items-start justify-between gap-3 px-4 py-3 text-left",
                      "hover:bg-zinc-50",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{v.label}</div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500">
                        <span className="font-mono">{`{${v.key}}`}</span>
                        <span className="mx-2">·</span>
                        <span>{v.appliesTo}</span>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-700">
                      {v.group}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-zinc-600">No variables found.</div>
              )}
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Works in SMS, email, and task text. Unknown variables stay unchanged.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
