"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type Block = { id: string; startAt: string; endAt: string };

const SLOT_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeekMonday(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function minutesToLabel(totalMinutes: number) {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)} ${suffix}`;
}

function formatDurationLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m available`;
  if (hours > 0) return `${hours}h available`;
  return `${minutes}m available`;
}

function keyForSlot(ymd: string, minutesFromMidnight: number) {
  return `${ymd}|${minutesFromMidnight}`;
}

function dateFromYmdAndMinutes(ymd: string, minutesFromMidnight: number) {
  const [y, mo, da] = ymd.split("-").map((v) => Number(v));
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return new Date(y, mo - 1, da, h, m, 0, 0);
}

function buildBlocksFromSlots(slotKeys: string[]) {
  const byDay = new Map<string, number[]>();
  for (const k of slotKeys) {
    const [ymd, minsStr] = k.split("|");
    const mins = Number(minsStr);
    if (!byDay.has(ymd)) byDay.set(ymd, []);
    byDay.get(ymd)!.push(mins);
  }

  const blocks: Array<{ startAt: string; endAt: string }> = [];
  for (const [ymd, minutes] of byDay) {
    const sorted = [...minutes].sort((a, b) => a - b);
    let i = 0;
    while (i < sorted.length) {
      const start = sorted[i];
      let end = start + SLOT_MINUTES;
      i++;
      while (i < sorted.length && sorted[i] === end) {
        end += SLOT_MINUTES;
        i++;
      }
      blocks.push({
        startAt: dateFromYmdAndMinutes(ymd, start).toISOString(),
        endAt: dateFromYmdAndMinutes(ymd, end).toISOString(),
      });
    }
  }
  return blocks;
}

export type PortalBookingAvailabilityHandle = {
  save: () => Promise<boolean>;
  discard: () => void;
};

type PortalBookingAvailabilityClientProps = {
  variant?: "page" | "modal";
  mode?: "week" | "day";
  calendarId?: string | null;
  calendarTitle?: string | null;
  dayYmd?: string | null;
  onSaved?: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
};

