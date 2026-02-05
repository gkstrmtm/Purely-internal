"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Site = {
  slug: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  timeZone: string;
  hostName?: string | null;
};

type Slot = { startAt: string; endAt: string };

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
};

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

export function PublicBookingClient({ slug }: { slug: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Booking | null>(null);

  const canBook = useMemo(() => {
    return Boolean(selected && name.trim() && email.trim());
  }, [selected, name, email]);

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
      url.searchParams.set("days", "14");
      url.searchParams.set("durationMinutes", String(site?.durationMinutes ?? 30));
      url.searchParams.set("limit", "30");

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
    if (!site) return;
    loadSlots().catch((e) => setError(e instanceof Error ? e.message : "Failed to load times"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.durationMinutes, site?.slug]);

  async function book() {
    if (!selected) return;
    setBookingBusy(true);
    setError(null);

    const res = await fetch(`/api/public/booking/${encodeURIComponent(slug)}/book`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startAt: selected,
        contactName: name,
        contactEmail: email,
        contactPhone: phone.trim() ? phone : null,
        notes: notes.trim() ? notes : null,
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
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  if (error && !site) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Booking page not found</div>
          <div className="mt-2 text-sm text-zinc-600">{error}</div>
          <div className="mt-6">
            <Link href="/portal" className="text-sm font-semibold text-brand-ink hover:underline">
              Go to portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success && site) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Booked</div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink">You’re all set.</h1>
          <p className="mt-3 text-sm text-zinc-600">
            {new Date(success.startAt).toLocaleString()} ({site.durationMinutes} minutes)
          </p>
          <div className="mt-6 text-sm text-zinc-600">You can close this window.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink">{site?.title ?? "Book a call"}</h1>
            {site?.description ? <p className="mt-2 text-sm text-zinc-600">{site.description}</p> : null}
            <div className="mt-2 text-xs text-zinc-500">Meeting length: {site?.durationMinutes ?? 30} minutes</div>
          </div>
          <Link href="/portal" className="text-sm font-semibold text-brand-ink hover:underline">
            Portal
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Pick a time</div>
            <div className="mt-3">
              {slotsLoading ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Loading times…</div>
              ) : slots.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  No times available yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {slots.map((s) => (
                    <button
                      key={s.startAt}
                      type="button"
                      onClick={() => setSelected(s.startAt)}
                      className={
                        "rounded-2xl border px-4 py-3 text-left text-sm transition-colors " +
                        (selected === s.startAt
                          ? "border-[color:var(--color-brand-blue)] bg-[color:rgba(29,78,216,0.06)]"
                          : "border-zinc-200 hover:bg-zinc-50")
                      }
                    >
                      <div className="font-semibold text-zinc-900">{new Date(s.startAt).toLocaleString()}</div>
                      <div className="mt-1 text-xs text-zinc-500">{site?.timeZone ?? ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-zinc-900">Your info</div>
            <div className="mt-3 space-y-3">
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <textarea
                className="h-28 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <button
                type="button"
                disabled={!canBook || bookingBusy}
                onClick={() => book()}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {bookingBusy ? "Booking…" : "Confirm booking"}
              </button>

              {error ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
