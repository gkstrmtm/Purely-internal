"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
};

type Settings = {
  version: 1;
  enabled: boolean;
  delayMinutes: number;
  channels: { email: boolean; sms: boolean };
  email: { subjectTemplate: string; bodyTemplate: string };
  sms: { bodyTemplate: string };
};

type QueueItem = {
  id: string;
  bookingId: string;
  channel: "EMAIL" | "SMS";
  to: string;
  subject?: string;
  body: string;
  sendAtIso: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELED";
  attempts: number;
  lastError?: string;
};

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function PortalFollowUpClient() {
  const service = useMemo(() => PORTAL_SERVICES.find((s) => s.slug === "follow-up") ?? null, []);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"settings" | "activity">("settings");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Just testing follow-up automation.");
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [meRes, settingsRes] = await Promise.all([
        fetch("/api/customer/me", { cache: "no-store" }),
        fetch("/api/portal/follow-up/settings", { cache: "no-store" }),
      ]);

      if (!mounted) return;

      if (meRes.ok) setMe((await meRes.json()) as Me);
      if (settingsRes.ok) {
        const json = (await settingsRes.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Settings;
          queue?: QueueItem[];
          error?: string;
        };
        if (json.ok && json.settings) {
          setSettings(json.settings);
          setQueue(Array.isArray(json.queue) ? json.queue : []);
        } else {
          setError(json.error ?? "Unable to load follow-up settings");
        }
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const unlocked = useMemo(() => {
    const email = (me?.user.email ?? "").toLowerCase().trim();
    if (email === DEFAULT_FULL_DEMO_EMAIL) return true;
    return Boolean(me?.entitlements?.crm);
  }, [me]);

  const canSave = useMemo(() => {
    if (!settings) return false;
    if (settings.delayMinutes < 0 || settings.delayMinutes > 60 * 24 * 30) return false;
    if (!settings.channels.email && !settings.channels.sms) return false;
    if (settings.channels.email) {
      if (settings.email.subjectTemplate.trim().length < 2) return false;
      if (settings.email.bodyTemplate.trim().length < 5) return false;
    }
    if (settings.channels.sms) {
      if (settings.sms.bodyTemplate.trim().length < 2) return false;
    }
    return true;
  }, [settings]);

  async function refresh() {
    const res = await fetch("/api/portal/follow-up/settings", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Settings; queue?: QueueItem[]; error?: string };
    if (!res.ok || !json.ok || !json.settings) {
      setError(json.error ?? "Unable to refresh");
      return;
    }
    setSettings(json.settings);
    setQueue(Array.isArray(json.queue) ? json.queue : []);
  }

  async function save() {
    if (!settings || !canSave) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/portal/follow-up/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Settings; queue?: QueueItem[]; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok || !json.settings) {
      setError(json.error ?? "Unable to save");
      return;
    }
    setSettings(json.settings);
    setQueue(Array.isArray(json.queue) ? json.queue : []);
    setNotice("Saved.");
  }

  async function sendTest(channel: "EMAIL" | "SMS") {
    setTestBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/portal/follow-up/test-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel,
        to: channel === "EMAIL" ? testEmail.trim() : testPhone.trim(),
        subject: channel === "EMAIL" ? "Test follow-up" : undefined,
        body: testMessage,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
    setTestBusy(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Test send failed");
      return;
    }
    setNotice(json.note ?? "Sent.");
  }

  if (!service) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-base font-semibold text-brand-ink">Service not found</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
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
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Unlock {service.title}</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-600">This service isn’t included in your current plan.</p>
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
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{service.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">{service.description}</p>
        </div>
        <Link
          href="/portal/app/services"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("settings")}
          className={
            tab === "settings"
              ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          }
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={
            tab === "activity"
              ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          }
        >
          Activity
        </button>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div> : null}

      {tab === "settings" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Automation</div>
            <div className="mt-2 text-sm text-zinc-600">Send follow-ups automatically after a booked appointment ends.</div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.enabled)}
                  onChange={(e) => settings && setSettings({ ...settings, enabled: e.target.checked })}
                />
                Enabled
              </label>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Delay after appointment (minutes)</label>
                <input
                  type="number"
                  value={settings?.delayMinutes ?? 60}
                  onChange={(e) => settings && setSettings({ ...settings, delayMinutes: Number(e.target.value || 0) })}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                />
              </div>

              <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.channels.email)}
                  onChange={(e) => settings && setSettings({ ...settings, channels: { ...settings.channels, email: e.target.checked } })}
                />
                Email
              </label>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.channels.sms)}
                  onChange={(e) => settings && setSettings({ ...settings, channels: { ...settings.channels, sms: e.target.checked } })}
                />
                Text (SMS)
              </label>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Templates</div>
              <div className="mt-2 text-xs text-zinc-600">Available placeholders: <span className="font-mono">{`{contactName}`}</span>, <span className="font-mono">{`{businessName}`}</span>, <span className="font-mono">{`{bookingTitle}`}</span></div>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Email subject</label>
                  <input
                    value={settings?.email.subjectTemplate ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, email: { ...settings.email, subjectTemplate: e.target.value } })}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Email body</label>
                  <textarea
                    value={settings?.email.bodyTemplate ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, email: { ...settings.email, bodyTemplate: e.target.value } })}
                    rows={8}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-600">SMS body</label>
                  <textarea
                    value={settings?.sms.bodyTemplate ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, sms: { ...settings.sms, bodyTemplate: e.target.value } })}
                    rows={3}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={save}
                disabled={!canSave || busy}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Send a test</div>
            <div className="mt-2 text-sm text-zinc-600">Sends immediately using your configured SendGrid/Twilio keys.</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Test email</label>
                <input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">Test phone</label>
                <input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="+15551234567"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">Message</label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void sendTest("EMAIL")}
                  disabled={testBusy || testEmail.trim().length < 3}
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {testBusy ? "Sending…" : "Send test email"}
                </button>
                <button
                  type="button"
                  onClick={() => void sendTest("SMS")}
                  disabled={testBusy || testPhone.trim().length < 7}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                >
                  {testBusy ? "Sending…" : "Send test SMS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Queue</div>
            <div className="mt-2 text-sm text-zinc-600">Upcoming and recent follow-ups.</div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <div className="grid grid-cols-12 gap-2 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-600">
                <div className="col-span-3">When</div>
                <div className="col-span-2">Channel</div>
                <div className="col-span-4">To</div>
                <div className="col-span-3">Status</div>
              </div>
              <div className="divide-y divide-zinc-200">
                {queue.length ? (
                  queue.slice(0, 60).map((q) => (
                    <div key={q.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                      <div className="col-span-3 text-zinc-700">{fmtWhen(q.sendAtIso)}</div>
                      <div className="col-span-2 text-zinc-700">{q.channel}</div>
                      <div className="col-span-4 truncate text-zinc-700">{q.to}</div>
                      <div className="col-span-3 text-zinc-600">
                        {q.status === "FAILED" ? (
                          <span className="text-red-700">FAILED</span>
                        ) : q.status === "SENT" ? (
                          <span className="text-emerald-700">SENT</span>
                        ) : q.status === "CANCELED" ? (
                          <span className="text-zinc-500">CANCELED</span>
                        ) : (
                          <span className="text-zinc-700">PENDING</span>
                        )}
                        {q.lastError ? <div className="mt-1 text-xs text-red-700">{q.lastError}</div> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-sm text-zinc-600">No follow-ups queued yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">How it works</div>
            <div className="mt-2 space-y-2 text-sm text-zinc-600">
              <div>• When a booking is created, we schedule follow-up messages.</div>
              <div>• Messages send after the appointment ends + your delay.</div>
              <div>• Sending requires SendGrid/Twilio environment variables.</div>
            </div>
            <div className="mt-5">
              <Link
                href="/portal/app/services/booking"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                View bookings
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
