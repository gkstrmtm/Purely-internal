"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Site = {
  enabled: boolean;
  slug: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  timeZone: string;
  hostName?: string | null;
  businessName?: string | null;
  logoUrl?: string | null;
  brandPrimaryHex?: string | null;
  brandAccentHex?: string | null;
  brandTextHex?: string | null;
  photoUrl?: string | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;

  form?: {
    version: 1;
    thankYouMessage?: string;
    phone: { enabled: boolean; required: boolean };
    notes: { enabled: boolean; required: boolean };
    questions: {
      id: string;
      label: string;
      required: boolean;
      kind: "short" | "long" | "single_choice" | "multiple_choice";
      options?: string[];
    }[];
  };
};

type Slot = { startAt: string; endAt: string };

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
};

type Step = "date" | "time" | "details";

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

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
  const startDow = first.getDay(); // 0=Sun
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

export function PublicBookingClient({ slug }: { slug: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [step, setStep] = useState<Step>("date");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Booking | null>(null);

  const canBook = useMemo(() => {
    if (!selected) return false;
    if (!name.trim() || !email.trim()) return false;
    const form = site?.form;
    if (form?.phone?.enabled && form.phone.required && !phone.trim()) return false;
    if (form?.notes?.enabled && form.notes.required && !notes.trim()) return false;
    if (form?.questions?.length) {
      for (const q of form.questions) {
        const a = answers[q.id];
        if (!q.required) continue;
        if (q.kind === "multiple_choice") {
          if (!Array.isArray(a) || a.length === 0) return false;
          continue;
        }
        if (typeof a !== "string" || !a.trim()) return false;
      }
    }
    return true;
  }, [answers, email, name, notes, phone, selected, site?.form]);

  const theme = useMemo(() => {
    const primary = normalizeHex(site?.brandPrimaryHex) ?? "#1d4ed8";
    const accent = normalizeHex(site?.brandAccentHex) ?? "#f472b6";
    const text = normalizeHex(site?.brandTextHex) ?? "#18181b";
    return { primary, accent, text };
  }, [site?.brandAccentHex, site?.brandPrimaryHex, site?.brandTextHex]);

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

  async function loadSettings() {
    const res = await fetch(`/api/public/booking/${encodeURIComponent(slug)}/settings`, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(getApiError(body) ?? "Booking page not found");
    setSite((body as { site: Site }).site);
  }

  async function loadSlots(fromIso?: string) {
    setSlotsLoading(true);
    setError(null);
    try {
      const startAt = fromIso ? new Date(fromIso) : new Date();
      startAt.setHours(0, 0, 0, 0);

      const url = new URL(`/api/public/booking/${encodeURIComponent(slug)}/suggestions`, window.location.origin);
      url.searchParams.set("startAt", startAt.toISOString());
      url.searchParams.set("days", "30");
      url.searchParams.set("durationMinutes", String(site?.durationMinutes ?? 30));
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
        await loadSettings();
        if (!mounted) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Booking page not found");
        setLoading(false);
        return;
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    // When changing months, reset selection and load a fresh 30-day window.
    if (!site) return;
    if (!site.enabled) {
      setSlots([]);
      setSelected(null);
      setSelectedDate(null);
      setStep("date");
      return;
    }
    setSelected(null);
    setSelectedDate(null);
    setStep("date");
    loadSlots(month.toISOString()).catch((e) => setError(e instanceof Error ? e.message : "Failed to load times"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.getTime(), site?.slug, site?.durationMinutes]);

  async function book() {
    if (!selected) return;
    if (!site?.enabled) {
      setError("This booking link isn’t accepting bookings yet.");
      return;
    }

    const form = site?.form;
    if (form?.phone?.enabled && form.phone.required && !phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (form?.notes?.enabled && form.notes.required && !notes.trim()) {
      setError("Please add notes.");
      return;
    }
    if (form?.questions?.length) {
      for (const q of form.questions) {
        const a = answers[q.id];
        if (!q.required) continue;
        if (q.kind === "multiple_choice") {
          if (!Array.isArray(a) || a.length === 0) {
            setError(`Please answer: ${q.label}`);
            return;
          }
          continue;
        }
        if (typeof a !== "string" || !a.trim()) {
          setError(`Please answer: ${q.label}`);
          return;
        }
      }
    }

    setBookingBusy(true);
    setError(null);

    const res = await fetch(`/api/public/booking/${encodeURIComponent(slug)}/book`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startAt: selected,
        contactName: name,
        contactEmail: email,
        contactPhone: form?.phone?.enabled ? (phone.trim() ? phone : null) : null,
        notes: form?.notes?.enabled ? (notes.trim() ? notes : null) : null,
        answers,
      }),
    });

    const body = await res.json().catch(() => ({}));
    setBookingBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Could not book that time.");
      if (res.status === 409) {
        await loadSlots(selected).catch(() => null);
      }
      return;
    }

    setSuccess((body as { booking: Booking }).booking);
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

  if (error && !site) {
    return (
      <div className="min-h-screen bg-[#f5f9ff]">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Booking page not found</div>
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

  if (success && site) {
    const thankYou = (site.form?.thankYouMessage ?? "").trim();
    return (
      <div
        className="min-h-screen bg-[#f5f9ff]"
        style={{
          ["--booking-primary" as any]: theme.primary,
          ["--booking-accent" as any]: theme.accent,
          ["--booking-text" as any]: theme.text,
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Booked</div>
            <div className="mt-3 flex items-center gap-3">
              {site.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.businessName ?? site.title} className="h-9 w-auto" />
              ) : null}
              <h1 className="text-2xl font-bold" style={{ color: "var(--booking-text)" }}>
                You’re all set.
              </h1>
            </div>
            <p className="mt-3 text-sm text-zinc-600">
              {new Date(success.startAt).toLocaleString()} ({site.durationMinutes} minutes)
            </p>
            {site.meetingLocation ? (
              <div className="mt-2 text-sm text-zinc-600">Location: {site.meetingLocation}</div>
            ) : null}
            {site.meetingDetails ? <div className="mt-1 text-sm text-zinc-600">{site.meetingDetails}</div> : null}
            <div className="mt-6 text-sm text-zinc-700">
              {thankYou ? thankYou : "You can close this window."}
            </div>

            <div className="mt-8 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-600">
              <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--booking-primary)" }}>
                Powered by Purely Automation
              </Link>
              <span className="px-2">•</span>
              <Link href="/#demo" className="font-semibold hover:underline" style={{ color: "var(--booking-primary)" }}>
                Create your own booking link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#f5f9ff]"
      style={{
        // CSS variables for themed colors
        ["--booking-primary" as any]: theme.primary,
        ["--booking-accent" as any]: theme.accent,
        ["--booking-text" as any]: theme.text,
      }}
    >
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          {!site?.enabled ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This booking link isn’t accepting bookings yet.
            </div>
          ) : null}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {site?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.businessName ?? site.title} className="h-10 w-auto" />
              ) : null}
              <h1 className="truncate text-2xl font-bold" style={{ color: "var(--booking-text)" }}>
                {site?.title ?? "Book a call"}
              </h1>
            </div>
            {site?.description ? <p className="mt-2 text-sm text-zinc-600">{site.description}</p> : null}
            <div className="mt-2 text-xs text-zinc-600">Meeting length: {site?.durationMinutes ?? 30} minutes</div>
            {site?.meetingLocation ? (
              <div className="mt-1 text-xs text-zinc-600">Location: {site.meetingLocation}</div>
            ) : null}
            {site?.meetingDetails ? (
              <div className="mt-1 text-xs text-zinc-600">{site.meetingDetails}</div>
            ) : null}
          </div>
        </div>

        {site?.photoUrl ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.photoUrl} alt="" className="h-48 w-full object-cover" />
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">
                {step === "date" ? "Pick a date" : step === "time" ? "Pick a time" : "Confirm details"}
              </div>
              <div className="text-xs font-semibold text-zinc-500">
                {step === "date" ? "Step 1/3" : step === "time" ? "Step 2/3" : "Step 3/3"}
              </div>
            </div>

            {step === "date" ? (
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
                          setStep("time");
                        }}
                        className={
                          "rounded-2xl border px-2 py-3 text-sm font-semibold transition " +
                          (hasTimes
                            ? isSelected
                              ? "border-[color:var(--booking-primary)] bg-[color:color-mix(in_srgb,var(--booking-primary)_10%,white)] text-zinc-900"
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
                  {site?.timeZone ? ` (${site.timeZone})` : ""}
                </div>

                {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
              </div>
            ) : null}

            {step === "time" ? (
              <div className="mt-4">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    setStep("date");
                    setSelected(null);
                  }}
                >
                  Back
                </button>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-zinc-900">
                    {selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString() : ""}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Time zone: {site?.timeZone ?? ""}</div>
                </div>

                <div className="mt-4">
                  {slotsLoading ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                      Loading times…
                    </div>
                  ) : daySlots.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                      No times available on this day.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {daySlots.map((s) => (
                        <button
                          key={s.startAt}
                          type="button"
                          onClick={() => {
                            setSelected(s.startAt);
                            setStep("details");
                          }}
                          className={
                            "rounded-2xl border px-4 py-3 text-left text-sm transition-colors " +
                            (selected === s.startAt
                              ? "border-[color:var(--booking-primary)] bg-[color:color-mix(in_srgb,var(--booking-primary)_10%,white)]"
                              : "border-zinc-200 hover:bg-zinc-50")
                          }
                        >
                          <div className="font-semibold text-zinc-900">
                            {new Date(s.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </div>
                          <div className="mt-1 text-xs text-zinc-600">
                            {site?.durationMinutes ?? 30} minutes
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
              </div>
            ) : null}

            {step === "details" ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setStep("time")}
                  >
                    Back
                  </button>
                  <div className="text-xs font-semibold text-zinc-600">
                    {selected ? new Date(selected).toLocaleString() : ""}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-sm font-semibold text-zinc-900">Your info</div>
            <div className="mt-3 space-y-3">
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {site?.form?.phone?.enabled ? (
                <input
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                  placeholder={site.form.phone.required ? "Phone" : "Phone (optional)"}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              ) : null}

              {site?.form?.notes?.enabled ? (
                <textarea
                  className="h-28 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                  placeholder={site.form.notes.required ? "Notes" : "Notes (optional)"}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              ) : null}

              {(site?.form?.questions ?? []).map((q) => (
                <div key={q.id}>
                  {q.kind === "long" ? (
                    <textarea
                      className="h-28 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                      placeholder={q.required ? `${q.label}` : `${q.label} (optional)`}
                      value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  ) : q.kind === "single_choice" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-zinc-900">{q.label}</div>
                      <div className="mt-2 space-y-2">
                        {(Array.isArray(q.options) ? q.options : []).map((opt) => {
                          const current = typeof answers[q.id] === "string" ? (answers[q.id] as string) : "";
                          const checked = current === opt;
                          return (
                            <label key={opt} className="flex items-center gap-2 text-sm text-zinc-800">
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={checked}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : q.kind === "multiple_choice" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-zinc-900">{q.label}</div>
                      <div className="mt-2 space-y-2">
                        {(Array.isArray(q.options) ? q.options : []).map((opt) => {
                          const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                          const checked = current.includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-2 text-sm text-zinc-800">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAnswers((prev) => {
                                    const list = Array.isArray(prev[q.id]) ? ([...(prev[q.id] as string[])] as string[]) : [];
                                    const next = list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt];
                                    return { ...prev, [q.id]: next };
                                  });
                                }}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                      placeholder={q.required ? `${q.label}` : `${q.label} (optional)`}
                      value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <button
                type="button"
                disabled={!canBook || bookingBusy}
                onClick={() => book()}
                className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                style={{ backgroundColor: "var(--booking-primary)" }}
              >
                {bookingBusy ? "Booking…" : "Confirm booking"}
              </button>

              {error ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-600">
          <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--booking-primary)" }}>
            Powered by Purely Automation
          </Link>
          <span className="px-2">•</span>
          <Link href="/#demo" className="font-semibold hover:underline" style={{ color: "var(--booking-primary)" }}>
            Create your own booking link
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}
