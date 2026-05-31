"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { popupZIndexForAnchor } from "@/components/popupLayering";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function computeFixedPopoverStyleForRect(rect: DOMRect, opts?: { gap?: number; padding?: number; minMaxHeight?: number; preferredWidth?: number }) {
  const gap = opts?.gap ?? 8;
  const padding = opts?.padding ?? 12;
  const minMaxHeight = opts?.minMaxHeight ?? 180;
  const preferredWidth = Math.max(rect.width, opts?.preferredWidth ?? rect.width);

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const width = Math.min(preferredWidth, vw - padding * 2);
  const anchorCenter = rect.left + (rect.width / 2);
  const left = clamp(anchorCenter - (width / 2), padding, vw - padding - width);
  const maxViewportHeight = Math.max(160, vh - padding * 2);
  const preferredMaxHeight = Math.min(minMaxHeight, maxViewportHeight);

  const spaceBelow = vh - rect.bottom - padding - gap;
  const spaceAbove = rect.top - padding - gap;
  const preferDown = spaceBelow >= 260 || spaceBelow >= spaceAbove;
  const availableSpace = Math.max(0, preferDown ? spaceBelow : spaceAbove);
  const nextMaxHeight = Math.min(preferredMaxHeight, availableSpace);

  return preferDown
    ? ({ left, top: rect.bottom + gap, width, maxHeight: nextMaxHeight } satisfies CSSProperties)
    : ({ left, bottom: vh - rect.top + gap, width, maxHeight: nextMaxHeight } satisfies CSSProperties);
}

function useFixedPopoverStyle(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  opts?: { gap?: number; padding?: number; minMaxHeight?: number; preferredWidth?: number },
) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    const recompute = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        ...computeFixedPopoverStyleForRect(rect, opts),
        zIndex: popupZIndexForAnchor(el),
      });
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };

    recompute();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, opts?.gap, opts?.minMaxHeight, opts?.padding, opts?.preferredWidth, rootRef]);

  return style;
}

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

type Meridiem = "AM" | "PM";

const COMPOSER_TIME_PRESETS = [
  { label: "9:00 AM", hm: "09:00" },
  { label: "12:00 PM", hm: "12:00" },
  { label: "3:00 PM", hm: "15:00" },
  { label: "6:00 PM", hm: "18:00" },
] as const;

function toMeridiemTimeParts(hm: string) {
  const parsed = parseHm(hm) || { h: 9, m: 0 };
  const meridiem: Meridiem = parsed.h >= 12 ? "PM" : "AM";
  const hour = parsed.h % 12 || 12;
  return {
    hour,
    minute: pad2(parsed.m),
    meridiem,
  };
}

function fromMeridiemTimeParts(hour: number, minute: string, meridiem: Meridiem) {
  const safeHour = clamp(Math.round(hour) || 12, 1, 12);
  const safeMinute = ["00", "15", "30", "45"].includes(minute) ? minute : "00";
  let normalizedHour = safeHour % 12;
  if (meridiem === "PM") normalizedHour += 12;
  return `${pad2(normalizedHour)}:${safeMinute}`;
}

function wrapHour(hour: number, delta: number) {
  return ((hour - 1 + delta + 120) % 12) + 1;
}

function formatDateTimeButtonLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function LocalDateTimePicker(props: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
  popoverClassName?: string;
  placeholder?: string;
  disablePast?: boolean;
  dateFirst?: boolean;
  minDateTime?: Date | null;
}) {
  const {
    value,
    onChange,
    disabled = false,
    buttonClassName,
    popoverClassName,
    placeholder,
    disablePast = false,
    dateFirst = false,
    minDateTime = null,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const parsedValue = useMemo(() => {
    const raw = String(value || "").trim();
    const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/.exec(raw);
    if (!m) return null;
    const d = dateFromParts(m[1], m[2]);
    if (!d) return null;
    return { ymd: m[1], hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, date: d };
  }, [value]);

  const [open, setOpen] = useState(false);
  const [nowSeed, setNowSeed] = useState(0);

  const fixedPopoverStyle = useFixedPopoverStyle(open && !popoverClassName, rootRef, {
    gap: 12,
    minMaxHeight: 420,
    padding: 20,
    preferredWidth: 680,
  });

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
    if (!disablePast) return;
    setNowSeed(Date.now());
  }, [disablePast, open]);

  const effectiveMinDateTime = useMemo(() => {
    let out: Date | null = null;
    if (minDateTime instanceof Date && isValidDate(minDateTime)) out = new Date(minDateTime);
    if (disablePast) {
      if (!open || !nowSeed) return out;
      const now = new Date(nowSeed);
      out = out ? (out > now ? out : now) : now;
    }
    return out;
  }, [disablePast, minDateTime, nowSeed, open]);

  const minYmd = effectiveMinDateTime ? formatYmd(effectiveMinDateTime) : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
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

  const displayLabel = (() => {
    if (parsedValue?.date) return formatDateTimeButtonLabel(parsedValue.date);
    return "";
  })();

  const grid = useMemo(() => makeMonthGrid(viewMonth), [viewMonth]);
  const viewMonthKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;

  const draftDate = useMemo(() => dateFromParts(draftYmd, draftHm), [draftHm, draftYmd]);
  const canSet = Boolean(draftDate && (!effectiveMinDateTime || draftDate >= effectiveMinDateTime));
  const draftTimeParts = useMemo(() => toMeridiemTimeParts(draftHm), [draftHm]);
  const minuteOptions = ["00", "15", "30", "45"] as const;
  const backdropZIndex = typeof fixedPopoverStyle?.zIndex === "number" ? Math.max(1, fixedPopoverStyle.zIndex - 1) : 40;

  const closePopover = () => {
    window.requestAnimationFrame(() => setOpen(false));
  };

  const setDraftTimeParts = (patch: Partial<{ hour: number; minute: string; meridiem: Meridiem }>) => {
    const nextHour = patch.hour ?? draftTimeParts.hour;
    const nextMinute = patch.minute ?? draftTimeParts.minute;
    const nextMeridiem = patch.meridiem ?? draftTimeParts.meridiem;
    setDraftHm(fromMeridiemTimeParts(nextHour, nextMinute, nextMeridiem));
  };

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <button
          type="button"
          aria-label="Close scheduler"
          className="fixed inset-0 bg-zinc-950/10 backdrop-blur-[1px]"
          style={{ zIndex: backdropZIndex }}
          onClick={() => setOpen(false)}
        />
      ) : null}

      <button
        type="button"
        disabled={disabled}
        className={
          (buttonClassName ||
            "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:bg-zinc-50") +
          (disabled ? " opacity-60" : "")
        }
        onClick={() => {
          if (disabled) return;
          if (!open && disablePast) setNowSeed(Date.now());
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
              "fixed flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-2xl")
          }
          style={popoverClassName ? undefined : fixedPopoverStyle ?? { visibility: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Schedule</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{draftDate ? formatDateTimeButtonLabel(draftDate) : "Pick a date and time"}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
              >
                Prev
              </button>
              <div className="min-w-32 text-center text-sm font-semibold text-zinc-900" key={viewMonthKey}>
                {monthLabel(viewMonth)}
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_272px]">
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-zinc-500">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayLabel) => (
                  <div key={dayLabel} className="py-2">{dayLabel}</div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {grid.map((day) => {
                  const ymd = formatYmd(day);
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const selected = ymd === draftYmd;
                  const isToday = ymd === formatYmd(new Date());
                  const disabledByMin = Boolean(minYmd && ymd < minYmd);

                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={disabledByMin}
                      className={
                        "h-11 rounded-2xl border text-sm transition " +
                        (disabledByMin
                          ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300"
                          : selected
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : inMonth
                              ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                              : "border-zinc-200 bg-zinc-50 text-zinc-400 hover:bg-zinc-100")
                      }
                      onClick={() => {
                        if (disabledByMin) return;
                        setDraftYmd(ymd);
                        const next = dateFromParts(ymd, draftHm);
                        if (next) setViewMonth(startOfMonth(next));
                      }}
                      title={day.toLocaleDateString()}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{day.getDate()}</span>
                        {isToday ? <span className={selected ? "text-white" : "text-emerald-600"}>•</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[26px] bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Time</div>

              <div className="mt-3">
                <div className="text-xs font-medium text-zinc-600">Quick picks</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {COMPOSER_TIME_PRESETS.map((preset) => {
                    const selected = preset.hm === draftHm;
                    return (
                      <button
                        key={preset.hm}
                        type="button"
                        className={
                          "min-h-11 rounded-2xl border px-3 py-2 text-xs font-semibold transition " +
                          (selected
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100")
                        }
                        onClick={() => setDraftHm(preset.hm)}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-3.5">
                <div className="grid gap-3 sm:grid-cols-[116px_minmax(0,1fr)]">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Hour</div>
                    <div className="mt-2 flex items-center justify-between rounded-2xl bg-zinc-50 px-2 py-2">
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-base font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => setDraftTimeParts({ hour: wrapHour(draftTimeParts.hour, -1) })}
                      >
                        -
                      </button>
                      <div className="min-w-12 text-center text-[2rem] font-semibold leading-none text-zinc-900">{pad2(draftTimeParts.hour)}</div>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-base font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => setDraftTimeParts({ hour: wrapHour(draftTimeParts.hour, 1) })}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">AM / PM</div>
                    <div className="mt-2 grid grid-cols-2 rounded-2xl bg-zinc-100 p-1">
                      {(["AM", "PM"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            "flex min-h-11 items-center justify-center rounded-[18px] px-3 text-sm font-semibold transition " +
                            (draftTimeParts.meridiem === value
                              ? "bg-zinc-900 text-white shadow-sm"
                              : "text-zinc-700 hover:bg-white")
                          }
                          onClick={() => setDraftTimeParts({ meridiem: value })}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Minutes</div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {minuteOptions.map((minute) => (
                      <button
                        key={minute}
                        type="button"
                        className={
                          "min-h-11 rounded-2xl px-3 py-2 text-sm font-semibold transition " +
                          (draftTimeParts.minute === minute
                            ? "bg-zinc-900 text-white"
                            : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                        onClick={() => setDraftTimeParts({ minute })}
                      >
                        :{minute}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3">
            <div className="text-xs text-zinc-500">
              {effectiveMinDateTime
                ? `Earliest ${formatDateTimeButtonLabel(effectiveMinDateTime)}`
                : draftDate
                  ? formatDateTimeButtonLabel(draftDate)
                  : ""}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => {
                  setDraftYmd(parsedValue?.ymd || formatYmd(new Date()));
                  setDraftHm(parsedValue?.hm || "09:00");
                  setViewMonth(startOfMonth(parsedValue?.date || new Date()));
                  closePopover();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => {
                  onChange("");
                  closePopover();
                }}
              >
                Clear
              </button>
              <button
                type="button"
                disabled={!canSet}
                className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  if (!draftDate) return;
                  if (effectiveMinDateTime && draftDate < effectiveMinDateTime) return;
                  onChange(toLocalDateTimeValue(draftDate));
                  closePopover();
                }}
              >
                Apply
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
  const fixedPopoverStyle = useFixedPopoverStyle(open, rootRef);

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
        <div
          className="fixed overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
          style={fixedPopoverStyle ?? { visibility: "hidden" }}
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
  const fixedPopoverStyle = useFixedPopoverStyle(open, rootRef);

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
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
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
        <div
          className="fixed overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
          style={fixedPopoverStyle ?? { visibility: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="max-h-60 overflow-auto p-2">
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
