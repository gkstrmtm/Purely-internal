"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";

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
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday=0
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function minutesToLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${pad2(m)} ${ampm}`;
}

function keyForSlot(ymd: string, minutesFromMidnight: number) {
  return `${ymd}|${minutesFromMidnight}`;
}

function dateFromYmdAndMinutes(ymd: string, minutesFromMidnight: number) {
  const [yy, mm, dd] = ymd.split("-").map((x) => Number(x));
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return new Date(yy, mm - 1, dd, h, m, 0, 0);
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

export default function AvailabilityPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);

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
    const res = await fetch("/api/availability");
    const body = await res.json();
    setBlocks(body.blocks ?? []);
  }

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  useEffect(() => {
    // Rebuild visible-week selection from blocks.
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
      // snap down to slot
      const minutes = cur.getHours() * 60 + cur.getMinutes();
      const snapped = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
      cur.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);

      const end = new Date(Math.min(e.getTime(), we.getTime()));
      while (cur < end) {
        const ymd = formatYmd(cur);
        const mins = cur.getHours() * 60 + cur.getMinutes();
        next.add(keyForSlot(ymd, mins));
        cur = new Date(cur.getTime() + SLOT_MINUTES * 60_000);
      }
    }

    setSelectedSlots(next);
    setDirty(false);
  }, [blocks, weekStart, weekEnd]);

  async function removeBlock(id: string) {
    setError(null);
    const res = await fetch("/api/availability", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to delete availability");
      return;
    }
    await refresh();
  }

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

  function clearWeek() {
    setSelectedSlots(new Set());
    setDirty(true);
  }

  useEffect(() => {
    function onUp() {
      isDraggingRef.current = false;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Add blocks when you’re available to take meetings. Dialers will auto-assign you
              when a slot fits.
            </p>
          </div>
          <a
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            href="/app/closer/appointments"
          >
            Upcoming meetings
          </a>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
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

            <div className="ml-2 text-sm text-zinc-700">
              Week of <span className="font-medium">{weekStart.toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              type="button"
              onClick={clearWeek}
            >
              Clear week
            </button>
            <button
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              type="button"
              onClick={saveWeek}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save availability"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {dirty ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Unsaved changes</div>
          ) : null}
          {lastSavedAt && !dirty ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">
              Saved {lastSavedAt.toLocaleString()}
            </div>
          ) : null}
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
                <div className="border-t border-zinc-100 p-2 text-xs text-zinc-500">
                  {minutesToLabel(mins)}
                </div>

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

        {error ? (
          <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {status ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {status}
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="text-sm font-semibold">My blocks</h2>
          <div className="mt-3 space-y-2">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleString()}
                  </div>
                </div>
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  onClick={() => removeBlock(b.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}

            {blocks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                No availability blocks yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
