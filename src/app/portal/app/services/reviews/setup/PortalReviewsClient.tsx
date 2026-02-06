"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewDelayUnit = "minutes" | "hours" | "days" | "weeks";

type ReviewDelay = {
  value: number;
  unit: ReviewDelayUnit;
};

type ReviewDestination = {
  id: string;
  label: string;
  url: string;
};

type ReviewsPublicPageSettings = {
  enabled: boolean;
  title: string;
  description: string;
  heroPhotoUrl?: string;
  verifiedBadge: boolean;
};

type ReviewRequestsSettings = {
  version: 1;
  enabled: boolean;
  sendAfter: ReviewDelay;
  destinations: ReviewDestination[];
  defaultDestinationId?: string;
  messageTemplate: string;
  publicPage: ReviewsPublicPageSettings;
};

type ReviewRequestEvent = {
  id: string;
  bookingId: string;
  scheduledForIso: string;
  destinationLabel: string;
  destinationUrl: string;
  contactName: string;
  smsTo: string | null;
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
  error?: string;
  createdAtIso: string;
};

const DEFAULT_SETTINGS: ReviewRequestsSettings = {
  version: 1,
  enabled: false,
  sendAfter: { value: 30, unit: "minutes" },
  destinations: [],
  messageTemplate: "Hi {name} — thanks again! If you have 30 seconds, would you leave us a review? {link}",
  publicPage: {
    enabled: true,
    title: "Reviews",
    description: "We’d love to hear about your experience.",
    verifiedBadge: true,
  },
};

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeUrl(raw: string) {
  const v = (raw || "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function idFromLabel(label: string) {
  const cleaned = (label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || `dest-${Date.now()}`;
}

export default function PortalReviewsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReviewRequestsSettings>(DEFAULT_SETTINGS);

  const [publicSiteSlug, setPublicSiteSlug] = useState<string | null>(null);

  const [events, setEvents] = useState<ReviewRequestEvent[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [upcomingBookings, setUpcomingBookings] = useState<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      status: "SCHEDULED" | "CANCELED";
      contactName: string;
      contactEmail: string;
      contactPhone: string | null;
      canceledAt: string | null;
    }>
  >([]);
  const [recentBookings, setRecentBookings] = useState<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      status: "SCHEDULED" | "CANCELED";
      contactName: string;
      contactEmail: string;
      contactPhone: string | null;
      canceledAt: string | null;
    }>
  >([]);
  const [bookingQuery, setBookingQuery] = useState("");

  const [newDestLabel, setNewDestLabel] = useState("Google Reviews");
  const [newDestUrl, setNewDestUrl] = useState("");

  const previewLink = useMemo(() => {
    if (settings.publicPage.enabled && publicSiteSlug) return `/${publicSiteSlug}/reviews`;
    const preferred = settings.defaultDestinationId
      ? settings.destinations.find((d) => d.id === settings.defaultDestinationId)
      : null;
    return preferred?.url || settings.destinations[0]?.url || "";
  }, [publicSiteSlug, settings.defaultDestinationId, settings.destinations, settings.publicPage.enabled]);

  const previewBody = useMemo(() => {
    const business = "{business}";
    return (settings.messageTemplate || "")
      .replaceAll("{name}", "Sam")
      .replaceAll("{link}", previewLink || "https://example.com/review")
      .replaceAll("{business}", business)
      .trim();
  }, [settings.messageTemplate, previewLink]);

  const maxValue = useMemo(() => {
    const unit = settings.sendAfter.unit;
    if (unit === "weeks") return 2;
    if (unit === "days") return 14;
    if (unit === "hours") return 24 * 14;
    return 60 * 24 * 14;
  }, [settings.sendAfter.unit]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, e, site] = await Promise.all([
        fetch("/api/portal/reviews/settings", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/portal/reviews/events?limit=50", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/portal/blogs/site", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (!s?.ok) throw new Error(s?.error || "Failed to load settings");
      setSettings(s.settings || DEFAULT_SETTINGS);
      setEvents(Array.isArray(e?.events) ? e.events : []);
      setPublicSiteSlug(typeof site?.site?.slug === "string" ? site.site.slug : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    setBookingsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/booking/bookings", { cache: "no-store" }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Failed to load bookings");

      const upcoming = Array.isArray(res?.upcoming) ? res.upcoming : [];
      const recent = Array.isArray(res?.recent) ? res.recent : [];
      setUpcomingBookings(upcoming);
      setRecentBookings(recent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBookingsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(next: ReviewRequestsSettings) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/reviews/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: next }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Failed to save");
      setSettings(res.settings || next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function setSendAfter(partial: Partial<ReviewDelay>) {
    const next: ReviewRequestsSettings = {
      ...settings,
      sendAfter: {
        value: clampInt(partial.value ?? settings.sendAfter.value, 0, maxValue),
        unit: (partial.unit ?? settings.sendAfter.unit) as ReviewDelayUnit,
      },
    };
    setSettings(next);
  }

  function addDestination() {
    const url = normalizeUrl(newDestUrl);
    if (!url) {
      setError("Please enter a valid http(s) URL.");
      return;
    }
    const label = (newDestLabel || "Review link").trim().slice(0, 60) || "Review link";
    const id = idFromLabel(label);
    const dest: ReviewDestination = { id, label, url };
    const nextDestinations = [...settings.destinations, dest].slice(0, 10);
    const next: ReviewRequestsSettings = {
      ...settings,
      destinations: nextDestinations,
      defaultDestinationId: settings.defaultDestinationId || dest.id,
    };
    setSettings(next);
    setNewDestUrl("");
  }

  function removeDestination(id: string) {
    const nextDestinations = settings.destinations.filter((d) => d.id !== id);
    const nextDefault =
      settings.defaultDestinationId === id ? nextDestinations[0]?.id : settings.defaultDestinationId;
    const next: ReviewRequestsSettings = {
      ...settings,
      destinations: nextDestinations,
      ...(nextDefault ? { defaultDestinationId: nextDefault } : {}),
    };
    setSettings(next);
  }

  async function manualSend(bookingId: string) {
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const res = await fetch("/api/portal/reviews/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Failed to send");
      setSendResult("Sent");
      await load();
    } catch (err) {
      setSendResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  const filteredUpcoming = useMemo(() => {
    const q = bookingQuery.trim().toLowerCase();
    if (!q) return upcomingBookings;
    return upcomingBookings.filter((b) => {
      const hay = `${b.contactName} ${b.contactEmail} ${b.contactPhone || ""} ${b.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookingQuery, upcomingBookings]);

  const filteredRecent = useMemo(() => {
    const q = bookingQuery.trim().toLowerCase();
    if (!q) return recentBookings;
    return recentBookings.filter((b) => {
      const hay = `${b.contactName} ${b.contactEmail} ${b.contactPhone || ""} ${b.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookingQuery, recentBookings]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex flex-col gap-1">
        <div className="text-2xl font-semibold">Review Requests</div>
        <div className="text-sm text-neutral-600">
          Send a review link after an appointment, and optionally host a public Reviews page.
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Settings</div>
            <button
              className={`h-10 rounded-lg px-4 text-sm font-medium ${
                settings.enabled ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-900"
              }`}
              onClick={() => {
                const next = { ...settings, enabled: !settings.enabled };
                setSettings(next);
              }}
              type="button"
            >
              {settings.enabled ? "On" : "Off"}
            </button>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Send after appointment ends</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="h-10 w-24 rounded-lg border px-3 text-sm"
                value={settings.sendAfter.value}
                onChange={(e) => setSendAfter({ value: clampInt(Number(e.target.value), 0, maxValue) })}
                type="number"
                min={0}
                max={maxValue}
              />
              <select
                className="h-10 w-32 rounded-lg border px-3 text-sm"
                value={settings.sendAfter.unit}
                onChange={(e) => {
                  const unit = e.target.value as ReviewDelayUnit;
                  const nextMax = unit === "weeks" ? 2 : unit === "days" ? 14 : unit === "hours" ? 24 * 14 : 60 * 24 * 14;
                  const nextValue = clampInt(settings.sendAfter.value, 0, nextMax);
                  setSendAfter({ unit, value: nextValue });
                }}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <div className="text-xs text-neutral-500">Max 2 weeks.</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium">Review destinations</div>
            <div className="mt-2 space-y-2">
              {settings.destinations.length === 0 ? (
                <div className="text-sm text-neutral-600">Add at least one review link.</div>
              ) : null}

              {settings.destinations.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.label}</div>
                    <div className="truncate text-xs text-neutral-500">{d.url}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-neutral-700">
                      <input
                        type="radio"
                        checked={settings.defaultDestinationId === d.id || (!settings.defaultDestinationId && settings.destinations[0]?.id === d.id)}
                        onChange={() => setSettings({ ...settings, defaultDestinationId: d.id })}
                      />
                      default
                    </label>
                    <button
                      type="button"
                      className="h-9 rounded-lg border px-3 text-xs"
                      onClick={() => removeDestination(d.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="h-10 flex-1 rounded-lg border px-3 text-sm"
                placeholder="Label (e.g. Google Reviews)"
                value={newDestLabel}
                onChange={(e) => setNewDestLabel(e.target.value)}
              />
              <input
                className="h-10 flex-[2] rounded-lg border px-3 text-sm"
                placeholder="https://..."
                value={newDestUrl}
                onChange={(e) => setNewDestUrl(e.target.value)}
              />
              <button className="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white" onClick={addDestination} type="button">
                Add
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium">SMS template</div>
            <div className="mt-2 text-xs text-neutral-500">Use placeholders: {"{name}"}, {"{link}"}, {"{business}"}</div>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-lg border px-3 py-2 text-sm"
              value={settings.messageTemplate}
              onChange={(e) => setSettings({ ...settings, messageTemplate: e.target.value })}
            />
            <div className="mt-2 rounded-lg border bg-neutral-50 p-3 text-xs text-neutral-700">
              <div className="font-medium">Preview</div>
              <div className="mt-1 whitespace-pre-wrap">{previewBody}</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium">Hosted reviews page</div>
            {publicSiteSlug ? (
              <div className="mt-1 text-xs text-neutral-500">
                Public URL: <span className="font-mono">/{publicSiteSlug}/reviews</span>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.publicPage.enabled}
                  onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, enabled: e.target.checked } })}
                />
                Enable public page
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.publicPage.verifiedBadge}
                  onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, verifiedBadge: e.target.checked } })}
                />
                Show “Verified by Purely” badge
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                className="h-10 rounded-lg border px-3 text-sm"
                placeholder="Page title"
                value={settings.publicPage.title}
                onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, title: e.target.value } })}
              />
              <input
                className="h-10 rounded-lg border px-3 text-sm"
                placeholder="Hero photo URL (optional)"
                value={settings.publicPage.heroPhotoUrl || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    publicPage: { ...settings.publicPage, heroPhotoUrl: e.target.value || undefined },
                  })
                }
              />
            </div>
            <textarea
              className="mt-2 min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Description"
              value={settings.publicPage.description}
              onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, description: e.target.value } })}
            />
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-60"
              disabled={saving}
              onClick={() => save(settings)}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="h-10 rounded-lg border px-4 text-sm" onClick={load} type="button">
              Refresh
            </button>
            {saving ? <div className="text-xs text-neutral-500">Please wait…</div> : null}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="text-lg font-semibold">Manual send</div>
          <div className="mt-1 text-sm text-neutral-600">Send a one-off review request for a specific booking.</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="h-10 flex-1 rounded-lg border px-3 text-sm"
              placeholder="Search bookings by name, email, phone, or ID"
              value={bookingQuery}
              onChange={(e) => setBookingQuery(e.target.value)}
            />
            <button
              className="h-10 rounded-lg border px-4 text-sm"
              disabled={bookingsLoading}
              onClick={loadBookings}
              type="button"
            >
              {bookingsLoading ? "Loading…" : "Load bookings"}
            </button>
          </div>
          {sendResult ? <div className="mt-2 text-sm text-emerald-700">{sendResult}</div> : null}

          <div className="mt-4">
            <div className="text-sm font-medium">Recent bookings</div>
            <div className="mt-2 rounded-lg border">
              <div className="grid grid-cols-1 gap-0">
                {(filteredRecent.length === 0 && filteredUpcoming.length === 0) ? (
                  <div className="p-4 text-sm text-neutral-600">No bookings loaded yet.</div>
                ) : null}

                {filteredRecent.slice(0, 25).map((b) => {
                  const ended = Date.now() >= new Date(b.endAt).getTime();
                  const canSend = ended && b.status === "SCHEDULED" && !sending;
                  return (
                    <div key={b.id} className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{b.contactName}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                          <span>{new Date(b.startAt).toLocaleString()}</span>
                          <span className="truncate">{b.contactPhone || "(no phone)"}</span>
                          <span className={b.status === "CANCELED" ? "text-red-700" : ""}>{b.status}</span>
                          {!ended ? <span className="text-amber-700">Not ended yet</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="h-9 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-60"
                          disabled={!canSend}
                          onClick={() => manualSend(b.id)}
                          type="button"
                        >
                          {sending ? "Sending…" : "Send"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {filteredUpcoming.length ? (
              <div className="mt-4">
                <div className="text-sm font-medium">Upcoming bookings</div>
                <div className="mt-2 rounded-lg border">
                  {filteredUpcoming.slice(0, 10).map((b) => (
                    <div key={b.id} className="flex flex-col gap-1 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{b.contactName}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                          <span>{new Date(b.startAt).toLocaleString()}</span>
                          <span className="truncate">{b.contactPhone || "(no phone)"}</span>
                          <span>{b.status}</span>
                        </div>
                      </div>
                      <div className="text-xs text-amber-700">Can’t send until it ends</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="text-lg font-semibold">Recent activity</div>
            <div className="mt-3 space-y-2">
              {events.length === 0 ? <div className="text-sm text-neutral-600">No activity yet.</div> : null}
              {events.map((e) => (
                <div key={e.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {e.status} — {e.contactName || "(no name)"}
                    </div>
                    <div className="text-xs text-neutral-500">{new Date(e.createdAtIso).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Booking: <span className="font-mono">{e.bookingId}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">To: {e.smsTo || "—"}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Link: <a className="underline" href={e.destinationUrl} target="_blank" rel="noreferrer">
                      {e.destinationLabel}
                    </a>
                  </div>
                  {e.reason ? <div className="mt-1 text-xs text-amber-700">Reason: {e.reason}</div> : null}
                  {e.error ? <div className="mt-1 text-xs text-red-700">Error: {e.error}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
