"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PortalMissedCallTextBackClient } from "@/app/portal/app/services/missed-call-textback/PortalMissedCallTextBackClient";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";

type Settings = {
  version: 1;
  enabled: boolean;
  mode: "AI" | "FORWARD";
  webhookToken: string;
  businessName: string;
  greeting: string;
  systemPrompt: string;
  forwardToPhoneE164: string | null;
  voiceAgentId: string;
  voiceAgentConfigured: boolean;
};

type EventRow = {
  id: string;
  callSid: string;
  from: string;
  to: string | null;
  createdAtIso: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "UNKNOWN";
  notes?: string;
};

type ApiPayload = {
  ok: boolean;
  settings: Settings;
  events: EventRow[];
  webhookUrl: string;
  webhookUrlLegacy?: string;
  twilioConfigured?: boolean;
  twilio?: {
    configured: boolean;
    accountSidMasked: string | null;
    fromNumberE164: string | null;
    hasAuthToken: boolean;
    updatedAtIso: string | null;
  };
  notes?: {
    startupChecklist?: string[];
  };
  error?: string;
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
    case "IN_PROGRESS":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "FAILED":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
  }
}

export function PortalAiReceptionistClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [credits, setCredits] = useState<number | null>(null);
  const [billingPath, setBillingPath] = useState<string>("/portal/app/billing");

  const [tab, setTab] = useState<"settings" | "testing" | "activity" | "missed-call-textback">("activity");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [webhookUrlLegacy, setWebhookUrlLegacy] = useState<string>("");
  const [twilioConfigured, setTwilioConfigured] = useState<boolean>(false);

  const [voiceAgentApiKey, setVoiceAgentApiKey] = useState<string>("");

  async function loadCredits() {
    const res = await fetch("/api/portal/credits", { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) {
      setCredits(0);
      setBillingPath("/portal/app/billing");
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { credits?: number; billingPath?: string };
    setCredits(typeof data.credits === "number" && Number.isFinite(data.credits) ? data.credits : 0);
    setBillingPath(typeof data.billingPath === "string" && data.billingPath.trim() ? data.billingPath : "/portal/app/billing");
  }

  async function load() {
    setLoading(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/ai-receptionist/settings", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      setError("Failed to load.");
      return;
    }

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!data?.ok || !data.settings) {
      setLoading(false);
      setError(data?.error || "Failed to load.");
      return;
    }

    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setWebhookUrl(data.webhookUrl || "");
    setWebhookUrlLegacy(typeof data.webhookUrlLegacy === "string" ? data.webhookUrlLegacy : "");
    setTwilioConfigured(Boolean(data.twilioConfigured ?? data.twilio?.configured));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    void loadCredits();
  }, []);

  function setTabWithUrl(nextTab: "settings" | "testing" | "activity" | "missed-call-textback") {
    setTab(nextTab);
    try {
      const url = new URL(window.location.href);
      if (nextTab === "activity") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("tab");
      if (t === "testing" || t === "activity" || t === "missed-call-textback" || t === "settings") {
        setTab(t);
      }
    } catch {
      // ignore
    }
  }, []);

  const canSave = useMemo(() => {
    if (!settings) return false;
    if (!settings.greeting.trim()) return false;
    if (settings.mode === "FORWARD" && !String(settings.forwardToPhoneE164 || "").trim()) return false;
    if (settings.mode === "AI" && (!settings.voiceAgentConfigured && !voiceAgentApiKey.trim())) {
      // Allow saving without a voice agent key.
      return true;
    }
    return true;
  }, [settings, voiceAgentApiKey]);

  async function save(next: Settings) {
    setSaving(true);
    setError(null);
    setNote(null);

    const payload: any = { ...next };
    if (voiceAgentApiKey.trim()) payload.voiceAgentApiKey = voiceAgentApiKey.trim();

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: payload }),
    });

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSaving(false);
      setError(data?.error || "Save failed.");
      return;
    }

    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setWebhookUrl(data.webhookUrl || webhookUrl);
    setWebhookUrlLegacy(typeof data.webhookUrlLegacy === "string" ? data.webhookUrlLegacy : webhookUrlLegacy);
    setVoiceAgentApiKey("");

    setSaving(false);
    setNote("Saved.");
    window.setTimeout(() => setNote(null), 1800);
  }

  async function saveEnabled(nextEnabled: boolean) {
    if (!settings) return;
    const prev = settings.enabled;

    setSavingEnabled(true);
    setError(null);

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: { enabled: nextEnabled } }),
    }).catch(() => null as any);

    const data = (await res?.json?.().catch(() => null)) as ApiPayload | null;
    if (!res?.ok || !data?.ok) {
      setSavingEnabled(false);
      setSettings((cur) => (cur ? { ...cur, enabled: prev } : cur));
      setError(data?.error || "Save failed.");
      return;
    }

    setSavingEnabled(false);
  }

  async function regenerateToken() {
    setSaving(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerateToken: true }),
    });

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSaving(false);
      setError(data?.error || "Failed to regenerate token.");
      return;
    }

    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setWebhookUrl(data.webhookUrl || webhookUrl);
    setWebhookUrlLegacy(typeof data.webhookUrlLegacy === "string" ? data.webhookUrlLegacy : webhookUrlLegacy);
    setSaving(false);
    setNote("Regenerated webhook token.");
    window.setTimeout(() => setNote(null), 2000);
  }

  async function clearVoiceAgentKey() {
    setSaving(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clearVoiceAgentKey: true, settings: settings ?? {} }),
    });

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSaving(false);
      setError(data?.error || "Failed to clear key.");
      return;
    }

    setSettings(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setWebhookUrl(data.webhookUrl || webhookUrl);
    setWebhookUrlLegacy(typeof data.webhookUrlLegacy === "string" ? data.webhookUrlLegacy : webhookUrlLegacy);
    setVoiceAgentApiKey("");

    setSaving(false);
    setNote("Cleared API key.");
    window.setTimeout(() => setNote(null), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">AI Receptionist</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Configure call answering + routing, or forward calls to your team.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="hidden rounded-2xl border border-zinc-200 bg-white px-4 py-2 sm:block">
            <div className="text-[11px] font-semibold text-zinc-500">Credits remaining</div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className="text-lg font-bold text-brand-ink">{credits === null ? "—" : credits.toLocaleString()}</div>
              <Link href={billingPath} className="text-xs font-semibold text-brand-ink hover:underline">
                Billing
              </Link>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">AI calls are 1 credit / started minute.</div>
          </div>

          <Link
            href="/portal/app/services"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            All services
          </Link>
        </div>
      </div>

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTabWithUrl("activity")}
          aria-current={tab === "activity" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "activity"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Activity
        </button>
        <button
          type="button"
          onClick={() => setTabWithUrl("testing")}
          aria-current={tab === "testing" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "testing"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Testing
        </button>
        <button
          type="button"
          onClick={() => setTabWithUrl("missed-call-textback")}
          aria-current={tab === "missed-call-textback" ? "page" : undefined}
          className={
            "flex-1 min-w-[220px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "missed-call-textback"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Missed Call Text Back
        </button>
        <button
          type="button"
          onClick={() => setTabWithUrl("settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "settings"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Settings
        </button>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

      {tab === "settings" ? (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Core</div>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.enabled)}
                  disabled={saving || savingEnabled || !settings}
                  onChange={(e) => {
                    if (!settings) return;
                    const nextEnabled = e.target.checked;
                    setSettings({ ...settings, enabled: nextEnabled });
                    void saveEnabled(nextEnabled);
                  }}
                />
                On
              </label>

              <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <div className="text-xs font-semibold text-zinc-600">Mode</div>
                <select
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.mode ?? "AI"}
                  onChange={(e) => settings && setSettings({ ...settings, mode: e.target.value === "FORWARD" ? "FORWARD" : "AI" })}
                >
                  <option value="AI">AI receptionist</option>
                  <option value="FORWARD">Forward calls</option>
                </select>
              </label>

              <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                <div className="text-xs font-semibold text-zinc-600">Business name</div>
                <input
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.businessName ?? ""}
                  onChange={(e) => settings && setSettings({ ...settings, businessName: e.target.value })}
                  placeholder="Purely Automation"
                />
              </label>

              <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                <div className="text-xs font-semibold text-zinc-600">Greeting</div>
                <textarea
                  className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.greeting ?? ""}
                  onChange={(e) => settings && setSettings({ ...settings, greeting: e.target.value })}
                />
              </label>

              <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                <div className="text-xs font-semibold text-zinc-600">System prompt</div>
                <textarea
                  className="mt-2 min-h-[160px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.systemPrompt ?? ""}
                  onChange={(e) => settings && setSettings({ ...settings, systemPrompt: e.target.value })}
                />
                <div className="mt-2 text-xs text-zinc-600">This guides how your receptionist responds.</div>
              </label>

              {settings?.mode === "FORWARD" ? (
                <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                  <div className="text-xs font-semibold text-zinc-600">Forward to (E.164)</div>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={settings?.forwardToPhoneE164 ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, forwardToPhoneE164: e.target.value || null })}
                    placeholder="+15551234567"
                  />
                  <div className="mt-2 text-xs text-zinc-600">If blank, we’ll try your Portal profile phone.</div>
                </label>
              ) : null}
            </div>

            <div className="mt-8 text-sm font-semibold text-zinc-900">Voice agent (optional)</div>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <div className="text-xs font-semibold text-zinc-600">Agent ID</div>
                <input
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.voiceAgentId ?? ""}
                  onChange={(e) => settings && setSettings({ ...settings, voiceAgentId: e.target.value })}
                  placeholder="agent_..."
                />
              </label>

              <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-600">API key</div>
                    <div className="text-xs text-zinc-500">{settings?.voiceAgentConfigured ? "configured" : "not set"}</div>
                </div>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={voiceAgentApiKey}
                  onChange={(e) => setVoiceAgentApiKey(e.target.value)}
                  placeholder={settings?.voiceAgentConfigured ? "(leave blank to keep)" : "(paste key)"}
                />
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                    disabled={saving || !settings?.voiceAgentConfigured}
                    onClick={() => void clearVoiceAgentKey()}
                  >
                    Clear key
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                disabled={saving}
                onClick={() => void load()}
              >
                Reload
              </button>
              <button
                type="button"
                className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={saving || !settings || !canSave}
                onClick={() => settings && void save(settings)}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <PortalSettingsSection
            title="Twilio"
            description="Webhook URLs and setup steps for inbound calls."
            accent="blue"
            dotClassName={
              twilioConfigured
                ? "bg-[color:var(--color-brand-blue)]"
                : "bg-zinc-400"
            }
          >
            <div className="space-y-3">
              <div
                className={
                  "rounded-2xl border p-4 " +
                  (twilioConfigured
                    ? "border-[color:rgba(29,78,216,0.18)] bg-[color:rgba(29,78,216,0.06)]"
                    : "border-red-200 bg-red-50")
                }
              >
                <div className="text-xs font-semibold text-zinc-600">Webhook URL (token-based)</div>
                <div className="mt-2 break-all font-mono text-xs text-zinc-800">{webhookUrlLegacy || "—"}</div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                    disabled={!webhookUrlLegacy}
                    onClick={async () => webhookUrlLegacy && navigator.clipboard.writeText(webhookUrlLegacy)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                    disabled={saving}
                    onClick={() => void regenerateToken()}
                    title="Regenerates the token in this URL"
                  >
                    Regenerate token
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-600">Startup checklist</div>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600">
                  <li>In Twilio Console, open your phone number.</li>
                  <li>Under “Voice &amp; Fax”, set “A CALL COMES IN” → Webhook (POST).</li>
                  <li>Paste the webhook URL above and save.</li>
                </ol>
              </div>
            </div>
          </PortalSettingsSection>
        </div>
      ) : null}

      {tab === "testing" ? (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Testing</div>
          <div className="mt-2 text-sm text-zinc-600">
            Point a Twilio number to the webhook URL, then call that number. You’ll see recent calls in Activity.
          </div>

          <div
            className={
              "mt-4 rounded-2xl border p-4 " +
              (twilioConfigured
                ? "border-[color:rgba(29,78,216,0.18)] bg-[color:rgba(29,78,216,0.06)]"
                : "border-red-200 bg-red-50")
            }
          >
            <div className="text-xs font-semibold text-zinc-600">Webhook URL</div>
            <div className="mt-2 break-all font-mono text-xs text-zinc-800">{webhookUrlLegacy || "—"}</div>
          </div>

        </div>
      ) : null}

      {tab === "missed-call-textback" ? (
        <div className="mt-4">
          <PortalMissedCallTextBackClient embedded />
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Recent calls</div>
              <div className="mt-1 text-sm text-zinc-600">Calls hitting the webhook will show here.</div>
            </div>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              disabled={saving}
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                No calls yet.
              </div>
            ) : (
              events.slice(0, 40).map((e) => (
                <div key={e.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-zinc-800">{e.from}</div>
                    <div className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass(e.status)}`}>{e.status.toLowerCase()}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">To: {e.to ?? "—"} · {formatWhen(e.createdAtIso)}</div>
                  {e.notes ? <div className="mt-1 text-xs text-zinc-600">{e.notes}</div> : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
