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
    <div className="relative isolate overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-mist via-white to-white" />
      <div className="relative">
        <div className="flex items-baseline justify-between">
          <div className="font-brand text-3xl text-brand-ink">automation</div>
          <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
            live routing
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {["Lead captured", "Follow ups queued", "Slots suggested", "Call booked"].map((label, idx) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3"
            >
              <div
                className={
                  "h-3 w-3 rounded-full " +
                  (idx === 0
                    ? "bg-brand-blue"
                    : idx === 1
                      ? "bg-brand-pink"
                      : idx === 2
                        ? "bg-emerald-500"
                        : "bg-amber-500")
                }
              />
              <div className="text-sm font-semibold text-zinc-800">{label}</div>
              <div className="ml-auto text-xs text-zinc-500">instant</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-brand-mist p-4 text-sm text-zinc-700">
          Simple inputs in. Real appointments out.
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
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={190}
              height={58}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-2xl bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-900"
            >
              See it in action
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-14 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600">
              Built for dialers, closers, and managers
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              A clean ops layer for calls, appointments, and follow ups
            </h1>

            <p className="mt-4 max-w-xl text-base text-zinc-600">
              Capture a lead, schedule a call based on closer availability, and route the appointment straight into your team workflow.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-2xl bg-brand-ink px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-900"
              >
                See it in action
              </button>
              <a
                href="#book"
                className="rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Book a call
              </a>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {["Availability based slots", "Auto closer assignment", "Notes and recordings", "Manager visibility"].map(
                (t) => (
                  <div key={t} className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm">
                    <div className="font-semibold text-zinc-900">{t}</div>
                    <div className="mt-1 text-xs text-zinc-600">Simple and fast.</div>
                  </div>
                ),
              )}
            </div>
          </div>

          <AutomationGraphic />
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-10">
          <div
            className={
              "overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition-all " +
              (expanded ? "max-h-[900px]" : "max-h-[92px]")
            }
          >
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <div>
                <div className="text-lg font-semibold text-zinc-900">See it in action</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Drop your info and we will send a quick demo follow up.
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700">
                {expanded ? "Close" : "Open"}
              </div>
            </button>

            <div className="px-6 pb-6">
              <DemoRequestForm
                disabled={submitting || !!requestId}
                submitting={submitting}
                error={error}
                onSubmit={submit}
              />

              {requestId ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Thanks. Your request is in.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section id="book" ref={bookingRef} className="mx-auto max-w-6xl px-6 pb-16">
          {requestId ? (
            <BookingWidget requestId={requestId} />
          ) : (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 shadow-sm">
              Submit the form above to unlock booking.
            </div>
          )}
        </section>

        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
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
}: {
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: DemoRequestPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [optedIn, setOptedIn] = useState(false);

  const canSubmit =
    !disabled &&
    name.trim().length > 0 &&
    company.trim().length > 0 &&
    email.trim().length > 0;

  return (
    <form
      className="grid gap-4"
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-xs font-semibold text-zinc-600">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900"
            placeholder="Your name"
            autoComplete="name"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold text-zinc-600">Company</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={disabled}
            className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900"
            placeholder="Company"
            autoComplete="organization"
          />
        </label>

        <label className="grid gap-2 sm:col-span-2">
          <span className="text-xs font-semibold text-zinc-600">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900"
            placeholder="you@company.com"
            type="email"
            autoComplete="email"
          />
        </label>

        <label className="grid gap-2 sm:col-span-2">
          <span className="text-xs font-semibold text-zinc-600">Phone (optional)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={disabled}
            className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900"
            placeholder="(555) 555-5555"
            autoComplete="tel"
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={optedIn}
          onChange={(e) => setOptedIn(e.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4"
        />
        <span>
          Opt in for SMS updates. Only sent if a phone number is provided.
        </span>
      </label>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-zinc-500">
          Follow ups are queued now. Sending is enabled when SendGrid and Twilio are configured.
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className={
            "h-11 rounded-2xl px-6 text-sm font-semibold text-white transition " +
            (canSubmit
              ? "bg-brand-ink hover:bg-zinc-900"
              : "cursor-not-allowed bg-zinc-300")
          }
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
