"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isValidDate(d: Date) {
  return Number.isFinite(d.getTime());
}

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(ymd || ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function parseHm(hm: string): { h: number; m: number } | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(hm || ""));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  if (h < 0 || h > 23) return null;
  if (mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

function dateFromParts(ymd: string, hm: string): Date | null {
  const ymdP = parseYmd(ymd);
  const hmP = parseHm(hm);
  if (!ymdP || !hmP) return null;
  const d = new Date(ymdP.y, ymdP.m - 1, ymdP.d, hmP.h, hmP.m, 0, 0);
  if (!isValidDate(d)) return null;
  // Guard against overflow (e.g. 2026-02-31).
  if (d.getFullYear() !== ymdP.y || d.getMonth() !== ymdP.m - 1 || d.getDate() !== ymdP.d) return null;
  return d;
}

function toLocalDateTimeValue(d: Date) {
  return `${formatYmd(d)}T${formatHm(d)}`;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, delta: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x;
}

function addDays(d: Date, delta: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function monthLabel(d: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(d);
}

function makeMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const firstDay = first.getDay(); // 0=Sun
  const gridStart = addDays(first, -firstDay);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) days.push(addDays(gridStart, i));
  return days;
}

export function LocalDateTimePicker(props: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
  popoverClassName?: string;
  placeholder?: string;
}) {
  const { value, onChange, disabled = false, buttonClassName, popoverClassName, placeholder } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const parsedValue = useMemo(() => {
    const raw = String(value || "").trim();
    const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/.exec(raw);
    if (!m) return null;
    const d = dateFromParts(m[1], m[2]);
    if (!d) return null;
    return { ymd: m[1], hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, date: d };
  }, [value]);

  const [open, setOpen] = useState(false);

  const [draftYmd, setDraftYmd] = useState<string>(() => parsedValue?.ymd || formatYmd(new Date()));
  const [draftHm, setDraftHm] = useState<string>(() => parsedValue?.hm || "09:00");
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(parsedValue?.date || new Date()));

  useEffect(() => {
    if (!open) return;
    setDraftYmd(parsedValue?.ymd || formatYmd(new Date()));
    setDraftHm(parsedValue?.hm || "09:00");
    setViewMonth(startOfMonth(parsedValue?.date || new Date()));
  }, [open, parsedValue?.date, parsedValue?.hm, parsedValue?.ymd]);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const displayLabel = (() => {
    if (parsedValue?.date) return parsedValue.date.toLocaleString();
    return "";
  })();

  const grid = useMemo(() => makeMonthGrid(viewMonth), [viewMonth]);
  const viewMonthKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 15) {
        opts.push(`${pad2(h)}:${pad2(m)}`);
      }
    }
    return opts;
  }, []);

  const draftDate = useMemo(() => dateFromParts(draftYmd, draftHm), [draftHm, draftYmd]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={
          (buttonClassName ||
            "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:bg-zinc-50") +
          (disabled ? " opacity-60" : "")
        }
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3">
          <div className={displayLabel ? "truncate" : "truncate text-zinc-500"}>
            {displayLabel || placeholder || "Select date/time"}
          </div>
          <div className="shrink-0 text-xs text-zinc-500">▾</div>
        </div>
      </button>

      {open ? (
        <div
          className={
            (popoverClassName ||
              "absolute left-0 right-0 z-[200] mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg")
          }
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              Prev
            </button>
            <div className="text-sm font-semibold text-zinc-900" key={viewMonthKey}>
              {monthLabel(viewMonth)}
            </div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 p-3 text-center text-[11px] font-semibold text-zinc-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 px-3 pb-3">
            {grid.map((d) => {
              const ymd = formatYmd(d);
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const selected = ymd === draftYmd;
              const isToday = ymd === formatYmd(new Date());
              return (
                <button
                  key={ymd}
                  type="button"
                  className={
                    "h-9 rounded-xl border text-sm transition " +
                    (selected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : inMonth
                        ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                        : "border-zinc-200 bg-zinc-50 text-zinc-400 hover:bg-zinc-100")
                  }
                  onClick={() => {
                    setDraftYmd(ymd);
                    const next = dateFromParts(ymd, draftHm);
                    if (next) setViewMonth(startOfMonth(next));
                  }}
                  title={d.toLocaleDateString()}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{d.getDate()}</span>
                    {isToday ? <span className={selected ? "text-white" : "text-emerald-600"}>•</span> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-zinc-200 p-3">
            <div className="text-xs font-semibold text-zinc-600">Time</div>
            <div className="mt-2 max-h-[160px] overflow-auto rounded-2xl border border-zinc-200 p-1">
              <div className="grid grid-cols-4 gap-1">
                {timeOptions.map((hm) => {
                  const selected = hm === draftHm;
                  return (
                    <button
                      key={hm}
                      type="button"
                      className={
                        "rounded-xl px-2 py-2 text-xs font-semibold transition " +
                        (selected ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50")
                      }
                      onClick={() => setDraftHm(hm)}
                    >
                      {hm}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => {
                  const now = new Date();
                  setDraftYmd(formatYmd(now));
                  setDraftHm(formatHm(now));
                  setViewMonth(startOfMonth(now));
                }}
              >
                Now
              </button>

              <div className="text-xs text-zinc-500">{draftDate ? draftDate.toLocaleString() : ""}</div>

              <button
                type="button"
                className="rounded-xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
                onClick={() => {
                  if (!draftDate) return;
                  onChange(toLocalDateTimeValue(draftDate));
                  setOpen(false);
                }}
              >
                Set
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LocalDatePicker(props: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
  placeholder?: string;
}) {
  const { value, onChange, disabled = false, buttonClassName, placeholder } = props;

  const parsed = useMemo(() => {
    const ymd = String(value || "").trim();
    const p = parseYmd(ymd);
    if (!p) return null;
    const d = new Date(p.y, p.m - 1, p.d);
    if (!isValidDate(d)) return null;
    if (d.getFullYear() !== p.y || d.getMonth() !== p.m - 1 || d.getDate() !== p.d) return null;
    return { ymd, date: d };
  }, [value]);

  const [open, setOpen] = useState(false);
  const [draftYmd, setDraftYmd] = useState<string>(() => parsed?.ymd || formatYmd(new Date()));
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(parsed?.date || new Date()));

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftYmd(parsed?.ymd || formatYmd(new Date()));
    setViewMonth(startOfMonth(parsed?.date || new Date()));
  }, [open, parsed?.date, parsed?.ymd]);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const grid = useMemo(() => makeMonthGrid(viewMonth), [viewMonth]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={
          (buttonClassName || "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:bg-zinc-50") +
          (disabled ? " opacity-60" : "")
        }
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3">
          <div className={parsed?.date ? "truncate" : "truncate text-zinc-500"}>
            {parsed?.date ? parsed.date.toLocaleDateString() : placeholder || "Select date"}
          </div>
          <div className="shrink-0 text-xs text-zinc-500">▾</div>
        </div>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-[200] mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              Prev
            </button>
            <div className="text-sm font-semibold text-zinc-900">{monthLabel(viewMonth)}</div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 p-3 text-center text-[11px] font-semibold text-zinc-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 px-3 pb-3">
            {grid.map((d) => {
              const ymd = formatYmd(d);
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const selected = ymd === draftYmd;
              const isToday = ymd === formatYmd(new Date());
              return (
                <button
                  key={ymd}
                  type="button"
                  className={
                    "h-9 rounded-xl border text-sm transition " +
                    (selected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : inMonth
                        ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                        : "border-zinc-200 bg-zinc-50 text-zinc-400 hover:bg-zinc-100")
                  }
                  onClick={() => {
                    setDraftYmd(ymd);
                    onChange(ymd);
                    setOpen(false);
                  }}
                  title={d.toLocaleDateString()}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{d.getDate()}</span>
                    {isToday ? <span className={selected ? "text-white" : "text-emerald-600"}>•</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LocalTimePicker(props: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
  placeholder?: string;
}) {
  const { value, onChange, disabled = false, buttonClassName, placeholder } = props;

  const parsed = useMemo(() => {
    const raw = String(value || "").trim();
    const m = /^(\d{1,2}:\d{2})/.exec(raw);
    if (!m) return null;
    const p = parseHm(m[1]);
    if (!p) return null;
    return `${pad2(p.h)}:${pad2(p.m)}`;
  }, [value]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(() => parsed || "09:00");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(parsed || "09:00");
  }, [open, parsed]);

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

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 15) {
        opts.push(`${pad2(h)}:${pad2(m)}`);
      }
    }
    return opts;
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={
          (buttonClassName || "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:bg-zinc-50") +
          (disabled ? " opacity-60" : "")
        }
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3">
          <div className={parsed ? "truncate" : "truncate text-zinc-500"}>{parsed || placeholder || "Select time"}</div>
          <div className="shrink-0 text-xs text-zinc-500">▾</div>
        </div>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-[200] mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
          <div className="max-h-[240px] overflow-auto p-2">
            <div className="grid grid-cols-4 gap-1">
              {timeOptions.map((hm) => {
                const selected = hm === draft;
                return (
                  <button
                    key={hm}
                    type="button"
                    className={
                      "rounded-xl px-2 py-2 text-xs font-semibold transition " +
                      (selected ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                    onClick={() => {
                      setDraft(hm);
                      onChange(hm);
                      setOpen(false);
                    }}
                  >
                    {hm}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
