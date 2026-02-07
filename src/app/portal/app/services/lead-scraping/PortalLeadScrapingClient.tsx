"use client";

import { useEffect, useMemo, useState } from "react";

type LeadRow = {
  id: string;
  businessName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
  createdAtIso: string;
};

type LeadScrapingSettings = {
  version: 1;
  b2b: {
    niche: string;
    location: string;
    count: number;
    requirePhone: boolean;
    requireWebsite: boolean;
    excludeNameContains: string[];
    excludeDomains: string[];
    excludePhones: string[];
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  b2c: {
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
};

type SettingsResponse = {
  ok?: boolean;
  settings?: LeadScrapingSettings;
  credits?: number;
  placesConfigured?: boolean;
  error?: string;
};

type LeadsResponse = {
  ok?: boolean;
  leads?: LeadRow[];
  error?: string;
};

type RunResponse = {
  ok?: boolean;
  kind?: "B2B" | "B2C";
  created?: number;
  chargedCredits?: number;
  refundedCredits?: number;
  creditsRemaining?: number;
  runId?: string;
  error?: string;
  code?: string;
  billingPath?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getApiError(body: unknown): string | undefined {
  const obj = asRecord(body);
  return typeof obj.error === "string" ? obj.error : undefined;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function csvEscape(v: string) {
  if (v.includes("\"")) v = v.replaceAll("\"", "\"\"");
  if (/[\n\r,\"]/g.test(v)) return `"${v}"`;
  return v;
}

function toCsv(rows: LeadRow[]) {
  const header = ["businessName", "phone", "website", "address", "niche", "createdAt"].join(",");
  const lines = rows.map((r) =>
    [
      r.businessName,
      r.phone ?? "",
      r.website ?? "",
      r.address ?? "",
      r.niche ?? "",
      r.createdAtIso,
    ]
      .map((x) => csvEscape(String(x ?? "")))
      .join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFormatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString();
}

function toTelHref(phone: string) {
  const digits = phone.replace(/\D+/g, "");
  return digits ? `tel:${digits}` : `tel:${phone}`;
}

export function PortalLeadScrapingClient() {
  const [tab, setTab] = useState<"b2b" | "b2c">("b2b");

  const [settings, setSettings] = useState<LeadScrapingSettings | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [placesConfigured, setPlacesConfigured] = useState<boolean>(false);

  const [leads, setLeads] = useState<LeadRow[]>([]);

  const [leadOpen, setLeadOpen] = useState(false);
  const [leadIndex, setLeadIndex] = useState<number>(0);

  const activeLead = leadOpen ? leads[leadIndex] ?? null : null;

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeToEmail, setComposeToEmail] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(true);
  const [composeSendSms, setComposeSendSms] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const estimatedRunCost = useMemo(() => {
    const c = settings?.b2b?.count ?? 0;
    return clampInt(c, 0, 50);
  }, [settings?.b2b?.count]);

  async function load() {
    setLoading(true);
    setError(null);
    setStatus(null);

    const [settingsRes, leadsRes] = await Promise.all([
      fetch("/api/portal/lead-scraping/settings", { cache: "no-store" }),
      fetch("/api/portal/lead-scraping/leads?take=200", { cache: "no-store" }),
    ]);

    const settingsBody = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;
    const leadsBody = (await leadsRes.json().catch(() => ({}))) as LeadsResponse;

    if (!settingsRes.ok) {
      setLoading(false);
      setError(getApiError(settingsBody) ?? "Failed to load lead scraping settings");
      return;
    }

    setSettings(settingsBody.settings ?? null);
    setCredits(typeof settingsBody.credits === "number" ? settingsBody.credits : null);
    setPlacesConfigured(Boolean(settingsBody.placesConfigured));

    if (leadsRes.ok) {
      setLeads(Array.isArray(leadsBody.leads) ? leadsBody.leads : []);
    } else {
      setLeads([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    });

    const body = (await res.json().catch(() => ({}))) as SettingsResponse;
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save settings");
      return;
    }

    setSettings(body.settings ?? settings);
    setCredits(typeof body.credits === "number" ? body.credits : credits);
    setStatus("Saved");
    window.setTimeout(() => setStatus(null), 1500);
  }

  async function runB2bNow() {
    if (!settings) return;
    setRunning(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "B2B" }),
    });

    const body = (await res.json().catch(() => ({}))) as RunResponse;
    setRunning(false);

    if (!res.ok) {
      if (res.status === 402 && body?.code === "INSUFFICIENT_CREDITS") {
        setError(body.error ?? "Not enough credits.");
      } else {
        setError(getApiError(body) ?? "Failed to run");
      }
      return;
    }

    const created = typeof body.created === "number" ? body.created : 0;
    const charged = typeof body.chargedCredits === "number" ? body.chargedCredits : 0;
    const refunded = typeof body.refundedCredits === "number" ? body.refundedCredits : 0;

    setCredits(typeof body.creditsRemaining === "number" ? body.creditsRemaining : credits);
    setStatus(
      created > 0
        ? `Added ${created} lead${created === 1 ? "" : "s"} • Charged ${charged} credit${charged === 1 ? "" : "s"}${refunded ? ` • Refunded ${refunded}` : ""}`
        : `No new leads matched (refunded ${refunded} credits)`,
    );

    await load();
  }

  function openLeadAtIndex(nextIndex: number) {
    if (!leads.length) return;
    const idx = Math.max(0, Math.min(leads.length - 1, Math.floor(nextIndex)));
    setLeadIndex(idx);
    setLeadOpen(true);
  }

  function closeLead() {
    setLeadOpen(false);
    setComposeOpen(false);
  }

  function openCompose() {
    if (!activeLead) return;
    setComposeOpen(true);
    setComposeSubject(`Quick question — ${activeLead.businessName}`.slice(0, 120));
    setComposeMessage(
      [
        `Hi ${activeLead.businessName},`,
        "",
        "Quick question — are you taking on new work right now?",
        "",
        "—",
      ].join("\n"),
    );
    setComposeSendEmail(true);
    setComposeSendSms(Boolean(activeLead.phone));
  }

  async function sendLeadMessage() {
    if (!activeLead) return;

    const msg = composeMessage.trim();
    if (!msg) {
      setError("Please enter a message.");
      return;
    }
    if (!composeSendEmail && !composeSendSms) {
      setError("Choose Email and/or Text.");
      return;
    }

    const subject = composeSubject.trim();
    if (composeSendEmail && subject.length > 120) {
      setError("Subject is too long (max 120 characters).");
      return;
    }

    const toEmail = composeToEmail.trim();
    const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (composeSendEmail && !emailLike.test(toEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (composeSendSms && !activeLead.phone) {
      setError("This lead has no phone number.");
      return;
    }

    setComposeBusy(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: activeLead.id,
        toEmail,
        subject,
        message: msg,
        sendEmail: composeSendEmail,
        sendSms: composeSendSms,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setComposeBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to send message");
      return;
    }

    setComposeOpen(false);
    setComposeToEmail("");
    setComposeSubject("");
    setComposeMessage("");
    setComposeSendEmail(true);
    setComposeSendSms(Boolean(activeLead.phone));
    setStatus("Sent message");
    window.setTimeout(() => setStatus(null), 1500);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Loading…
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Unable to load settings.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Lead Scraping</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            B2B pulls business listings (any niche). B2C is a stub until we select a consumer data source.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
            <div className="text-xs text-zinc-500">Credits</div>
            <div className="mt-0.5 font-semibold text-brand-ink">{credits ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("b2b")}
          className={
            tab === "b2b"
              ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          }
        >
          B2B (Business listings)
        </button>
        <button
          type="button"
          onClick={() => setTab("b2c")}
          className={
            tab === "b2c"
              ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          }
        >
          B2C (Consumer)
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>
      ) : null}

      {tab === "b2b" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-brand-ink">B2B pulls</div>
                <div className="mt-1 text-sm text-zinc-600">Search businesses by niche/keywords + location.</div>
              </div>
              <div className="text-right text-xs text-zinc-500">
                Est. max cost per run: <span className="font-semibold text-zinc-900">{estimatedRunCost}</span> credits
              </div>
            </div>

            {!placesConfigured ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Google Places is not configured in this environment (missing GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY).
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Niche / keywords</div>
                <input
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.niche}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            b2b: {
                              ...prev.b2b,
                              niche: e.target.value,
                            },
                          }
                        : prev,
                    )
                  }
                  placeholder="e.g. Roofing, Med Spa, Dentist"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Location</div>
                <input
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.location}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            b2b: {
                              ...prev.b2b,
                              location: e.target.value,
                            },
                          }
                        : prev,
                    )
                  }
                  placeholder="e.g. Austin TX"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Count (max 50)</div>
                <input
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  max={50}
                  value={settings.b2b.count}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            b2b: {
                              ...prev.b2b,
                              count: clampInt(Number(e.target.value), 1, 50),
                            },
                          }
                        : prev,
                    )
                  }
                />
              </label>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-medium text-zinc-800">Filters</div>
                <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-700">Require phone</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.requirePhone}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, b2b: { ...prev.b2b, requirePhone: e.target.checked } }
                          : prev,
                      )
                    }
                  />
                </label>
                <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-700">Require website</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.requireWebsite}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, b2b: { ...prev.b2b, requireWebsite: e.target.checked } }
                          : prev,
                      )
                    }
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Exclude business names (one per line)</div>
                <textarea
                  className="mt-2 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.excludeNameContains.join("\n")}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const next = e.target.value
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .slice(0, 200);
                      return { ...prev, b2b: { ...prev.b2b, excludeNameContains: next } };
                    })
                  }
                  placeholder="e.g. walmart\nverizon"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Exclude domains (one per line)</div>
                <textarea
                  className="mt-2 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.excludeDomains.join("\n")}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const next = e.target.value
                        .split("\n")
                        .map((x) => x.trim().toLowerCase())
                        .filter(Boolean)
                        .slice(0, 200);
                      return { ...prev, b2b: { ...prev.b2b, excludeDomains: next } };
                    })
                  }
                  placeholder="e.g. yelp.com\nfacebook.com"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Exclude phones (one per line)</div>
                <textarea
                  className="mt-2 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.excludePhones.join("\n")}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const next = e.target.value
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .slice(0, 200);
                      return { ...prev, b2b: { ...prev.b2b, excludePhones: next } };
                    })
                  }
                  placeholder="e.g. +15551234567"
                />
              </label>
            </div>

            <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Scheduling</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Runs via a secure cron endpoint (server-side). You can still run manually any time.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                  <span className="text-zinc-800">Enabled</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.scheduleEnabled}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, b2b: { ...prev.b2b, scheduleEnabled: e.target.checked } }
                          : prev,
                      )
                    }
                  />
                </label>

                <label className="block sm:col-span-2">
                  <div className="text-sm font-medium text-zinc-800">Frequency (days)</div>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    max={60}
                    value={settings.b2b.frequencyDays}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              b2b: {
                                ...prev.b2b,
                                frequencyDays: clampInt(Number(e.target.value), 1, 60),
                              },
                            }
                          : prev,
                      )
                    }
                  />
                  <div className="mt-1 text-xs text-zinc-500">
                    Last run: {settings.b2b.lastRunAtIso ? new Date(settings.b2b.lastRunAtIso).toLocaleString() : "Never"}
                  </div>
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={runB2bNow}
                disabled={running || !placesConfigured}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              >
                {running ? "Running…" : "Run now"}
              </button>

              <button
                type="button"
                onClick={() => downloadText(`leads_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(leads))}
                disabled={!leads.length}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              >
                Export CSV
              </button>

              <div className="text-xs text-zinc-500 sm:ml-auto">
                {leads.length} lead{leads.length === 1 ? "" : "s"} shown
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Recent leads</div>
            <div className="mt-3 space-y-3">
              {leads.length ? (
                leads.map((l, idx) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => openLeadAtIndex(idx)}
                    className="w-full rounded-2xl border border-zinc-200 p-3 text-left hover:bg-zinc-50"
                  >
                    <div className="text-sm font-semibold text-brand-ink">{l.businessName}</div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                      {l.phone ? <span className="whitespace-nowrap">{l.phone}</span> : null}
                      {l.phone && l.website ? <span>•</span> : null}
                      {l.website ? (
                        <span className="min-w-0 max-w-full truncate">{l.website}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">{[l.niche, l.address].filter(Boolean).join(" • ")}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{safeFormatDateTime(l.createdAtIso)}</div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                  No leads yet. Run your first pull.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">B2C (Consumer leads)</div>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Consumer lead pulling depends on the data source (data broker, CSV import, partner API, etc.).
            This iteration ships the portal UX + settings storage so we can plug in a source next.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <div className="text-sm font-medium text-zinc-800">Notes / requirements</div>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={settings.b2c.notes}
                onChange={(e) =>
                  setSettings((prev) => (prev ? { ...prev, b2c: { ...prev.b2c, notes: e.target.value } } : prev))
                }
                placeholder="Describe what type of consumer list you want (geo, age, income, intent, etc.)"
              />
            </label>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
              B2C runs are disabled until a consumer data source is connected.
            </div>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="text-zinc-800">Scheduling (disabled)</span>
              <input type="checkbox" checked={false} disabled />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-zinc-800">Frequency (days)</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                type="number"
                min={1}
                max={60}
                value={settings.b2c.frequencyDays}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, b2c: { ...prev.b2c, frequencyDays: clampInt(Number(e.target.value), 1, 60) } }
                      : prev,
                  )
                }
              />
              <div className="mt-1 text-xs text-zinc-500">
                Last run: {settings.b2c.lastRunAtIso ? new Date(settings.b2c.lastRunAtIso).toLocaleString() : "Never"}
              </div>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {leadOpen && activeLead ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={closeLead}
          />

          <div className="relative w-full max-w-2xl">
            <button
              type="button"
              onClick={() => setLeadIndex((i) => Math.max(0, i - 1))}
              disabled={leadIndex <= 0}
              className="absolute -left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 sm:flex"
              aria-label="Previous lead"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setLeadIndex((i) => Math.min(leads.length - 1, i + 1))}
              disabled={leadIndex >= leads.length - 1}
              className="absolute -right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 sm:flex"
              aria-label="Next lead"
            >
              →
            </button>

            <div className="relative rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
              <button
                type="button"
                onClick={closeLead}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                aria-label="Close"
              >
                ✕
              </button>

              <div className="pr-10">
                <div className="text-lg font-semibold text-brand-ink">{activeLead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-500">Pulled: {safeFormatDateTime(activeLead.createdAtIso)}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">Phone</div>
                  <div className="mt-1 text-sm text-zinc-900">{activeLead.phone ?? "—"}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">Website</div>
                  <div className="mt-1 break-words text-sm text-zinc-900">
                    {activeLead.website ? (
                      <a
                        href={activeLead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {activeLead.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              {activeLead.address || activeLead.niche ? (
                <div className="mt-4 text-sm text-zinc-700">
                  {[activeLead.niche, activeLead.address].filter(Boolean).join(" • ")}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                {activeLead.phone ? (
                  <a
                    href={toTelHref(activeLead.phone)}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Call
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white opacity-60"
                  >
                    Call
                  </button>
                )}

                <button
                  type="button"
                  onClick={openCompose}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Email / SMS
                </button>

                <div className="text-xs text-zinc-500 sm:ml-auto">
                  {leadIndex + 1} / {leads.length}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 sm:hidden">
                <button
                  type="button"
                  onClick={() => setLeadIndex((i) => Math.max(0, i - 1))}
                  disabled={leadIndex <= 0}
                  className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setLeadIndex((i) => Math.min(leads.length - 1, i + 1))}
                  disabled={leadIndex >= leads.length - 1}
                  className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              {composeOpen ? (
                <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-5">
                  <div className="text-sm font-semibold text-zinc-900">Compose</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">To (email)</div>
                      <input
                        value={composeToEmail}
                        onChange={(e) => setComposeToEmail(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="name@company.com"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">To (phone)</div>
                      <input
                        value={activeLead.phone ?? ""}
                        disabled
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700"
                      />
                    </label>

                    <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={composeSendEmail}
                          onChange={(e) => setComposeSendEmail(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Email
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={composeSendSms}
                          onChange={(e) => setComposeSendSms(e.target.checked)}
                          disabled={!activeLead.phone}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Text
                      </label>
                      {!activeLead.phone ? (
                        <span className="text-xs text-zinc-500">No phone on this lead</span>
                      ) : null}
                    </div>

                    <label className="block sm:col-span-2">
                      <div className="text-xs font-semibold text-zinc-600">Subject (email)</div>
                      <input
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        disabled={!composeSendEmail}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <div className="text-xs font-semibold text-zinc-600">Message</div>
                      <textarea
                        value={composeMessage}
                        onChange={(e) => setComposeMessage(e.target.value)}
                        rows={5}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={sendLeadMessage}
                      disabled={composeBusy}
                      className={
                        composeBusy
                          ? "inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white opacity-70"
                          : "inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                      }
                    >
                      {composeBusy ? "Sending…" : "Send"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setComposeOpen(false)}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
