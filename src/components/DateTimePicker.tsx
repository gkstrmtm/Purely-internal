"use client";

import { useMemo, useState } from "react";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function clampToMin(selected: Date, min: Date) {
  return selected.getTime() < min.getTime() ? new Date(min) : selected;
}

export function DateTimePicker({
  value,
  onChange,
  min,
  disabled,
}: {
  value: Date | null;
  onChange: (next: Date) => void;
  min?: Date;
  disabled?: boolean;
}) {
  const minDate = min && Number.isFinite(min.getTime()) ? min : null;
  const selected = value && Number.isFinite(value.getTime()) ? value : null;

  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthCursor);
  }, [monthCursor]);

  const grid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const firstWeekday = first.getDay(); // 0 Sun
    const count = daysInMonth(monthCursor);

    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    // leading days
    for (let i = 0; i < firstWeekday; i += 1) {
      const dt = new Date(first);
      dt.setDate(dt.getDate() - (firstWeekday - i));
      cells.push({ date: dt, inMonth: false });
    }

    for (let day = 1; day <= count; day += 1) {
      cells.push({ date: new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day), inMonth: true });
    }

    // trailing to complete weeks (6 rows max)
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const dt = new Date(last);
      dt.setDate(dt.getDate() + 1);
      cells.push({ date: dt, inMonth: false });
    }

    // cap at 6 weeks for consistent layout
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const dt = new Date(last);
      dt.setDate(dt.getDate() + 1);
      cells.push({ date: dt, inMonth: false });
    }

    return cells;
  }, [monthCursor]);

  const timeParts = useMemo(() => {
    const base = selected ?? new Date();
    const hours24 = base.getHours();
    const minutes = base.getMinutes();
    const isPm = hours24 >= 12;
    const hour12 = ((hours24 + 11) % 12) + 1;
    return { hour12, minutes, isPm };
  }, [selected]);

  const minuteOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = 0; m < 60; m += 5) opts.push(m);
    return opts;
  }, []);

  function commit(next: Date) {
    const resolved = minDate ? clampToMin(next, minDate) : next;
    onChange(resolved);
  }

  function setDay(d: Date) {
    const base = selected ?? new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes(), 0, 0);
    commit(next);
  }

  function setTime(hour12: number, minutes: number, isPm: boolean) {
    const base = selected ?? new Date();
    const hours24 = (hour12 % 12) + (isPm ? 12 : 0);
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours24, minutes, 0, 0);
    commit(next);
  }

  const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className={classNames("space-y-3", disabled && "opacity-60")}> 
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          onClick={() => setMonthCursor((d) => addMonths(d, -1))}
          disabled={disabled}
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="text-sm font-semibold text-zinc-900">{monthLabel}</div>
        <button
          type="button"
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          onClick={() => setMonthCursor((d) => addMonths(d, 1))}
          disabled={disabled}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-semibold text-zinc-500">
            {w}
          </div>
        ))}
        {grid.map((cell) => {
          const d = cell.date;
          const isSelected = selected ? sameDay(d, selected) : false;
          const isToday = sameDay(d, new Date());
          const isDisabled = Boolean(minDate && startOfDay(d).getTime() < startOfDay(minDate).getTime());

          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={disabled || isDisabled}
              onClick={() => setDay(d)}
              className={classNames(
                "h-10 rounded-2xl text-sm font-semibold",
                cell.inMonth ? "text-zinc-900" : "text-zinc-400",
                isDisabled ? "cursor-not-allowed" : "hover:bg-zinc-50",
                isSelected ? "bg-[#007aff] text-white hover:bg-[#006ae6]" : "bg-white",
                !isSelected && isToday ? "ring-1 ring-[#007aff]/40" : "border border-zinc-200",
              )}
              aria-label={d.toDateString()}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold text-zinc-600">Time</div>
        <select
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
          value={timeParts.hour12}
          disabled={disabled}
          onChange={(e) => setTime(Number(e.target.value), timeParts.minutes, timeParts.isPm)}
          aria-label="Hour"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const h = i + 1;
            return (
              <option key={h} value={h}>
                {h}
              </option>
            );
          })}
        </select>

        <select
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
          value={minuteOptions.includes(timeParts.minutes) ? timeParts.minutes : Math.round(timeParts.minutes / 5) * 5}
          disabled={disabled}
          onChange={(e) => setTime(timeParts.hour12, Number(e.target.value), timeParts.isPm)}
          aria-label="Minute"
        >
          {minuteOptions.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>

        <select
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
          value={timeParts.isPm ? "pm" : "am"}
          disabled={disabled}
          onChange={(e) => setTime(timeParts.hour12, timeParts.minutes, e.target.value === "pm")}
          aria-label="AM/PM"
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>

        <div className="flex-1" />

        <button
          type="button"
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          disabled={disabled}
          onClick={() => {
            const base = new Date(Date.now() + 15 * 60 * 1000);
            commit(base);
            setMonthCursor(new Date(base.getFullYear(), base.getMonth(), 1));
          }}
        >
          +15 min
        </button>
      </div>

      {minDate ? (
        <div className="text-xs text-zinc-500">Earliest: {minDate.toLocaleString()}</div>
      ) : null}
    </div>
  );
}
