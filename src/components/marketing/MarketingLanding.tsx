"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DemoRequestPayload = {
  name: string;
  company: string;
  email: string;
  phone?: string;
  optedIn?: boolean;
};

type DemoRequestResponse = {
  requestId: string;
  leadId: string;
};

type Slot = {
  startAt: string;
  endAt: string;
  closerCount: number;
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

function toLocalYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function startOfLocalDayIso(ymd: string) {
  // ymd is YYYY-MM-DD from <input type="date">.
  const local = new Date(`${ymd}T00:00:00`);
  return local.toISOString();
}

function AutomationGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-transparent">
      <div className="relative mx-auto max-w-md">
        <div className="relative">
          <div className="font-brand text-3xl text-brand-ink">automation</div>

          <div className="mt-6 space-y-6">
            <div className="relative">
              <div className="h-10 w-40 rounded-xl bg-zinc-800/85" />
              <div className="absolute right-0 top-1 h-10 w-44 rounded-xl bg-brand-blue" />
              <svg
                className="absolute left-40 top-1 h-10 w-20"
                viewBox="0 0 100 50"
                fill="none"
              >
                <path
                  d="M10 25 L72 25"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M72 25 L58 14"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M72 25 L58 36"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="relative flex items-center gap-4">
              <div className="flex h-10 w-44 items-center rounded-xl bg-zinc-200 px-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-700" fill="currentColor">
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.85 21 3 13.15 3 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
                  </svg>
                </div>
              </div>
              <div className="h-10 w-44 rounded-xl bg-zinc-800/85" />

              <svg
                className="absolute left-44 top-4 h-10 w-28"
                viewBox="0 0 140 50"
                fill="none"
              >
                <path
                  d="M10 25 C55 25 55 25 96 40"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M96 40 L82 30"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M96 40 L86 48"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="relative pl-40">
              <div className="h-10 w-44 rounded-xl bg-zinc-800/85" />
              <svg
                className="absolute left-56 -top-6 h-16 w-28"
                viewBox="0 0 140 90"
                fill="none"
              >
                <path
                  d="M50 80 C100 70 105 35 106 18"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M106 18 L94 32"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M106 18 L118 32"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingWidget({ requestId }: { requestId: string }) {
  const [ymd, setYmd] = useState(() => toLocalYmd(new Date()));
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [booked, setBooked] = useState<null | { startAt: string }>(null);

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      const d = new Date(s.startAt);
      if (Number.isNaN(d.getTime())) return false;
      return toLocalYmd(d) === ymd;
    });
  }, [slots, ymd]);

  const loadSlots = useCallback(async (nextYmd: string) => {
    setError(null);
    setLoading(true);
    setBooked(null);

    try {
      const startAt = startOfLocalDayIso(nextYmd);
      const res = await fetch(
        `/api/public/appointments/suggestions?startAt=${encodeURIComponent(startAt)}&days=2&durationMinutes=30&limit=40`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load slots");
      setSlots((json?.slots as Slot[]) ?? []);
    } catch (e) {
      setSlots([]);
      setError(e instanceof Error ? e.message : "Failed to load slots");
    } finally {
      setLoading(false);
    }
  }, []);

  const book = useCallback(
    async (startAt: string) => {
    setError(null);
    setBooking(startAt);

    try {
      const res = await fetch("/api/public/appointments/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, startAt, durationMinutes: 30 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Booking failed");
      setBooked({ startAt: json?.appointment?.startAt ?? startAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBooking(null);
    }
    },
    [requestId],
  );

  useEffect(() => {
    void loadSlots(ymd);
  }, [loadSlots, ymd]);

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-zinc-900">Book a call</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Pick a date and choose an available time.
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-semibold text-zinc-600">Date</span>
          <input
            type="date"
            value={ymd}
            onChange={(e) => {
              setYmd(e.target.value);
            }}
            className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {booked ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Confirmed for {formatLocalDateTime(booked.startAt)}.
        </div>
      ) : null}

      <div className="mt-5">
        <div className="text-xs font-semibold text-zinc-600">Times</div>

        {loading ? (
          <div className="mt-3 text-sm text-zinc-600">Loading availability...</div>
        ) : filteredSlots.length === 0 ? (
          <div className="mt-3 text-sm text-zinc-600">
            No times found for this date. Try another day.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredSlots.map((s) => {
              const isBusy = booking === s.startAt;
              return (
                <button
                  key={s.startAt}
                  type="button"
                  disabled={!!booking}
                  onClick={() => void book(s.startAt)}
                  className={
                    "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition " +
                    (isBusy
                      ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                      : "border-zinc-200 bg-white hover:bg-zinc-50")
                  }
                >
                  <div className="font-semibold text-zinc-900">
                    {formatLocalDateTime(s.startAt)}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {s.closerCount} available
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function MarketingLanding() {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement | null>(null);
  const bookingRef = useRef<HTMLDivElement | null>(null);

  async function submit(payload: DemoRequestPayload) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as DemoRequestResponse | { error?: string } | null;

      if (!res.ok) throw new Error((json as { error?: string } | null)?.error || "Submit failed");

      const id = (json as DemoRequestResponse).requestId;
      setRequestId(id);
      setExpanded(false);

      setTimeout(() => {
        bookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-zinc-900">
      <main>
        <section className="mx-auto max-w-6xl px-6 pt-10">
          <div className="rounded-[28px] border-2 border-brand-blue bg-[#f7f5ef] p-8">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div>
                <Image
                  src="/brand/purity-5.png"
                  alt="Purely Automation"
                  width={520}
                  height={180}
                  className="h-auto w-[420px] max-w-full object-contain"
                  priority
                />
                <p className="mt-4 max-w-md font-brand text-lg text-brand-ink">
                  let your computer handle the busywork,
                  <br />
                  so you can focus on moving levers
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    setTimeout(() => {
                      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  className="mt-8 inline-flex items-center gap-3 rounded-xl border-2 border-zinc-800 bg-brand-pink px-6 py-3 font-brand text-lg text-brand-blue shadow-sm hover:bg-pink-300"
                >
                  <span>see it in action</span>
                  <span className="grid h-8 w-10 place-items-center rounded-lg bg-brand-blue text-white">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>
              </div>

              <div className="flex justify-center md:justify-end">
                <AutomationGraphic />
              </div>
            </div>
          </div>
        </section>

        <section ref={formRef} className="mx-auto max-w-6xl px-6 py-10">
          <div className="relative">
            <div
              className={
                "mx-auto max-w-4xl overflow-hidden rounded-[28px] border-2 border-brand-blue bg-[#f7f5ef] transition-all " +
                (expanded ? "max-h-[900px]" : "max-h-0 border-transparent")
              }
            >
              <div className="px-8 pb-8 pt-10">
                <div className="text-center font-brand text-3xl text-brand-blue">
                  were going to send you some stuff
                </div>
                <div className="mt-2 text-center font-brand text-lg text-brand-ink">let us know:</div>

                <div className="mt-10">
                  <DemoRequestForm
                    disabled={submitting || !!requestId}
                    submitting={submitting}
                    error={error}
                    onSubmit={submit}
                    onCancel={() => {
                      setExpanded(false);
                      setError(null);
                    }}
                  />

                  {requestId ? (
                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Thanks. Your request is in.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {!expanded ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    setTimeout(() => {
                      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  className="rounded-xl border-2 border-zinc-800 bg-brand-pink px-6 py-3 font-brand text-lg text-brand-blue shadow-sm hover:bg-pink-300"
                >
                  see it in action
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section id="book" ref={bookingRef} className="mx-auto max-w-6xl px-6 pb-16">
          {requestId ? (
            <BookingWidget requestId={requestId} />
          ) : (
            <div className="mx-auto max-w-4xl rounded-[28px] border-2 border-brand-blue bg-[#f7f5ef] p-6 text-sm text-zinc-700">
              Submit the form to unlock booking.
            </div>
          )}
        </section>

        <footer className="pb-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
            <div>Purely Automation</div>
            <div className="flex gap-4">
              <Link className="hover:text-zinc-900" href="/dashboard">
                Dashboard
              </Link>
              <Link className="hover:text-zinc-900" href="/login">
                Login
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function DemoRequestForm({
  disabled,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: DemoRequestPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Keep the API field name but match the UI from the mock.
  const [optedIn, setOptedIn] = useState(true);

  const canSubmit =
    !disabled &&
    name.trim().length > 0 &&
    company.trim().length > 0 &&
    email.trim().length > 0;

  return (
    <form
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        void onSubmit({
          name,
          company,
          email,
          phone: phone.trim() ? phone.trim() : undefined,
          optedIn,
        });
      }}
    >
      <div className="grid grid-cols-1 gap-x-16 gap-y-10 sm:grid-cols-2">
        <label className="grid gap-3">
          <span className="font-brand text-lg text-brand-ink">your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 font-brand text-lg text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="name"
          />
        </label>

        <label className="grid gap-3">
          <span className="font-brand text-lg text-brand-ink">your company</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 font-brand text-lg text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="organization"
          />
        </label>

        <label className="grid gap-3">
          <span className="font-brand text-lg text-brand-ink">your email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 font-brand text-lg text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            type="email"
            autoComplete="email"
          />
        </label>

        <label className="grid gap-3">
          <span className="font-brand text-lg text-brand-ink">your phone number</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 font-brand text-lg text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="tel"
          />
        </label>
      </div>

      <div className="grid gap-4 text-center">
        <div className="font-brand text-xl text-brand-ink">opting in for sms and email?</div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setName("");
              setCompany("");
              setEmail("");
              setPhone("");
              setOptedIn(false);
              onCancel();
            }}
            className="h-11 rounded-xl bg-zinc-800 px-6 font-brand text-lg text-white hover:bg-zinc-900"
          >
            no, cancel demo
          </button>

          <button
            type="submit"
            disabled={!canSubmit}
            onClick={() => setOptedIn(true)}
            className={
              "h-11 rounded-xl px-6 font-brand text-lg text-white transition " +
              (canSubmit ? "bg-brand-blue hover:bg-blue-700" : "cursor-not-allowed bg-zinc-300")
            }
          >
            {submitting ? "sending..." : "yes, send the demo"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </form>
  );
}
