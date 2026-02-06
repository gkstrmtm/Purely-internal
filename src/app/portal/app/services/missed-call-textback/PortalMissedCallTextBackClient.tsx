"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Settings = {
  version: 1;
  enabled: boolean;
  replyDelaySeconds: number;
  replyBody: string;
  forwardToPhoneE164: string | null;
  webhookToken: string;
};

type EventRow = {
  id: string;
  callSid: string;
  from: string;
  to: string | null;
  createdAtIso: string;
  dialCallStatus?: string;
  finalStatus: "ANSWERED" | "MISSED" | "UNKNOWN";
  smsStatus: "NONE" | "SENT" | "SKIPPED" | "FAILED";
  smsTo?: string;
  smsFrom?: string;
  smsBody?: string;
  smsMessageSid?: string;
  smsError?: string;
};

type ApiPayload = {
  ok: boolean;
  settings: Settings;
  events: EventRow[];
  profilePhone: string | null;
  twilioConfigured: boolean;
  twilioReason?: string;
  webhookUrl: string;
  notes?: { variables?: string[] };
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badgeClass(kind: string) {
  switch (kind) {
    case "SENT":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "FAILED":
      return "bg-red-50 text-red-700 border-red-200";
    case "SKIPPED":
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
    case "MISSED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "ANSWERED":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
  }
}

export function PortalMissedCallTextBackClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [twilioConfigured, setTwilioConfigured] = useState<boolean>(false);
  const [twilioReason, setTwilioReason] = useState<string | undefined>(undefined);
  const [webhookUrl, setWebhookUrl] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/missed-call-textback/settings", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      setError("Failed to load.");
      return;
    }

    const data = (await res.json()) as ApiPayload;
    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setProfilePhone(data.profilePhone ?? null);
    setTwilioConfigured(Boolean(data.twilioConfigured));
    setTwilioReason(data.twilioReason);
    setWebhookUrl(data.webhookUrl || "");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const missedCalls = useMemo(
    () => events.filter((e) => e.finalStatus === "MISSED"),
    [events],
  );

  const forwardPreview = settings?.forwardToPhoneE164 || profilePhone || "(not set)";

  async function save(next: Settings) {
    setSaving(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/missed-call-textback/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: next }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setSaving(false);
      setError(text || "Save failed.");
      return;
    }

    const data = (await res.json()) as ApiPayload;
    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setProfilePhone(data.profilePhone ?? null);
    setTwilioConfigured(Boolean(data.twilioConfigured));
    setTwilioReason(data.twilioReason);
    setWebhookUrl(data.webhookUrl || "");
    setSaving(false);
    setNote("Saved.");

    window.setTimeout(() => setNote(null), 1800);
  }

  async function regenerateToken() {
    setSaving(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/missed-call-textback/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: settings, regenerateToken: true }),
    });

    if (!res.ok) {
      setSaving(false);
      setError("Failed to regenerate.");
      return;
    }

    const data = (await res.json()) as ApiPayload;
    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setProfilePhone(data.profilePhone ?? null);
    setTwilioConfigured(Boolean(data.twilioConfigured));
    setTwilioReason(data.twilioReason);
    setWebhookUrl(data.webhookUrl || "");
    setSaving(false);
    setNote("Webhook token regenerated.");
    window.setTimeout(() => setNote(null), 2200);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied.");
      window.setTimeout(() => setNote(null), 1200);
    } catch {
      setError("Copy failed.");
    }
  }

  if (loading || !settings) {
    return (
      <div className="mx-auto max-w-6xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Missed-Call Text Back</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            A simple missed-call list + a simple auto-text.
          </p>
        </div>
        <Link
          href="/portal/app/services"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      {!twilioConfigured ? (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Twilio isn’t configured</div>
          <div className="mt-1 text-amber-900/80">
            This will start sending texts as soon as Twilio credentials are set in environment variables.
            {twilioReason ? ` (${twilioReason})` : ""}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {note ? (
        <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {note}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Automation</div>
              <div className="mt-1 text-xs text-zinc-500">
                Variables: {(settings ? ["{from}", "{to}"] : []).join(", ")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void save({ ...settings, enabled: !settings.enabled })}
              disabled={saving}
              className={
                settings.enabled
                  ? "rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  : "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              }
            >
              {settings.enabled ? "On" : "Off"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-700">Reply delay (seconds)</label>
              <input
                value={settings.replyDelaySeconds}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    replyDelaySeconds: Math.max(0, Math.min(600, Math.round(Number(e.target.value || 0)))),
                  })
                }
                type="number"
                min={0}
                max={600}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
              <div className="mt-1 text-xs text-zinc-500">0–600 seconds.</div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700">Forward calls to</label>
              <input
                value={settings.forwardToPhoneE164 ?? ""}
                onChange={(e) => setSettings({ ...settings, forwardToPhoneE164: e.target.value || null })}
                placeholder={profilePhone ? `Default: ${profilePhone}` : "(Use your Profile phone)"}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Effective: <span className="font-mono">{forwardPreview}</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-xs font-semibold text-zinc-700">Text message</label>
            <textarea
              value={settings.replyBody}
              onChange={(e) => setSettings({ ...settings, replyBody: e.target.value })}
              rows={5}
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void save(settings)}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Webhook</div>
          <div className="mt-2 text-xs text-zinc-500">
            Put this URL in Twilio for your phone number’s “A call comes in”.
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="break-all font-mono text-xs text-zinc-800">{webhookUrl}</div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void copy(webhookUrl)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Copy URL
            </button>
            <button
              type="button"
              onClick={() => void regenerateToken()}
              disabled={saving}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
            >
              Regenerate token
            </button>
          </div>

          <div className="mt-4 text-xs text-zinc-500">
            Token protects the endpoint without requiring Twilio signature validation.
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Missed calls</div>
          <div className="mt-1 text-xs text-zinc-500">Latest missed calls + what happened.</div>

          {missedCalls.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">From</th>
                    <th className="py-2 pr-3">Text</th>
                  </tr>
                </thead>
                <tbody>
                  {missedCalls.slice(0, 25).map((e) => (
                    <tr key={e.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(e.createdAtIso)}</td>
                      <td className="py-2 pr-3 font-mono">{e.from}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(e.smsStatus)}`}>
                          {e.smsStatus}
                        </span>
                        {e.smsError ? (
                          <div className="mt-1 text-xs text-zinc-500">{e.smsError}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No missed calls yet.</div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Activity</div>
          <div className="mt-1 text-xs text-zinc-500">All recent call attempts (answered + missed).</div>

          {events.length ? (
            <div className="mt-4 space-y-3">
              {events.slice(0, 30).map((e) => (
                <div key={e.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(e.finalStatus)}`}>
                      {e.finalStatus}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(e.smsStatus)}`}>
                      SMS: {e.smsStatus}
                    </span>
                    <span className="text-xs text-zinc-500">{formatWhen(e.createdAtIso)}</span>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-zinc-700 sm:grid-cols-2">
                    <div>
                      <span className="text-zinc-500">From:</span> <span className="font-mono">{e.from}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">To:</span> <span className="font-mono">{e.to ?? ""}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Dial:</span> <span className="font-mono">{e.dialCallStatus ?? ""}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">CallSid:</span> <span className="font-mono">{e.callSid.slice(0, 12)}…</span>
                    </div>
                  </div>

                  {e.smsBody ? (
                    <div className="mt-2 text-xs text-zinc-600">
                      <div className="text-zinc-500">Text:</div>
                      <div className="mt-1 whitespace-pre-wrap">{e.smsBody}</div>
                    </div>
                  ) : null}

                  {e.smsError ? (
                    <div className="mt-2 text-xs text-red-700">{e.smsError}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No activity yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
