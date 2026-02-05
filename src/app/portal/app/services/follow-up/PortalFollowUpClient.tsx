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
    audience?: "CONTACT" | "INTERNAL";
    internalRecipients?:
      | {
          mode: "BOOKING_NOTIFICATION_EMAILS" | "CUSTOM";
          emails?: string[];
          phones?: string[];
        }
      | undefined;
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

type Calendar = { id: string; title: string; enabled: boolean; notificationEmails?: string[] };

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
  const [siteNotificationEmails, setSiteNotificationEmails] = useState<string[]>([]);
  const [builtinVariables, setBuiltinVariables] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newVarKey, setNewVarKey] = useState("");
  const [newVarValue, setNewVarValue] = useState("");
  const [varError, setVarError] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Just testing follow-up automation.");
  const [testBusy, setTestBusy] = useState(false);

  const [internalEmailDraft, setInternalEmailDraft] = useState("");
  const [internalPhoneDraft, setInternalPhoneDraft] = useState("");

  useEffect(() => {
    setInternalEmailDraft("");
    setInternalPhoneDraft("");
  }, [selectedTemplateId]);

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
          siteNotificationEmails?: string[];
          builtinVariables?: string[];
          error?: string;
        };
        if (json.ok && json.settings) {
          setSettings(json.settings);
          setQueue(Array.isArray(json.queue) ? json.queue : []);
          setCalendars(Array.isArray(json.calendars) ? json.calendars : []);
          setSiteNotificationEmails(Array.isArray(json.siteNotificationEmails) ? json.siteNotificationEmails : []);
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

      const audience = t.audience ?? "CONTACT";
      if (audience === "INTERNAL") {
        const mode = t.internalRecipients?.mode ?? "BOOKING_NOTIFICATION_EMAILS";
        if (mode === "CUSTOM") {
          const emails = Array.isArray(t.internalRecipients?.emails) ? t.internalRecipients!.emails! : [];
          const phones = Array.isArray(t.internalRecipients?.phones) ? t.internalRecipients!.phones! : [];
          if (t.channels.email && emails.filter(Boolean).length < 1) return false;
          if (t.channels.sms && phones.filter(Boolean).length < 1) return false;
        }
      }

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
      audience: "CONTACT",
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

  function addInternalEmail(templateId: string, overrideEmail?: string) {
    if (!settings) return;
    const email = (overrideEmail ?? internalEmailDraft).trim().toLowerCase();
    if (!email) return;
    const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailLike.test(email)) {
      setNotice("Invalid email.");
      return;
    }
    const tpl = settings.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const current = tpl.internalRecipients?.mode === "CUSTOM" && Array.isArray(tpl.internalRecipients.emails) ? tpl.internalRecipients.emails : [];
    if (current.includes(email)) return;
    updateTemplate(templateId, {
      internalRecipients: {
        mode: "CUSTOM",
        emails: [...current, email].slice(0, 20),
        phones:
          tpl.internalRecipients?.mode === "CUSTOM" && Array.isArray(tpl.internalRecipients.phones)
            ? tpl.internalRecipients.phones
            : [],
      },
    });
    if (!overrideEmail) setInternalEmailDraft("");
  }

  function addInternalPhone(templateId: string) {
    if (!settings) return;
    const phone = internalPhoneDraft.trim();
    if (!phone) return;
    if (!/^[0-9+()\- .]*$/.test(phone) || phone.replace(/\D/g, "").length < 10) {
      setNotice("Invalid phone.");
      return;
    }
    const tpl = settings.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const current = tpl.internalRecipients?.mode === "CUSTOM" && Array.isArray(tpl.internalRecipients.phones) ? tpl.internalRecipients.phones : [];
    if (current.includes(phone)) return;
    updateTemplate(templateId, {
      internalRecipients: {
        mode: "CUSTOM",
        emails:
          tpl.internalRecipients?.mode === "CUSTOM" && Array.isArray(tpl.internalRecipients.emails)
            ? tpl.internalRecipients.emails
            : [],
        phones: [...current, phone].slice(0, 20),
      },
    });
    setInternalPhoneDraft("");
  }

  function removeInternalRecipient(templateId: string, kind: "email" | "phone", value: string) {
    if (!settings) return;
    const tpl = settings.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const emails =
      tpl.internalRecipients?.mode === "CUSTOM" && Array.isArray(tpl.internalRecipients.emails) ? tpl.internalRecipients.emails : [];
    const phones =
      tpl.internalRecipients?.mode === "CUSTOM" && Array.isArray(tpl.internalRecipients.phones) ? tpl.internalRecipients.phones : [];
    const nextEmails = kind === "email" ? emails.filter((x) => x !== value) : emails;
    const nextPhones = kind === "phone" ? phones.filter((x) => x !== value) : phones;
    updateTemplate(templateId, {
      internalRecipients: { mode: "CUSTOM", emails: nextEmails, phones: nextPhones },
    });
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
      siteNotificationEmails?: string[];
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
    setSiteNotificationEmails(Array.isArray(json.siteNotificationEmails) ? json.siteNotificationEmails : []);
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
      siteNotificationEmails?: string[];
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
    setSiteNotificationEmails(Array.isArray(json.siteNotificationEmails) ? json.siteNotificationEmails : []);
    setBuiltinVariables(Array.isArray(json.builtinVariables) ? json.builtinVariables : []);
    setNotice("Saved.");
  }

  function addCustomVariable() {
    if (!settings) return;
    setVarError(null);

    const key = newVarKey.trim();
    const keyOk = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    const reserved = new Set(builtinVariables);
    if (!key || !keyOk.test(key) || reserved.has(key)) {
      setVarError("Invalid variable name.");
      return;
    }
    if (Object.prototype.hasOwnProperty.call(settings.customVariables || {}, key)) {
      setVarError("That variable already exists.");
      return;
    }

    setSettings({
      ...settings,
      customVariables: { ...settings.customVariables, [key]: newVarValue },
    });
    setNewVarKey("");
    setNewVarValue("");
  }

  function fmtDelay(minutes: number) {
    const m = Math.max(0, Math.round(minutes || 0));
    if (m === 0) return "Immediately";
    if (m < 60) return `${m} min`;
    const h = Math.round((m / 60) * 10) / 10;
    if (m < 60 * 24) return `${h} hr`;
    const d = Math.round((m / 60 / 24) * 10) / 10;
    return `${d} days`;
  }

  function moveInList(ids: string[], id: string, dir: -1 | 1) {
    const idx = ids.indexOf(id);
    if (idx < 0) return ids;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= ids.length) return ids;
    const next = [...ids];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item!);
    return next;
  }

  function setDefaultSequence(ids: string[]) {
    if (!settings) return;
    setSettings({ ...settings, assignments: { ...settings.assignments, defaultTemplateIds: ids } });
  }

  function setCalendarSequence(calendarId: string, ids: string[]) {
    if (!settings) return;
    setSettings({
      ...settings,
      assignments: {
        ...settings.assignments,
        calendarTemplateIds: { ...settings.assignments.calendarTemplateIds, [calendarId]: ids },
      },
    });
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
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
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
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
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
              <div className="mt-2 text-xs text-zinc-600 break-words whitespace-normal">
                Available: <span className="font-mono break-words whitespace-normal">{allVariableKeys.map((k) => `{${k}}`).join(" ")}</span>
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

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <input
                        value={newVarKey}
                        onChange={(e) => setNewVarKey(e.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="Variable name (e.g. referralSource)"
                      />
                    </div>
                    <div className="sm:col-span-7">
                      <input
                        value={newVarValue}
                        onChange={(e) => setNewVarValue(e.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="Value"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addCustomVariable}
                      className="sm:col-span-1 rounded-2xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                    >
                      +
                    </button>
                  </div>
                  {varError ? <div className="mt-2 text-xs font-semibold text-red-700">{varError}</div> : null}
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
                    <div className="sm:col-span-3 flex flex-wrap items-end gap-2">
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
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Audience</label>
                      <select
                        value={(selectedTemplate.audience ?? "CONTACT") as string}
                        onChange={(e) =>
                          updateTemplate(selectedTemplate.id, {
                            audience: (e.target.value === "INTERNAL" ? "INTERNAL" : "CONTACT") as any,
                            internalRecipients:
                              e.target.value === "INTERNAL"
                                ? (selectedTemplate.internalRecipients ?? { mode: "BOOKING_NOTIFICATION_EMAILS" })
                                : undefined,
                          })
                        }
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      >
                        <option value="CONTACT">Client (booking contact)</option>
                        <option value="INTERNAL">Internal (your team)</option>
                      </select>
                      <div className="mt-1 text-xs text-zinc-500">
                        Internal steps can send to booking notification emails, or to custom recipients.
                      </div>
                    </div>

                    {((selectedTemplate.audience ?? "CONTACT") === "INTERNAL") ? (
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">Internal recipients</label>
                        <select
                          value={(selectedTemplate.internalRecipients?.mode ?? "BOOKING_NOTIFICATION_EMAILS") as string}
                          onChange={(e) =>
                            updateTemplate(selectedTemplate.id, {
                              internalRecipients:
                                e.target.value === "CUSTOM"
                                  ? { mode: "CUSTOM", emails: selectedTemplate.internalRecipients?.emails ?? [], phones: selectedTemplate.internalRecipients?.phones ?? [] }
                                  : { mode: "BOOKING_NOTIFICATION_EMAILS" },
                            })
                          }
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                        >
                          <option value="BOOKING_NOTIFICATION_EMAILS">Use booking notification emails</option>
                          <option value="CUSTOM">Use custom recipients</option>
                        </select>
                        {selectedTemplate.internalRecipients?.mode === "CUSTOM" ? (
                          <div className="mt-3 space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-zinc-600">Emails</div>
                              <div className="mt-2 space-y-2">
                                {(selectedTemplate.internalRecipients?.emails ?? []).map((email) => (
                                  <div key={email} className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                                    <div className="truncate text-sm text-zinc-800">{email}</div>
                                    <button
                                      type="button"
                                      onClick={() => removeInternalRecipient(selectedTemplate.id, "email", email)}
                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    value={internalEmailDraft}
                                    onChange={(e) => setInternalEmailDraft(e.target.value)}
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                    placeholder="team@example.com"
                                  />
                                  <button
                                    type="button"
                                      onClick={() => addInternalEmail(selectedTemplate.id)}
                                    className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                                  >
                                    Add
                                  </button>
                                </div>

                                {(() => {
                                  const picks = Array.from(
                                    new Set([
                                      ...(siteNotificationEmails || []),
                                      ...calendars.flatMap((c) => c.notificationEmails ?? []),
                                    ]),
                                  ).slice(0, 12);
                                  if (!picks.length) return null;
                                  return (
                                    <div className="pt-1">
                                      <div className="text-xs text-zinc-500">Quick add:</div>
                                      <div className="mt-1 flex flex-wrap gap-2">
                                        {picks.map((email) => (
                                          <button
                                            key={email}
                                            type="button"
                                            onClick={() => {
                                              addInternalEmail(selectedTemplate.id, email);
                                            }}
                                            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                          >
                                            {email}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs font-semibold text-zinc-600">Phones (SMS)</div>
                              <div className="mt-2 space-y-2">
                                {(selectedTemplate.internalRecipients?.phones ?? []).map((phone) => (
                                  <div key={phone} className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                                    <div className="truncate text-sm text-zinc-800">{phone}</div>
                                    <button
                                      type="button"
                                      onClick={() => removeInternalRecipient(selectedTemplate.id, "phone", phone)}
                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    value={internalPhoneDraft}
                                    onChange={(e) => setInternalPhoneDraft(e.target.value)}
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                    placeholder="+15551234567"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addInternalPhone(selectedTemplate.id)}
                                    className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-zinc-500 break-words">
                            Will send to: {(Array.from(new Set([...(siteNotificationEmails || []), ...calendars.flatMap((c) => c.notificationEmails ?? [])]))).join(", ") || "(no notification emails configured)"}
                          </div>
                        )}
                      </div>
                    ) : null}
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
              <div className="mt-2 text-xs text-zinc-600">Build a sequence (multiple steps) for each calendar.</div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-zinc-600">Default (main booking link)</div>
                <div className="mt-2 space-y-2">
                  {(settings?.assignments.defaultTemplateIds ?? []).length ? (
                    <div className="space-y-2">
                      {(settings?.assignments.defaultTemplateIds ?? []).map((id) => {
                        const t = (settings?.templates ?? []).find((x) => x.id === id);
                        if (!t) return null;
                        return (
                          <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900">{t.name}</div>
                              <div className="text-xs text-zinc-600">{fmtDelay(t.delayMinutes)} • {t.channels.email ? "Email" : ""}{t.channels.email && t.channels.sms ? ", " : ""}{t.channels.sms ? "SMS" : ""}{(t.audience ?? "CONTACT") === "INTERNAL" ? " • Internal" : ""}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setDefaultSequence(moveInList(settings?.assignments.defaultTemplateIds ?? [], id, -1))
                                }
                                className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDefaultSequence(moveInList(settings?.assignments.defaultTemplateIds ?? [], id, 1))
                                }
                                className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDefaultSequence((settings?.assignments.defaultTemplateIds ?? []).filter((x) => x !== id))
                                }
                                className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">No steps selected yet.</div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        const cur = settings?.assignments.defaultTemplateIds ?? [];
                        if (cur.includes(id)) return;
                        setDefaultSequence([...cur, id].slice(0, 10));
                      }}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                    >
                      <option value="">Add a step…</option>
                      {(settings?.templates ?? [])
                        .filter((t) => !(settings?.assignments.defaultTemplateIds ?? []).includes(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({fmtDelay(t.delayMinutes)})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {calendars.length ? (
                <div className="mt-5 space-y-4">
                  {calendars.map((cal) => (
                    <div key={cal.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-semibold text-zinc-900">{cal.title}</div>
                      <div className="mt-2 space-y-2">
                        {(settings?.assignments.calendarTemplateIds?.[cal.id] ?? []).length ? (
                          <div className="space-y-2">
                            {(settings?.assignments.calendarTemplateIds?.[cal.id] ?? []).map((id) => {
                              const t = (settings?.templates ?? []).find((x) => x.id === id);
                              if (!t) return null;
                              return (
                                <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{t.name}</div>
                                    <div className="text-xs text-zinc-600">{fmtDelay(t.delayMinutes)} • {t.channels.email ? "Email" : ""}{t.channels.email && t.channels.sms ? ", " : ""}{t.channels.sms ? "SMS" : ""}{(t.audience ?? "CONTACT") === "INTERNAL" ? " • Internal" : ""}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCalendarSequence(
                                          cal.id,
                                          moveInList(settings?.assignments.calendarTemplateIds?.[cal.id] ?? [], id, -1),
                                        )
                                      }
                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCalendarSequence(
                                          cal.id,
                                          moveInList(settings?.assignments.calendarTemplateIds?.[cal.id] ?? [], id, 1),
                                        )
                                      }
                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCalendarSequence(
                                          cal.id,
                                          (settings?.assignments.calendarTemplateIds?.[cal.id] ?? []).filter((x) => x !== id),
                                        )
                                      }
                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-zinc-600">No steps selected yet.</div>
                        )}

                        <select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (!id || !settings) return;
                            const cur = settings.assignments.calendarTemplateIds?.[cal.id] ?? [];
                            if (cur.includes(id)) return;
                            setCalendarSequence(cal.id, [...cur, id].slice(0, 10));
                          }}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        >
                          <option value="">Add a step…</option>
                          {(settings?.templates ?? [])
                            .filter((t) => !(settings?.assignments.calendarTemplateIds?.[cal.id] ?? []).includes(t.id))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({fmtDelay(t.delayMinutes)})
                              </option>
                            ))}
                        </select>
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

          <div className="min-w-0 rounded-3xl border border-zinc-200 bg-white p-6">
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
