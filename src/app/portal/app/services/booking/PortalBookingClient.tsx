"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Site = {
  id: string;
  slug: string;
  enabled: boolean;
  title: string;
  description?: string | null;
  durationMinutes: number;
  timeZone: string;
};

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
};

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  canceledAt?: string | null;
};

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

export function PortalBookingClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [recent, setRecent] = useState<Booking[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const bookingUrl = useMemo(() => {
    if (!site?.slug) return null;
    if (typeof window === "undefined") return `/book/${site.slug}`;
    return `${window.location.origin}/book/${site.slug}`;
  }, [site?.slug]);

  async function refreshAll() {
    setError(null);
    const [meRes, settingsRes, bookingsRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/booking/settings", { cache: "no-store" }),
      fetch("/api/portal/booking/bookings", { cache: "no-store" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const settingsJson = await settingsRes.json().catch(() => ({}));
    if (settingsRes.ok) setSite((settingsJson as { site: Site }).site);

    const bookingsJson = await bookingsRes.json().catch(() => ({}));
    if (bookingsRes.ok) {
      setUpcoming((bookingsJson as { upcoming?: Booking[] }).upcoming ?? []);
      setRecent((bookingsJson as { recent?: Booking[] }).recent ?? []);
    }

    if (!meRes.ok || !settingsRes.ok || !bookingsRes.ok) {
      setError(getApiError(meJson) ?? getApiError(settingsJson) ?? getApiError(bookingsJson) ?? "Failed to load booking automation");
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await refreshAll();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function save(partial: Partial<Site>) {
    if (!site) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/booking/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save settings");
      return;
    }

    setSite((body as { site: Site }).site);
    setStatus("Saved booking settings");
  }

  async function cancelBooking(id: string) {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/portal/booking/bookings/${id}/cancel`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to cancel booking");
      return;
    }
    await refreshAll();
    setStatus("Canceled booking");
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  const unlocked = Boolean(me?.entitlements?.booking);

  if (!unlocked) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[color:rgba(251,113,133,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-pink)]">
            Locked
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Booking Automation</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-600">
            This service isn’t included in your current plan. Upgrade to unlock your booking link and availability.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/billing"
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in billing
            </Link>
            <Link
              href="/portal/app/services"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Back to services
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Booking Automation</h1>
          <p className="mt-1 text-sm text-zinc-600">Publish a booking link, set availability, and capture appointments.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/portal/app/services"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Services
          </Link>
          <Link
            href="/portal/app/billing"
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Billing
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Booking link</div>
          <div className="mt-2 text-sm text-zinc-600">
            Share this link anywhere. Only times you mark as available will show.
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
              <div className="truncate">{bookingUrl ?? "…"}</div>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={!bookingUrl}
              onClick={async () => {
                if (!bookingUrl) return;
                await navigator.clipboard.writeText(bookingUrl);
                setStatus("Copied booking link");
              }}
            >
              Copy
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="font-medium text-zinc-800">Booking enabled</span>
              <input
                type="checkbox"
                checked={Boolean(site?.enabled)}
                onChange={(e) => save({ enabled: e.target.checked })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting length</div>
              <select
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={site?.durationMinutes ?? 30}
                onChange={(e) => save({ durationMinutes: Number(e.target.value) })}
              >
                {[15, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
              <div className="font-medium text-zinc-800">Page title</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={site?.title ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                onBlur={() => save({ title: site?.title ?? "" })}
              />
              <div className="mt-2 text-xs text-zinc-500">
                Tip: you can also customize the link slug in settings (coming next). For now it’s stable.
              </div>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/services/booking/availability"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Edit availability
            </Link>
            {site?.enabled ? (
              <a
                href={bookingUrl ?? "#"}
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                target="_blank"
                rel="noreferrer"
              >
                Preview booking page
              </a>
            ) : null}
          </div>

          {saving ? <div className="mt-4 text-sm text-zinc-500">Saving…</div> : null}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Upcoming bookings</div>
          <div className="mt-3 space-y-3">
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                No bookings yet.
              </div>
            ) : (
              upcoming.map((b) => (
                <div key={b.id} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="text-sm font-semibold text-zinc-900">
                    {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleTimeString()}
                  </div>
                  <div className="mt-1 text-sm text-zinc-700">
                    {b.contactName} · {b.contactEmail}
                    {b.contactPhone ? ` · ${b.contactPhone}` : ""}
                  </div>
                  {b.notes ? <div className="mt-2 text-sm text-zinc-600">{b.notes}</div> : null}
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => cancelBooking(b.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {recent.length ? (
            <>
              <div className="mt-6 text-sm font-semibold text-zinc-900">Recent</div>
              <div className="mt-3 space-y-2">
                {recent.slice(0, 6).map((b) => (
                  <div key={b.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                    <div className="font-medium text-zinc-800">
                      {new Date(b.startAt).toLocaleString()} · {b.status.toLowerCase()}
                    </div>
                    <div className="mt-1 text-zinc-600">{b.contactName}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>
      ) : null}
    </div>
  );
}
