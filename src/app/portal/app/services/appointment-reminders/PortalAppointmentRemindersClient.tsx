"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { AppModal } from "@/components/AppModal";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import type { TemplateVariable } from "@/lib/portalTemplateVars";

const LEAD_TIME_UNIT_OPTIONS: Array<PortalListboxOption<AppointmentReminderSettings["steps"][number]["leadTime"]["unit"]>> = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
];

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
  version: 4;
  enabled: boolean;
  steps: {
    id: string;
    enabled: boolean;
    kind: "SMS" | "EMAIL" | "TAG";
    leadTime: { value: number; unit: "minutes" | "hours" | "days" | "weeks" };
    subjectTemplate?: string;
    messageBody?: string;
    tagId?: string;
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
  contactEmailRaw?: string | null;
  contactId?: string | null;
  smsTo: string | null;
  smsBody: string | null;

  channel?: "SMS" | "EMAIL" | "TAG";
  to?: string | null;
  body?: string | null;

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

type ContactTag = { id: string; name: string; color: string | null };

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

async function generateReminderDraft(opts: {
  kind: "EMAIL" | "SMS";
  stepName?: string;
  prompt?: string;
  existingSubject?: string;
  existingBody?: string;
}): Promise<{ subject?: string; body: string } | null> {
  const res = await fetch("/api/portal/follow-up/ai/generate-step", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: opts.kind,
      stepName: opts.stepName,
      prompt: opts.prompt,
      existingSubject: opts.existingSubject,
      existingBody: opts.existingBody,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (json as any)?.code;
    if (res.status === 402 && code === "INSUFFICIENT_CREDITS") {
      throw new Error("Insufficient credits to generate");
    }
    throw new Error(String((json as any)?.error || "Failed to generate"));
  }

  if (opts.kind === "EMAIL") {
    return {
      subject: String((json as any)?.subject ?? "").slice(0, 200),
      body: String((json as any)?.body ?? "").slice(0, 8000),
    };
  }

  return { body: String((json as any)?.body ?? "").slice(0, 8000) };
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

const APPOINTMENT_REMINDER_VARIABLES: TemplateVariable[] = [
  { key: "when", label: "Appointment time", group: "Booking", appliesTo: "Booking" },
  { key: "name", label: "Contact name", group: "Contact", appliesTo: "Booking contact" },
];

export function PortalAppointmentRemindersClient() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [calendars, setCalendars] = useState<BookingCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const selectedCalendarIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedCalendarIdRef.current = selectedCalendarId;
  }, [selectedCalendarId]);

  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [settings, setSettings] = useState<AppointmentReminderSettings | null>(null);
  const [draft, setDraft] = useState<AppointmentReminderSettings | null>(null);
  const [events, setEvents] = useState<AppointmentReminderEvent[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [mediaPickerStepId, setMediaPickerStepId] = useState<string | null>(null);
  const [uploadBusyStepId, setUploadBusyStepId] = useState<string | null>(null);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagBusy, setCreateTagBusy] = useState(false);
  const [createTagStepId, setCreateTagStepId] = useState<string | null>(null);

  const [aiDraftStepId, setAiDraftStepId] = useState<string | null>(null);
  const [aiDraftInstruction, setAiDraftInstruction] = useState("");
  const [aiDraftBusy, setAiDraftBusy] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);

  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varPickerStepId, setVarPickerStepId] = useState<string | null>(null);
  const activeMessageElRef = useRef<HTMLTextAreaElement | null>(null);

  const refreshTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const res = await fetch("/api/portal/contact-tags", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json.ok || !Array.isArray(json.tags)) {
        throw new Error(typeof json?.error === "string" ? json.error : "Failed to load tags");
      }
      const next = (json.tags as any[])
        .map((t: any) => ({
          id: String(t?.id || ""),
          name: String(t?.name || "").slice(0, 60),
          color: typeof t?.color === "string" ? String(t.color) : null,
        }))
        .filter((t: ContactTag) => t.id && t.name);
      next.sort((a: ContactTag, b: ContactTag) => a.name.localeCompare(b.name));
      setOwnerTags(next);
    } catch {
      setOwnerTags([]);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  async function createTag() {
    const name = createTagName.trim();
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setCreateTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json.ok || !json.tag?.id) {
        throw new Error(typeof json?.error === "string" ? json.error : "Failed to create tag");
      }
      const createdId = String(json.tag.id);
      await refreshTags();
      const stepId = createTagStepId;
      if (stepId) updateStep(stepId, { tagId: createdId });
      setCreateTagOpen(false);
      setCreateTagName("");
      setCreateTagStepId(null);
      toast.success("Created tag");
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setCreateTagBusy(false);
    }
  }

  function insertAtCursor(current: string, insert: string, el: HTMLTextAreaElement | null) {
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    return { next, cursor: start + insert.length };
  }

  const unlocked = useMemo(() => Boolean(me?.entitlements?.booking), [me?.entitlements?.booking]);

  useEffect(() => {
    if (!unlocked) return;
    void refreshTags();
  }, [refreshTags, unlocked]);

  const calendarsById = useMemo(() => {
    const m = new Map<string, BookingCalendar>();
    for (const c of calendars) m.set(c.id, c);
    return m;
  }, [calendars]);

  const calendarOptions = useMemo(() => {
    return [
      { value: "", label: "Default (all booking links)" },
      ...calendars
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((c) => ({ value: c.id, label: `${c.title}${c.enabled ? "" : " (off)"}` })),
    ] satisfies Array<PortalListboxOption<string>>;
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

  const remindersUrl = useCallback((calendarId: string | null) => {
    const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return `/api/portal/booking/reminders/settings${q}`;
  }, []);

  const fetchReminders = useCallback(
    async (calendarId: string | null) => {
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
    },
    [remindersUrl]
  );

  const refresh = useCallback(async () => {
    setError(null);

    const [meRes, calendarsRes] = await Promise.all([
      fetch("/api/customer/me", {
        cache: "no-store",
        headers: {
          "x-pa-app": "portal",
          "x-portal-variant": typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "credit" : "portal",
        },
      }),
      fetch("/api/portal/booking/calendars", { cache: "no-store" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const calJson = await calendarsRes.json().catch(() => ({}));
    if (calendarsRes.ok) {
      const list = (((calJson as any)?.config?.calendars as BookingCalendar[]) ?? []).filter((c) => c && c.id);
      setCalendars(list);
      if (!selectedCalendarIdRef.current) {
        const firstEnabled = list.find((c) => c.enabled) ?? list[0];
        if (firstEnabled?.id) setSelectedCalendarId(firstEnabled.id);
      }
    }

    const targetCalendar = selectedCalendarIdRef.current;
    const remindersResult = await fetchReminders(targetCalendar);
    if (!meRes.ok || !calendarsRes.ok || !remindersResult.ok) {
      setError(getApiError(meJson) ?? getApiError(calJson) ?? ("error" in remindersResult ? remindersResult.error : null) ?? "Failed to load appointment reminders");
    }
  }, [fetchReminders]);

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
  }, [refresh]);

  useEffect(() => {
    if (!selectedCalendarId) return;
    void (async () => {
      setError(null);
      const res = await fetchReminders(selectedCalendarId);
      if (!res.ok) setError((res as any).error ?? "Failed to load appointment reminders");
    })();
  }, [fetchReminders, selectedCalendarId]);

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
      return { ...prev, version: 4, steps };
    });
  }

  function addStep(kind: "SMS" | "EMAIL" | "TAG") {
    const defaultSubject = "Appointment reminder: {when}";
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      if (steps.length >= 8) return prev;
      return {
        ...prev,
        version: 4,
        steps: [
          ...steps,
          {
            id: makeClientId("rem_"),
            enabled: true,
            kind,
            leadTime: { value: 1, unit: "hours" },
            ...(kind === "EMAIL" ? { subjectTemplate: defaultSubject } : {}),
            ...(kind === "TAG" ? {} : { messageBody: DEFAULT_BODY }),
          },
        ],
      };
    });
  }

  function moveStep(stepId: string, delta: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= steps.length) return prev;
      const tmp = steps[idx];
      steps[idx] = steps[nextIdx];
      steps[nextIdx] = tmp;
      return { ...prev, version: 4, steps };
    });
  }

  function deleteStep(stepId: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.filter((s) => s.id !== stepId) : [];
      if (steps.length === 0) return prev;
      return { ...prev, version: 4, steps };
    });
  }

  async function addMediaLinkToStep(item: PortalMediaPickItem) {
    const stepId = mediaPickerStepId;
    if (!stepId) return;
    const step = draft?.steps.find((s) => s.id === stepId);
    if (!step) return;

    const link = window.location.origin + item.shareUrl;
    const base = String(step.messageBody || "");
    const sep = base.trim().length ? "\n\n" : "";
    updateStep(stepId, { messageBody: base + sep + link });
    setMediaPickerStepId(null);
  }

  async function uploadFileForStep(stepId: string, file: File) {
    setUploadBusyStepId(stepId);
    setError(null);
    setStatus(null);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setError((typeof body?.error === "string" ? body.error : null) ?? "Upload failed");
        return;
      }

      const rawUrl = typeof body?.url === "string" ? body.url : "";
      if (!rawUrl) {
        setError("Upload did not return a URL");
        return;
      }

      const link = rawUrl.startsWith("/") ? window.location.origin + rawUrl : rawUrl;
      const step = draft?.steps.find((s) => s.id === stepId);
      const base = String(step?.messageBody || "");
      const sep = base.trim().length ? "\n\n" : "";
      updateStep(stepId, { messageBody: base + sep + link });
      setStatus("Attached");
      window.setTimeout(() => setStatus(null), 1200);
    } finally {
      setUploadBusyStepId((prev) => (prev === stepId ? null : prev));
    }
  }

  async function setEnabled(enabled: boolean) {
    if (!draft) return;
    const next: AppointmentReminderSettings = { ...draft, enabled, version: 4 };
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
          <p className="mt-3 max-w-2xl text-sm text-zinc-600">Requires Booking Automation to be on for your plan.</p>

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-sm font-semibold text-zinc-900">Why this matters</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Cut no-shows with automatic SMS/email reminders</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Keep customers informed without manual outreach</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Spend time delivering service, not chasing confirmations</span></li>
            </ul>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/billing?buy=booking&autostart=1"
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in Billing
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

      {status ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{status}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PortalSettingsSection
            title="Setup"
            description="Add one or more reminder steps with different lead times."
            accent="slate"
            status={draft ? (draft.enabled ? "on" : "off") : undefined}
            defaultOpen={false}
          >
          <div className="flex items-start justify-between gap-3">

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
              <PortalListboxDropdown
                value={selectedCalendarId ?? ""}
                options={calendarOptions}
                onChange={(v) => setSelectedCalendarId(v || null)}
                disabled={saving}
                className="w-full max-w-md"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
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
                : (
                    <>
                      Add your Twilio credentials in{" "}
                      <Link href="/portal/app/profile" className="font-semibold text-brand-ink underline hover:no-underline">
                        Profile
                      </Link>
                      {" "}→ Twilio to enable SMS reminders.
                    </>
                  )}
            </div>
          </div>

          {draft ? (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-zinc-600">Reminder steps</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    disabled={saving || draft.steps.length >= 8}
                    onClick={() => addStep("SMS")}
                  >
                    + SMS step
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    disabled={saving || draft.steps.length >= 8}
                    onClick={() => addStep("EMAIL")}
                  >
                    + Email step
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    disabled={saving || draft.steps.length >= 8}
                    onClick={() => addStep("TAG")}
                  >
                    + Tag step
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {draft.steps.map((s, idx) => (
                  <div key={s.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">
                            {s.kind === "EMAIL" ? "Email" : s.kind === "TAG" ? "Tag" : "SMS"} step {idx + 1}
                          </div>
                          <div className="mt-1 text-xs text-zinc-600">{s.leadTime.value} {s.leadTime.unit} before</div>
                          <div className="mt-1 text-xs text-zinc-600">Variables: {"{name}"}, {"{when}"}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                            disabled={saving || idx === 0}
                            onClick={() => moveStep(s.id, -1)}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                            disabled={saving || idx === draft.steps.length - 1}
                            onClick={() => moveStep(s.id, 1)}
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-xs text-zinc-600">On</span>
                          <input
                            type="checkbox"
                            checked={Boolean(s.enabled)}
                            disabled={saving}
                            onChange={(e) => updateStep(s.id, { enabled: e.target.checked })}
                          />
                        </label>
                        <button
                          type="button"
                          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
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
                          <PortalListboxDropdown
                            value={s.leadTime.unit}
                            options={LEAD_TIME_UNIT_OPTIONS}
                            disabled={saving}
                            onChange={(unit) =>
                              updateStep(s.id, {
                                leadTime: {
                                  unit,
                                  value: Math.max(minValueForUnit(unit), Math.min(maxValueForUnit(unit), s.leadTime.value)),
                                },
                              })
                            }
                            className="w-32"
                            buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                          <span className="text-sm text-zinc-600">before</span>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-zinc-500">Max 2 weeks.</div>
                      </label>

                      <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-zinc-800">{s.kind === "TAG" ? "Tag" : "Message"}</div>
                          <div className="flex items-center gap-2">
                            {s.kind !== "TAG" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  className={
                                    "inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
                                    "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink)"
                                  }
                                  onClick={() => {
                                    setAiDraftStepId(s.id);
                                    setAiDraftInstruction("");
                                    setAiDraftError(null);
                                  }}
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                                    <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                                  </svg>
                                  <span>AI draft</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                  onClick={() => {
                                    setVarPickerStepId(s.id);
                                    setVarPickerOpen(true);
                                  }}
                                >
                                  Insert variable
                                </button>
                                <label className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60">
                                  {uploadBusyStepId === s.id ? "Uploading…" : "Upload file"}
                                  <input
                                    type="file"
                                    className="hidden"
                                    disabled={saving || uploadBusyStepId === s.id}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void uploadFileForStep(s.id, f);
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={saving}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                                  onClick={() => setMediaPickerStepId(s.id)}
                                >
                                  Attach files
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                onClick={() => {
                                  setCreateTagStepId(s.id);
                                  setCreateTagName("");
                                  setCreateTagOpen(true);
                                }}
                              >
                                New tag
                              </button>
                            )}
                          </div>
                        </div>

                        {s.kind === "TAG" ? (
                          <>
                            <PortalListboxDropdown
                              value={String(s.tagId || "")}
                              disabled={saving || tagsLoading}
                              onChange={(v) => updateStep(s.id, { tagId: String(v || "") || undefined })}
                              options={[
                                { value: "", label: tagsLoading ? "Loading tags…" : "Select a tag…" },
                                ...ownerTags.map((t) => ({ value: t.id, label: t.name })),
                              ]}
                              className="mt-2 w-full max-w-md"
                              buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            />
                            <div className="mt-2 text-xs text-zinc-500">This step applies a tag to the contact (no message is sent).</div>
                          </>
                        ) : (
                          <>
                            {s.kind === "EMAIL" ? (
                              <div className="mt-3">
                                <div className="text-xs font-semibold text-zinc-600">Subject</div>
                                <input
                                  className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                                  value={String(s.subjectTemplate ?? "")}
                                  onChange={(e) => updateStep(s.id, { subjectTemplate: e.target.value })}
                                  disabled={saving}
                                />
                              </div>
                            ) : null}
                            <textarea
                              className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              value={String(s.messageBody ?? "")}
                              onChange={(e) => updateStep(s.id, { messageBody: e.target.value })}
                              disabled={saving}
                              onFocus={(e) => {
                                activeMessageElRef.current = e.currentTarget;
                              }}
                            />
                          </>
                        )}
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
                  disabled={
                    saving ||
                    draft.steps.length === 0 ||
                    draft.steps.some((x) => (x.kind === "TAG" ? !String(x.tagId || "").trim() : !String(x.messageBody || "").trim()))
                  }
                  onClick={() => void save(draft)}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 text-sm text-zinc-500">Loading reminders…</div>
          )}
          </PortalSettingsSection>
        </div>

        <PortalSettingsSection
          title="Activity"
          description="Reminders sent (or skipped) show here."
          accent="slate"
          status={draft ? (draft.enabled ? "on" : "off") : undefined}
          defaultOpen={false}
        >

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
        </PortalSettingsSection>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Tip: reminders are processed every 5 minutes.
      </div>

      <AppModal
        open={createTagOpen}
        title="Create tag"
        description="Create a new contact tag to use in this reminder step."
        onClose={() => {
          if (createTagBusy) return;
          setCreateTagOpen(false);
        }}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              disabled={createTagBusy}
              onClick={() => setCreateTagOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={createTagBusy || !createTagName.trim()}
              onClick={() => void createTag()}
            >
              {createTagBusy ? "Creating…" : "Create"}
            </button>
          </div>
        }
      >
        <label className="block">
          <div className="text-xs font-semibold text-zinc-600">Tag name</div>
          <input
            className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            value={createTagName}
            onChange={(e) => setCreateTagName(e.target.value)}
            disabled={createTagBusy}
            placeholder="e.g. Confirmed"
          />
        </label>
      </AppModal>

      <AppModal
        open={Boolean(aiDraftStepId)}
        title="AI draft"
        description="Describe what you want this reminder to say."
        onClose={() => {
          if (aiDraftBusy) return;
          setAiDraftStepId(null);
          setAiDraftError(null);
        }}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              disabled={aiDraftBusy}
              onClick={() => {
                setAiDraftStepId(null);
                setAiDraftError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={aiDraftBusy || !aiDraftStepId}
              onClick={async () => {
                if (!draft) return;
                const stepId = aiDraftStepId;
                if (!stepId) return;

                const step = draft.steps.find((x) => x.id === stepId);
                if (!step || step.kind === "TAG") {
                  setAiDraftStepId(null);
                  return;
                }

                setAiDraftBusy(true);
                setAiDraftError(null);
                try {
                  const generated = await generateReminderDraft({
                    kind: step.kind,
                    stepName: step.kind === "EMAIL" ? "Email reminder" : "SMS reminder",
                    prompt: aiDraftInstruction.trim() || undefined,
                    existingSubject: step.kind === "EMAIL" ? String(step.subjectTemplate ?? "") : undefined,
                    existingBody: String(step.messageBody ?? ""),
                  });

                  if (!generated) return;

                  if (step.kind === "EMAIL") {
                    const subject = (generated.subject ?? String(step.subjectTemplate ?? "")).trim();
                    updateStep(stepId, {
                      subjectTemplate: subject || "Appointment reminder",
                      messageBody: String(generated.body || ""),
                    });
                  } else {
                    updateStep(stepId, { messageBody: String(generated.body || "") });
                  }

                  setAiDraftStepId(null);
                  setAiDraftInstruction("");
                  toast.success("Draft applied");
                } catch (e: any) {
                  setAiDraftError(String(e?.message || "Failed to generate"));
                } finally {
                  setAiDraftBusy(false);
                }
              }}
            >
              {aiDraftBusy ? "Drafting…" : "Generate"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <div className="text-xs font-semibold text-zinc-600">Instructions</div>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={aiDraftInstruction}
              onChange={(e) => setAiDraftInstruction(e.target.value)}
              disabled={aiDraftBusy}
              placeholder="e.g. Friendly, short, and include the appointment time."
            />
          </label>

          {aiDraftError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{aiDraftError}</div>
          ) : null}

          <div className="text-xs text-zinc-500">Tip: you can reference variables like {"{name}"} and {"{when}"}.</div>
        </div>
      </AppModal>

      <PortalMediaPickerModal
        open={Boolean(mediaPickerStepId)}
        onClose={() => setMediaPickerStepId(null)}
        onPick={addMediaLinkToStep}
        confirmLabel="Attach"
        title="Attach from media library"
      />

      <PortalVariablePickerModal
        open={varPickerOpen}
        onClose={() => {
          setVarPickerOpen(false);
          setVarPickerStepId(null);
        }}
        variables={APPOINTMENT_REMINDER_VARIABLES}
        title="Insert variable"
        onPick={(key) => {
          if (!draft) return;
          const stepId = varPickerStepId;
          if (!stepId) return;
          const step = draft.steps.find((x) => x.id === stepId);
          if (!step) return;
          if (step.kind === "TAG") return;

          const token = `{${key}}`;
          const { next, cursor } = insertAtCursor(step.messageBody || "", token, activeMessageElRef.current);
          updateStep(stepId, { messageBody: next });
          queueMicrotask(() => {
            const el = activeMessageElRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(cursor, cursor);
          });
        }}
      />
    </div>
  );
}
