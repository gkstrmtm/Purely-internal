"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type Block = { id: string; startAt: string; endAt: string };

type Props = {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
};

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

export default function AvailabilityCalendar({ title, description, backHref, backLabel }: Props) {
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
    const res = await fetch("/api/availability");
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
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-zinc-600">{description}</p>
          </div>
          <a className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50" href={backHref}>
            {backLabel}
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
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              type="button"
              onClick={() => void saveWeek()}
              disabled={saving || !dirty}
            >
              {saving ? "Saving..." : "Save week"}
            </button>
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              type="button"
              onClick={() => clearWeek()}
            >
              Clear
            </button>
          </div>
        </div>

        {status ? <div className="mt-3 text-sm text-emerald-700">{status}</div> : null}
        {lastSavedAt ? (
          <div className="mt-1 text-xs text-zinc-500">Last saved: {lastSavedAt.toLocaleString()}</div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-2 text-left text-xs font-semibold text-zinc-500">Time</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="p-2 text-left text-xs font-semibold text-zinc-500">
                    {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotRows.map((mins) => (
                <tr key={mins}>
                  <td className="sticky left-0 z-10 bg-white p-2 text-xs font-medium text-zinc-600">
                    {minutesToLabel(mins)}
                  </td>
                  {days.map((d) => {
                    const ymd = formatYmd(d);
                    const k = keyForSlot(ymd, mins);
                    const on = selectedSlots.has(k);
                    return (
                      <td key={k} className="p-1">
                        <button
                          type="button"
                          className={
                            "h-8 w-28 rounded-lg border text-xs transition " +
                            (on
                              ? "border-brand-ink bg-brand-ink text-white"
                              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50")
                          }
                          onMouseDown={() => {
                            isDraggingRef.current = true;
                            dragModeRef.current = on ? "remove" : "add";
                            applySlot(ymd, mins);
                          }}
                          onMouseEnter={() => {
                            if (!isDraggingRef.current) return;
                            applySlot(ymd, mins);
                          }}
                        >
                          {on ? "Available" : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8">
          <div className="text-sm font-semibold text-zinc-800">All saved blocks</div>
          <div className="mt-3 space-y-2">
            {blocks.map((b) => (
              <div key={b.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center">
                <div className="text-sm text-zinc-700">
                  {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleString()}
                </div>
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50"
                  type="button"
                  onClick={() => void removeBlock(b.id)}
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
