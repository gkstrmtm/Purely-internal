"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type Block = { id: string; startAt: string; endAt: string };

const SLOT_MINUTES = 30;
const START_HOUR = 7;
const END_HOUR = 19;

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

export function PortalBookingAvailabilityClient() {
  const toast = useToast();
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

  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(() => new Set());
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<"add" | "remove">("add");

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const slotRows = useMemo(() => {
    const rows: number[] = [];
    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += SLOT_MINUTES) rows.push(m);
    return rows;
  }, []);

  async function refresh() {
    const res = await fetch("/api/availability", { cache: "no-store" });
    const body = await res.json();
    setBlocks(body.blocks ?? []);
  }

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  useEffect(() => {
    const ws = new Date(weekStart);
    const we = new Date(weekEnd);
    const next = new Set<string>();

    for (const b of blocks) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      if (s >= we || e <= ws) continue;

      let cur = new Date(Math.max(s.getTime(), ws.getTime()));
      cur.setSeconds(0, 0);
      const mins = cur.getMinutes();
      cur.setMinutes(mins - (mins % SLOT_MINUTES));

      while (cur < e && cur < we) {
        const ymd = formatYmd(cur);
        const minutesFromMidnight = cur.getHours() * 60 + cur.getMinutes();
        if (minutesFromMidnight >= START_HOUR * 60 && minutesFromMidnight < END_HOUR * 60) {
          next.add(keyForSlot(ymd, minutesFromMidnight));
        }
        cur = new Date(cur.getTime() + SLOT_MINUTES * 60_000);
      }
    }

    setSelectedSlots(next);
    setDirty(false);
  }, [blocks, weekStart, weekEnd]);

  function applySlot(ymd: string, minutesFromMidnight: number) {
    const k = keyForSlot(ymd, minutesFromMidnight);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (dragModeRef.current === "add") next.add(k);
      else next.delete(k);
      return next;
    });
    setDirty(true);
  }

  function clearWeek() {
    const ws = new Date(weekStart);
    const we = new Date(weekEnd);

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

  async function saveWeek() {
    setError(null);
    setStatus(null);
    setSaving(true);

    const rangeStart = new Date(weekStart);
    const rangeEnd = new Date(weekEnd);
    const blocksToSave = buildBlocksFromSlots(Array.from(selectedSlots));

    const res = await fetch("/api/availability", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        blocks: blocksToSave,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save availability");
      setSaving(false);
      return;
    }

    const now = new Date();
    setLastSavedAt(now);
    setDirty(false);
    setStatus(`Saved availability at ${now.toLocaleTimeString()}`);
    setSaving(false);
    await refresh();
  }

  useEffect(() => {
    function onUp() {
      isDraggingRef.current = false;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Availability</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Select times you’re available for bookings. These slots show up on your public booking page.
          </p>
        </div>
        <Link
          href="/portal/app/services/booking"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          Back
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              type="button"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            >
              ← Prev
            </button>
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              type="button"
              onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            >
              This week
            </button>
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              type="button"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
            >
              Next →
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              type="button"
              onClick={() => clearWeek()}
            >
              Clear week
            </button>
            <button
              className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              type="button"
              onClick={() => saveWeek()}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
          <div className="grid grid-cols-8 bg-zinc-50">
            <div className="p-3 text-xs font-medium text-zinc-600">Time</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="p-3 text-xs font-medium text-zinc-700">
                <div>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-zinc-500">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-8">
            {slotRows.map((mins) => (
              <div key={mins} className="contents">
                <div className="border-t border-zinc-100 p-2 text-xs text-zinc-500">{minutesToLabel(mins)}</div>

                {days.map((d) => {
                  const ymd = formatYmd(d);
                  const k = keyForSlot(ymd, mins);
                  const active = selectedSlots.has(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      className={
                        "border-t border-l border-zinc-100 p-2 transition-colors " +
                        (active ? "bg-emerald-200 hover:bg-emerald-300" : "bg-white hover:bg-zinc-50")
                      }
                      onMouseDown={() => {
                        isDraggingRef.current = true;
                        dragModeRef.current = active ? "remove" : "add";
                        applySlot(ymd, mins);
                      }}
                      onMouseEnter={() => {
                        if (!isDraggingRef.current) return;
                        applySlot(ymd, mins);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {dirty ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Unsaved changes</div>
        ) : null}
        {lastSavedAt && !dirty ? (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Saved {lastSavedAt.toLocaleString()}
          </div>
        ) : null}

        {status ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</div> : null}
      </div>
    </div>
  );
}
