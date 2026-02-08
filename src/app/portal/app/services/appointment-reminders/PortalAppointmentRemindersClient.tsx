"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
};

type TwilioMasked = {
  configured: boolean;
  accountSidMasked: string | null;
  fromNumberE164: string | null;
  hasAuthToken: boolean;
  updatedAtIso: string | null;
};

type AppointmentReminderSettings = {
  version: 3;
  enabled: boolean;
  steps: {
    id: string;
    enabled: boolean;
    leadTime: { value: number; unit: "minutes" | "hours" | "days" | "weeks" };
    messageBody: string;
  }[];
};

type AppointmentReminderEvent = {
  id: string;
  bookingId: string;
  calendarId?: string;
  bookingStartAtIso: string;
  scheduledForIso: string;

  stepId: string;
  stepLeadTimeMinutes: number;

  contactName: string;
  contactPhoneRaw: string | null;
  smsTo: string | null;
  smsBody: string | null;

  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
  smsMessageSid?: string;
  error?: string;

  createdAtIso: string;
};

type BookingCalendar = {
  id: string;
  enabled: boolean;
  title: string;
  description?: string;
  durationMinutes?: number;
};

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

function makeClientId(prefix: string) {
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return `${prefix}${Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
  } catch {
    return `${prefix}${Math.random().toString(16).slice(2, 10)}`;
  }
}

const DEFAULT_BODY = "Reminder: your appointment is scheduled for {when}.";

export function PortalAppointmentRemindersClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [calendars, setCalendars] = useState<BookingCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);

  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [settings, setSettings] = useState<AppointmentReminderSettings | null>(null);
  const [draft, setDraft] = useState<AppointmentReminderSettings | null>(null);
  const [events, setEvents] = useState<AppointmentReminderEvent[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const unlocked = useMemo(() => Boolean(me?.entitlements?.booking), [me?.entitlements?.booking]);

  const calendarsById = useMemo(() => {
    const m = new Map<string, BookingCalendar>();
    for (const c of calendars) m.set(c.id, c);
    return m;
  }, [calendars]);

  const filteredEvents = useMemo(() => {
    const cal = selectedCalendarId;
    if (!cal) return events;
    return events.filter((e) => e.calendarId === cal);
  }, [events, selectedCalendarId]);

  function maxValueForUnit(unit: AppointmentReminderSettings["steps"][number]["leadTime"]["unit"]) {
    if (unit === "weeks") return 2;
    if (unit === "days") return 14;
    if (unit === "hours") return 24 * 14;
    return 60 * 24 * 14;
  }

  function minValueForUnit(unit: AppointmentReminderSettings["steps"][number]["leadTime"]["unit"]) {
    return unit === "minutes" ? 5 : 1;
  }

  function remindersUrl(calendarId: string | null) {
    const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return `/api/portal/booking/reminders/settings${q}`;
  }

  async function fetchReminders(calendarId: string | null) {
    const remindersRes = await fetch(remindersUrl(calendarId), { cache: "no-store" });
    const remJson = await remindersRes.json().catch(() => ({}));
    if (remindersRes.ok) {
      const s = ((remJson as any)?.settings as AppointmentReminderSettings) ?? null;
      setSettings(s);
      setDraft(s);
      setTwilio(((remJson as any)?.twilio as TwilioMasked) ?? null);
      setEvents((((remJson as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
      return { ok: true as const };
    }
    return { ok: false as const, error: getApiError(remJson) ?? "Failed to load appointment reminders" };
  }

  async function refresh() {
    setError(null);

    const [meRes, calendarsRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store", headers: { "x-pa-app": "portal" } }),
      fetch("/api/portal/booking/calendars", { cache: "no-store" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const calJson = await calendarsRes.json().catch(() => ({}));
    if (calendarsRes.ok) {
      const list = (((calJson as any)?.config?.calendars as BookingCalendar[]) ?? []).filter((c) => c && c.id);
      setCalendars(list);
      if (!selectedCalendarId) {
        const firstEnabled = list.find((c) => c.enabled) ?? list[0];
        if (firstEnabled?.id) setSelectedCalendarId(firstEnabled.id);
      }
    }

    const targetCalendar = selectedCalendarId;
    const remindersResult = await fetchReminders(targetCalendar);
    if (!meRes.ok || !calendarsRes.ok || !remindersResult.ok) {
      setError(getApiError(meJson) ?? getApiError(calJson) ?? ("error" in remindersResult ? remindersResult.error : null) ?? "Failed to load appointment reminders");
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await refresh();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCalendarId) return;
    void (async () => {
      setError(null);
      const res = await fetchReminders(selectedCalendarId);
      if (!res.ok) setError((res as any).error ?? "Failed to load appointment reminders");
    })();
  }, [selectedCalendarId]);

  async function save(next: AppointmentReminderSettings) {
    setSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch(remindersUrl(selectedCalendarId), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: next }),
    });

    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save reminders");
      return;
    }

    const s = ((body as any)?.settings as AppointmentReminderSettings) ?? next;
    setSettings(s);
    setDraft(s);
    setTwilio(((body as any)?.twilio as TwilioMasked) ?? null);
    setEvents((((body as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
    setStatus("Saved");
  }

  function updateStep(stepId: string, partial: Partial<AppointmentReminderSettings["steps"][number]>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      steps[idx] = { ...steps[idx], ...partial };
      return { ...prev, version: 3, steps };
    });
  }

  function addStep() {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      if (steps.length >= 8) return prev;
      return {
        ...prev,
        version: 3,
        steps: [
          ...steps,
          { id: makeClientId("rem_"), enabled: true, leadTime: { value: 1, unit: "hours" }, messageBody: DEFAULT_BODY },
        ],
      };
    });
  }

  function deleteStep(stepId: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.filter((s) => s.id !== stepId) : [];
      if (steps.length === 0) return prev;
      return { ...prev, version: 3, steps };
    });
  }

  async function setEnabled(enabled: boolean) {
    if (!draft) return;
    const next: AppointmentReminderSettings = { ...draft, enabled, version: 3 };
    setDraft(next);
    await save(next);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[color:rgba(251,113,133,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-pink)]">
            Locked
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Appointment Reminders</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-600">Requires Booking Automation to be enabled on your plan.</p>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Appointment Reminders</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">Cut no-shows with automatic reminders.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/portal/app/services/booking"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Open booking
          </Link>
          <Link
            href="/portal/app/services"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            All services
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {status ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{status}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Setup</div>
              <div className="mt-2 text-sm text-zinc-600">Add one or more reminder steps with different lead times.</div>
            </div>

            <div className="inline-flex overflow-hidden rounded-2xl border border-zinc-200">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-semibold ${
                  draft && !draft.enabled ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
                disabled={saving || !draft}
                onClick={() => void setEnabled(false)}
              >
                Off
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-semibold ${
                  draft && draft.enabled ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
                disabled={saving || !draft}
                onClick={() => void setEnabled(true)}
              >
                On
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-zinc-600">Calendar</label>
            <div className="mt-2 flex items-center gap-2">
              <select
                className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                value={selectedCalendarId ?? ""}
                onChange={(e) => setSelectedCalendarId(e.target.value || null)}
                disabled={saving}
              >
                <option value="">Default (all booking links)</option>
                {calendars
                  .slice()
                  .sort((a, b) => a.title.localeCompare(b.title))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}{c.enabled ? "" : " (disabled)"}
                    </option>
                  ))}
              </select>
              {selectedCalendarId ? (
                <div className="text-xs text-zinc-500">
                  Configuring: {calendarsById.get(selectedCalendarId)?.title ?? selectedCalendarId}
                </div>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Each calendar can have its own reminder sequence.
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-zinc-800">Twilio</div>
              <div className={`text-xs font-semibold ${twilio?.configured ? "text-emerald-700" : "text-amber-700"}`}>
                {twilio?.configured ? "Configured" : "Not configured"}
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-600">
              {twilio?.configured
                ? `From: ${twilio.fromNumberE164 ?? ""}`
                : "Add your Twilio credentials (Services → Missed-Call Text Back) to enable SMS reminders."}
            </div>
          </div>

          {draft ? (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-zinc-600">Reminder steps</div>
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                  disabled={saving || draft.steps.length >= 8}
                  onClick={() => addStep()}
                >
                  Add step
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {draft.steps.map((s, idx) => (
                  <div key={s.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900">Step {idx + 1}</div>
                        <div className="mt-1 text-xs text-zinc-600">Variables: {"{name}"}, {"{when}"}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-xs text-zinc-600">Enabled</span>
                          <input
                            type="checkbox"
                            checked={Boolean(s.enabled)}
                            disabled={saving}
                            onChange={(e) => updateStep(s.id, { enabled: e.target.checked })}
                          />
                        </label>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                          disabled={saving || draft.steps.length <= 1}
                          onClick={() => deleteStep(s.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                        <div className="font-medium text-zinc-800">Timing</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={minValueForUnit(s.leadTime.unit)}
                            max={maxValueForUnit(s.leadTime.unit)}
                            className="h-10 w-24 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            value={s.leadTime.value}
                            onChange={(e) =>
                              updateStep(s.id, {
                                leadTime: {
                                  ...s.leadTime,
                                  value: Number(e.target.value),
                                },
                              })
                            }
                            disabled={saving}
                          />
                          <select
                            className="h-10 w-32 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            value={s.leadTime.unit}
                            disabled={saving}
                            onChange={(e) =>
                              updateStep(s.id, {
                                leadTime: {
                                  unit: e.target.value as any,
                                  value: Math.max(
                                    minValueForUnit(e.target.value as any),
                                    Math.min(maxValueForUnit(e.target.value as any), s.leadTime.value),
                                  ),
                                },
                              })
                            }
                          >
                            <option value="minutes">minutes</option>
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                            <option value="weeks">weeks</option>
                          </select>
                          <span className="text-sm text-zinc-600">before</span>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-zinc-500">Max 2 weeks.</div>
                      </label>

                      <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                        <div className="font-medium text-zinc-800">Message</div>
                        <textarea
                          className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={s.messageBody}
                          onChange={(e) => updateStep(s.id, { messageBody: e.target.value })}
                          disabled={saving}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  disabled={saving}
                  onClick={() => setDraft(settings ?? draft)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={saving || draft.steps.length === 0 || draft.steps.some((x) => !String(x.messageBody || "").trim())}
                  onClick={() => void save(draft)}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 text-sm text-zinc-500">Loading reminders…</div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Activity</div>
          <div className="mt-2 text-sm text-zinc-600">Reminders sent (or skipped) show here.</div>

          <div className="mt-4 space-y-2">
            {filteredEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                No reminder activity yet.
              </div>
            ) : (
              filteredEvents.slice(0, 12).map((e) => (
                <div key={e.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-zinc-800">{e.contactName || "(unknown)"}</div>
                    <div
                      className={`text-xs font-semibold ${
                        e.status === "SENT" ? "text-emerald-700" : e.status === "FAILED" ? "text-red-700" : "text-zinc-600"
                      }`}
                    >
                      {e.status.toLowerCase()}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Step: {e.stepLeadTimeMinutes}m before · Appt: {new Date(e.bookingStartAtIso).toLocaleString()}
                  </div>
                  {e.reason ? <div className="mt-1 text-xs text-zinc-600">{e.reason}</div> : null}
                  {e.error ? <div className="mt-1 text-xs text-red-700">{e.error}</div> : null}
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              onClick={() => void refresh()}
              disabled={saving}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Tip: reminders are processed every 5 minutes.
      </div>
    </div>
  );
}
