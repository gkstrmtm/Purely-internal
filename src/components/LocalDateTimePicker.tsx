"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { OVERLAY_POPUP_Z_INDEX, popupZIndexForAnchor } from "@/components/popupLayering";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function computeFixedPopoverStyleForRect(rect: DOMRect, opts?: { gap?: number; padding?: number }) {
  const gap = opts?.gap ?? 8;
  const padding = opts?.padding ?? 12;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const width = Math.min(Math.max(rect.width, 380), vw - padding * 2);
  const left = clamp(rect.left, padding, vw - padding - width);

  const spaceBelow = vh - rect.bottom - padding - gap;
  const spaceAbove = rect.top - padding - gap;
  const preferDown = spaceBelow >= 260 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(0, preferDown ? spaceBelow : spaceAbove);

  return preferDown
    ? ({ left, top: rect.bottom + gap, width, maxHeight } satisfies CSSProperties)
    : ({ left, bottom: vh - rect.top + gap, width, maxHeight } satisfies CSSProperties);
}

function useFixedPopoverStyle(open: boolean, rootRef: RefObject<HTMLElement | null>) {
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
        ...computeFixedPopoverStyleForRect(rect),
        zIndex: Math.max(popupZIndexForAnchor(el), OVERLAY_POPUP_Z_INDEX + 80),
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
  }, [open, rootRef]);

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
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(ymd || ""));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function parseHm(hm: string): { h: number; m: number } | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(hm || ""));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

type Meridiem = "AM" | "PM";

function hmToTwelveHourParts(hm: string): { hour: string; minute: string; meridiem: Meridiem } {
  const parsed = parseHm(hm) || { h: 9, m: 0 };
  const meridiem: Meridiem = parsed.h >= 12 ? "PM" : "AM";
  const hour12 = parsed.h % 12 || 12;
  return { hour: String(hour12), minute: pad2(parsed.m), meridiem };
}

function twelveHourPartsToHm(hourRaw: string, minuteRaw: string, meridiem: Meridiem): string | null {
  const hourDigits = String(hourRaw || "").replace(/\D/g, "").slice(0, 2);
  const minuteDigits = String(minuteRaw || "").replace(/\D/g, "").slice(0, 2);
  if (!hourDigits || !minuteDigits) return null;

  const hour = Number(hourDigits);
  const minute = Number(minuteDigits);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  let hour24 = hour % 12;
  if (meridiem === "PM") hour24 += 12;
  return `${pad2(hour24)}:${pad2(minute)}`;
}

