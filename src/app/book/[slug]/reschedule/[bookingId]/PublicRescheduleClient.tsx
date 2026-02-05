"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Site = {
  slug: string;
  title: string;
  durationMinutes: number;
  timeZone: string;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  hostName?: string | null;
};

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
};

type Slot = { startAt: string; endAt: string };

type Step = "pick" | "done";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  const out = new Date(d);
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addMonths(d: Date, delta: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + delta);
  return startOfMonth(out);
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function makeMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const startDow = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startDow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

export function PublicRescheduleClient({
  slug,
  bookingId,
  token,
}: {
  slug: string;
  bookingId: string;
  token: string;
}) {
  const [site, setSite] = useState<Site | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("pick");

  const [error, setError] = useState<string | null>(null);
  const [doneUrl, setDoneUrl] = useState<string | null>(null);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = toYmd(new Date(s.startAt));
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      map.set(k, list);
    }
    return map;
  }, [slots]);

  const daySlots = useMemo(() => {
    if (!selectedDate) return [];
    return slotsByDay.get(selectedDate) ?? [];
  }, [selectedDate, slotsByDay]);

  async function loadDetails() {
    const url = new URL(
      `/api/public/booking/${encodeURIComponent(slug)}/reschedule/${encodeURIComponent(bookingId)}`,
      window.location.origin,
    );
    if (token) url.searchParams.set("t", token);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(getApiError(body) ?? "Reschedule link is invalid.");

    setSite((body as any).site as Site);
    setBooking((body as any).booking as Booking);
  }

  async function loadSlots(fromIso?: string) {
    if (!site) return;
    setSlotsLoading(true);
    setError(null);
    try {
      const startAt = fromIso ? new Date(fromIso) : new Date();
      startAt.setHours(0, 0, 0, 0);

      const url = new URL(`/api/public/booking/${encodeURIComponent(slug)}/suggestions`, window.location.origin);
      url.searchParams.set("startAt", startAt.toISOString());
      url.searchParams.set("days", "30");
      url.searchParams.set("durationMinutes", String(site.durationMinutes));
      url.searchParams.set("limit", "50");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiError(body) ?? "Failed to load available times");
      setSlots((body as { slots?: Slot[] }).slots ?? []);
    } finally {
      setSlotsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadDetails();
        if (!mounted) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reschedule link is invalid.");
        setLoading(false);
        return;
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, bookingId, token]);

  useEffect(() => {
    if (!site) return;
    setSelected(null);
    setSelectedDate(null);
    loadSlots(month.toISOString()).catch((e) => setError(e instanceof Error ? e.message : "Failed to load times"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.slug, month.getTime(), site?.durationMinutes]);

  async function applyReschedule() {
    if (!selected) return;
    setBusy(true);
    setError(null);

    const res = await fetch(
      `/api/public/booking/${encodeURIComponent(slug)}/reschedule/${encodeURIComponent(bookingId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startAt: selected, t: token }),
      },
    );

    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Could not reschedule that time.");
      if (res.status === 409) {
        await loadSlots(selected).catch(() => null);
      }
      return;
    }

    setDoneUrl(typeof (body as any).rescheduleUrl === "string" ? ((body as any).rescheduleUrl as string) : null);
    setStep("done");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f9ff]">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
        </div>
      </div>
    );
  }

  if (error && (!site || !booking)) {
    return (
      <div className="min-h-screen bg-[#f5f9ff]">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Reschedule</div>
            <div className="mt-2 text-sm text-zinc-600">{error}</div>
            <div className="mt-6">
              <Link href="/" className="text-sm font-semibold text-brand-ink hover:underline">
                Back to Purely Automation
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!site || !booking) return null;

  if (step === "done") {
    return (
      <div className="min-h-screen bg-[#f5f9ff]">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Rescheduled</div>
            <h1 className="mt-3 text-2xl font-bold text-zinc-900">You’re all set.</h1>
            <div className="mt-3 text-sm text-zinc-600">We emailed you confirmation.</div>
            {doneUrl ? (
              <div className="mt-6 text-sm text-zinc-600">Need to reschedule again? Use the latest link in your email.</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f9ff]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-zinc-900">Reschedule: {site.title}</h1>
              <div className="mt-2 text-sm text-zinc-600">
                Current: {new Date(booking.startAt).toLocaleString()} ({site.durationMinutes} minutes)
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Pick a new time</div>
                <div className="text-xs font-semibold text-zinc-500">{site.timeZone}</div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMonth((m) => addMonths(m, -1))}
                  >
                    Prev
                  </button>
                  <div className="text-sm font-semibold text-zinc-900">{monthLabel(month)}</div>
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setMonth((m) => addMonths(m, 1))}
                  >
                    Next
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-500">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-2">
                  {makeMonthGrid(month).map((d) => {
                    const ymd = toYmd(d);
                    const inMonth = d.getMonth() === month.getMonth();
                    const hasTimes = (slotsByDay.get(ymd)?.length ?? 0) > 0;
                    const isSelected = selectedDate === ymd;
                    return (
                      <button
                        key={ymd}
                        type="button"
                        disabled={!hasTimes}
                        onClick={() => {
                          setSelectedDate(ymd);
                          setSelected(null);
                        }}
                        className={
                          "rounded-2xl border px-2 py-3 text-sm font-semibold transition " +
                          (hasTimes
                            ? isSelected
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                            : "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300") +
                          (!inMonth ? " opacity-60" : "")
                        }
                        aria-label={d.toDateString()}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-xs text-zinc-600">
                  {slotsLoading ? "Loading available days…" : "Select a highlighted day to see times."}
                </div>
              </div>

              {selectedDate ? (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-zinc-900">
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
                  </div>
                  <div className="mt-3">
                    {slotsLoading ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">Loading times…</div>
                    ) : daySlots.length === 0 ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">No times available on this day.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {daySlots.map((s) => (
                          <button
                            key={s.startAt}
                            type="button"
                            onClick={() => setSelected(s.startAt)}
                            className={
                              "rounded-2xl border px-4 py-3 text-left text-sm transition-colors " +
                              (selected === s.startAt
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 hover:bg-zinc-50")
                            }
                          >
                            <div className="font-semibold">
                              {new Date(s.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              ) : null}
            </div>

            <div>
              <div className="text-sm font-semibold text-zinc-900">Confirm</div>
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">{booking.contactName}</div>
                <div className="mt-1 text-xs text-zinc-600">{booking.contactEmail}</div>
              </div>

              <button
                type="button"
                disabled={!selected || busy}
                onClick={() => applyReschedule()}
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {busy ? "Rescheduling…" : "Confirm reschedule"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-600">
          <Link href="/" className="font-semibold hover:underline">
            Powered by Purely Automation
          </Link>
        </div>
      </div>
    </div>
  );
}