export const PortalBookingAvailabilityClient = forwardRef<PortalBookingAvailabilityHandle, PortalBookingAvailabilityClientProps>(function PortalBookingAvailabilityClient({
  variant = "page",
  mode: modeProp,
  calendarId = null,
  calendarTitle,
  dayYmd = null,
  onSaved,
  onDirtyChange,
  onSavingChange,
} = {}, ref) {
  const pathname = usePathname() || "";
  const toast = useToast();
  const portalBase = useMemo(() => (pathname.startsWith("/credit") ? "/credit" : "/portal"), [pathname]);
  const mode = modeProp ?? (dayYmd ? "day" : "week");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const activeDayYmd = useMemo(() => {
    if (dayYmd && /^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return dayYmd;
    return formatYmd(new Date());
  }, [dayYmd]);
  const activeDay = useMemo(() => new Date(`${activeDayYmd}T00:00:00`), [activeDayYmd]);
  const rangeStart = useMemo(() => (mode === "day" ? activeDay : weekStart), [activeDay, mode, weekStart]);
  const rangeEnd = useMemo(() => (mode === "day" ? addDays(activeDay, 1) : weekEnd), [activeDay, mode, weekEnd]);

  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(() => new Set());
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<"add" | "remove">("add");
  const dragStartSlotRef = useRef<string | null>(null);

  const days = useMemo(
    () => (mode === "day" ? [activeDay] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))),
    [activeDay, mode, weekStart],
  );
  const slotRows = useMemo(() => {
    const rows: number[] = [];
    for (let m = 0; m < MINUTES_PER_DAY; m += SLOT_MINUTES) rows.push(m);
    return rows;
  }, []);
  const todayYmd = useMemo(() => formatYmd(new Date()), []);
  const availabilityApiUrl = useMemo(() => {
    const qs = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return `/api/availability${qs}`;
  }, [calendarId]);
  const availabilityTitle = calendarTitle?.trim() ? `${calendarTitle} availability` : "Availability";

  const refresh = useCallback(async () => {
    const res = await fetch(availabilityApiUrl, { cache: "no-store" });
    const body = await res.json();
    setBlocks(body.blocks ?? []);
  }, [availabilityApiUrl]);

  useEffect(() => {
    refresh().catch(() => null);
  }, [refresh]);

  useEffect(() => {
    const ws = new Date(weekStart);
    const we = new Date(weekEnd);
    const rs = new Date(rangeStart);
    const re = new Date(rangeEnd);
    const next = new Set<string>();

    for (const b of blocks) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      if (mode === "day") {
        if (s >= re || e <= rs) continue;
      } else if (s >= we || e <= ws) {
        continue;
      }

      let cur = new Date(Math.max(s.getTime(), mode === "day" ? rs.getTime() : ws.getTime()));
      cur.setSeconds(0, 0);
      const mins = cur.getMinutes();
      cur.setMinutes(mins - (mins % SLOT_MINUTES));

      while (cur < e && cur < (mode === "day" ? re : we)) {
        const ymd = formatYmd(cur);
        const minutesFromMidnight = cur.getHours() * 60 + cur.getMinutes();
        if (minutesFromMidnight >= 0 && minutesFromMidnight < MINUTES_PER_DAY) {
          next.add(keyForSlot(ymd, minutesFromMidnight));
        }
        cur = new Date(cur.getTime() + SLOT_MINUTES * 60_000);
      }
    }

    setSelectedSlots(next);
    setDirty(false);
  }, [activeDayYmd, blocks, mode, rangeEnd, rangeStart, weekEnd, weekStart]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [onSavingChange, saving]);

  function applySlot(ymd: string, minutesFromMidnight: number) {
    if (ymd < todayYmd) return;
    const k = keyForSlot(ymd, minutesFromMidnight);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (dragModeRef.current === "add") next.add(k);
      else next.delete(k);
      return next;
    });
    setDirty(true);
  }

  function toggleSlot(ymd: string, minutesFromMidnight: number) {
    if (ymd < todayYmd) return;
    const k = keyForSlot(ymd, minutesFromMidnight);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setDirty(true);
  }

  function clearWeek() {
    const ws = new Date(rangeStart);
    const we = new Date(rangeEnd);

    setSelectedSlots((prev) => {
      const next = new Set(prev);
      for (const k of prev) {
        const [ymd] = k.split("|");
        const d = new Date(ymd + "T00:00:00");
        if (d >= ws && d < we) next.delete(k);
      }
      return next;
    });
    setDirty(true);
  }

  const saveRange = useCallback(async () => {
    if (!dirty) return true;
    setError(null);
    setStatus(null);
    setSaving(true);

    const blocksToSave = buildBlocksFromSlots(Array.from(selectedSlots));

    const res = await fetch(availabilityApiUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(calendarId ? { calendarId } : {}),
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        blocks: blocksToSave,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Availability did not save. Try again here or keep editing this panel.");
      setSaving(false);
      return false;
    }

    const now = new Date();
    setLastSavedAt(now);
    setDirty(false);
    setStatus(`Saved availability at ${now.toLocaleTimeString()}`);
    setSaving(false);
    await refresh();
    await onSaved?.();
    return true;
  }, [availabilityApiUrl, calendarId, dirty, onSaved, rangeEnd, rangeStart, refresh, selectedSlots]);

  const discardDraft = useCallback(() => {
    const next = new Set<string>();
    for (const b of blocks) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      if (s >= rangeEnd || e <= rangeStart) continue;
      let cur = new Date(Math.max(s.getTime(), rangeStart.getTime()));
      cur.setSeconds(0, 0);
      const mins = cur.getMinutes();
      cur.setMinutes(mins - (mins % SLOT_MINUTES));
      while (cur < e && cur < rangeEnd) {
        next.add(keyForSlot(formatYmd(cur), cur.getHours() * 60 + cur.getMinutes()));
        cur = new Date(cur.getTime() + SLOT_MINUTES * 60_000);
      }
    }
    setSelectedSlots(next);
    setDirty(false);
    setStatus(null);
    setError(null);
  }, [blocks, rangeEnd, rangeStart]);

  useImperativeHandle(ref, () => ({
    save: saveRange,
    discard: discardDraft,
  }), [discardDraft, saveRange]);

  useEffect(() => {
    function onUp() {
      isDraggingRef.current = false;
    }
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  const totalSelectedMinutes = selectedSlots.size * SLOT_MINUTES;
  const showFloatingDirtyPill = variant === "modal" && dirty;
  const showInternalSaveControls = variant === "page";
  const compactModalWeek = variant === "modal" && mode === "week";

  return (
    <div className={variant === "modal" ? (compactModalWeek ? "w-full" : "flex h-full min-h-0 w-full") : "mx-auto w-full max-w-6xl"}>
      {variant === "page" ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Availability</h1>
            <p className="mt-2 text-sm text-zinc-600">
              {calendarTitle?.trim()
                ? `Select times for ${calendarTitle}. These slots show up on that booking calendar.`
                : "Select times you’re available for bookings. These slots show up on your public booking page."}
            </p>
          </div>
          <Link
            href={`${portalBase}/app/services/booking`}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-zinc-50"
          >
            Back
          </Link>
        </div>
      ) : null}

      <div className={variant === "modal" ? (compactModalWeek ? "relative w-full rounded-3xl border border-zinc-200 bg-white/95 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]" : "relative flex h-full min-h-0 w-full flex-col rounded-3xl border border-zinc-200 bg-white/95 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]") : "mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"}>
        {showFloatingDirtyPill ? (
          <div className="pointer-events-none absolute left-4 top-3 z-10 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 shadow-[0_10px_24px_rgba(180,83,9,0.12)]">
            Unsaved changes
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {variant === "page" ? (
            <div>
              <div className="text-sm font-semibold text-zinc-900">{availabilityTitle}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {calendarTitle?.trim() ? "Changes here only affect this calendar." : "These changes affect your default booking availability."}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                {mode === "day"
                  ? new Date(`${activeDayYmd}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : availabilityTitle}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {mode === "day"
                  ? totalSelectedMinutes > 0
                    ? formatDurationLabel(totalSelectedMinutes)
                    : "No availability set for this day"
                  : calendarTitle?.trim()
                    ? "Changes here only affect this calendar."
                    : "These changes affect your default booking availability."}
              </div>
            </div>
          )}

          {mode === "week" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
                type="button"
                onClick={() => setWeekStart((d) => addDays(d, -7))}
              >
                ← Prev
              </button>
              <button
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
                type="button"
                onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
              >
                This week
              </button>
              <button
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
                type="button"
                onClick={() => setWeekStart((d) => addDays(d, 7))}
              >
                Next →
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
              type="button"
              onClick={() => clearWeek()}
            >
              {mode === "day" ? "Clear day" : "Clear week"}
            </button>
            {showInternalSaveControls ? (
              <button
                className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-95 disabled:opacity-60"
                type="button"
                onClick={() => void saveRange()}
                disabled={!dirty || saving}
              >
                {saving ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            ) : null}
          </div>
        </div>

        {mode === "day" ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] bg-zinc-50">
              <div className="p-3 text-xs font-medium text-zinc-600">Time</div>
              <div className="p-3 text-xs font-medium text-zinc-700">Availability</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid grid-cols-[88px_minmax(0,1fr)]">
                {slotRows.map((mins) => {
                  const k = keyForSlot(activeDayYmd, mins);
                  const active = selectedSlots.has(k);
                  const isPastDay = activeDayYmd < todayYmd;
                  return (
                    <div key={k} className="contents">
                      <div className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500">{minutesToLabel(mins)}</div>
                      <button
                        type="button"
                        disabled={isPastDay}
                        className={
                          "touch-pan-y border-t border-l border-zinc-200 px-3 py-2 text-left text-sm transition-colors " +
                          (isPastDay
                            ? "bg-zinc-100/80 text-zinc-400"
                            : active
                              ? "bg-emerald-100 text-emerald-950 ring-1 ring-inset ring-emerald-300 hover:bg-emerald-200"
                              : "bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                        onMouseDown={
                          isPastDay
                            ? undefined
                            : () => {
                                isDraggingRef.current = true;
                                dragModeRef.current = active ? "remove" : "add";
                                dragStartSlotRef.current = k;
                                applySlot(activeDayYmd, mins);
                              }
                        }
                        onMouseEnter={
                          isPastDay
                            ? undefined
                            : () => {
                                if (!isDraggingRef.current) return;
                                applySlot(activeDayYmd, mins);
                              }
                        }
                        onClick={
                          isPastDay
                            ? undefined
                            : () => {
                                if (dragStartSlotRef.current === k) {
                                  dragStartSlotRef.current = null;
                                  return;
                                }
                                toggleSlot(activeDayYmd, mins);
                              }
                        }
                      >
                        {active ? "Available" : "Blocked"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className={compactModalWeek ? "mt-4 overflow-hidden rounded-2xl border border-zinc-200" : "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200"}>
            <div className="grid grid-cols-8 bg-zinc-50">
              <div className="p-3 text-xs font-medium text-zinc-600">Time</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="p-3 text-xs font-medium text-zinc-700">
                  <div>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                  <div className="text-zinc-500">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                </div>
              ))}
            </div>

            <div className={compactModalWeek ? "overflow-x-auto overscroll-x-contain" : "min-h-0 flex-1 overflow-auto overscroll-contain"}>
              <div className="grid grid-cols-8">
                {slotRows.map((mins) => (
                  <div key={mins} className="contents">
                    <div className="border-t border-zinc-200 p-2 text-xs text-zinc-500">{minutesToLabel(mins)}</div>

                    {days.map((d) => {
                      const ymd = formatYmd(d);
                      const k = keyForSlot(ymd, mins);
                      const active = selectedSlots.has(k);
                      const isPastDay = ymd < todayYmd;
                      const slotLabel = `${d.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })} at ${minutesToLabel(mins)} - ${active ? "available" : "blocked"}`;
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={isPastDay}
                          aria-label={slotLabel}
                          aria-pressed={active}
                          className={
                            "touch-pan-y border-t border-l border-zinc-200 p-2 transition-colors " +
                            (isPastDay
                              ? "bg-zinc-100/80"
                              : active
                                ? "bg-emerald-100 ring-1 ring-inset ring-emerald-300 hover:bg-emerald-200"
                                : "bg-white hover:bg-zinc-50")
                          }
                          onMouseDown={
                            isPastDay
                              ? undefined
                              : () => {
                                  isDraggingRef.current = true;
                                  dragModeRef.current = active ? "remove" : "add";
                                  dragStartSlotRef.current = k;
                                  applySlot(ymd, mins);
                                }
                          }
                          onMouseEnter={
                            isPastDay
                              ? undefined
                              : () => {
                                  if (!isDraggingRef.current) return;
                                  applySlot(ymd, mins);
                                }
                          }
                          onClick={
                            isPastDay
                              ? undefined
                              : () => {
                                  if (dragStartSlotRef.current === k) {
                                    dragStartSlotRef.current = null;
                                    return;
                                  }
                                  toggleSlot(ymd, mins);
                                }
                          }
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {lastSavedAt && !dirty ? (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Saved {lastSavedAt.toLocaleString()}
          </div>
        ) : null}

        {status ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</div> : null}
      </div>
    </div>
  );
});
