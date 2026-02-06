"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BookingFormConfig = {
  version: 1;
  thankYouMessage?: string;
  phone: { enabled: boolean; required: boolean };
  notes: { enabled: boolean; required: boolean };
  questions: {
    id: string;
    label: string;
    required: boolean;
    kind: "short" | "long" | "single_choice" | "multiple_choice";
    options?: string[];
  }[];
};

type Site = {
  id: string;
  ownerId: string;
  slug: string;
  enabled: boolean;
  title: string;
  description?: string | null;
  durationMinutes: number;
  timeZone: string;

  photoUrl?: string | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  appointmentPurpose?: string | null;
  toneDirection?: string | null;
  notificationEmails?: string[] | null;
};

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
};

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  canceledAt?: string | null;
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

type Slot = { startAt: string; endAt: string };

type AvailabilityBlock = { id: string; startAt: string; endAt: string };

type BookingCalendar = {
  id: string;
  enabled: boolean;
  title: string;
  description?: string;
  durationMinutes?: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`;
}

function startOfMonth(d: Date) {
  const out = new Date(d);
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addMonths(d: Date, delta: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + delta);
  return startOfMonth(out);
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, delta: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

function startOfWeek(d: Date) {
  const day = startOfDay(d);
  // Keep consistent with the month grid: 0=Sun.
  return addDays(day, -day.getDay());
}

function makeMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const startDow = first.getDay(); // 0=Sun
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startDow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
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

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

export function PortalBookingClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [recent, setRecent] = useState<Booking[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);

  const [form, setForm] = useState<BookingFormConfig | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [calendars, setCalendars] = useState<BookingCalendar[]>([]);
  const [calSaving, setCalSaving] = useState(false);

  const [newCalTitle, setNewCalTitle] = useState("");
  const [newCalDuration, setNewCalDuration] = useState<number>(30);

  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);

  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [calSelectedYmd, setCalSelectedYmd] = useState<string | null>(null);

  const [topTab, setTopTab] = useState<"settings" | "appointments" | "reminders">("settings");
  const [appointmentsView, setAppointmentsView] = useState<"week" | "month">("week");

  const [contactOpen, setContactOpen] = useState(false);
  const [contactBooking, setContactBooking] = useState<Booking | null>(null);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSendEmail, setContactSendEmail] = useState(true);
  const [contactSendSms, setContactSendSms] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);

  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedBooking, setReschedBooking] = useState<Booking | null>(null);
  const [reschedWhen, setReschedWhen] = useState("");
  const [reschedForce, setReschedForce] = useState(false);
  const [reschedBusy, setReschedBusy] = useState(false);
  const [reschedSlots, setReschedSlots] = useState<Slot[]>([]);
  const [reschedSlotsLoading, setReschedSlotsLoading] = useState(false);

  const [reminderSettings, setReminderSettings] = useState<AppointmentReminderSettings | null>(null);
  const [reminderDraft, setReminderDraft] = useState<AppointmentReminderSettings | null>(null);
  const [reminderTwilio, setReminderTwilio] = useState<TwilioMasked | null>(null);
  const [reminderEvents, setReminderEvents] = useState<AppointmentReminderEvent[]>([]);
  const [reminderSaving, setReminderSaving] = useState(false);

  const [reminderCalendarId, setReminderCalendarId] = useState<string | null>(null);

  const filteredReminderEvents = useMemo(() => {
    const cal = reminderCalendarId;
    if (!cal) return reminderEvents;
    return reminderEvents.filter((e) => e.calendarId === cal);
  }, [reminderEvents, reminderCalendarId]);

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

  async function loadReminders(calendarId: string | null) {
    const remindersRes = await fetch(remindersUrl(calendarId), { cache: "no-store" });
    const remindersJson = await remindersRes.json().catch(() => ({}));
    if (!remindersRes.ok) {
      setError(getApiError(remindersJson) ?? "Failed to load appointment reminders");
      return;
    }
    const settings = ((remindersJson as any)?.settings as AppointmentReminderSettings) ?? null;
    setReminderSettings(settings);
    setReminderDraft(settings);
    setReminderTwilio(((remindersJson as any)?.twilio as TwilioMasked) ?? null);
    setReminderEvents((((remindersJson as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
  }

  const bookingUrl = useMemo(() => {
    if (!site?.slug) return null;
    if (typeof window === "undefined") return `/book/${site.slug}`;
    return `${window.location.origin}/book/${site.slug}`;
  }, [site?.slug]);

  const calendarUrlBase = useMemo(() => {
    if (!site?.slug) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/book/${encodeURIComponent(site.slug)}/c`;
  }, [site?.slug]);

  async function refreshAll() {
    setError(null);
    const [meRes, settingsRes, bookingsRes, formRes, calendarsRes, blocksRes, remindersRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/booking/settings", { cache: "no-store" }),
      fetch("/api/portal/booking/bookings", { cache: "no-store" }),
      fetch("/api/portal/booking/form", { cache: "no-store" }),
      fetch("/api/portal/booking/calendars", { cache: "no-store" }),
      fetch("/api/availability", { cache: "no-store" }),
      fetch(remindersUrl(reminderCalendarId), { cache: "no-store" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const settingsJson = await settingsRes.json().catch(() => ({}));
    if (settingsRes.ok) {
      const nextSite = (settingsJson as { site: Site }).site;
      setSite(nextSite);
      const xs = Array.isArray(nextSite?.notificationEmails) ? nextSite.notificationEmails : [];
      setNotificationEmails(xs);
    }

    const bookingsJson = await bookingsRes.json().catch(() => ({}));
    if (bookingsRes.ok) {
      setUpcoming((bookingsJson as { upcoming?: Booking[] }).upcoming ?? []);
      setRecent((bookingsJson as { recent?: Booking[] }).recent ?? []);
    }

    const formJson = await formRes.json().catch(() => ({}));
    if (formRes.ok) {
      setForm((formJson as { config?: BookingFormConfig }).config ?? null);
    }

    const calendarsJson = await calendarsRes.json().catch(() => ({}));
    if (calendarsRes.ok) {
      setCalendars(((calendarsJson as any)?.config?.calendars as BookingCalendar[]) ?? []);
    }

    const blocksJson = await blocksRes.json().catch(() => ({}));
    if (blocksRes.ok) {
      setBlocks(((blocksJson as any)?.blocks as AvailabilityBlock[]) ?? []);
    }

    const remindersJson = await remindersRes.json().catch(() => ({}));
    if (remindersRes.ok) {
      const settings = ((remindersJson as any)?.settings as AppointmentReminderSettings) ?? null;
      setReminderSettings(settings);
      setReminderDraft(settings);
      setReminderTwilio(((remindersJson as any)?.twilio as TwilioMasked) ?? null);
      setReminderEvents((((remindersJson as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
    }

    if (!meRes.ok || !settingsRes.ok || !bookingsRes.ok || !formRes.ok || !calendarsRes.ok || !blocksRes.ok || !remindersRes.ok) {
      setError(
        getApiError(meJson) ??
          getApiError(settingsJson) ??
          getApiError(bookingsJson) ??
          getApiError(formJson) ??
          getApiError(calendarsJson) ??
          getApiError(blocksJson) ??
          getApiError(remindersJson) ??
          "Failed to load booking automation",
      );
    }
  }

  async function saveCalendars(next: BookingCalendar[]) {
    setCalSaving(true);
    setError(null);
    setStatus(null);
    const res = await fetch("/api/portal/booking/calendars", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ calendars: next }),
    });
    const body = await res.json().catch(() => ({}));
    setCalSaving(false);
    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save calendars");
      return;
    }
    setCalendars(((body as any)?.config?.calendars as BookingCalendar[]) ?? next);
    setStatus("Saved calendars");
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await refreshAll();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (topTab !== "appointments") return;
    setCalSelectedYmd((prev) => prev ?? toYmd(new Date()));
  }, [topTab]);

  async function save(partial: Partial<Site>) {
    if (!site) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/booking/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save settings");
      return;
    }

    setSite((body as { site: Site }).site);
    const nextSite = (body as { site: Site }).site;
    if (Array.isArray(nextSite?.notificationEmails)) {
      setNotificationEmails(nextSite.notificationEmails);
    }
    setStatus("Saved booking settings");
  }

  async function saveReminders(next: AppointmentReminderSettings) {
    setReminderSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch(remindersUrl(reminderCalendarId), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: next }),
    });
    const body = await res.json().catch(() => ({}));
    setReminderSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save appointment reminders");
      return;
    }

    const settings = ((body as any)?.settings as AppointmentReminderSettings) ?? next;
    setReminderSettings(settings);
    setReminderDraft(settings);
    setReminderTwilio(((body as any)?.twilio as TwilioMasked) ?? null);
    setReminderEvents((((body as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
    setStatus("Saved appointment reminders");
  }

  async function setReminderEnabled(enabled: boolean) {
    if (!reminderDraft) return;
    const next: AppointmentReminderSettings = { ...reminderDraft, enabled, version: 3 };
    setReminderDraft(next);
    await saveReminders(next);
  }

  function updateReminderStep(stepId: string, partial: Partial<AppointmentReminderSettings["steps"][number]>) {
    setReminderDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      steps[idx] = { ...steps[idx], ...partial };
      return { ...prev, version: 3, steps };
    });
  }

  function addReminderStep() {
    const defaultBody = "Reminder: your appointment is scheduled for {when}.";
    setReminderDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      if (steps.length >= 8) return prev;
      const nextStep = {
        id: makeClientId("rem_"),
        enabled: true,
        leadTime: { value: 1, unit: "hours" as const },
        messageBody: defaultBody,
      };
      return { ...prev, version: 3, steps: [...steps, nextStep] };
    });
  }

  function deleteReminderStep(stepId: string) {
    setReminderDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.filter((s) => s.id !== stepId) : [];
      return { ...prev, version: 3, steps: steps.length ? steps : prev.steps };
    });
  }

  function sanitizeNotificationEmails(items: string[]): string[] {
    const xs = (Array.isArray(items) ? items : []).map((x) => String(x || "").trim()).filter(Boolean);
    const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    // De-dupe while preserving order.
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const x of xs) {
      const lower = x.toLowerCase();
      if (!emailLike.test(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      unique.push(lower);
    }
    return unique.slice(0, 20);
  }

  async function cancelBooking(id: string) {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/portal/booking/bookings/${id}/cancel`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to cancel booking");
      return;
    }
    await refreshAll();
    setStatus("Canceled booking");
  }

  async function sendFollowUp() {
    if (!contactBooking) return;
    const msg = contactMessage.trim();
    if (!msg) {
      setError("Please enter a message.");
      return;
    }
    if (!contactSendEmail && !contactSendSms) {
      setError("Choose Email and/or Text.");
      return;
    }

    const subject = contactSubject.trim();
    if (contactSendEmail && subject.length > 120) {
      setError("Subject is too long (max 120 characters).");
      return;
    }

    setContactBusy(true);
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/portal/booking/bookings/${contactBooking.id}/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject,
        message: msg,
        sendEmail: contactSendEmail,
        sendSms: contactSendSms,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setContactBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to send follow-up");
      return;
    }

    setContactOpen(false);
    setContactBooking(null);
    setContactSubject("");
    setContactMessage("");
    setContactSendEmail(true);
    setContactSendSms(false);
    setStatus("Sent follow-up");
  }

  async function loadReschedSlots(fromIso?: string) {
    if (!site) return;
    setReschedSlotsLoading(true);
    try {
      const startAt = fromIso ? new Date(fromIso) : new Date();
      startAt.setHours(0, 0, 0, 0);
      const url = new URL("/api/portal/booking/suggestions", window.location.origin);
      url.searchParams.set("startAt", startAt.toISOString());
      url.searchParams.set("days", "14");
      url.searchParams.set("durationMinutes", String(site.durationMinutes ?? 30));
      url.searchParams.set("limit", "25");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiError(body) ?? "Failed to load suggestions");
      }
      setReschedSlots((body as { slots?: Slot[] }).slots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setReschedSlotsLoading(false);
    }
  }

  async function rescheduleBooking() {
    if (!reschedBooking) return;
    if (!reschedWhen.trim()) {
      setError("Pick a new date/time.");
      return;
    }

    const dt = new Date(reschedWhen);
    if (Number.isNaN(dt.getTime())) {
      setError("Pick a valid date/time.");
      return;
    }

    setReschedBusy(true);
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/portal/booking/bookings/${reschedBooking.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startAt: dt.toISOString(), forceAvailability: reschedForce }),
    });
    const body = await res.json().catch(() => ({}));
    setReschedBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to reschedule booking");
      return;
    }

    setReschedOpen(false);
    setReschedBooking(null);
    setReschedWhen("");
    setReschedForce(false);
    await refreshAll();
    setStatus("Rescheduled booking");
  }

  function makeId(label: string) {
    const base = String(label || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const suffix = Math.random().toString(16).slice(2, 6);
    return `${base || "q"}-${suffix}`;
  }

  async function saveForm(next: BookingFormConfig) {
    setFormSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/booking/form", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });

    const body = await res.json().catch(() => ({}));
    setFormSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save booking form");
      return;
    }

    setForm((body as { config: BookingFormConfig }).config);
    setStatus("Saved booking form");
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  const unlocked = Boolean(me?.entitlements?.booking);

  if (!unlocked) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[color:rgba(251,113,133,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-pink)]">
            Locked
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Booking Automation</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-600">
            This service isn’t included in your current plan. Upgrade to unlock your booking link and availability.
          </p>

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

  const focusYmd = calSelectedYmd ?? toYmd(new Date());
  const focusDate = new Date(`${focusYmd}T00:00:00`);
  const weekStart = startOfWeek(focusDate);
  const weekEnd = addDays(weekStart, 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const sidebarBookings = (appointmentsView === "week"
    ? upcoming.filter((b) => {
        const startAt = new Date(b.startAt);
        return startAt >= weekStart && startAt < weekEnd;
      })
    : upcoming.filter((b) => toYmd(new Date(b.startAt)) === focusYmd)
  ).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Booking Automation</h1>
          <p className="mt-1 text-sm text-zinc-600">Publish a booking link, set availability, and capture appointments.</p>
        </div>
      </div>

      <div className="mt-4 inline-flex rounded-2xl border border-zinc-200 bg-white p-1">
        <button
          type="button"
          className={
            topTab === "settings"
              ? "rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              : "rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          }
          onClick={() => setTopTab("settings")}
        >
          Settings
        </button>
        <button
          type="button"
          className={
            topTab === "appointments"
              ? "rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              : "rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          }
          onClick={() => setTopTab("appointments")}
        >
          Appointments
        </button>
        <button
          type="button"
          className={
            topTab === "reminders"
              ? "rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              : "rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          }
          onClick={() => setTopTab("reminders")}
        >
          Reminders
        </button>
      </div>

      {topTab === "appointments" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-9">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Calendar</div>
                <div className="mt-1 text-sm text-zinc-600">See bookings in a weekly or monthly view.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    className={
                      appointmentsView === "week"
                        ? "rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                        : "rounded-2xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    }
                    onClick={() => setAppointmentsView("week")}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    className={
                      appointmentsView === "month"
                        ? "rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                        : "rounded-2xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    }
                    onClick={() => setAppointmentsView("month")}
                  >
                    Month
                  </button>
                </div>

                {appointmentsView === "week" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => setCalSelectedYmd(toYmd(addDays(focusDate, -7)))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => setCalSelectedYmd(toYmd(new Date()))}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => setCalSelectedYmd(toYmd(addDays(focusDate, 7)))}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => setCalMonth((m) => addMonths(m, -1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => setCalMonth(startOfMonth(new Date()))}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      onClick={() => setCalMonth((m) => addMonths(m, 1))}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>

            {appointmentsView === "week" ? (
              <div className="mt-5 -mx-2 overflow-x-auto px-2">
                <div className="grid min-w-max grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3">
                  {weekDays.map((day) => {
                  const ymd = toYmd(day);
                  const selected = focusYmd === ymd;
                  const isToday = toYmd(new Date()) === ymd;

                  const dayStart = startOfDay(day);
                  const dayEnd = addDays(dayStart, 1);

                  const dayBookings = upcoming
                    .filter((b) => toYmd(new Date(b.startAt)) === ymd)
                    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

                  const cardBase =
                    "h-[420px] w-[240px] rounded-3xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200";
                  const cardCls = selected
                    ? `${cardBase} border-blue-300 bg-blue-50/70`
                    : `${cardBase} border-zinc-200 bg-white hover:bg-zinc-50`;

                  return (
                    <button key={ymd} type="button" className={cardCls} onClick={() => setCalSelectedYmd(ymd)}>
                      <div className="flex h-10 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">
                            {day.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                            <span className="text-zinc-500">{day.getDate()}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {day.toLocaleDateString(undefined, { month: "short" })}
                          </div>
                        </div>

                        {isToday ? (
                          <div className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">Today</div>
                        ) : null}
                      </div>

                      <div className="mt-2">
                        <div className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                          {dayBookings.length} booking{dayBookings.length === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="mt-3 h-[340px] overflow-auto">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Bookings</div>
                        {dayBookings.length ? (
                          <div className="mt-2 space-y-1.5">
                            {dayBookings.map((b) => (
                              <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                                <div className="truncate text-xs font-semibold text-zinc-900">
                                  {new Date(b.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{" "}
                                  <span className="font-normal text-zinc-500">·</span>{" "}
                                  {b.contactName}
                                </div>
                                <div className="truncate text-[11px] text-zinc-500">{b.contactEmail}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                            No bookings
                          </div>
                        )}
                      </div>
                    </button>
                  );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-900">{monthLabel(calMonth)}</div>
                  <div className="text-xs text-zinc-500">Click a day to focus the sidebar.</div>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-2 text-xs font-semibold text-zinc-500">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="px-2">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-2">
                  {makeMonthGrid(calMonth).map((day) => {
                    const ymd = toYmd(day);
                    const inMonth = day.getMonth() === calMonth.getMonth();
                    const today = toYmd(new Date()) === ymd;
                    const selected = focusYmd === ymd;

                    const dayStart = startOfDay(day);
                    const dayEnd = addDays(dayStart, 1);

                    const bookingCount = upcoming.reduce((acc, b) => (toYmd(new Date(b.startAt)) === ymd ? acc + 1 : acc), 0);
                    const hasCoverage = blocks.some((b) => new Date(b.startAt) < dayEnd && new Date(b.endAt) > dayStart);

                    const baseCls =
                      "h-24 rounded-3xl border px-3 py-3 text-left hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300";
                    const borderCls = selected
                      ? "border-zinc-900 bg-white"
                      : inMonth
                        ? "border-zinc-200 bg-white"
                        : "border-zinc-200 bg-zinc-50";

                    return (
                      <button
                        key={ymd}
                        type="button"
                        className={`${baseCls} ${borderCls}`}
                        onClick={() => setCalSelectedYmd(ymd)}
                      >
                        <div className="flex items-center justify-between">
                          <div className={inMonth ? "text-sm font-semibold text-zinc-900" : "text-sm font-semibold text-zinc-400"}>
                            {day.getDate()}
                          </div>
                          {today ? (
                            <div className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">Today</div>
                          ) : null}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className={hasCoverage ? "text-[11px] font-medium text-emerald-700" : "text-[11px] text-zinc-400"}>
                            {hasCoverage ? "Avail" : "No avail"}
                          </div>
                          {bookingCount ? (
                            <div className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">{bookingCount}</div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Appointments</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {appointmentsView === "week"
                    ? `Week of ${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : focusDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>

              <Link
                href="/portal/app/services/booking/availability"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Edit availability
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {sidebarBookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  No appointments.
                </div>
              ) : (
                sidebarBookings.map((b) => (
                  <div key={b.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="text-sm font-semibold text-zinc-900">
                      {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleTimeString()}
                    </div>
                    <div className="mt-1 text-sm text-zinc-700">
                      {b.contactName} · {b.contactEmail}
                      {b.contactPhone ? ` · ${b.contactPhone}` : ""}
                    </div>
                    {b.notes ? <div className="mt-2 text-sm text-zinc-600">{b.notes}</div> : null}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                        onClick={() => {
                          setReschedBooking(b);
                          setReschedWhen(toLocalDateTimeInputValue(new Date(b.startAt)));
                          setReschedForce(false);
                          setReschedOpen(true);
                          void loadReschedSlots(b.startAt);
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                        onClick={() => {
                          setContactBooking(b);
                          setContactSubject(`Follow-up: ${site?.title ?? "Booking"}`);
                          setContactMessage("");
                          setContactSendEmail(true);
                          setContactSendSms(Boolean(b.contactPhone));
                          setContactOpen(true);
                        }}
                      >
                        Send follow-up
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                        onClick={() => cancelBooking(b.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {recent.length ? (
              <>
                <div className="mt-6 text-sm font-semibold text-zinc-900">Recent</div>
                <div className="mt-3 space-y-2">
                  {recent.slice(0, 6).map((b) => (
                    <div key={b.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                      <div className="font-medium text-zinc-800">
                        {new Date(b.startAt).toLocaleString()} · {b.status.toLowerCase()}
                      </div>
                      <div className="mt-1 text-zinc-600">{b.contactName}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {topTab === "reminders" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Appointment reminders</div>
                <div className="mt-2 text-sm text-zinc-600">
                  Automatically text people before their appointment. Works like follow-up automation steps.
                </div>
              </div>

              <div className="inline-flex overflow-hidden rounded-2xl border border-zinc-200">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-semibold ${
                    reminderDraft && !reminderDraft.enabled
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                  disabled={reminderSaving || !reminderDraft}
                  onClick={() => void setReminderEnabled(false)}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-semibold ${
                    reminderDraft && reminderDraft.enabled
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                  disabled={reminderSaving || !reminderDraft}
                  onClick={() => void setReminderEnabled(true)}
                >
                  On
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-zinc-800">Twilio</div>
                <div className={`text-xs font-semibold ${reminderTwilio?.configured ? "text-emerald-700" : "text-amber-700"}`}>
                  {reminderTwilio?.configured ? "Configured" : "Not configured"}
                </div>
              </div>
              <div className="mt-2 text-xs text-zinc-600">
                {reminderTwilio?.configured
                  ? `From: ${reminderTwilio.fromNumberE164 ?? ""}`
                  : "Add your Twilio credentials (Services → Missed Call Text Back) to enable SMS reminders."}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-zinc-600">Calendar</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                  value={reminderCalendarId ?? ""}
                  onChange={(e) => {
                    const next = e.target.value || null;
                    setReminderCalendarId(next);
                    void loadReminders(next);
                  }}
                  disabled={reminderSaving}
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
                <div className="text-xs text-zinc-500">Each calendar can have its own reminder sequence.</div>
              </div>
            </div>

            {reminderDraft ? (
              <>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">Reminder steps</div>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                    disabled={reminderSaving || reminderDraft.steps.length >= 8}
                    onClick={() => addReminderStep()}
                  >
                    Add step
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {reminderDraft.steps.map((s, idx) => (
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
                              disabled={reminderSaving}
                              onChange={(e) => updateReminderStep(s.id, { enabled: e.target.checked })}
                            />
                          </label>
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                            disabled={reminderSaving || reminderDraft.steps.length <= 1}
                            onClick={() => deleteReminderStep(s.id)}
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
                                updateReminderStep(s.id, {
                                  leadTime: { ...s.leadTime, value: Number(e.target.value) },
                                })
                              }
                              disabled={reminderSaving}
                            />
                            <select
                              className="h-10 w-32 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                              value={s.leadTime.unit}
                              disabled={reminderSaving}
                              onChange={(e) =>
                                updateReminderStep(s.id, {
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
                        </label>

                        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                          <div className="font-medium text-zinc-800">Message</div>
                          <textarea
                            className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            value={s.messageBody}
                            onChange={(e) => updateReminderStep(s.id, { messageBody: e.target.value })}
                            disabled={reminderSaving}
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
                    disabled={reminderSaving}
                    onClick={() => setReminderDraft(reminderSettings ?? reminderDraft)}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    disabled={
                      reminderSaving ||
                      reminderDraft.steps.length === 0 ||
                      reminderDraft.steps.some((x) => !String(x.messageBody || "").trim())
                    }
                    onClick={() => void saveReminders(reminderDraft)}
                  >
                    {reminderSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 text-sm text-zinc-500">Loading reminders…</div>
            )}
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-4">
            <div className="text-sm font-semibold text-zinc-900">Activity</div>
            <div className="mt-2 text-sm text-zinc-600">Reminders sent (or skipped) show here.</div>

            <div className="mt-4 space-y-2">
              {filteredReminderEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  No reminder activity yet.
                </div>
              ) : (
                filteredReminderEvents.slice(0, 12).map((e) => (
                  <div key={e.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-zinc-800">{e.contactName || "(unknown)"}</div>
                      <div
                        className={`text-xs font-semibold ${
                          e.status === "SENT"
                            ? "text-emerald-700"
                            : e.status === "FAILED"
                              ? "text-red-700"
                              : "text-zinc-600"
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
          </div>
        </div>
      ) : null}

      {topTab === "settings" ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Booking link</div>
          <div className="mt-2 text-sm text-zinc-600">
            Share this link anywhere. Only times you mark as available will show.
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
              <div className="truncate">{bookingUrl ?? "…"}</div>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={!bookingUrl}
              onClick={async () => {
                if (!bookingUrl) return;
                await navigator.clipboard.writeText(bookingUrl);
                setStatus("Copied booking link");
              }}
            >
              Copy
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="font-medium text-zinc-800">Booking enabled</span>
              <input
                type="checkbox"
                checked={Boolean(site?.enabled)}
                onChange={(e) => save({ enabled: e.target.checked })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting length</div>
              <select
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={site?.durationMinutes ?? 30}
                onChange={(e) => save({ durationMinutes: Number(e.target.value) })}
              >
                {[15, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
              <div className="font-medium text-zinc-800">Page title</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={site?.title ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                onBlur={() => save({ title: site?.title ?? "" })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
              <div className="font-medium text-zinc-800">Link slug</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={site?.slug ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, slug: e.target.value } : prev))}
                onBlur={() => save({ slug: site?.slug ?? "" })}
              />
              <div className="mt-2 text-xs text-zinc-500">This becomes the end of your public link: /book/&lt;slug&gt;</div>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/services/booking/availability"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Edit availability
            </Link>
            {site?.enabled ? (
              <a
                href={bookingUrl ?? "#"}
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                target="_blank"
                rel="noreferrer"
              >
                Preview booking page
              </a>
            ) : null}
          </div>

          {saving ? <div className="mt-4 text-sm text-zinc-500">Saving…</div> : null}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Calendars</div>
          <div className="mt-2 text-sm text-zinc-600">
            Create multiple booking links (different appointment types) with their own title and duration.
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold text-zinc-600">Add a calendar</div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm sm:col-span-2"
                placeholder="e.g. Intro call"
                value={newCalTitle}
                onChange={(e) => setNewCalTitle(e.target.value)}
                disabled={calSaving}
              />
              <select
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={newCalDuration}
                onChange={(e) => setNewCalDuration(Number(e.target.value))}
                disabled={calSaving}
              >
                {[15, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={calSaving || !newCalTitle.trim()}
                onClick={() => {
                  const title = newCalTitle.trim();
                  if (!title) return;
                  const next: BookingCalendar = {
                    id: makeClientId("cal_"),
                    enabled: true,
                    title,
                    durationMinutes: newCalDuration,
                  };
                  setNewCalTitle("");
                  void saveCalendars([...(calendars ?? []), next]);
                }}
              >
                {calSaving ? "Saving…" : "Add calendar"}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {calendars.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                No extra calendars yet.
              </div>
            ) : (
              calendars.map((c) => (
                <div key={c.id} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {c.title} <span className="text-xs font-normal text-zinc-500">({c.durationMinutes ?? site?.durationMinutes ?? 30} min)</span>
                      </div>
                      {calendarUrlBase ? (
                        <div className="mt-1 truncate text-xs text-zinc-500">
                          {calendarUrlBase}/{c.id}
                        </div>
                      ) : null}
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-zinc-600">Enabled</span>
                      <input
                        type="checkbox"
                        checked={Boolean(c.enabled)}
                        disabled={calSaving}
                        onChange={(e) => {
                          const next = calendars.map((x) => (x.id === c.id ? { ...x, enabled: e.target.checked } : x));
                          void saveCalendars(next);
                        }}
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={!calendarUrlBase}
                      onClick={async () => {
                        if (!calendarUrlBase) return;
                        await navigator.clipboard.writeText(`${calendarUrlBase}/${c.id}`);
                        setStatus("Copied calendar link");
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={calSaving}
                      onClick={() => {
                        const title = window.prompt("Calendar title", c.title) ?? c.title;
                        const durRaw = window.prompt("Duration minutes", String(c.durationMinutes ?? site?.durationMinutes ?? 30));
                        const dur = durRaw ? Number(durRaw) : c.durationMinutes;

                        const meetingLocation =
                          window.prompt("Meeting location (optional)", (c as any).meetingLocation ?? "") ??
                          ((c as any).meetingLocation ?? "");
                        const meetingDetails =
                          window.prompt("Meeting details (optional)", (c as any).meetingDetails ?? "") ??
                          ((c as any).meetingDetails ?? "");
                        const notifyRaw =
                          window.prompt(
                            "Notification emails (comma-separated, optional)",
                            Array.isArray((c as any).notificationEmails) ? ((c as any).notificationEmails as string[]).join(", ") : "",
                          ) ??
                          (Array.isArray((c as any).notificationEmails) ? ((c as any).notificationEmails as string[]).join(", ") : "");
                        const notificationEmails = notifyRaw
                          .split(",")
                          .map((x) => x.trim().toLowerCase())
                          .filter(Boolean)
                          .slice(0, 20);

                        const next = calendars.map((x) =>
                          x.id === c.id
                            ? {
                                ...x,
                                title: String(title || c.title).slice(0, 80),
                                durationMinutes:
                                  typeof dur === "number" && Number.isFinite(dur)
                                    ? Math.max(10, Math.min(180, Math.round(dur)))
                                    : x.durationMinutes,
                                meetingLocation: String(meetingLocation || "").trim().slice(0, 120) || undefined,
                                meetingDetails: String(meetingDetails || "").trim().slice(0, 600) || undefined,
                                notificationEmails: notificationEmails.length ? notificationEmails : undefined,
                              }
                            : x,
                        );
                        void saveCalendars(next);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={calSaving}
                      onClick={() => {
                        if (!window.confirm("Delete this calendar?")) return;
                        const next = calendars.filter((x) => x.id !== c.id);
                        void saveCalendars(next);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Customization & notifications</div>
          <div className="mt-2 text-sm text-zinc-600">
            Add an optional header photo, meeting info, and who gets notified when someone books.
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold text-zinc-600">Header photo (optional)</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  {site?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={site.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-zinc-500">{site?.photoUrl ? site.photoUrl : "No photo uploaded"}</div>
                  <div className="mt-1 text-xs text-zinc-500">Recommended: wide image, under 2MB.</div>
                </div>
              </div>

              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50">
                  {photoBusy ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={photoBusy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPhotoBusy(true);
                      setError(null);
                      try {
                        const fd = new FormData();
                        fd.set("file", file);
                        const up = await fetch("/api/uploads", { method: "POST", body: fd });
                        const upBody = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
                        if (!up.ok || !upBody.url) {
                          setError(upBody.error ?? "Upload failed");
                          return;
                        }
                        await save({ photoUrl: upBody.url });
                      } finally {
                        setPhotoBusy(false);
                        if (e.target) e.target.value = "";
                      }
                    }}
                  />
                </label>
                {site?.photoUrl ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    onClick={() => save({ photoUrl: null })}
                    disabled={saving}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting location (optional)</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Phone call, Zoom link, in-person address…"
                value={site?.meetingLocation ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, meetingLocation: e.target.value } : prev))}
                onBlur={() => save({ meetingLocation: site?.meetingLocation?.trim() ? site.meetingLocation.trim() : null })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting details (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Anything they should know before the call."
                value={site?.meetingDetails ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, meetingDetails: e.target.value } : prev))}
                onBlur={() => save({ meetingDetails: site?.meetingDetails?.trim() ? site.meetingDetails.trim() : null })}
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Appointment purpose (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="What is this appointment for?"
                value={site?.appointmentPurpose ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, appointmentPurpose: e.target.value } : prev))}
                onBlur={() =>
                  save({
                    appointmentPurpose: site?.appointmentPurpose?.trim()
                      ? site.appointmentPurpose.trim()
                      : null,
                  })
                }
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Tone direction (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Friendly, direct, professional…"
                value={site?.toneDirection ?? ""}
                onChange={(e) => setSite((prev) => (prev ? { ...prev, toneDirection: e.target.value } : prev))}
                onBlur={() =>
                  save({
                    toneDirection: site?.toneDirection?.trim() ? site.toneDirection.trim() : null,
                  })
                }
              />
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
              <div className="font-medium text-zinc-800">Notification emails (optional)</div>
              <div className="mt-2 space-y-2">
                {notificationEmails.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                    Add one or more emails to notify when someone books.
                  </div>
                ) : null}

                {notificationEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={idx === 0 ? "you@company.com" : "another@company.com"}
                      value={email}
                      onChange={(e) => {
                        const next = [...notificationEmails];
                        next[idx] = e.target.value;
                        setNotificationEmails(next);
                      }}
                      onBlur={() => save({ notificationEmails: sanitizeNotificationEmails(notificationEmails) })}
                    />
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => {
                        const next = notificationEmails.filter((_, i) => i !== idx);
                        setNotificationEmails(next);
                        void save({ notificationEmails: sanitizeNotificationEmails(next) });
                      }}
                      aria-label="Remove email"
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  onClick={() => setNotificationEmails((prev) => [...prev, ""])}
                >
                  + Add email
                </button>

                <div className="text-xs text-zinc-500">Emails: {sanitizeNotificationEmails(notificationEmails).length}</div>
              </div>
            </label>
          </div>

          {saving ? <div className="mt-4 text-sm text-zinc-500">Saving…</div> : null}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Booking form</div>
        <div className="mt-1 text-sm text-zinc-600">
          Choose what questions to ask when someone books.
        </div>

        {!form ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Loading form settings…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Thank-you message</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Thanks — you’re booked! We'll see you soon."
                value={form.thankYouMessage ?? ""}
                disabled={formSaving}
                onChange={(e) => setForm({ ...form, thankYouMessage: e.target.value })}
                onBlur={() => void saveForm(form)}
              />
              <div className="mt-2 text-xs text-zinc-500">Shown after a successful booking.</div>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Ask for phone</span>
                <input
                  type="checkbox"
                  checked={form.phone.enabled}
                  disabled={formSaving}
                  onChange={(e) =>
                    void saveForm({
                      ...form,
                      phone: { enabled: e.target.checked, required: e.target.checked ? form.phone.required : false },
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Phone required</span>
                <input
                  type="checkbox"
                  checked={form.phone.required}
                  disabled={formSaving || !form.phone.enabled}
                  onChange={(e) => void saveForm({ ...form, phone: { ...form.phone, required: e.target.checked } })}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Ask for notes</span>
                <input
                  type="checkbox"
                  checked={form.notes.enabled}
                  disabled={formSaving}
                  onChange={(e) =>
                    void saveForm({
                      ...form,
                      notes: { enabled: e.target.checked, required: e.target.checked ? form.notes.required : false },
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Notes required</span>
                <input
                  type="checkbox"
                  checked={form.notes.required}
                  disabled={formSaving || !form.notes.enabled}
                  onChange={(e) => void saveForm({ ...form, notes: { ...form.notes, required: e.target.checked } })}
                />
              </label>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Custom questions</div>
              <div className="mt-1 text-xs text-zinc-600">Add extra questions to your booking form.</div>

              <div className="mt-3 space-y-2">
                {form.questions.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                    No custom questions yet.
                  </div>
                ) : null}

                {form.questions.map((q, idx) => (
                  <div key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center">
                      <input
                        className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={q.label}
                        disabled={formSaving}
                        onChange={(e) => {
                          const next = [...form.questions];
                          next[idx] = { ...q, label: e.target.value };
                          setForm({ ...form, questions: next });
                        }}
                        onBlur={() => void saveForm(form)}
                        placeholder="Question label"
                      />

                      <select
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={q.kind}
                        disabled={formSaving}
                        onChange={(e) => {
                          const next = [...form.questions];
                          const kind = ((e.target.value as any) || "short") as BookingFormConfig["questions"][number]["kind"];
                          const hasOptions = kind === "single_choice" || kind === "multiple_choice";
                          next[idx] = {
                            ...q,
                            kind,
                            ...(hasOptions
                              ? { options: Array.isArray(q.options) && q.options.length ? q.options : ["Option 1", "Option 2"] }
                              : { options: undefined }),
                          };
                          setForm({ ...form, questions: next });
                        }}
                        onBlur={() => void saveForm(form)}
                      >
                        <option value="short">Short answer</option>
                        <option value="long">Long answer</option>
                        <option value="single_choice">Multiple choice (pick one)</option>
                        <option value="multiple_choice">Checkboxes (pick many)</option>
                      </select>

                      <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
                        <span>Required</span>
                        <input
                          type="checkbox"
                          checked={q.required}
                          disabled={formSaving}
                          onChange={(e) => {
                            const next = [...form.questions];
                            next[idx] = { ...q, required: e.target.checked };
                            void saveForm({ ...form, questions: next });
                          }}
                        />
                      </label>
                    </div>

                    {q.kind === "single_choice" || q.kind === "multiple_choice" ? (
                      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-600">Options</div>
                        <div className="mt-2 space-y-2">
                          {(Array.isArray(q.options) ? q.options : []).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <input
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                value={opt}
                                disabled={formSaving}
                                onChange={(e) => {
                                  const next = [...form.questions];
                                  const options = Array.isArray(q.options) ? [...q.options] : [];
                                  options[optIdx] = e.target.value;
                                  next[idx] = { ...q, options };
                                  setForm({ ...form, questions: next });
                                }}
                                onBlur={() => void saveForm(form)}
                                placeholder={`Option ${optIdx + 1}`}
                              />
                              <button
                                type="button"
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                                disabled={formSaving}
                                onClick={() => {
                                  const next = [...form.questions];
                                  const options = (Array.isArray(q.options) ? q.options : []).filter((_, i) => i !== optIdx);
                                  next[idx] = { ...q, options: options.length ? options : ["Option 1", "Option 2"] };
                                  setForm({ ...form, questions: next });
                                  void saveForm({ ...form, questions: next });
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                            disabled={formSaving}
                            onClick={() => {
                              const next = [...form.questions];
                              const options = Array.isArray(q.options) ? [...q.options] : [];
                              options.push(`Option ${options.length + 1}`);
                              next[idx] = { ...q, options: options.slice(0, 12) };
                              setForm({ ...form, questions: next });
                              void saveForm({ ...form, questions: next });
                            }}
                          >
                            + Add option
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-500">ID: {q.id}</div>
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        disabled={formSaving}
                        onClick={() => {
                          const next = form.questions.filter((x) => x.id !== q.id);
                          void saveForm({ ...form, questions: next });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  disabled={formSaving}
                  onClick={() => {
                    const label = "New question";
                    const next = {
                      id: makeId(label),
                      label,
                      required: false,
                      kind: "short" as const,
                    };
                    const updated = { ...form, questions: [...form.questions, next].slice(0, 20) };
                    setForm(updated);
                    void saveForm(updated);
                  }}
                >
                  + Add question
                </button>
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Your public booking link will show these questions immediately.
            </div>
          </div>
        )}
          </div>
        </>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>
      ) : null}

      {contactOpen && contactBooking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">Send follow-up</div>
            <div className="mt-1 text-sm text-zinc-600">
              {contactBooking.contactName} · {contactBooking.contactEmail}
              {contactBooking.contactPhone ? ` · ${contactBooking.contactPhone}` : ""}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Email</span>
                <input
                  type="checkbox"
                  checked={contactSendEmail}
                  disabled={contactBusy}
                  onChange={(e) => setContactSendEmail(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Text</span>
                <input
                  type="checkbox"
                  checked={contactSendSms}
                  disabled={contactBusy || !contactBooking.contactPhone}
                  onChange={(e) => setContactSendSms(e.target.checked)}
                />
              </label>
            </div>
            {!contactBooking.contactPhone ? (
              <div className="mt-2 text-xs text-zinc-500">No phone number on this booking.</div>
            ) : null}

            {contactSendEmail ? (
              <div className="mt-4">
                <div className="text-xs font-semibold text-zinc-600">Email subject</div>
                <input
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                  placeholder={`Follow-up: ${site?.title ?? "Booking"}`}
                  value={contactSubject}
                  disabled={contactBusy}
                  onChange={(e) => setContactSubject(e.target.value)}
                  autoComplete="off"
                />
                <div className="mt-1 text-xs text-zinc-500">Only used for email (not SMS).</div>
              </div>
            ) : null}

            <textarea
              className="mt-4 min-h-[140px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
              placeholder="Write a quick follow-up…"
              value={contactMessage}
              disabled={contactBusy}
              onChange={(e) => setContactMessage(e.target.value)}
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                disabled={contactBusy}
                onClick={() => {
                  setContactOpen(false);
                  setContactBooking(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={contactBusy}
                onClick={() => void sendFollowUp()}
              >
                {contactBusy ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reschedOpen && reschedBooking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">Reschedule booking</div>
            <div className="mt-1 text-sm text-zinc-600">
              {reschedBooking.contactName} · {new Date(reschedBooking.startAt).toLocaleString()}
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-600">New date/time</div>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                value={reschedWhen}
                disabled={reschedBusy}
                onChange={(e) => setReschedWhen(e.target.value)}
              />
              <div className="mt-1 text-xs text-zinc-500">Uses your local time zone.</div>
            </div>

            <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="font-medium text-zinc-800">Force availability</span>
              <input
                type="checkbox"
                checked={reschedForce}
                disabled={reschedBusy}
                onChange={(e) => setReschedForce(e.target.checked)}
              />
            </label>
            <div className="mt-2 text-xs text-zinc-500">
              If there’s no availability block covering this time, we’ll create one.
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs font-semibold text-zinc-600">Suggested slots</div>
              {reschedSlotsLoading ? (
                <div className="mt-2 text-sm text-zinc-600">Loading…</div>
              ) : reschedSlots.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-600">No suggestions found.</div>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {reschedSlots.slice(0, 12).map((s) => (
                    <button
                      key={s.startAt}
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      onClick={() => setReschedWhen(toLocalDateTimeInputValue(new Date(s.startAt)))}
                      disabled={reschedBusy}
                    >
                      {new Date(s.startAt).toLocaleString()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                disabled={reschedBusy}
                onClick={() => {
                  setReschedOpen(false);
                  setReschedBooking(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={reschedBusy}
                onClick={() => void rescheduleBooking()}
              >
                {reschedBusy ? "Rescheduling…" : "Reschedule"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
