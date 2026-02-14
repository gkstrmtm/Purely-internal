"use client";

import { useEffect, useMemo, useState } from "react";

type SuggestedSlot = { startAt: string; endAt: string; closerCount: number };

type DemoRequestPayload = {
  name: string;
  company: string;
  email: string;
  phone: string;
  goals?: string;
  optedIn?: boolean;
};

type DemoRequestResponse = {
  requestId: string;
  leadId: string;
};

function formatLocalDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatLocalMonthDay(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

function toLocalYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const mondayBased = (day + 6) % 7;
  return addDays(x, -mondayBased);
}

function normalizePhone(inputRaw: string): { display: string; e164: string } | null {
  const input = inputRaw.trim();
  if (!input) return null;

  const hasPlus = input.startsWith("+");
  const digits = input.replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 15) return null;

  if (!hasPlus) {
    if (digits.length === 10) {
      return {
        display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
        e164: `+1${digits}`,
      };
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      const d = digits.slice(1);
      return {
        display: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
        e164: `+${digits}`,
      };
    }
  }

  return { display: `+${digits}`, e164: `+${digits}` };
}

function getTimeZoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "your local time";
  }
}

export function MarketingBookingWidget({
  initialRequestId,
  onRequestId,
  prefill,
}: {
  initialRequestId: string | null;
  onRequestId?: (id: string) => void;
  prefill?: Partial<{ name: string; company: string; email: string; phone: string; goals: string }> | null;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => new Date());
  const minBookableAt = useMemo(() => new Date(now.getTime() + 30 * 60_000), [now]);

  const [slots, setSlots] = useState<SuggestedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const slotsByLocalYmd = useMemo(() => {
    const map = new Map<string, SuggestedSlot[]>();
    for (const s of slots) {
      const key = toLocalYmd(new Date(s.startAt));
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      map.set(k, list);
    }
    return map;
  }, [slots]);

  const dayIsSelectable = useMemo(() => {
    return (d: Date) => {
      const isBeforeToday = toLocalYmd(d) < toLocalYmd(now);
      if (isBeforeToday) return false;
      const list = slotsByLocalYmd.get(toLocalYmd(d)) ?? [];
      return list.some((s) => {
        const dt = new Date(s.startAt);
        return !Number.isNaN(dt.getTime()) && dt.getTime() >= minBookableAt.getTime();
      });
    };
  }, [now, minBookableAt, slotsByLocalYmd]);

  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [step, setStep] = useState<"time" | "details" | "confirm">("time");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [localRequestId, setLocalRequestId] = useState<string | null>(null);
  const effectiveRequestId = localRequestId ?? initialRequestId;
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [booked, setBooked] = useState<null | { startAt: string }>(null);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [goals, setGoals] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const startAt = new Date(weekStart);
        startAt.setHours(0, 0, 0, 0);

        const url = new URL("/api/public/appointments/suggestions", window.location.origin);
        url.searchParams.set("startAt", startAt.toISOString());
        url.searchParams.set("days", "7");
        url.searchParams.set("durationMinutes", "30");
        url.searchParams.set("limit", "50");

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { slots?: SuggestedSlot[]; error?: string } | null;

        if (!res.ok) throw new Error(json?.error || "Unable to load availability.");
        const nextSlots = Array.isArray(json?.slots) ? json!.slots! : [];
        if (!cancelled) setSlots(nextSlots);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unable to load availability.";
        if (!cancelled) {
          setSlots([]);
          setSlotsError(msg);
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  useEffect(() => {
    if (dayIsSelectable(selectedDay)) return;
    for (let i = 0; i < 14; i++) {
      const d = addDays(startOfWeek(now), i);
      if (dayIsSelectable(d)) {
        setSelectedDay(d);
        setWeekStart(startOfWeek(d));
        break;
      }
    }
  }, [now, dayIsSelectable, selectedDay]);

  useEffect(() => {
    if (step !== "details") return;

    if (!name.trim() && prefill?.name) setName(prefill.name);
    if (!company.trim() && prefill?.company) setCompany(prefill.company);
    if (!email.trim() && prefill?.email) setEmail(prefill.email);
    if (!phone.trim() && prefill?.phone) setPhone(prefill.phone);
    if (!goals.trim() && prefill?.goals) setGoals(prefill.goals);
  }, [step, prefill, name, company, email, phone, goals]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const times = useMemo(() => {
    const list = slotsByLocalYmd.get(toLocalYmd(selectedDay)) ?? [];
    return list.map((s) => s.startAt);
  }, [selectedDay, slotsByLocalYmd]);

  const userTimeZone = useMemo(() => getTimeZoneLabel(), []);

  async function createDemoRequestIfNeeded() {
    if (effectiveRequestId) return effectiveRequestId;

    if (!name.trim() || !company.trim() || !email.trim() || !phone.trim()) {
      throw new Error("Please fill out all required fields.");
    }

    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Please enter a valid phone number.");
    setPhone(normalized.display);
    setPhoneE164(normalized.e164);

    const res = await fetch("/api/marketing/demo-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        company: company.trim(),
        email: email.trim(),
        phone: normalized.e164,
        goals: goals.trim() ? goals.trim() : undefined,
        optedIn: true,
      } satisfies DemoRequestPayload),
    });

    const json = (await res.json().catch(() => null)) as DemoRequestResponse | { error?: string } | null;
    if (!res.ok) {
      const msg = (json as { error?: string } | null)?.error || "Please check your details and try again.";
      throw new Error(msg);
    }

    const id = (json as DemoRequestResponse).requestId;
    setLocalRequestId(id);
    onRequestId?.(id);
    return id;
  }

  async function bookSelectedTime(requestId: string) {
    if (!selectedTime) throw new Error("Please pick a time.");

    const res = await fetch("/api/public/appointments/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, startAt: selectedTime, durationMinutes: 30, timeZone: userTimeZone }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string; appointment?: unknown } | null;
    if (!res.ok) {
      if (res.status === 404) throw new Error("We could not find your request. Please try again.");
      if (res.status === 409) throw new Error("That time just became unavailable. Please choose a different time.");
      throw new Error(json?.error || "We could not book that time. Please try again.");
    }

    setBooked({ startAt: selectedTime });
    setStep("confirm");
  }

  async function handlePrimaryAction() {
    setUiError(null);
    if (!selectedTime) {
      setUiError("Please select a time first.");
      return;
    }

    // If we already have a requestId (e.g. user came from a nurture link),
    // skip details and book directly.
    if (effectiveRequestId) {
      setBusy(true);
      try {
        await bookSelectedTime(effectiveRequestId);
      } catch (e) {
        setUiError(e instanceof Error ? e.message : "We could not book that time. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    setStep("details");
  }

  async function handleSubmitDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setUiError(null);

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (!selectedTime) {
      setUiError("Please select a time first.");
      setStep("time");
      return;
    }

    setBusy(true);
    try {
      const id = effectiveRequestId ?? (await createDemoRequestIfNeeded());
      await bookSelectedTime(id);
    } catch (e) {
      setUiError(e instanceof Error ? e.message : "Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  const timeItems = useMemo(() => {
    return times.map((t) => {
      const dt = new Date(t);
      const disabled = Number.isNaN(dt.getTime()) || dt.getTime() < minBookableAt.getTime();
      return { t, disabled };
    });
  }, [times, minBookableAt]);

  useEffect(() => {
    if (!selectedTime) return;
    const dt = new Date(selectedTime);
    if (!Number.isNaN(dt.getTime()) && dt.getTime() < minBookableAt.getTime()) setSelectedTime(null);
  }, [selectedTime, minBookableAt]);

  const selectedIsAvailable = times.length > 0;

  return (
    <section className="mx-auto max-w-4xl rounded-[28px] bg-[#f7f5ef] p-8 shadow-sm">
      <div className="text-center font-brand text-3xl text-brand-blue">book a call</div>
      <div className="mt-2 text-center text-base text-brand-ink">choose a day and pick a time</div>
      <div className="mt-2 text-center text-xs text-zinc-600">Times are shown in your local time ({userTimeZone}).</div>

      {slotsError ? (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">{slotsError}</div>
      ) : null}

      {uiError ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">{uiError}</div>
      ) : null}

      {step === "confirm" && booked ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800">
          Thanks for booking. You were just sent an email with instructions on how to join the video call.
          <div className="mt-1 font-semibold">{formatLocalDateTime(booked.startAt)}</div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setBooked(null);
                setSelectedTime(null);
                setUiError(null);
                setBusy(false);
                setStep("time");
              }}
              className="h-10 rounded-xl bg-zinc-800 px-5 text-sm font-semibold text-white hover:bg-zinc-900"
            >
              book another time
            </button>
          </div>
        </div>
      ) : null}

      {step === "details" ? (
        <div className="mx-auto mt-8 max-w-2xl">
          <div className="text-center text-sm font-semibold text-brand-ink">step 2 of 2</div>
          <div className="mt-2 text-center font-brand text-2xl text-brand-blue">tell us who you are</div>
          <div className="mt-2 text-center text-sm text-zinc-700">We will reach out by email and text.</div>

          <form className="mt-6 grid gap-4" autoComplete="on" onSubmit={handleSubmitDetails}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">name</span>
                <input
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  disabled={busy}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">company</span>
                <input
                  name="organization"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  required
                  autoComplete="organization"
                  disabled={busy}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">email</span>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  disabled={busy}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">phone</span>
                <input
                  name="tel"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneE164(null);
                  }}
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={busy}
                  onBlur={(e) => {
                    const raw = e.currentTarget.value;
                    if (!raw.trim()) return;
                    const normalized = normalizePhone(raw);
                    if (!normalized) {
                      e.currentTarget.setCustomValidity("Please enter a valid phone number.");
                      return;
                    }
                    e.currentTarget.setCustomValidity("");
                    setPhone(normalized.display);
                    setPhoneE164(normalized.e164);
                  }}
                  onInvalid={(e) => e.currentTarget.setCustomValidity("Please enter a valid phone number.")}
                  onInput={(e) => e.currentTarget.setCustomValidity("")}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-ink">what do you want automated</span>
              <input
                name="goals"
                list="automation-goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                disabled={busy}
                className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                placeholder="Choose one or type your own"
              />
              <datalist id="automation-goals">
                <option value="Inbound calls, SMS, and email routing" />
                <option value="Lead follow up and conversion" />
                <option value="Scheduling and appointment booking" />
                <option value="Dispatching teams and contractors" />
                <option value="Newsletters and announcements" />
                <option value="Dashboards and reporting" />
                <option value="Outbound acquisition" />
                <option value="Social media marketing workflows" />
              </datalist>
            </label>

            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep("time")}
                disabled={busy}
                className="h-11 rounded-xl bg-zinc-800 px-5 text-sm font-semibold text-white hover:bg-zinc-900"
              >
                back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-xl bg-brand-blue px-6 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {busy ? "booking..." : "book"}
              </button>
            </div>

            {phoneE164 ? <input type="hidden" name="phoneE164" value={phoneE164} readOnly /> : null}
          </form>
        </div>
      ) : null}

      {step === "time" ? (
        <>
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const next = addDays(weekStart, -7);
                setWeekStart(next);
                setSelectedDay(next);
                setSelectedTime(null);
              }}
              disabled={slotsLoading}
              className="rounded-xl border-2 border-zinc-800 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            >
              last week
            </button>

            <div className="text-sm font-semibold text-brand-ink">
              {formatLocalMonthDay(days[0])} to {formatLocalMonthDay(days[6])}
            </div>

            <button
              type="button"
              onClick={() => {
                const next = addDays(weekStart, 7);
                setWeekStart(next);
                setSelectedDay(next);
                setSelectedTime(null);
              }}
              disabled={slotsLoading}
              className="rounded-xl border-2 border-zinc-800 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            >
              next week
            </button>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-2">
            {days.map((d) => {
              const isBeforeToday = toLocalYmd(d) < toLocalYmd(now);
              const list = slotsByLocalYmd.get(toLocalYmd(d)) ?? [];
              const hasFutureSlot = list.some((s) => {
                const dt = new Date(s.startAt);
                return !Number.isNaN(dt.getTime()) && dt.getTime() >= minBookableAt.getTime();
              });

              const available = !isBeforeToday && hasFutureSlot;
              const active = toLocalYmd(d) === toLocalYmd(selectedDay);

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    setBooked(null);
                    setSelectedDay(d);
                    setSelectedTime(null);
                    setStep("time");
                  }}
                  className={
                    "rounded-xl px-2 py-3 text-center text-sm font-semibold transition " +
                    (available
                      ? active
                        ? "bg-brand-blue text-white"
                        : "bg-white text-zinc-900 hover:bg-zinc-50"
                      : "bg-zinc-100 text-zinc-400")
                  }
                >
                  {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d).slice(0, 1)}
                  <div className="mt-1 text-xs font-normal opacity-80">{new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(d)}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="text-center text-sm font-semibold text-brand-ink">
              {selectedIsAvailable ? "pick a time" : "no availability this day"}
            </div>

            {slotsLoading ? (
              <div className="mt-4 text-center text-sm text-zinc-700">Loading availability…</div>
            ) : !selectedIsAvailable ? (
              <div className="mt-4 text-center text-sm text-zinc-700">No availability this day.</div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {timeItems.map(({ t, disabled }) => (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setSelectedTime(t);
                      setUiError(null);
                    }}
                    className={
                      "rounded-xl px-4 py-3 text-left text-sm font-semibold transition " +
                      (disabled
                        ? "bg-zinc-100 text-zinc-400"
                        : selectedTime === t
                          ? "bg-zinc-900 text-white"
                          : "bg-white text-zinc-900 hover:bg-zinc-50")
                    }
                  >
                    {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(t))}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void handlePrimaryAction()}
                disabled={!selectedTime || busy}
                className="h-11 rounded-xl bg-brand-blue px-6 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                continue
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