function dateFromParts(ymd: string, hm: string): Date | null {
  const ymdParts = parseYmd(ymd);
  const hmParts = parseHm(hm);
  if (!ymdParts || !hmParts) return null;
  const date = new Date(ymdParts.y, ymdParts.m - 1, ymdParts.d, hmParts.h, hmParts.m, 0, 0);
  if (!isValidDate(date)) return null;
  if (date.getFullYear() !== ymdParts.y || date.getMonth() !== ymdParts.m - 1 || date.getDate() !== ymdParts.d) return null;
  return date;
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
  disablePast?: boolean;
  dateFirst?: boolean;
  minDateTime?: Date | null;
  liveDraftUpdates?: boolean;
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
    liveDraftUpdates = false,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  const fixedPopoverStyle = useFixedPopoverStyle(open && !popoverClassName, rootRef);

  const [step, setStep] = useState<"date" | "time">("date");

  const [draftYmd, setDraftYmd] = useState<string>(() => parsedValue?.ymd || formatYmd(new Date()));
  const [draftHm, setDraftHm] = useState<string>(() => parsedValue?.hm || "09:00");
  const initialTimeParts = useMemo(() => hmToTwelveHourParts(parsedValue?.hm || "09:00"), [parsedValue?.hm]);
  const [draftHourInput, setDraftHourInput] = useState<string>(initialTimeParts.hour);
  const [draftMinuteInput, setDraftMinuteInput] = useState<string>(initialTimeParts.minute);
  const [draftMeridiem, setDraftMeridiem] = useState<Meridiem>(initialTimeParts.meridiem);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(parsedValue?.date || new Date()));

  useEffect(() => {
    if (!open) return;
    setDraftYmd(parsedValue?.ymd || formatYmd(new Date()));
    setDraftHm(parsedValue?.hm || "09:00");
    const nextParts = hmToTwelveHourParts(parsedValue?.hm || "09:00");
    setDraftHourInput(nextParts.hour);
    setDraftMinuteInput(nextParts.minute);
    setDraftMeridiem(nextParts.meridiem);
    setViewMonth(startOfMonth(parsedValue?.date || new Date()));
    setStep("date");
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
  const minHm = effectiveMinDateTime ? formatHm(effectiveMinDateTime) : null;

  const emitLiveDraft = useCallback(
    (nextYmd: string, nextHm: string) => {
      if (!liveDraftUpdates) return;
      const next = dateFromParts(nextYmd, nextHm);
      if (!next) return;
      if (effectiveMinDateTime && next < effectiveMinDateTime) return;
      onChange(toLocalDateTimeValue(next));
    },
    [effectiveMinDateTime, liveDraftUpdates, onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
      if (ev.target && popoverRef.current?.contains(ev.target as Node)) return;
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
    if (parsedValue?.date) return parsedValue.date.toLocaleString();
    return "";
  })();

  const grid = useMemo(() => makeMonthGrid(viewMonth), [viewMonth]);
  const viewMonthKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;

  const draftDate = useMemo(() => dateFromParts(draftYmd, draftHm), [draftHm, draftYmd]);
  const canSet = Boolean(draftDate && (!effectiveMinDateTime || draftDate >= effectiveMinDateTime));
  const timeInputValid = Boolean(twelveHourPartsToHm(draftHourInput, draftMinuteInput, draftMeridiem));

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

      {open
        ? (() => {
            const node = (
              <div
                ref={popoverRef}
                className={
                  popoverClassName ||
                  "fixed overflow-y-auto rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                }
                style={
                  popoverClassName
                    ? undefined
                    : {
                        ...(fixedPopoverStyle ?? { visibility: "hidden" }),
                        overscrollBehavior: "contain",
                        WebkitOverflowScrolling: "touch",
                        touchAction: "pan-y",
                      }
                }
                onMouseDown={(e) => e.stopPropagation()}
                onWheelCapture={(e) => e.stopPropagation()}
                onTouchMoveCapture={(e) => e.stopPropagation()}
              >
                <div>
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/95 px-3 py-2 backdrop-blur">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setViewMonth((m) => addMonths(m, -1))}
                      disabled={dateFirst && step === "time"}
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
                      disabled={dateFirst && step === "time"}
                    >
                      Next
                    </button>
                  </div>

                  {dateFirst ? (
                    <div className="sticky top-12 z-10 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur">
                      <div className="text-xs font-semibold text-zinc-600">{step === "date" ? "Select date" : "Select time"}</div>
                      {step === "time" ? (
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => setStep("date")}
                        >
                          Back
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {!dateFirst || step === "date" ? (
                    <>
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
                          const disabledByMin = Boolean(minYmd && ymd < minYmd);

                          return (
                            <button
                              key={ymd}
                              type="button"
                              disabled={disabledByMin}
                              className={
                                "h-9 rounded-xl border text-sm transition " +
                                (disabledByMin
                                  ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300"
                                  : selected
                                    ? "border-[rgba(29,78,216,0.24)] bg-[rgba(29,78,216,0.14)] text-brand-blue"
                                    : inMonth
                                      ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                                      : "border-zinc-200 bg-zinc-50 text-zinc-400 hover:bg-zinc-100")
                              }
                              onClick={() => {
                                if (disabledByMin) return;
                                setDraftYmd(ymd);
                                const next = dateFromParts(ymd, draftHm);
                                if (next) setViewMonth(startOfMonth(next));
                                if (next) emitLiveDraft(ymd, draftHm);
                                if (dateFirst) setStep("time");
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
                    </>
                  ) : null}

                  {!dateFirst || step === "time" ? (
                    <div className={"border-t border-zinc-200 bg-white p-3" + (dateFirst ? " border-t-0" : "")}> 
              <div className="text-xs font-semibold text-zinc-600">Time</div>
              <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    inputMode="numeric"
                    maxLength={2}
                    value={draftHourInput}
                    onChange={(event) => {
                      const nextHour = event.target.value.replace(/\D/g, "").slice(0, 2);
                      setDraftHourInput(nextHour);
                      const nextHm = twelveHourPartsToHm(nextHour, draftMinuteInput, draftMeridiem);
                      if (!nextHm) return;
                      setDraftHm(nextHm);
                      emitLiveDraft(draftYmd, nextHm);
                    }}
                    onBlur={() => {
                      const digits = draftHourInput.replace(/\D/g, "");
                      if (!digits) return;
                      const nextHour = String(clamp(Number(digits), 1, 12));
                      setDraftHourInput(nextHour);
                      const nextHm = twelveHourPartsToHm(nextHour, draftMinuteInput, draftMeridiem);
                      if (!nextHm) return;
                      setDraftHm(nextHm);
                      emitLiveDraft(draftYmd, nextHm);
                    }}
                    placeholder="9"
                    className="h-11 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 text-center text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300 focus:bg-white"
                    aria-label="Hour"
                  />
                  <span className="text-sm font-semibold text-zinc-400">:</span>
                  <input
                    inputMode="numeric"
                    maxLength={2}
                    value={draftMinuteInput}
                    onChange={(event) => {
                      const nextMinute = event.target.value.replace(/\D/g, "").slice(0, 2);
                      setDraftMinuteInput(nextMinute);
                      const nextHm = twelveHourPartsToHm(draftHourInput, nextMinute, draftMeridiem);
                      if (!nextHm) return;
                      setDraftHm(nextHm);
                      emitLiveDraft(draftYmd, nextHm);
                    }}
                    onBlur={() => {
                      const digits = draftMinuteInput.replace(/\D/g, "");
                      const nextMinute = pad2(clamp(Number(digits || "0"), 0, 59));
                      setDraftMinuteInput(nextMinute);
                      const nextHm = twelveHourPartsToHm(draftHourInput, nextMinute, draftMeridiem);
                      if (!nextHm) return;
                      setDraftHm(nextHm);
                      emitLiveDraft(draftYmd, nextHm);
                    }}
                    placeholder="00"
                    className="h-11 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 text-center text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300 focus:bg-white"
                    aria-label="Minutes"
                  />
                  <div className="grid h-11 grid-cols-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
                    {(["AM", "PM"] as const).map((meridiem) => {
                      const active = draftMeridiem === meridiem;
                      return (
                        <button
                          key={meridiem}
                          type="button"
                          className={
                            "rounded-xl px-3 text-xs font-semibold transition-colors " +
                            (active ? "bg-[rgba(29,78,216,0.14)] text-brand-blue" : "text-zinc-700 hover:bg-white")
                          }
                          onClick={() => {
                            setDraftMeridiem(meridiem);
                            const nextHm = twelveHourPartsToHm(draftHourInput, draftMinuteInput, meridiem);
                            if (!nextHm) return;
                            setDraftHm(nextHm);
                            emitLiveDraft(draftYmd, nextHm);
                          }}
                        >
                          {meridiem}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">Type the time, then choose AM or PM.</div>
                {!timeInputValid ? <div className="mt-2 text-[11px] font-medium text-amber-700">Enter a valid time to save this schedule.</div> : null}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    const now = new Date();
                    const next = effectiveMinDateTime && effectiveMinDateTime > now ? effectiveMinDateTime : now;
                    setDraftYmd(formatYmd(next));
                    setDraftHm(formatHm(next));
                    const nextParts = hmToTwelveHourParts(formatHm(next));
                    setDraftHourInput(nextParts.hour);
                    setDraftMinuteInput(nextParts.minute);
                    setDraftMeridiem(nextParts.meridiem);
                    setViewMonth(startOfMonth(next));
                    emitLiveDraft(formatYmd(next), formatHm(next));
                    if (dateFirst) setStep("time");
                  }}
                >
                  Now
                </button>

                <div className="text-xs text-zinc-500">{draftDate ? draftDate.toLocaleString() : ""}</div>

                <button
                  type="button"
                  disabled={!canSet}
                  className={
                    "rounded-xl bg-[rgba(29,78,216,0.18)] px-4 py-2 text-xs font-semibold text-brand-blue hover:bg-[rgba(29,78,216,0.26)] disabled:cursor-not-allowed disabled:opacity-45"
                  }
                  onClick={() => {
                    if (!draftDate) return;
                    if (effectiveMinDateTime && draftDate < effectiveMinDateTime) return;
                    onChange(toLocalDateTimeValue(draftDate));
                    setOpen(false);
                  }}
                >
                  Set
                </button>
              </div>
            </div>
                  ) : null}
                </div>
              </div>
            );

            if (typeof document === "undefined") return node;
            return createPortal(node, document.body);
          })()
        : null}
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
                      ? "border-[rgba(29,78,216,0.24)] bg-[rgba(29,78,216,0.14)] text-brand-blue"
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
                      (selected ? "bg-[rgba(29,78,216,0.14)] text-brand-blue" : "bg-white text-zinc-700 hover:bg-zinc-50")
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
