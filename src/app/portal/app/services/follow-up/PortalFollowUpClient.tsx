"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
};

type Settings = {
  version: 2;
  enabled: boolean;
  templates: {
    id: string;
    name: string;
    enabled: boolean;
    delayMinutes: number;
    channels: { email: boolean; sms: boolean };
    email: { subjectTemplate: string; bodyTemplate: string };
    sms: { bodyTemplate: string };
  }[];
  assignments: {
    defaultTemplateIds: string[];
    calendarTemplateIds: Record<string, string[]>;
  };
  customVariables: Record<string, string>;
};

type Calendar = { id: string; title: string; enabled: boolean };

type QueueItem = {
  id: string;
  bookingId: string;
  templateId: string;
  templateName: string;
  calendarId?: string;
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
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [builtinVariables, setBuiltinVariables] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
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
          calendars?: Calendar[];
          builtinVariables?: string[];
          error?: string;
        };
        if (json.ok && json.settings) {
          setSettings(json.settings);
          setQueue(Array.isArray(json.queue) ? json.queue : []);
          setCalendars(Array.isArray(json.calendars) ? json.calendars : []);
          setBuiltinVariables(Array.isArray(json.builtinVariables) ? json.builtinVariables : []);
          setSelectedTemplateId(json.settings.templates?.[0]?.id ?? null);
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
    if (!Array.isArray(settings.templates) || settings.templates.length < 1) return false;
    for (const t of settings.templates) {
      if (!t.id.trim() || !t.name.trim()) return false;
      if (t.delayMinutes < 0 || t.delayMinutes > 60 * 24 * 30) return false;
      if (!t.channels.email && !t.channels.sms) return false;
      if (t.channels.email) {
        if (t.email.subjectTemplate.trim().length < 2) return false;
        if (t.email.bodyTemplate.trim().length < 5) return false;
      }
      if (t.channels.sms) {
        if (t.sms.bodyTemplate.trim().length < 2) return false;
      }
    }
    return true;
  }, [settings]);

  const selectedTemplate = useMemo(() => {
    if (!settings || !selectedTemplateId) return null;
    return settings.templates.find((t) => t.id === selectedTemplateId) ?? null;
  }, [settings, selectedTemplateId]);

  function updateTemplate(templateId: string, patch: Partial<Settings["templates"][number]>) {
    if (!settings) return;
    const next = settings.templates.map((t) => (t.id === templateId ? { ...t, ...patch } : t));
    setSettings({ ...settings, templates: next });
  }

  function addTemplate() {
    if (!settings) return;
    const baseId = `tpl${settings.templates.length + 1}`;
    let id = baseId;
    let n = 2;
    while (settings.templates.some((t) => t.id === id)) {
      id = `${baseId}_${n}`;
      n += 1;
    }

    const nextTemplate: Settings["templates"][number] = {
      id,
      name: "New template",
      enabled: false,
      delayMinutes: 60,
      channels: { email: true, sms: false },
      email: {
        subjectTemplate: "Thanks, {contactName}",
        bodyTemplate: "Hi {contactName},\n\nThanks again — {businessName}",
      },
      sms: { bodyTemplate: "Thanks again — {businessName}" },
    };

    setSettings({ ...settings, templates: [...settings.templates, nextTemplate].slice(0, 20) });
    setSelectedTemplateId(id);
  }

  function removeTemplate(templateId: string) {
    if (!settings) return;
    const nextTemplates = settings.templates.filter((t) => t.id !== templateId);
    if (!nextTemplates.length) return;

    const nextDefault = (settings.assignments.defaultTemplateIds || []).filter((id) => id !== templateId);
    const nextCalendarMap: Record<string, string[]> = {};
    for (const [calId, ids] of Object.entries(settings.assignments.calendarTemplateIds || {})) {
      nextCalendarMap[calId] = (ids || []).filter((id) => id !== templateId);
    }

    setSettings({
      ...settings,
      templates: nextTemplates,
      assignments: { ...settings.assignments, defaultTemplateIds: nextDefault, calendarTemplateIds: nextCalendarMap },
    });
    setSelectedTemplateId((prev) => (prev === templateId ? nextTemplates[0]!.id : prev));
  }

  function toggleCalendarTemplate(calendarId: string, templateId: string) {
    if (!settings) return;
    const current = settings.assignments.calendarTemplateIds?.[calendarId] ?? [];
    const has = current.includes(templateId);
    const next = has ? current.filter((x) => x !== templateId) : [...current, templateId];
    setSettings({
      ...settings,
      assignments: {
        ...settings.assignments,
        calendarTemplateIds: { ...settings.assignments.calendarTemplateIds, [calendarId]: next },
      },
    });
  }

  function toggleDefaultTemplate(templateId: string) {
    if (!settings) return;
    const current = settings.assignments.defaultTemplateIds ?? [];
    const has = current.includes(templateId);
    const next = has ? current.filter((x) => x !== templateId) : [...current, templateId];
    setSettings({ ...settings, assignments: { ...settings.assignments, defaultTemplateIds: next } });
  }

  const allVariableKeys = useMemo(() => {
    const customKeys = settings ? Object.keys(settings.customVariables || {}) : [];
    const keys = [...builtinVariables, ...customKeys];
    return Array.from(new Set(keys)).filter(Boolean);
  }, [builtinVariables, settings]);

  async function refresh() {
    const res = await fetch("/api/portal/follow-up/settings", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      settings?: Settings;
      queue?: QueueItem[];
      calendars?: Calendar[];
      builtinVariables?: string[];
      error?: string;
    };
    if (!res.ok || !json.ok || !json.settings) {
      setError(json.error ?? "Unable to refresh");
      return;
    }
    setSettings(json.settings);
    setQueue(Array.isArray(json.queue) ? json.queue : []);
    setCalendars(Array.isArray(json.calendars) ? json.calendars : []);
    setBuiltinVariables(Array.isArray(json.builtinVariables) ? json.builtinVariables : []);
    setSelectedTemplateId((prev) => prev ?? json.settings?.templates?.[0]?.id ?? null);
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
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      settings?: Settings;
      queue?: QueueItem[];
      calendars?: Calendar[];
      builtinVariables?: string[];
      error?: string;
    };
    setBusy(false);
    if (!res.ok || !json.ok || !json.settings) {
      setError(json.error ?? "Unable to save");
      return;
    }
    setSettings(json.settings);
    setQueue(Array.isArray(json.queue) ? json.queue : []);
    setCalendars(Array.isArray(json.calendars) ? json.calendars : []);
    setBuiltinVariables(Array.isArray(json.builtinVariables) ? json.builtinVariables : []);
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
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Variables</div>
              <div className="mt-2 text-xs text-zinc-600">
                Use placeholders like <span className="font-mono">{"{contactName}"}</span> inside templates.
              </div>
              <div className="mt-2 text-xs text-zinc-600">
                Available: <span className="font-mono">{allVariableKeys.map((k) => `{${k}}`).join(" ")}</span>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-zinc-600">Custom variables</div>
                <div className="mt-2 space-y-2">
                  {(settings ? Object.entries(settings.customVariables || {}) : []).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                      <input
                        value={k}
                        disabled
                        className="sm:col-span-4 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none"
                      />
                      <input
                        value={v}
                        onChange={(e) =>
                          settings &&
                          setSettings({
                            ...settings,
                            customVariables: { ...settings.customVariables, [k]: e.target.value },
                          })
                        }
                        className="sm:col-span-7 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!settings) return;
                          const next = { ...settings.customVariables };
                          delete next[k];
                          setSettings({ ...settings, customVariables: next });
                        }}
                        className="sm:col-span-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      if (!settings) return;
                      const proposed = window.prompt(
                        "Variable name (letters, numbers, underscore). Use without braces:",
                        "myVar",
                      );
                      const key = (proposed ?? "").trim();
                      const keyOk = /^[a-zA-Z][a-zA-Z0-9_]*$/;
                      const reserved = new Set(builtinVariables);
                      if (!key || !keyOk.test(key) || reserved.has(key)) {
                        setNotice("Invalid variable name.");
                        return;
                      }
                      if (Object.prototype.hasOwnProperty.call(settings.customVariables || {}, key)) {
                        setNotice("That variable already exists.");
                        return;
                      }
                      setSettings({ ...settings, customVariables: { ...settings.customVariables, [key]: "" } });
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  >
                    Add variable
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Templates</div>
              <div className="mt-2 text-xs text-zinc-600">Create multiple follow-ups and attach them to specific calendars.</div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(settings?.templates ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={
                      selectedTemplateId === t.id
                        ? "rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white"
                        : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                    }
                  >
                    {t.name}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={addTemplate}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  + Add template
                </button>
              </div>

              {selectedTemplate ? (
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-6">
                      <label className="text-xs font-semibold text-zinc-600">Template name</label>
                      <input
                        value={selectedTemplate.name}
                        onChange={(e) => updateTemplate(selectedTemplate.id, { name: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-xs font-semibold text-zinc-600">Delay (minutes)</label>
                      <input
                        type="number"
                        value={selectedTemplate.delayMinutes}
                        onChange={(e) => updateTemplate(selectedTemplate.id, { delayMinutes: Number(e.target.value || 0) })}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-end gap-2">
                      <label className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedTemplate.enabled)}
                          onChange={(e) => updateTemplate(selectedTemplate.id, { enabled: e.target.checked })}
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={() => removeTemplate(selectedTemplate.id)}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTemplate.channels.email)}
                        onChange={(e) =>
                          updateTemplate(selectedTemplate.id, {
                            channels: { ...selectedTemplate.channels, email: e.target.checked },
                          })
                        }
                      />
                      Email
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTemplate.channels.sms)}
                        onChange={(e) =>
                          updateTemplate(selectedTemplate.id, {
                            channels: { ...selectedTemplate.channels, sms: e.target.checked },
                          })
                        }
                      />
                      Text (SMS)
                    </label>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Email subject</label>
                    <input
                      value={selectedTemplate.email.subjectTemplate}
                      onChange={(e) =>
                        updateTemplate(selectedTemplate.id, {
                          email: { ...selectedTemplate.email, subjectTemplate: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Email body</label>
                    <textarea
                      value={selectedTemplate.email.bodyTemplate}
                      onChange={(e) =>
                        updateTemplate(selectedTemplate.id, {
                          email: { ...selectedTemplate.email, bodyTemplate: e.target.value },
                        })
                      }
                      rows={8}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">SMS body</label>
                    <textarea
                      value={selectedTemplate.sms.bodyTemplate}
                      onChange={(e) =>
                        updateTemplate(selectedTemplate.id, {
                          sms: { ...selectedTemplate.sms, bodyTemplate: e.target.value },
                        })
                      }
                      rows={3}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">Attach templates</div>
              <div className="mt-2 text-xs text-zinc-600">Choose which templates send for each calendar.</div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-zinc-600">Default (main booking link)</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(settings?.templates ?? []).map((t) => (
                    <label
                      key={t.id}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(settings?.assignments.defaultTemplateIds?.includes(t.id))}
                        onChange={() => toggleDefaultTemplate(t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>

              {calendars.length ? (
                <div className="mt-5 space-y-4">
                  {calendars.map((cal) => (
                    <div key={cal.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-semibold text-zinc-900">{cal.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(settings?.templates ?? []).map((t) => (
                          <label
                            key={t.id}
                            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(settings?.assignments.calendarTemplateIds?.[cal.id]?.includes(t.id))}
                              onChange={() => toggleCalendarTemplate(cal.id, t.id)}
                            />
                            {t.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-sm text-zinc-600">No calendars configured yet.</div>
              )}
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
            <div className="mt-2 text-sm text-zinc-600">
              Sends immediately. Emails send from Purely Automation with your business name as the sender name.
            </div>

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
                <div className="col-span-2">When</div>
                <div className="col-span-3">Template</div>
                <div className="col-span-2">Channel</div>
                <div className="col-span-3">To</div>
                <div className="col-span-2">Status</div>
              </div>
              <div className="divide-y divide-zinc-200">
                {queue.length ? (
                  queue.slice(0, 60).map((q) => (
                    <div key={q.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                      <div className="col-span-2 text-zinc-700">{fmtWhen(q.sendAtIso)}</div>
                      <div className="col-span-3 truncate text-zinc-700">{q.templateName}</div>
                      <div className="col-span-2 text-zinc-700">{q.channel}</div>
                      <div className="col-span-3 truncate text-zinc-700">{q.to}</div>
                      <div className="col-span-2 text-zinc-600">
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
              <div>• Each template has its own delay after the appointment ends.</div>
              <div>• Email sender name uses your business name.</div>
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
