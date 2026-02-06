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
  version: 2;
  enabled: boolean;
  steps: {
    id: string;
    enabled: boolean;
    leadTimeMinutes: number;
    messageBody: string;
  }[];
};

type AppointmentReminderEvent = {
  id: string;
  bookingId: string;
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

  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [settings, setSettings] = useState<AppointmentReminderSettings | null>(null);
  const [draft, setDraft] = useState<AppointmentReminderSettings | null>(null);
  const [events, setEvents] = useState<AppointmentReminderEvent[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const unlocked = useMemo(() => Boolean(me?.entitlements?.booking), [me?.entitlements?.booking]);

  async function refresh() {
    setError(null);

    const [meRes, remindersRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/booking/reminders/settings", { cache: "no-store" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const remJson = await remindersRes.json().catch(() => ({}));
    if (remindersRes.ok) {
      const s = ((remJson as any)?.settings as AppointmentReminderSettings) ?? null;
      setSettings(s);
      setDraft(s);
      setTwilio(((remJson as any)?.twilio as TwilioMasked) ?? null);
      setEvents((((remJson as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
    }

    if (!meRes.ok || !remindersRes.ok) {
      setError(getApiError(meJson) ?? getApiError(remJson) ?? "Failed to load appointment reminders");
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

  async function save(next: AppointmentReminderSettings) {
    setSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/booking/reminders/settings", {
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
      return { ...prev, version: 2, steps };
    });
  }

  function addStep() {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      if (steps.length >= 8) return prev;
      return {
        ...prev,
        version: 2,
        steps: [
          ...steps,
          { id: makeClientId("rem_"), enabled: true, leadTimeMinutes: 60, messageBody: DEFAULT_BODY },
        ],
      };
    });
  }

  function deleteStep(stepId: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.filter((s) => s.id !== stepId) : [];
      if (steps.length === 0) return prev;
      return { ...prev, version: 2, steps };
    });
  }

  async function setEnabled(enabled: boolean) {
    if (!draft) return;
    const next: AppointmentReminderSettings = { ...draft, enabled, version: 2 };
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
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="number"
                            min={5}
                            max={20160}
                            className="w-28 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            value={s.leadTimeMinutes}
                            onChange={(e) => updateStep(s.id, { leadTimeMinutes: Number(e.target.value) })}
                            disabled={saving}
                          />
                          <span className="text-sm text-zinc-600">min before</span>
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">Max 14 days (20160 minutes).</div>
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
            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                No reminder activity yet.
              </div>
            ) : (
              events.slice(0, 12).map((e) => (
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
