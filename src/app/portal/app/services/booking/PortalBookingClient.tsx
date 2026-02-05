"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BookingFormConfig = {
  version: 1;
  phone: { enabled: boolean; required: boolean };
  notes: { enabled: boolean; required: boolean };
  questions: { id: string; label: string; required: boolean; kind: "short" | "long" }[];
};

type Site = {
  id: string;
  slug: string;
  enabled: boolean;
  title: string;
  description?: string | null;
  durationMinutes: number;
  timeZone: string;

  photoUrl?: string | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  appointmentPurpose?: string | null;
  toneDirection?: string | null;
  notificationEmails?: string[] | null;
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

  const [photoBusy, setPhotoBusy] = useState(false);
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);

  const [form, setForm] = useState<BookingFormConfig | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const bookingUrl = useMemo(() => {
    if (!site?.slug) return null;
    if (typeof window === "undefined") return `/book/${site.slug}`;
    return `${window.location.origin}/book/${site.slug}`;
  }, [site?.slug]);

  async function refreshAll() {
    setError(null);
    const [meRes, settingsRes, bookingsRes, formRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/booking/settings", { cache: "no-store" }),
      fetch("/api/portal/booking/bookings", { cache: "no-store" }),
      fetch("/api/portal/booking/form", { cache: "no-store" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const settingsJson = await settingsRes.json().catch(() => ({}));
    if (settingsRes.ok) {
      const nextSite = (settingsJson as { site: Site }).site;
      setSite(nextSite);
      const xs = Array.isArray(nextSite?.notificationEmails) ? nextSite.notificationEmails : [];
      setNotificationEmails(xs);
    }

    const bookingsJson = await bookingsRes.json().catch(() => ({}));
    if (bookingsRes.ok) {
      setUpcoming((bookingsJson as { upcoming?: Booking[] }).upcoming ?? []);
      setRecent((bookingsJson as { recent?: Booking[] }).recent ?? []);
    }

    const formJson = await formRes.json().catch(() => ({}));
    if (formRes.ok) {
      setForm((formJson as { config?: BookingFormConfig }).config ?? null);
    }

    if (!meRes.ok || !settingsRes.ok || !bookingsRes.ok || !formRes.ok) {
      setError(
        getApiError(meJson) ??
          getApiError(settingsJson) ??
          getApiError(bookingsJson) ??
          getApiError(formJson) ??
          "Failed to load booking automation",
      );
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
    const nextSite = (body as { site: Site }).site;
    if (Array.isArray(nextSite?.notificationEmails)) {
      setNotificationEmails(nextSite.notificationEmails);
    }
    setStatus("Saved booking settings");
  }

  function sanitizeNotificationEmails(items: string[]): string[] {
    const xs = (Array.isArray(items) ? items : []).map((x) => String(x || "").trim()).filter(Boolean);
    const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    // De-dupe while preserving order.
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const x of xs) {
      const lower = x.toLowerCase();
      if (!emailLike.test(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      unique.push(lower);
    }
    return unique.slice(0, 20);
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

  function makeId(label: string) {
    const base = String(label || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const suffix = Math.random().toString(16).slice(2, 6);
    return `${base || "q"}-${suffix}`;
  }

  async function saveForm(next: BookingFormConfig) {
    setFormSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/booking/form", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });

    const body = await res.json().catch(() => ({}));
    setFormSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save booking form");
      return;
    }

    setForm((body as { config: BookingFormConfig }).config);
    setStatus("Saved booking form");
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
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
              <div className="font-medium text-zinc-800">Link slug</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={site?.slug ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, slug: e.target.value } : prev))}
                onBlur={() => save({ slug: site?.slug ?? "" })}
              />
              <div className="mt-2 text-xs text-zinc-500">This becomes the end of your public link: /book/&lt;slug&gt;</div>
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

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Customization & notifications</div>
          <div className="mt-2 text-sm text-zinc-600">
            Add an optional header photo, meeting info, and who gets notified when someone books.
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold text-zinc-600">Header photo (optional)</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  {site?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={site.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-zinc-500">{site?.photoUrl ? site.photoUrl : "No photo uploaded"}</div>
                  <div className="mt-1 text-xs text-zinc-500">Recommended: wide image, under 2MB.</div>
                </div>
              </div>

              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50">
                  {photoBusy ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={photoBusy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPhotoBusy(true);
                      setError(null);
                      try {
                        const fd = new FormData();
                        fd.set("file", file);
                        const up = await fetch("/api/uploads", { method: "POST", body: fd });
                        const upBody = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
                        if (!up.ok || !upBody.url) {
                          setError(upBody.error ?? "Upload failed");
                          return;
                        }
                        await save({ photoUrl: upBody.url });
                      } finally {
                        setPhotoBusy(false);
                        if (e.target) e.target.value = "";
                      }
                    }}
                  />
                </label>
                {site?.photoUrl ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    onClick={() => save({ photoUrl: null })}
                    disabled={saving}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting location (optional)</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Phone call, Zoom link, in-person address…"
                value={site?.meetingLocation ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, meetingLocation: e.target.value } : prev))}
                onBlur={() => save({ meetingLocation: site?.meetingLocation?.trim() ? site.meetingLocation.trim() : null })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting details (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Anything they should know before the call."
                value={site?.meetingDetails ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, meetingDetails: e.target.value } : prev))}
                onBlur={() => save({ meetingDetails: site?.meetingDetails?.trim() ? site.meetingDetails.trim() : null })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Appointment purpose (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="What is this appointment for?"
                value={site?.appointmentPurpose ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, appointmentPurpose: e.target.value } : prev))}
                onBlur={() =>
                  save({
                    appointmentPurpose: site?.appointmentPurpose?.trim()
                      ? site.appointmentPurpose.trim()
                      : null,
                  })
                }
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Tone direction (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Friendly, direct, professional…"
                value={site?.toneDirection ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, toneDirection: e.target.value } : prev))}
                onBlur={() =>
                  save({
                    toneDirection: site?.toneDirection?.trim() ? site.toneDirection.trim() : null,
                  })
                }
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
              <div className="font-medium text-zinc-800">Notification emails (optional)</div>
              <div className="mt-2 space-y-2">
                {notificationEmails.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                    Add one or more emails to notify when someone books.
                  </div>
                ) : null}

                {notificationEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={idx === 0 ? "you@company.com" : "another@company.com"}
                      value={email}
                      onChange={(e) => {
                        const next = [...notificationEmails];
                        next[idx] = e.target.value;
                        setNotificationEmails(next);
                      }}
                      onBlur={() => save({ notificationEmails: sanitizeNotificationEmails(notificationEmails) })}
                    />
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => {
                        const next = notificationEmails.filter((_, i) => i !== idx);
                        setNotificationEmails(next);
                        void save({ notificationEmails: sanitizeNotificationEmails(next) });
                      }}
                      aria-label="Remove email"
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  onClick={() => setNotificationEmails((prev) => [...prev, ""])}
                >
                  + Add email
                </button>

                <div className="text-xs text-zinc-500">Emails: {sanitizeNotificationEmails(notificationEmails).length}</div>
              </div>
            </label>
          </div>

          {saving ? <div className="mt-4 text-sm text-zinc-500">Saving…</div> : null}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Booking form</div>
        <div className="mt-1 text-sm text-zinc-600">
          Choose what questions to ask when someone books.
        </div>

        {!form ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Loading form settings…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Ask for phone</span>
                <input
                  type="checkbox"
                  checked={form.phone.enabled}
                  disabled={formSaving}
                  onChange={(e) =>
                    void saveForm({
                      ...form,
                      phone: { enabled: e.target.checked, required: e.target.checked ? form.phone.required : false },
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Phone required</span>
                <input
                  type="checkbox"
                  checked={form.phone.required}
                  disabled={formSaving || !form.phone.enabled}
                  onChange={(e) => void saveForm({ ...form, phone: { ...form.phone, required: e.target.checked } })}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Ask for notes</span>
                <input
                  type="checkbox"
                  checked={form.notes.enabled}
                  disabled={formSaving}
                  onChange={(e) =>
                    void saveForm({
                      ...form,
                      notes: { enabled: e.target.checked, required: e.target.checked ? form.notes.required : false },
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Notes required</span>
                <input
                  type="checkbox"
                  checked={form.notes.required}
                  disabled={formSaving || !form.notes.enabled}
                  onChange={(e) => void saveForm({ ...form, notes: { ...form.notes, required: e.target.checked } })}
                />
              </label>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Custom questions</div>
              <div className="mt-1 text-xs text-zinc-600">Add extra questions like a simple Google Form.</div>

              <div className="mt-3 space-y-2">
                {form.questions.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                    No custom questions yet.
                  </div>
                ) : null}

                {form.questions.map((q, idx) => (
                  <div key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center">
                      <input
                        className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={q.label}
                        disabled={formSaving}
                        onChange={(e) => {
                          const next = [...form.questions];
                          next[idx] = { ...q, label: e.target.value };
                          setForm({ ...form, questions: next });
                        }}
                        onBlur={() => void saveForm(form)}
                        placeholder="Question label"
                      />

                      <select
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={q.kind}
                        disabled={formSaving}
                        onChange={(e) => {
                          const next = [...form.questions];
                          next[idx] = { ...q, kind: (e.target.value as any) || "short" };
                          setForm({ ...form, questions: next });
                        }}
                        onBlur={() => void saveForm(form)}
                      >
                        <option value="short">Short answer</option>
                        <option value="long">Long answer</option>
                      </select>

                      <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
                        <span>Required</span>
                        <input
                          type="checkbox"
                          checked={q.required}
                          disabled={formSaving}
                          onChange={(e) => {
                            const next = [...form.questions];
                            next[idx] = { ...q, required: e.target.checked };
                            void saveForm({ ...form, questions: next });
                          }}
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-500">ID: {q.id}</div>
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        disabled={formSaving}
                        onClick={() => {
                          const next = form.questions.filter((x) => x.id !== q.id);
                          void saveForm({ ...form, questions: next });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  disabled={formSaving}
                  onClick={() => {
                    const label = "New question";
                    const next = {
                      id: makeId(label),
                      label,
                      required: false,
                      kind: "short" as const,
                    };
                    const updated = { ...form, questions: [...form.questions, next].slice(0, 20) };
                    setForm(updated);
                    void saveForm(updated);
                  }}
                >
                  + Add question
                </button>
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Your public booking link will show these questions immediately.
            </div>
          </div>
        )}
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
