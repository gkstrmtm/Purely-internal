"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalFollowUpClient } from "@/app/portal/app/services/follow-up/PortalFollowUpClient";
import { PortalBookingAvailabilityClient } from "@/app/portal/app/services/booking/availability/PortalBookingAvailabilityClient";
import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { PortalTypeaheadInput } from "@/components/PortalTypeaheadInput";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";
import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { useToast } from "@/components/ToastProvider";
import { REMINDER_TEMPLATES, type ReminderTemplate } from "@/lib/portalReminderTemplates";
import { PORTAL_BOOKING_VARIABLES, PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { IconEdit } from "@/app/portal/PortalIcons";

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
  meetingPlatform?: string | null;
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
  contactId?: string | null;
  contactTags?: ContactTag[];
  notes?: string | null;
  createdAt: string;
  canceledAt?: string | null;
};

type FunnelDomain = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED";
};

type HostedSite = {
  id: string;
  primaryDomain: string | null;
  verifiedAt: string | null;
  verificationToken?: string;
};

type BookingCalendar = {
  id: string;
  enabled: boolean;
  title: string;
  durationMinutes?: number | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  notificationEmails?: string[] | null;
};

type AvailabilityBlock = {
  id?: string;
  startAt: string;
  endAt: string;
};

type Slot = {
  startAt: string;
  endAt?: string;
};

type EmailAttachmentRef = {
  mediaItemId: string;
  fileName: string;
  mimeType: string;
};

type AppointmentReminderSettings = {
  version: 4;
  enabled: boolean;
  customVariables: Record<string, string>;
  steps: {
    id: string;
    enabled: boolean;
    kind: "SMS" | "EMAIL" | "TAG";
    leadTime: { value: number; unit: "minutes" | "hours" | "days" | "weeks" };
    subjectTemplate?: string;
    messageBody?: string;
    emailAttachments?: EmailAttachmentRef[];
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
  error?: string;
};

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  accent = "blue",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  accent?: "blue" | "pink" | "ink";
}) {
  const checkedBgClass =
    accent === "pink"
      ? "peer-checked:bg-(--color-brand-pink)"
      : accent === "ink"
        ? "peer-checked:bg-brand-ink"
        : "peer-checked:bg-(--color-brand-blue)";

  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 rounded-full bg-zinc-200 transition " +
          checkedBgClass +
          " peer-disabled:opacity-60"
        }
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-60"
      />
    </span>
  );
}

const BOOKING_PATH_SUFFIX = "/app/services/booking";
const AVAILABILITY_PATH_SUFFIX = "/app/services/booking/availability";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), 1);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfWeek(d: Date): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = next.getDay(); // 0 = Sunday
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeClientId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      const uuid = (crypto as any).randomUUID() as string;
      return `${prefix}${uuid.replace(/-/g, "")}`;
    }
  } catch {
    // ignore
  }
  return `${prefix}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function apexDomain(raw: string): string {
  const host = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];

  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function monthLabel(d: Date): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1);
  return dt.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function makeMonthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function startOfDay(d: Date): Date {
  const next = new Date(d.getTime());
  next.setHours(0, 0, 0, 0);
  return next;
}

function getPurelyConnectJoinUrl(notes: string | null | undefined): string | null {
  const text = String(notes || "").trim();
  if (!text) return null;
  const match = text.match(/https:\/\/[^\s)\]]+/i);
  return match?.[0] ?? null;
}

function toLocalDateTimeInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function portalBasePrefixFromPathname(pathname: string): "/portal" | "/credit" {
  return pathname.startsWith("/credit/") ? "/credit" : "/portal";
}

function toBookingPathname(pathname: string) {
  return `${portalBasePrefixFromPathname(pathname)}${BOOKING_PATH_SUFFIX}`;
}

function toAvailabilityPathname(pathname: string) {
  return `${portalBasePrefixFromPathname(pathname)}${AVAILABILITY_PATH_SUFFIX}`;
}

export function PortalBookingClient() {
  const pathname = usePathname();
  const appBase = String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";
  const toast = useToast();
  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  type BookingDeepLinkModal = "contact" | "reschedule";

  const isMobileApp = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("pa_mobileapp") === "1") return true;
    return (window.location.host || "").includes("purely-mobile");
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts/custom-variable-keys", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok || !Array.isArray(json.keys)) return;
        const keys = json.keys.map((k: any) => String(k || "").trim()).filter(Boolean).slice(0, 50);
        if (!canceled) setKnownContactCustomVarKeys(keys);
      } catch {
        // ignore
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);
  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [recent, setRecent] = useState<Booking[]>([]);

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [notificationEmailSuggestions, setNotificationEmailSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/notifications/recipients").catch(() => null);
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as any;
      const list = Array.isArray(json?.recipients) ? json.recipients : [];
      const emails = list
        .map((r: any) => (typeof r?.email === "string" ? r.email.trim() : ""))
        .filter((e: string) => Boolean(e) && e.includes("@"))
        .slice(0, 5000);
      if (cancelled) return;
      setNotificationEmailSuggestions(emails);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [form, setForm] = useState<BookingFormConfig | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [funnelDomains, setFunnelDomains] = useState<FunnelDomain[]>([]);
  const [funnelDomainsBusy, setFunnelDomainsBusy] = useState(false);
  const [hostedSite, setHostedSite] = useState<HostedSite | null>(null);
  const [hostedSiteBusy, setHostedSiteBusy] = useState(false);
  const [hostedDomainDraft, setHostedDomainDraft] = useState("");

  const [calendars, setCalendars] = useState<BookingCalendar[]>([]);
  const [calSaving, setCalSaving] = useState(false);

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const selectedCalendar = useMemo(() => {
    if (!selectedCalendarId) return null;
    return calendars.find((c) => c.id === selectedCalendarId) ?? null;
  }, [calendars, selectedCalendarId]);

  const [calendarDraftTitle, setCalendarDraftTitle] = useState("");
  const [calendarDraftDurationMinutes, setCalendarDraftDurationMinutes] = useState<number>(30);
  const [calendarDraftMeetingLocation, setCalendarDraftMeetingLocation] = useState("");
  const [calendarDraftMeetingDetails, setCalendarDraftMeetingDetails] = useState("");
  const [calendarDraftNotificationEmails, setCalendarDraftNotificationEmails] = useState<string[]>([]);

  const selectedCalendarIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Default to first calendar for convenience.
    if (!selectedCalendarId && calendars.length) {
      setSelectedCalendarId(calendars[0]?.id ?? null);
    }
  }, [calendars, selectedCalendarId]);

  useEffect(() => {
    // Only reset drafts when switching calendars.
    if (selectedCalendarIdRef.current === selectedCalendarId) return;
    selectedCalendarIdRef.current = selectedCalendarId;

    if (!selectedCalendar) {
      setCalendarDraftTitle("");
      setCalendarDraftDurationMinutes(site?.durationMinutes ?? 30);
      setCalendarDraftMeetingLocation("");
      setCalendarDraftMeetingDetails("");
      setCalendarDraftNotificationEmails([]);
      return;
    }

    setCalendarDraftTitle(selectedCalendar.title ?? "");
    setCalendarDraftDurationMinutes(selectedCalendar.durationMinutes ?? site?.durationMinutes ?? 30);
    setCalendarDraftMeetingLocation(selectedCalendar.meetingLocation ?? site?.meetingLocation ?? "");
    setCalendarDraftMeetingDetails(selectedCalendar.meetingDetails ?? site?.meetingDetails ?? "");
    setCalendarDraftNotificationEmails(Array.isArray(selectedCalendar.notificationEmails) ? selectedCalendar.notificationEmails : Array.isArray(site?.notificationEmails) ? site.notificationEmails : []);
  }, [selectedCalendar, selectedCalendarId, site?.durationMinutes, site?.meetingDetails, site?.meetingLocation, site?.notificationEmails]);

  const [newCalTitle, setNewCalTitle] = useState("");
  const [newCalDuration, setNewCalDuration] = useState<number>(30);

  const [calendarDeleteId, setCalendarDeleteId] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);

  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [calSelectedYmd, setCalSelectedYmd] = useState<string | null>(null);
  const [weekDayModalYmd, setWeekDayModalYmd] = useState<string | null>(null);

  const [topTab, setTopTab] = useState<"settings" | "appointments" | "bookings" | "reminders" | "follow-up">("appointments");
  const [appointmentsView, setAppointmentsView] = useState<"week" | "month">("week");

  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const availabilityReturnHrefRef = useRef<string | null>(null);

  const syncAvailabilityFromUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    const isAvail = window.location.pathname === toAvailabilityPathname(window.location.pathname);
    setAvailabilityOpen(isAvail);
    if (!isAvail) availabilityReturnHrefRef.current = null;
  }, []);

  const openAvailability = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!availabilityReturnHrefRef.current) {
      availabilityReturnHrefRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }
    setAvailabilityOpen(true);

    try {
      const url = new URL(window.location.href);
      url.pathname = toAvailabilityPathname(url.pathname);
      window.history.pushState({ modal: "availability" }, "", url.toString());
    } catch {
      // ignore
    }
  }, []);

  const closeAvailability = useCallback(() => {
    setAvailabilityOpen(false);
    if (typeof window === "undefined") return;
    const target = availabilityReturnHrefRef.current || toBookingPathname(window.location.pathname);
    availabilityReturnHrefRef.current = null;
    try {
      window.history.replaceState({}, "", target);
    } catch {
      // ignore
    }
  }, []);

  const bookingModalReturnHrefRef = useRef<string | null>(null);

  const clearBookingModalUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const target = (() => {
        if (bookingModalReturnHrefRef.current) return bookingModalReturnHrefRef.current;
        const url = new URL(window.location.href);
        url.searchParams.delete("bookingId");
        url.searchParams.delete("modal");
        return url.toString();
      })();
      bookingModalReturnHrefRef.current = null;
      window.history.replaceState({}, "", target);
    } catch {
      // ignore
    }
  }, []);

  const setBookingModalUrl = useCallback(
    (next: { bookingId: string; modal: BookingDeepLinkModal }, mode: "push" | "replace") => {
      if (typeof window === "undefined") return;
      try {
        if (mode === "push" && !bookingModalReturnHrefRef.current) {
          bookingModalReturnHrefRef.current = window.location.href;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("bookingId", next.bookingId);
        url.searchParams.set("modal", next.modal);
        const nextHref = url.toString();
        if (mode === "push") window.history.pushState({ modal: `booking_${next.modal}`, bookingId: next.bookingId }, "", nextHref);
        else window.history.replaceState({ modal: `booking_${next.modal}`, bookingId: next.bookingId }, "", nextHref);
      } catch {
        // ignore
      }
    },
    [],
  );

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

  const pendingBookingDeepLinkRef = useRef<null | { bookingId: string; modal: BookingDeepLinkModal | null }>(null);
  const appliedBookingDeepLinkSigRef = useRef<string | null>(null);

  const loadReschedSlots = useCallback(async (fromIso?: string) => {
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
  }, [site]);

  const tryApplyBookingDeepLink = useCallback(() => {
    const pending = pendingBookingDeepLinkRef.current;
    if (!pending) return;

    if (!pending.bookingId) {
      pendingBookingDeepLinkRef.current = null;
      return;
    }

    const booking = [...upcoming, ...recent].find((b) => b.id === pending.bookingId) ?? null;
    if (!booking) return;
    if (!pending.modal) {
      pendingBookingDeepLinkRef.current = null;
      return;
    }

    if (pending.modal === "contact") {
      setReschedOpen(false);
      setReschedBooking(null);
      setContactBooking(booking);
      setContactSubject(`Follow-up: ${site?.title ?? "Booking"}`);
      setContactMessage("");
      setContactSendEmail(true);
      setContactSendSms(Boolean(booking.contactPhone));
      setContactOpen(true);
    } else {
      setContactOpen(false);
      setContactBooking(null);
      setReschedBooking(booking);
      setReschedWhen(toLocalDateTimeInputValue(new Date(booking.startAt)));
      setReschedForce(false);
      setReschedOpen(true);
      void loadReschedSlots(booking.startAt);
    }

    pendingBookingDeepLinkRef.current = null;
  }, [loadReschedSlots, recent, site?.title, upcoming]);

  const syncBookingDeepLinkFromUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const bookingId = String(sp.get("bookingId") || "").trim();
      const modalRaw = String(sp.get("modal") || "").trim();
      const modal = modalRaw === "contact" || modalRaw === "reschedule" ? (modalRaw as BookingDeepLinkModal) : null;
      const sig = bookingId ? `${bookingId}:${modal ?? ""}` : "";
      if (appliedBookingDeepLinkSigRef.current === sig) return;
      appliedBookingDeepLinkSigRef.current = sig;

      if (!bookingId) {
        pendingBookingDeepLinkRef.current = null;
        setContactOpen(false);
        setContactBooking(null);
        setReschedOpen(false);
        setReschedBooking(null);
        bookingModalReturnHrefRef.current = null;
        return;
      }

      pendingBookingDeepLinkRef.current = { bookingId, modal };
      tryApplyBookingDeepLink();
    } catch {
      // ignore
    }
  }, [tryApplyBookingDeepLink]);

  const [reminderSettings, setReminderSettings] = useState<AppointmentReminderSettings | null>(null);
  const [reminderDraft, setReminderDraft] = useState<AppointmentReminderSettings | null>(null);
  const [reminderEvents, setReminderEvents] = useState<AppointmentReminderEvent[]>([]);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderTemplateOpen, setReminderTemplateOpen] = useState(false);

  const reminderDraftSig = useMemo(() => (reminderDraft ? JSON.stringify(reminderDraft) : null), [reminderDraft]);
  const reminderSettingsSig = useMemo(() => (reminderSettings ? JSON.stringify(reminderSettings) : null), [reminderSettings]);
  const reminderDirty = Boolean(reminderDraftSig && reminderSettingsSig && reminderDraftSig !== reminderSettingsSig);

  type ReminderAiDraftModalState =
    | null
    | {
        stepId: string;
        kind: "EMAIL" | "SMS";
        stepLabel: string;
        existingSubject?: string;
        existingBody: string;
      };

  const [reminderAiDraftModal, setReminderAiDraftModal] = useState<ReminderAiDraftModalState>(null);
  const [reminderAiDraftInstruction, setReminderAiDraftInstruction] = useState("");
  const [reminderAiDraftBusy, setReminderAiDraftBusy] = useState(false);
  const [reminderAiDraftError, setReminderAiDraftError] = useState<string | null>(null);

  const [reminderVarPickerOpen, setReminderVarPickerOpen] = useState(false);
  const [reminderVarPickerTarget, setReminderVarPickerTarget] = useState<
    | null
    | { kind: "step"; stepId: string; field: "subject" | "body" }
    | { kind: "aiDraft"; field: "instruction" }
  >(null);
  const reminderActiveFieldElRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const [reminderBuiltinVariables, setReminderBuiltinVariables] = useState<string[]>([]);

  function insertAtCursor(current: string, insert: string, el: HTMLInputElement | HTMLTextAreaElement | null) {
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    return { next, cursor: start + insert.length };
  }

  function coerceAiDraftText(raw: unknown): { subject?: string; body?: string } {
    const stripCodeFence = (s: string) => {
      const t = s.trim();
      if (!t.startsWith("```")) return s;
      const lines = t.split("\n");
      if (lines.length < 3) return s;
      if (!lines[0].startsWith("```")) return s;
      let endIdx = -1;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i]?.trim().startsWith("```")) {
          endIdx = i;
          break;
        }
      }
      if (endIdx <= 0) return s;
      return lines.slice(1, endIdx).join("\n").trim();
    };

    const tryParseJsonObject = (s: string): any | null => {
      const t = stripCodeFence(String(s ?? "")).trim();
      if (!t.startsWith("{") || !t.endsWith("}")) return null;
      try {
        const parsed = JSON.parse(t);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const r = raw as any;
      const rawSubject = String(r?.subject ?? "");
      const rawBody = String(r?.body ?? "");
      const parsed = tryParseJsonObject(rawBody) ?? tryParseJsonObject(rawSubject);
      const subject = parsed && "subject" in parsed ? String(parsed.subject ?? "") : rawSubject;
      const body = parsed && "body" in parsed ? String(parsed.body ?? "") : rawBody;
      return { subject, body };
    }

    const s = String(raw ?? "");
    const parsed = tryParseJsonObject(s);
    if (parsed) return { subject: typeof parsed.subject === "string" ? parsed.subject : undefined, body: typeof parsed.body === "string" ? parsed.body : undefined };
    return { body: s };
  }

  const reminderTemplateVariables = useMemo(() => {
    const custom = reminderDraft?.customVariables && typeof reminderDraft.customVariables === "object" ? reminderDraft.customVariables : {};
    const customVars = Object.keys(custom)
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 100)
      .map((k) => ({ key: k, label: `Custom: ${k}`, group: "Custom" as const, appliesTo: "Custom variable" }));

    const contactCustomVars = (Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [])
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 50)
      .map((k) => ({ key: `contact.custom.${k}`, label: `Contact custom: ${k}`, group: "Custom" as const, appliesTo: "Lead/contact" }));

    const builtinVars = (Array.isArray(reminderBuiltinVariables) ? reminderBuiltinVariables : [])
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 100)
      .map((k) => ({ key: k, label: k, group: "Custom" as const, appliesTo: "Built-in" }));

    const merged = [...PORTAL_MESSAGE_VARIABLES, ...PORTAL_BOOKING_VARIABLES, ...contactCustomVars, ...builtinVars, ...customVars];
    const seen = new Set<string>();
    return merged.filter((v) => {
      const key = `${v.group}:${v.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [knownContactCustomVarKeys, reminderDraft?.customVariables, reminderBuiltinVariables]);

  const allReminderVariableKeys = useMemo(() => {
    const custom = reminderDraft?.customVariables && typeof reminderDraft.customVariables === "object" ? reminderDraft.customVariables : {};
    const customKeys = Object.keys(custom).filter((k) => typeof k === "string" && k.trim());
    const builtinKeys = (Array.isArray(reminderBuiltinVariables) ? reminderBuiltinVariables : []).filter((k) => typeof k === "string" && k.trim());
    const defaultKeys = [...PORTAL_MESSAGE_VARIABLES, ...PORTAL_BOOKING_VARIABLES].map((v) => v.key);
    const merged = [...defaultKeys, ...builtinKeys, ...customKeys];
    return Array.from(new Set(merged)).slice(0, 500);
  }, [reminderDraft?.customVariables, reminderBuiltinVariables]);

  const [reminderOwnerTags, setReminderOwnerTags] = useState<ContactTag[]>([]);
  const [reminderTagsLoading, setReminderTagsLoading] = useState(false);
  const [reminderCreateTagOpen, setReminderCreateTagOpen] = useState(false);
  const [reminderCreateTagName, setReminderCreateTagName] = useState("");
  const [reminderCreateTagStepId, setReminderCreateTagStepId] = useState<string | null>(null);
  const [reminderCreateTagBusy, setReminderCreateTagBusy] = useState(false);

  const [reminderCalendarId, setReminderCalendarId] = useState<string | null>(null);
  const reminderCalendarIdRef = useRef<string | null>(null);

  useEffect(() => {
    reminderCalendarIdRef.current = reminderCalendarId;
  }, [reminderCalendarId]);

  const [reminderMediaPickerStepId, setReminderMediaPickerStepId] = useState<string | null>(null);
  const [reminderUploadBusyStepId, setReminderUploadBusyStepId] = useState<string | null>(null);

  function updateBookingTags(bookingId: string, next: ContactTag[]) {
    setUpcoming((prev) => prev.map((b) => (b.id === bookingId ? { ...b, contactTags: next } : b)));
    setRecent((prev) => prev.map((b) => (b.id === bookingId ? { ...b, contactTags: next } : b)));
  }

  const filteredReminderEvents = useMemo(() => {
    const cal = reminderCalendarId;
    if (!cal) return reminderEvents;
    return reminderEvents.filter((e) => e.calendarId === cal);
  }, [reminderEvents, reminderCalendarId]);

  function setTopTabWithUrl(next: "settings" | "appointments" | "bookings" | "reminders" | "follow-up") {
    setTopTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "appointments") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "appointments" || tab === "bookings" || tab === "reminders" || tab === "follow-up" || tab === "settings") {
        setTopTab(tab);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    syncAvailabilityFromUrl();
    window.addEventListener("popstate", syncAvailabilityFromUrl);
    return () => window.removeEventListener("popstate", syncAvailabilityFromUrl);
  }, [syncAvailabilityFromUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    syncBookingDeepLinkFromUrl();
    window.addEventListener("popstate", syncBookingDeepLinkFromUrl);
    return () => window.removeEventListener("popstate", syncBookingDeepLinkFromUrl);
  }, [syncBookingDeepLinkFromUrl]);

  useEffect(() => {
    tryApplyBookingDeepLink();
  }, [tryApplyBookingDeepLink]);

  function maxValueForUnit(unit: AppointmentReminderSettings["steps"][number]["leadTime"]["unit"]) {
    if (unit === "weeks") return 2;
    if (unit === "days") return 14;
    if (unit === "hours") return 24 * 14;
    return 60 * 24 * 14;
  }

  function minValueForUnit(unit: AppointmentReminderSettings["steps"][number]["leadTime"]["unit"]) {
    return unit === "minutes" ? 5 : 1;
  }

  function bestLeadTimeForMinutes(minutes: number): { value: number; unit: "minutes" | "hours" | "days" | "weeks" } {
    const m = Math.max(0, Math.floor(Number(minutes) || 0));
    const units: Array<{ unit: "weeks" | "days" | "hours" | "minutes"; factor: number }> = [
      { unit: "weeks", factor: 60 * 24 * 7 },
      { unit: "days", factor: 60 * 24 },
      { unit: "hours", factor: 60 },
      { unit: "minutes", factor: 1 },
    ];

    for (const { unit, factor } of units) {
      if (factor !== 1 && m % factor !== 0) continue;
      const raw = Math.floor(m / factor);
      const value = Math.max(minValueForUnit(unit), Math.min(maxValueForUnit(unit), raw));
      return { unit, value };
    }

    return { unit: "minutes", value: Math.max(minValueForUnit("minutes"), Math.min(maxValueForUnit("minutes"), m)) };
  }

  function applyReminderTemplate(t: ReminderTemplate) {
    if (!reminderDraft) return;

    const next: AppointmentReminderSettings = {
      ...reminderDraft,
      version: 4,
      customVariables: reminderDraft.customVariables ?? {},
      steps: t.steps.slice(0, 8).map((s) => ({
        id: makeClientId("rem_"),
        enabled: true,
        kind: s.kind === "EMAIL" ? "EMAIL" : "SMS",
        leadTime: bestLeadTimeForMinutes(s.leadMinutes),
        subjectTemplate: s.kind === "EMAIL" ? String(s.subject || "Appointment reminder") : undefined,
        messageBody: s.kind === "EMAIL" || s.kind === "SMS" ? String(s.body || "") : undefined,
      })),
    };

    setReminderDraft(next);
    setStatus("Loaded template (not saved yet)");
    window.setTimeout(() => setStatus(null), 1500);
  }

  const remindersUrl = useCallback((calendarId: string | null) => {
    const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return `/api/portal/booking/reminders/settings${q}`;
  }, []);

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
    setReminderEvents((((remindersJson as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
    setReminderBuiltinVariables((((remindersJson as any)?.builtinVariables as string[]) ?? []).slice(0, 50));
  }

  const verifiedBookingDomain = useMemo(() => {
    if (!hostedSite?.primaryDomain) return null;
    if (hostedSite.verifiedAt) return hostedSite.primaryDomain;
    const targetApex = apexDomain(hostedSite.primaryDomain);
    const match = funnelDomains.find((d) => apexDomain(d.domain) === targetApex);
    if (match?.status === "VERIFIED") return hostedSite.primaryDomain;
    return null;
  }, [funnelDomains, hostedSite?.primaryDomain, hostedSite?.verifiedAt]);

  const previewBookingUrl = useMemo(() => {
    if (!site?.slug) return null;
    return toPurelyHostedUrl(`/book/${encodeURIComponent(site.slug)}`);
  }, [site?.slug]);

  const liveBookingUrl = useMemo(() => {
    if (!site?.slug) return null;
    if (verifiedBookingDomain) return `https://${verifiedBookingDomain}/book/${encodeURIComponent(site.slug)}`;
    return previewBookingUrl;
  }, [previewBookingUrl, site?.slug, verifiedBookingDomain]);

  const previewCalendarUrlBase = useMemo(() => {
    if (!site?.slug) return null;
    return toPurelyHostedUrl(`/book/${encodeURIComponent(site.slug)}/c`);
  }, [site?.slug]);

  const liveCalendarUrlBase = useMemo(() => {
    if (!site?.slug) return null;
    if (!previewCalendarUrlBase) return null;
    if (verifiedBookingDomain) return `https://${verifiedBookingDomain}/book/${encodeURIComponent(site.slug)}/c`;
    return previewCalendarUrlBase;
  }, [previewCalendarUrlBase, site?.slug, verifiedBookingDomain]);

  const refreshAll = useCallback(async () => {
    setError(null);
    setFunnelDomainsBusy(true);
    try {
      const [meRes, settingsRes, bookingsRes, formRes, calendarsRes, blocksRes, remindersRes, hostedSiteRes, funnelDomainsRes] = await Promise.all([
        fetch("/api/customer/me", {
          cache: "no-store",
          headers: {
            "x-pa-app": "portal",
            "x-portal-variant": typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "credit" : "portal",
          },
        }),
        fetch("/api/portal/booking/settings", { cache: "no-store" }),
        fetch("/api/portal/booking/bookings", { cache: "no-store" }),
        fetch("/api/portal/booking/form", { cache: "no-store" }),
        fetch("/api/portal/booking/calendars", { cache: "no-store" }),
        fetch("/api/availability", { cache: "no-store" }),
        fetch(remindersUrl(reminderCalendarIdRef.current), { cache: "no-store" }),
        fetch("/api/portal/booking/site", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/funnel-builder/domains", { cache: "no-store" }).catch(() => null as any),
      ]);

    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok) setMe(meJson as Me);

    const settingsJson = await settingsRes.json().catch(() => ({}));
    if (settingsRes.ok) {
      const nextSite = (settingsJson as { site: Site }).site;
      setSite(nextSite);
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

    const hostedSiteJson = hostedSiteRes ? await hostedSiteRes.json().catch(() => ({})) : null;
    if (hostedSiteRes && hostedSiteRes.ok && (hostedSiteJson as any)?.ok) {
      setHostedSite(((hostedSiteJson as any)?.site as HostedSite) ?? null);
    }

    const funnelDomainsJson = funnelDomainsRes ? await funnelDomainsRes.json().catch(() => ({})) : null;
    if (funnelDomainsRes && funnelDomainsRes.ok && (funnelDomainsJson as any)?.ok === true && Array.isArray((funnelDomainsJson as any)?.domains)) {
      setFunnelDomains(
        (funnelDomainsJson as any).domains
          .map((d: any) => ({ domain: String(d?.domain || "").trim(), status: String(d?.status || "").trim() }))
          .filter((d: any) => d.domain),
      );
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
      setReminderEvents((((remindersJson as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
      setReminderBuiltinVariables((((remindersJson as any)?.builtinVariables as string[]) ?? []).slice(0, 50));
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
    } finally {
      setFunnelDomainsBusy(false);
    }
  }, [remindersUrl]);

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

  async function saveSelectedCalendarPatch(patch: Partial<BookingCalendar>) {
    if (!selectedCalendarId) return;
    const next = calendars.map((c) => (c.id === selectedCalendarId ? { ...c, ...patch } : c));
    await saveCalendars(next);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const isFirstLoad = !hasLoadedOnceRef.current;
      if (isFirstLoad) setLoading(true);
      else setRefreshing(true);
      try {
        await refreshAll();
        if (!mounted) return;
        hasLoadedOnceRef.current = true;
      } catch {
        if (!mounted) return;
        setError("Failed to load booking automation");
      } finally {
        if (!mounted) return;
        setLoading(false);
        setRefreshing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshAll]);

  useEffect(() => {
    if (topTab !== "appointments") return;
    setCalSelectedYmd((prev) => prev ?? toYmd(new Date()));
  }, [topTab]);

  useEffect(() => {
    setHostedDomainDraft(hostedSite?.primaryDomain || "");
  }, [hostedSite?.primaryDomain]);

  async function saveHostedBookingDomain() {
    setHostedSiteBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/portal/booking/site", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryDomain: hostedDomainDraft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !(body as any)?.ok) {
        setError(getApiError(body) ?? "Failed to save custom domain");
        return;
      }
      setHostedSite(((body as any)?.site as HostedSite) ?? null);
      setStatus("Saved custom domain");
    } finally {
      setHostedSiteBusy(false);
    }
  }

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
    setReminderEvents((((body as any)?.events as AppointmentReminderEvent[]) ?? []).slice(0, 50));
    setStatus("Saved appointment reminders");
  }

  async function setReminderEnabled(enabled: boolean) {
    if (!reminderDraft) return;
    const next: AppointmentReminderSettings = { ...reminderDraft, enabled, version: 4 };
    setReminderDraft(next);
    await saveReminders(next);
  }

  const refreshReminderTags = useCallback(async () => {
    setReminderTagsLoading(true);
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
      setReminderOwnerTags(next);
    } catch {
      setReminderOwnerTags([]);
    } finally {
      setReminderTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (topTab !== "reminders") return;
    void refreshReminderTags();
  }, [topTab, refreshReminderTags]);

  async function createReminderTag() {
    const name = reminderCreateTagName.trim();
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setReminderCreateTagBusy(true);
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
      await refreshReminderTags();

      const stepId = reminderCreateTagStepId;
      if (stepId) updateReminderStep(stepId, { tagId: createdId });

      setReminderCreateTagOpen(false);
      setReminderCreateTagStepId(null);
      setReminderCreateTagName("");
      toast.success("Created tag");
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setReminderCreateTagBusy(false);
    }
  }

  async function addEmailAttachmentToReminderStep(item: PortalMediaPickItem) {
    const stepId = reminderMediaPickerStepId;
    if (!stepId) return;
    const step = reminderDraft?.steps.find((s) => s.id === stepId);
    if (!step) return;

    if (step.kind !== "EMAIL") return;
    const prev = Array.isArray(step.emailAttachments) ? step.emailAttachments : [];
    const next: EmailAttachmentRef[] = [
      ...prev,
      {
        mediaItemId: String(item.id),
        fileName: String(item.fileName || "Attachment"),
        mimeType: String(item.mimeType || "application/octet-stream"),
      },
    ];
    updateReminderStep(stepId, { emailAttachments: next });
    setReminderMediaPickerStepId(null);
  }

  async function uploadFileForReminderStep(stepId: string, file: File) {
    setReminderUploadBusyStepId(stepId);
    setError(null);
    setStatus(null);

    try {
      const step = reminderDraft?.steps.find((s) => s.id === stepId);
      if (!step) return;
      if (step.kind !== "EMAIL") {
        setError("Attachments are only supported for email reminders");
        return;
      }

      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setError((typeof body?.error === "string" ? body.error : null) ?? "Upload failed");
        return;
      }

      const mediaItemId = typeof body?.mediaItem?.id === "string" ? body.mediaItem.id : "";
      if (!mediaItemId) {
        setError("Upload did not return a media item");
        return;
      }

      const prev = Array.isArray(step.emailAttachments) ? step.emailAttachments : [];
      const next: EmailAttachmentRef[] = [
        ...prev,
        {
          mediaItemId,
          fileName: file.name || "Attachment",
          mimeType: file.type || "application/octet-stream",
        },
      ];
      updateReminderStep(stepId, { emailAttachments: next });
      setStatus("Attached");
      window.setTimeout(() => setStatus(null), 1200);
    } finally {
      setReminderUploadBusyStepId((prev) => (prev === stepId ? null : prev));
    }
  }

  function updateReminderStep(stepId: string, partial: Partial<AppointmentReminderSettings["steps"][number]>) {
    setReminderDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      steps[idx] = { ...steps[idx], ...partial };
      return { ...prev, version: 4, steps };
    });
  }

  function addReminderStep(kind: "SMS" | "EMAIL" | "TAG") {
    const defaultBody = "Reminder: your appointment is scheduled for {when}.";
    const defaultSubject = "Appointment reminder: {when}";
    setReminderDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
      if (steps.length >= 8) return prev;
      const nextStep = {
        id: makeClientId("rem_"),
        enabled: true,
        kind,
        leadTime: { value: 1, unit: "hours" as const },
        subjectTemplate: kind === "EMAIL" ? defaultSubject : undefined,
        messageBody: kind === "TAG" ? undefined : defaultBody,
        tagId: kind === "TAG" ? undefined : undefined,
      };
      return { ...prev, version: 4, steps: [...steps, nextStep] };
    });
  }

  function moveReminderStep(stepId: string, delta: number) {
    setReminderDraft((prev) => {
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

  function deleteReminderStep(stepId: string) {
    setReminderDraft((prev) => {
      if (!prev) return prev;
      const steps = Array.isArray(prev.steps) ? prev.steps.filter((s) => s.id !== stepId) : [];
      return { ...prev, version: 4, steps: steps.length ? steps : prev.steps };
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
    clearBookingModalUrl();
    setContactSubject("");
    setContactMessage("");
    setContactSendEmail(true);
    setContactSendSms(false);
    setStatus("Sent follow-up");
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
    clearBookingModalUrl();
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

  if (loading && !hasLoadedOnceRef.current) {
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

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-sm font-semibold text-zinc-900">What you unlock</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>A booking link that works 24/7</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Less back-and-forth scheduling</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Reminders to reduce no-shows</span></li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`${appBase}/billing?buy=booking&autostart=1`}
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in Billing
            </Link>
            <Link
              href={`${appBase}/services`}
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
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const bookingsChronological = (() => {
    const now = new Date();
    return upcoming
      .filter((b) => new Date(b.startAt) >= now)
      .slice()
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  })();

  const weekDayModalBookings: Booking[] = weekDayModalYmd
    ? upcoming
        .filter((b) => toYmd(new Date(b.startAt)) === weekDayModalYmd)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    : [];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <AppModal
        open={Boolean(weekDayModalYmd)}
        onClose={() => setWeekDayModalYmd(null)}
        title={
          weekDayModalYmd
            ? `Appointments - ${new Date(`${weekDayModalYmd}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}`
            : "Appointments"
        }
        widthClassName="max-w-lg"
      >
        <div className="space-y-3">
          {weekDayModalBookings.length === 0 ? (
            <div className="text-sm text-zinc-600">No bookings for this day.</div>
          ) : (
            weekDayModalBookings.map((b) => (
              <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {new Date(b.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {b.contactName}
                    </div>
                    <div className="truncate text-xs text-zinc-600">{b.contactEmail}</div>
                  </div>
                  {b.status ? (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                      {b.status}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </AppModal>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Booking Automation</h1>
          <p className="mt-1 text-sm text-zinc-600">Publish a booking link, set availability, and capture appointments.</p>
          {refreshing ? (
            <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
              Refreshing…
            </div>
          ) : null}
        </div>

        <div className="w-full sm:w-auto">
          <SuggestedSetupModalLauncher serviceSlugs={["booking"]} buttonLabel="Suggested setup" />
        </div>
      </div>

      <div className="mt-6">
        {isMobileApp ? (
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold text-zinc-600">Section</div>
            <PortalListboxDropdown
              value={topTab}
              onChange={(v) => setTopTabWithUrl(v as any)}
              options={[
                { value: "appointments", label: "Appointments" },
                { value: "bookings", label: "Bookings" },
                { value: "reminders", label: "Reminders" },
                { value: "follow-up", label: "Follow-up" },
                { value: "settings", label: "Settings" },
              ]}
              className="w-full max-w-sm"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
            />
          </div>
        ) : (
          <div className="flex w-full flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTopTabWithUrl("appointments")}
              aria-current={topTab === "appointments" ? "page" : undefined}
              className={
                "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                (topTab === "appointments"
                  ? "border-brand-blue bg-brand-blue text-white shadow-sm focus-visible:ring-brand-blue/40"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              Appointments
            </button>
            <button
              type="button"
              onClick={() => setTopTabWithUrl("bookings")}
              aria-current={topTab === "bookings" ? "page" : undefined}
              className={
                "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                (topTab === "bookings"
                  ? "border-brand-ink bg-brand-ink text-white shadow-sm focus-visible:ring-brand-ink/40"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              Bookings
            </button>
            <button
              type="button"
              onClick={() => setTopTabWithUrl("reminders")}
              aria-current={topTab === "reminders" ? "page" : undefined}
              className={
                "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                (topTab === "reminders"
                  ? "border-brand-pink bg-brand-pink text-white shadow-sm focus-visible:ring-brand-pink/40"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              Reminders
            </button>
            <button
              type="button"
              onClick={() => setTopTabWithUrl("follow-up")}
              aria-current={topTab === "follow-up" ? "page" : undefined}
              className={
                "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                (topTab === "follow-up"
                  ? "border-brand-blue bg-brand-blue text-white shadow-sm focus-visible:ring-brand-blue/40"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              Follow-up
            </button>
            <button
              type="button"
              onClick={() => setTopTabWithUrl("settings")}
              aria-current={topTab === "settings" ? "page" : undefined}
              className={
                "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                (topTab === "settings"
                  ? "border-brand-ink bg-brand-ink text-white shadow-sm focus-visible:ring-brand-ink/40"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              Settings
            </button>
          </div>
        )}
      </div>

      {topTab === "appointments" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-12">
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
                        ? "rounded-2xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white"
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
                        ? "rounded-2xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white"
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
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                      onClick={() => setCalSelectedYmd(toYmd(addDays(focusDate, -7)))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                      onClick={() => setCalSelectedYmd(toYmd(new Date()))}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                      onClick={() => setCalSelectedYmd(toYmd(addDays(focusDate, 7)))}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                      onClick={() => setCalMonth((m) => addMonths(m, -1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                      onClick={() => setCalMonth(startOfMonth(new Date()))}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                      onClick={() => setCalMonth((m) => addMonths(m, 1))}
                    >
                      Next
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                  onClick={openAvailability}
                >
                  Edit availability
                </button>
              </div>
            </div>

            {appointmentsView === "week" ? (
                  <div className="mt-5 -mx-2 h-110 overflow-x-auto overflow-y-hidden px-2">
                <div className="grid min-w-max grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3">
                  {weekDays.map((day) => {
                  const ymd = toYmd(day);
                  const selected = focusYmd === ymd;
                  const isToday = toYmd(new Date()) === ymd;

                  const dayBookings = upcoming
                    .filter((b) => toYmd(new Date(b.startAt)) === ymd)
                    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

                  const cardBase =
                    "flex h-[420px] w-[240px] flex-col rounded-3xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200";
                  const cardCls = selected
                    ? `${cardBase} border-blue-300 bg-blue-50 shadow-[0_18px_40px_rgba(37,99,235,0.14)]`
                    : `${cardBase} border-zinc-200 bg-white hover:bg-zinc-50`;

                  return (
                    <button
                      key={ymd}
                      type="button"
                      className={cardCls}
                      onClick={() => {
                        setCalSelectedYmd(ymd);
                        if (isMobileApp) setWeekDayModalYmd(ymd);
                      }}
                    >
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
                          <div className="shrink-0 rounded-full bg-brand-ink px-2 py-0.5 text-[10px] font-semibold text-white">Today</div>
                        ) : null}
                      </div>

                      <div className="mt-2">
                        <div className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                          {dayBookings.length} booking{dayBookings.length === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Bookings</div>
                        <div className="mt-2 min-h-0 flex-1 overflow-auto">
                          {dayBookings.length ? (
                            <div className="space-y-1.5">
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
                            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                              No bookings
                            </div>
                          )}
                        </div>
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
                  <div className="text-xs text-zinc-500">Tap a day to view appointments.</div>
                </div>

                <div
                  className={
                    isMobileApp
                      ? "mt-3 grid grid-cols-7 gap-1.5 text-[11px] font-semibold text-zinc-500"
                      : "mt-3 grid grid-cols-7 gap-2 text-xs font-semibold text-zinc-500"
                  }
                >
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className={isMobileApp ? "px-1 text-center" : "px-2"}>
                      {d}
                    </div>
                  ))}
                </div>

                <div className={isMobileApp ? "mt-2 grid grid-cols-7 gap-1.5" : "mt-2 grid grid-cols-7 gap-2"}>
                  {makeMonthGrid(calMonth).map((day) => {
                    const ymd = toYmd(day);
                    const inMonth = day.getMonth() === calMonth.getMonth();
                    const today = toYmd(new Date()) === ymd;
                    const selected = focusYmd === ymd;

                    const dayStart = startOfDay(day);
                    const dayEnd = addDays(dayStart, 1);

                    const bookingCount = upcoming.reduce((acc, b) => (toYmd(new Date(b.startAt)) === ymd ? acc + 1 : acc), 0);
                    const hasCoverage = blocks.some((b) => new Date(b.startAt) < dayEnd && new Date(b.endAt) > dayStart);

                    const baseCls = isMobileApp
                      ? "aspect-square rounded-md border p-2 text-left hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                      : "h-24 rounded-lg border px-3 py-3 text-left hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300";

                    const borderCls = selected
                      ? "border-brand-ink bg-zinc-50 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                      : today
                        ? "border-(--color-brand-blue) bg-blue-50/80"
                        : inMonth
                          ? "border-zinc-200 bg-white"
                          : "border-zinc-200 bg-zinc-50";

                    return (
                      <button
                        key={ymd}
                        type="button"
                        className={`${baseCls} ${borderCls}`}
                        onClick={() => {
                          setCalSelectedYmd(ymd);
                          setWeekDayModalYmd(ymd);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={
                              isMobileApp
                                ? inMonth
                                  ? "text-[12px] font-semibold text-zinc-900"
                                  : "text-[12px] font-semibold text-zinc-400"
                                : inMonth
                                  ? "text-sm font-semibold text-zinc-900"
                                  : "text-sm font-semibold text-zinc-400"
                            }
                          >
                            <span
                              className={
                                today
                                  ? "inline-flex min-w-6 items-center justify-center rounded-sm bg-(--color-brand-blue) px-1.5 py-0.5 text-[11px] font-semibold text-white"
                                  : undefined
                              }
                            >
                              {day.getDate()}
                            </span>
                          </div>

                          {bookingCount ? (
                            <div className={isMobileApp ? "rounded-sm bg-brand-ink px-1.5 py-0.5 text-[10px] font-semibold text-white" : "rounded-sm bg-brand-ink px-2 py-0.5 text-[10px] font-semibold text-white"}>
                              {bookingCount}
                            </div>
                          ) : null}
                        </div>

                        {isMobileApp ? (
                          <div className="mt-2 flex items-center justify-between">
                            <div className={hasCoverage ? "text-[11px] font-medium text-emerald-700" : "text-[11px] text-zinc-400"}>
                              {hasCoverage ? "Avail" : "No"}
                            </div>
                            <div className={hasCoverage ? "h-2 w-2 rounded-sm bg-emerald-500" : "h-2 w-2 rounded-sm bg-zinc-300"} aria-hidden="true" />
                          </div>
                        ) : (
                          <div className="mt-3 flex items-center justify-between">
                            <div className={hasCoverage ? "text-[11px] font-medium text-emerald-700" : "text-[11px] text-zinc-400"}>
                              {hasCoverage ? "Avail" : "No avail"}
                            </div>
                            {bookingCount ? (
                              <div className="rounded-sm bg-brand-ink px-2 py-0.5 text-[10px] font-semibold text-white">{bookingCount}</div>
                            ) : null}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {topTab === "bookings" ? (
        <div className="mt-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Bookings</div>
                <div className="mt-1 text-sm text-zinc-600">Upcoming bookings.</div>
              </div>
              <div className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                {bookingsChronological.length} upcoming
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {bookingsChronological.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  No upcoming bookings.
                </div>
              ) : (
                bookingsChronological.map((b) => {
                  const joinUrl = getPurelyConnectJoinUrl(b.notes);
                  return (
                    <div key={b.id} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">
                            {new Date(b.startAt).toLocaleString()} → {new Date(b.endAt).toLocaleTimeString()}
                          </div>
                          <div className="mt-1 text-sm text-zinc-700">
                            {b.contactName} · {b.contactEmail}
                            {b.contactPhone ? ` · ${b.contactPhone}` : ""}
                          </div>
                          {b.notes ? <div className="mt-2 text-sm text-zinc-600">{b.notes}</div> : null}
                        </div>

                        {joinUrl ? (
                          <div className="shrink-0">
                            <a
                              href={joinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                            >
                              Join meeting
                            </a>
                          </div>
                        ) : null}
                      </div>

                      {b.contactId ? (
                        <div className="mt-2">
                          <ContactTagsEditor
                            compact
                            contactId={b.contactId}
                            tags={Array.isArray(b.contactTags) ? b.contactTags : []}
                            onChange={(next) => updateBookingTags(b.id, next)}
                          />
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                          onClick={() => {
                            setReschedBooking(b);
                            setReschedWhen(toLocalDateTimeInputValue(new Date(b.startAt)));
                            setReschedForce(false);
                            setReschedOpen(true);
                            setBookingModalUrl({ bookingId: b.id, modal: "reschedule" }, "push");
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
                            setBookingModalUrl({ bookingId: b.id, modal: "contact" }, "push");
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
                  );
                })
              )}
            </div>

            {recent.length ? (
              <>
                <div className="mt-6 text-sm font-semibold text-zinc-900">Recent</div>
                <div className="mt-3 space-y-2">
                  {recent.slice(0, 10).map((b) => (
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
                  Automatically send reminders before appointments. Build a sequence of SMS steps, email steps, and tag steps.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-600">Off</span>
                <ToggleSwitch
                  checked={Boolean(reminderDraft?.enabled)}
                  disabled={reminderSaving || !reminderDraft}
                  accent="pink"
                  onChange={(checked) => void setReminderEnabled(checked)}
                />
                <span className="text-sm text-zinc-600">On</span>
              </div>
            </div>


            <div className="mt-4">
              <label className="block text-xs font-semibold text-zinc-600">Calendar</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <PortalListboxDropdown
                  value={reminderCalendarId ?? ""}
                  onChange={(v) => {
                    const next = v || null;
                    setReminderCalendarId(next);
                    void loadReminders(next);
                  }}
                  disabled={reminderSaving}
                  options={[
                    { value: "", label: "Default (all booking links)" },
                    ...calendars
                      .slice()
                      .sort((a, b) => a.title.localeCompare(b.title))
                      .map((c) => ({ value: c.id, label: `${c.title}${c.enabled ? "" : " (off)"}` })),
                  ]}
                  className="w-full max-w-md"
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                />
                <div className="text-xs text-zinc-500">Each calendar can have its own reminder sequence.</div>
              </div>
            </div>

            {reminderDraft ? (
              <>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">Reminder steps</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      disabled={reminderSaving}
                      onClick={() => setReminderTemplateOpen(true)}
                    >
                      Load template
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                      disabled={reminderSaving || reminderDraft.steps.length >= 8}
                      onClick={() => addReminderStep("SMS")}
                    >
                      + SMS step
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                      disabled={reminderSaving || reminderDraft.steps.length >= 8}
                      onClick={() => addReminderStep("EMAIL")}
                    >
                      + Email step
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                      disabled={reminderSaving || reminderDraft.steps.length >= 8}
                      onClick={() => addReminderStep("TAG")}
                    >
                      + Tag step
                    </button>
                  </div>
                </div>

                {reminderTemplateOpen ? (
                  <div className="fixed inset-0 z-9998 flex items-end justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
                    <div className="flex w-full max-w-2xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] flex-col overflow-hidden overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-zinc-900">Load a template</div>
                          <div className="mt-1 text-sm text-zinc-600">Replaces your current reminder steps.</div>
                        </div>
                        <button
                          type="button"
                          aria-label="Close template picker"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800"
                          onClick={() => setReminderTemplateOpen(false)}
                          disabled={reminderSaving}
                        >
                          ×
                        </button>
                      </div>

                      <div className="mt-4 flex-1 space-y-2 overflow-auto pr-1">
                        {REMINDER_TEMPLATES.map((t) => {
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={reminderSaving || t.steps.length === 0}
                              className="w-full rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50 disabled:opacity-60"
                              onClick={() => {
                                applyReminderTemplate(t);
                                setReminderTemplateOpen(false);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-zinc-900">{t.title}</div>
                                  <div className="mt-1 text-sm text-zinc-600">{t.description}</div>
                                </div>
                                <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                  {t.steps.length} step{t.steps.length === 1 ? "" : "s"}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 text-xs text-zinc-500">Tip: load a template, then customize the copy and click Save.</div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 space-y-3">
                  {reminderDraft.steps.map((s, idx) => (
                    <div key={s.id} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">
                            {s.kind === "EMAIL" ? "Email" : s.kind === "TAG" ? "Tag" : "SMS"} step {idx + 1}
                          </div>
                          <div className="mt-1 text-xs text-zinc-600">
                            {s.leadTime.value} {s.leadTime.unit} before
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                              disabled={reminderSaving || idx === 0}
                              onClick={() => moveReminderStep(s.id, -1)}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                              disabled={reminderSaving || idx === reminderDraft.steps.length - 1}
                              onClick={() => moveReminderStep(s.id, 1)}
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-xs text-zinc-600">On</span>
                            <ToggleSwitch
                              checked={Boolean(s.enabled)}
                              disabled={reminderSaving}
                              accent="pink"
                              onChange={(checked) => updateReminderStep(s.id, { enabled: checked })}
                            />
                          </div>
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
                            <PortalListboxDropdown
                              value={s.leadTime.unit}
                              disabled={reminderSaving}
                              onChange={(unit) =>
                                updateReminderStep(s.id, {
                                  leadTime: {
                                    unit,
                                    value: Math.max(minValueForUnit(unit), Math.min(maxValueForUnit(unit), s.leadTime.value)),
                                  },
                                })
                              }
                              options={[
                                { value: "minutes", label: "minutes" },
                                { value: "hours", label: "hours" },
                                { value: "days", label: "days" },
                                { value: "weeks", label: "weeks" },
                              ]}
                              className="w-32"
                              buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            />
                            <span className="text-sm text-zinc-600">before</span>
                          </div>
                        </label>

                        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                          <div className={isMobileApp ? "flex flex-col items-start gap-2" : "flex items-center justify-between gap-3"}>
                            <div className="font-medium text-zinc-800">
                              {s.kind === "EMAIL" ? "Email" : s.kind === "TAG" ? "Tag" : "SMS"} content
                            </div>
                            <div className={isMobileApp ? "flex w-full flex-wrap items-center gap-2" : "flex items-center gap-2"}>
                              {s.kind !== "TAG" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={reminderSaving}
                                    className={
                                      "inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
                                      "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink)"
                                    }
                                    onClick={() => {
                                      if (!reminderDraft) return;
                                      if (s.kind === "TAG") return;
                                      setReminderAiDraftError(null);
                                      setReminderAiDraftInstruction("");
                                      setReminderAiDraftModal({
                                        stepId: s.id,
                                        kind: s.kind === "EMAIL" ? "EMAIL" : "SMS",
                                        stepLabel: `${s.kind === "EMAIL" ? "Email" : "SMS"} step ${idx + 1}`,
                                        existingSubject: s.kind === "EMAIL" ? String(s.subjectTemplate ?? "") : undefined,
                                        existingBody: String(s.messageBody ?? ""),
                                      });
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
                                  {s.kind === "EMAIL" ? (
                                    <>
                                      <label className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60">
                                        {reminderUploadBusyStepId === s.id ? "Uploading…" : "Upload file"}
                                        <input
                                          type="file"
                                          className="hidden"
                                          disabled={reminderSaving || reminderUploadBusyStepId === s.id}
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) void uploadFileForReminderStep(s.id, f);
                                            e.currentTarget.value = "";
                                          }}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        disabled={reminderSaving}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                                        onClick={() => setReminderMediaPickerStepId(s.id)}
                                      >
                                        Attach files
                                      </button>
                                    </>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </div>

                          {s.kind === "TAG" ? (
                            <div className="mt-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-semibold text-zinc-600">Tag to apply</div>
                                <button
                                  type="button"
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                  disabled={reminderSaving}
                                  onClick={() => {
                                    setReminderCreateTagStepId(s.id);
                                    setReminderCreateTagName("");
                                    setReminderCreateTagOpen(true);
                                  }}
                                >
                                  New tag
                                </button>
                              </div>
                              <PortalListboxDropdown
                                value={String(s.tagId || "")}
                                disabled={reminderSaving || reminderTagsLoading}
                                onChange={(v) => updateReminderStep(s.id, { tagId: String(v || "") || undefined })}
                                options={[
                                  { value: "", label: reminderTagsLoading ? "Loading tags…" : "Select a tag…" },
                                  ...reminderOwnerTags.map((t) => ({ value: t.id, label: t.name })),
                                ]}
                                className="mt-2 w-full max-w-md"
                                buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                              />
                              <div className="mt-2 text-xs text-zinc-500">This step applies a tag to the contact (no message is sent).</div>
                            </div>
                          ) : null}

                          {s.kind === "EMAIL" ? (
                            <div className="mt-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-semibold text-zinc-600">Subject</div>
                                <button
                                  type="button"
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                  disabled={reminderSaving}
                                  onClick={() => {
                                    setReminderVarPickerTarget({ kind: "step", stepId: s.id, field: "subject" });
                                    setReminderVarPickerOpen(true);
                                  }}
                                >
                                  Insert variable
                                </button>
                              </div>
                              <input
                                className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                                value={String(s.subjectTemplate ?? "")}
                                onChange={(e) => updateReminderStep(s.id, { subjectTemplate: e.target.value })}
                                onFocus={(e) => {
                                  reminderActiveFieldElRef.current = e.currentTarget;
                                }}
                                disabled={reminderSaving}
                              />

                              <div className="mt-3">
                                <div className="text-xs font-semibold text-zinc-600">Attachments</div>
                                {Array.isArray(s.emailAttachments) && s.emailAttachments.length ? (
                                  <div className="mt-2 space-y-2">
                                    {s.emailAttachments.map((a) => (
                                      <div
                                        key={a.mediaItemId}
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-medium text-zinc-800">{a.fileName}</div>
                                          <div className="truncate text-xs text-zinc-500">{a.mimeType}</div>
                                        </div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                                          disabled={reminderSaving}
                                          onClick={() => {
                                            const prev = Array.isArray(s.emailAttachments) ? s.emailAttachments : [];
                                            updateReminderStep(s.id, { emailAttachments: prev.filter((x) => x.mediaItemId !== a.mediaItemId) });
                                          }}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-2 text-xs text-zinc-500">No attachments</div>
                                )}
                              </div>
                            </div>
                          ) : null}

                          {s.kind !== "TAG" ? (
                            <textarea
                              className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              value={String(s.messageBody ?? "")}
                              onChange={(e) => updateReminderStep(s.id, { messageBody: e.target.value })}
                              onFocus={(e) => {
                                reminderActiveFieldElRef.current = e.currentTarget;
                              }}
                              disabled={reminderSaving}
                            />
                          ) : null}
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
                      !reminderDirty ||
                      reminderDraft.steps.length === 0 ||
                      reminderDraft.steps.some((x) => (x.kind === "TAG" ? !String(x.tagId || "").trim() : !String(x.messageBody || "").trim()))
                    }
                    onClick={() => void saveReminders(reminderDraft)}
                  >
                    {reminderSaving ? "Saving…" : reminderDirty ? "Save" : "Saved"}
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
                  (() => {
                    const inboxHref =
                      e.channel === "EMAIL" && e.to
                        ? `${appBase}/services/inbox/email?to=${encodeURIComponent(e.to)}`
                        : e.smsTo
                          ? `${appBase}/services/inbox/sms?to=${encodeURIComponent(e.smsTo)}`
                          : e.contactPhoneRaw
                            ? `${appBase}/services/inbox/sms?to=${encodeURIComponent(e.contactPhoneRaw)}`
                            : null;

                    const Card = (
                      <>
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
                        {inboxHref ? <div className="mt-2 text-xs font-semibold text-brand-ink">Open thread →</div> : null}
                      </>
                    );

                    if (!inboxHref) {
                      return (
                        <div key={e.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                          {Card}
                        </div>
                      );
                    }

                    return (
                      <a
                        key={e.id}
                        href={inboxHref}
                        className="block rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm hover:bg-zinc-100"
                      >
                        {Card}
                      </a>
                    );
                  })()
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <PortalVariablePickerModal
        open={reminderVarPickerOpen}
        onClose={() => {
          setReminderVarPickerOpen(false);
          setReminderVarPickerTarget(null);
        }}
        variables={reminderTemplateVariables}
        createCustom={{
          enabled: true,
          existingKeys: allReminderVariableKeys,
          onCreate: (key, value) => {
            setReminderDraft((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                customVariables: { ...(prev.customVariables ?? {}), [key]: value },
              };
            });
          },
        }}
        onPick={(variableKey) => {
          const insert = `{${variableKey}}`;

          if (!reminderVarPickerTarget) return;

          if (reminderVarPickerTarget.kind === "aiDraft") {
            const { next, cursor } = insertAtCursor(reminderAiDraftInstruction, insert, reminderActiveFieldElRef.current);
            setReminderAiDraftInstruction(next);
            requestAnimationFrame(() => {
              const el = reminderActiveFieldElRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
            return;
          }

          if (!reminderDraft) return;
          const step = reminderDraft.steps.find((x) => x.id === reminderVarPickerTarget.stepId);
          if (!step) return;

          if (reminderVarPickerTarget.field === "subject") {
            if (step.kind !== "EMAIL") return;
            const current = String(step.subjectTemplate ?? "");
            const { next, cursor } = insertAtCursor(current, insert, reminderActiveFieldElRef.current);
            updateReminderStep(step.id, { subjectTemplate: next });
            requestAnimationFrame(() => {
              const el = reminderActiveFieldElRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
            return;
          }

          if (step.kind === "TAG") return;
          const current = String(step.messageBody ?? "");
          const { next, cursor } = insertAtCursor(current, insert, reminderActiveFieldElRef.current);
          updateReminderStep(step.id, { messageBody: next });
          requestAnimationFrame(() => {
            const el = reminderActiveFieldElRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(cursor, cursor);
          });
        }}
      />

      <AppModal
        open={Boolean(reminderAiDraftModal)}
        title="AI draft"
        description={reminderAiDraftModal ? `Describe what you want ${reminderAiDraftModal.stepLabel} to say.` : "Describe what you want this reminder to say."}
        onClose={() => {
          if (reminderAiDraftBusy) return;
          setReminderAiDraftModal(null);
          setReminderAiDraftError(null);
        }}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              disabled={reminderAiDraftBusy}
              onClick={() => {
                setReminderAiDraftModal(null);
                setReminderAiDraftError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={reminderAiDraftBusy || !reminderAiDraftModal}
              onClick={async () => {
                if (!reminderAiDraftModal) return;
                if (!reminderDraft) return;
                setReminderAiDraftBusy(true);
                setReminderAiDraftError(null);

                try {
                  const res = await fetch("/api/portal/booking/reminders/ai/generate-step", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      kind: reminderAiDraftModal.kind,
                      prompt: reminderAiDraftInstruction.trim() || undefined,
                      existingSubject: reminderAiDraftModal.kind === "EMAIL" ? reminderAiDraftModal.existingSubject : undefined,
                      existingBody: reminderAiDraftModal.existingBody,
                    }),
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    const code = (json as any)?.code;
                    if (res.status === 402 && code === "INSUFFICIENT_CREDITS") {
                      setReminderAiDraftError("Insufficient credits to generate.");
                      return;
                    }
                    setReminderAiDraftError(getApiError(json) ?? (json as any)?.error ?? "Failed to generate reminder draft");
                    return;
                  }

                  const coerced = coerceAiDraftText(json);

                  if (reminderAiDraftModal.kind === "EMAIL") {
                    const subjectRaw = String(coerced.subject ?? "").trim();
                    const subject = (subjectRaw || String(reminderAiDraftModal.existingSubject ?? "").trim() || "Appointment reminder").slice(0, 200);
                    const body = String(coerced.body ?? "").slice(0, 8000);
                    updateReminderStep(reminderAiDraftModal.stepId, { subjectTemplate: subject, messageBody: body });
                  } else {
                    const body = String(coerced.body ?? "").slice(0, 8000);
                    updateReminderStep(reminderAiDraftModal.stepId, { messageBody: body });
                  }

                  setStatus("Generated");
                  window.setTimeout(() => setStatus(null), 1200);
                  setReminderAiDraftModal(null);
                  setReminderAiDraftInstruction("");
                } catch (e: any) {
                  setReminderAiDraftError(String(e?.message || "Failed to generate"));
                } finally {
                  setReminderAiDraftBusy(false);
                }
              }}
            >
              {reminderAiDraftBusy ? "Drafting…" : "Generate"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-zinc-600">Instructions</div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                disabled={reminderAiDraftBusy}
                onClick={() => {
                  setReminderVarPickerTarget({ kind: "aiDraft", field: "instruction" });
                  setReminderVarPickerOpen(true);
                }}
              >
                Insert variable
              </button>
            </div>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              value={reminderAiDraftInstruction}
              onChange={(e) => setReminderAiDraftInstruction(e.target.value)}
              onFocus={(e) => {
                reminderActiveFieldElRef.current = e.currentTarget;
              }}
              disabled={reminderAiDraftBusy}
              placeholder="e.g. Friendly, short, and include the appointment time and location."
            />
          </label>

          {reminderAiDraftError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{reminderAiDraftError}</div>
          ) : null}

          <div className="text-xs text-zinc-500">
            Tip: you can reference variables like {"{contactName}"} and {"{when}"}.
          </div>
        </div>
      </AppModal>

      <AppModal
        open={reminderCreateTagOpen}
        title="Create tag"
        description="Create a new contact tag to use in this reminder step."
        onClose={() => {
          if (reminderCreateTagBusy) return;
          setReminderCreateTagOpen(false);
        }}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              disabled={reminderCreateTagBusy}
              onClick={() => setReminderCreateTagOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={reminderCreateTagBusy || !reminderCreateTagName.trim()}
              onClick={() => void createReminderTag()}
            >
              {reminderCreateTagBusy ? "Creating…" : "Create"}
            </button>
          </div>
        }
      >
        <label className="block">
          <div className="text-xs font-semibold text-zinc-600">Tag name</div>
          <input
            className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            value={reminderCreateTagName}
            onChange={(e) => setReminderCreateTagName(e.target.value)}
            disabled={reminderCreateTagBusy}
            placeholder="e.g. Confirmed"
          />
        </label>
      </AppModal>

      <PortalMediaPickerModal
        open={Boolean(reminderMediaPickerStepId)}
        onClose={() => setReminderMediaPickerStepId(null)}
        onPick={addEmailAttachmentToReminderStep}
        confirmLabel="Attach"
        title="Attach from media library"
      />

      {topTab === "follow-up" ? (
        <div className="mt-6">
          <PortalFollowUpClient embedded />
        </div>
      ) : null}

      {topTab === "settings" ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PortalSettingsSection
            title="Booking link"
            description="Share this link anywhere. Only times you mark as available will show."
            accent="slate"
            status={site ? (site.enabled ? "on" : "off") : undefined}
            collapsible={false}
            dotClassName="hidden"
          >

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                <div className="truncate">
                  <span className="font-semibold text-zinc-600">Preview:</span> {previewBookingUrl ?? "…"}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                disabled={!previewBookingUrl}
                onClick={async () => {
                  if (!previewBookingUrl) return;
                  await navigator.clipboard.writeText(previewBookingUrl);
                  setStatus("Copied preview booking link");
                }}
              >
                Copy preview
              </button>
              <a
                href={previewBookingUrl ?? "#"}
                className={
                  "inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 " +
                  (!previewBookingUrl ? "pointer-events-none opacity-60" : "")
                }
                target="_blank"
                rel="noreferrer"
              >
                Preview
              </a>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                <div className="truncate">
                  <span className="font-semibold text-zinc-600">Live:</span> {liveBookingUrl ?? "…"}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                disabled={!liveBookingUrl}
                onClick={async () => {
                  if (!liveBookingUrl) return;
                  await navigator.clipboard.writeText(liveBookingUrl);
                  setStatus("Copied live booking link");
                }}
              >
                Copy live
              </button>
              <a
                href={liveBookingUrl ?? "#"}
                className={
                  "inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 " +
                  (!liveBookingUrl ? "pointer-events-none opacity-60" : "")
                }
                target="_blank"
                rel="noreferrer"
              >
                Live
              </a>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-600">Custom domain (optional)</div>
            <div className="mt-1">
              <PortalListboxDropdown
                value={hostedDomainDraft as any}
                disabled={loading || hostedSiteBusy || funnelDomainsBusy}
                options={
                  [
                    { value: "", label: "No custom domain" },
                    ...funnelDomains.map((d) => ({
                      value: d.domain,
                      label: d.domain,
                      hint: d.status === "PENDING" ? "Pending DNS verification" : undefined,
                    })),
                  ] as any
                }
                onChange={(v) => setHostedDomainDraft(String(v || ""))}
                placeholder={
                  funnelDomainsBusy
                    ? "Loading domains…"
                    : funnelDomains.length
                      ? "Choose a domain"
                      : "No domains yet"
                }
              />
            </div>

            {hostedDomainDraft.trim() && site?.slug ? (
              <div className="mt-2 text-xs text-zinc-600">
                Live link: <span className="font-mono">https://{hostedDomainDraft.trim()}/book/{site.slug}</span>
                {(() => {
                  const targetApex = apexDomain(hostedDomainDraft);
                  const match = funnelDomains.find((d) => apexDomain(d.domain) === targetApex);
                  const verified = Boolean(hostedSite?.verifiedAt) || match?.status === "VERIFIED";
                  if (verified) return <span className="ml-1 text-emerald-700">(verified)</span>;
                  if (match?.status === "PENDING") return <span className="ml-1 text-amber-700">(pending verification)</span>;
                  return null;
                })()}
              </div>
            ) : null}

            <div className="mt-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <div className="text-xs text-zinc-500">Domains come from Funnel Builder → Settings → Custom domains.</div>
              <a href={`${appBase}/services/funnel-builder/settings`} className="text-xs font-semibold text-[color:var(--color-brand-blue)] hover:underline">
                Add / manage domains
              </a>
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="rounded-xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
                disabled={hostedSiteBusy}
                onClick={saveHostedBookingDomain}
              >
                {hostedSiteBusy ? "Saving…" : "Save custom domain"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="font-medium text-zinc-800">Booking</span>
              <ToggleSwitch
                checked={Boolean(site?.enabled)}
                disabled={!site}
                accent="blue"
                onChange={(checked) => save({ enabled: checked })}
              />
            </div>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting length</div>
              <PortalSelectDropdown
                value={site?.durationMinutes ?? 30}
                onChange={(v) => save({ durationMinutes: v })}
                options={[15, 30, 45, 60].map((m) => ({ value: m, label: `${m} minutes` }))}
                className="mt-2 w-full"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
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
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              onClick={openAvailability}
            >
              Edit availability
            </button>
            {site?.enabled ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={previewBookingUrl ?? "#"}
                  className={
                    "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 " +
                    (!previewBookingUrl ? "pointer-events-none opacity-60" : "")
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview booking page
                </a>
                <a
                  href={liveBookingUrl ?? "#"}
                  className={
                    "inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 " +
                    (!liveBookingUrl ? "pointer-events-none opacity-60" : "")
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Live booking page
                </a>
              </div>
            ) : null}
          </div>

          {saving ? <div className="mt-4 text-sm text-zinc-500">Saving…</div> : null}
          </PortalSettingsSection>
        </div>

        <PortalSettingsSection
          title="Calendars"
          description="Create multiple booking links (different appointment types) with their own title and duration."
          accent="slate"
          collapsible={false}
          dotClassName="hidden"
        >

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
              <PortalSelectDropdown
                value={newCalDuration}
                onChange={(v) => setNewCalDuration(v)}
                disabled={calSaving}
                options={[15, 30, 45, 60].map((m) => ({ value: m, label: `${m} min` }))}
                className="w-full"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
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
                      <button
                        type="button"
                        className={
                          "truncate text-left text-sm font-semibold hover:underline " +
                          (selectedCalendarId === c.id ? "text-[color:var(--color-brand-blue)]" : "text-zinc-900")
                        }
                        onClick={() => setSelectedCalendarId(c.id)}
                      >
                        {c.title}{" "}
                        <span className="text-xs font-normal text-zinc-500">({c.durationMinutes ?? site?.durationMinutes ?? 30} min)</span>
                      </button>
                      {previewCalendarUrlBase ? (
                        <div className="mt-1 truncate text-xs text-zinc-500">
                          Preview: {previewCalendarUrlBase}/{c.id}
                        </div>
                      ) : null}
                      {liveCalendarUrlBase ? (
                        <div className="mt-1 truncate text-xs text-zinc-500">
                          Live: {liveCalendarUrlBase}/{c.id}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-zinc-600">On</span>
                      <ToggleSwitch
                        checked={Boolean(c.enabled)}
                        disabled={calSaving}
                        accent="ink"
                        onChange={(checked) => {
                          const next = calendars.map((x) => (x.id === c.id ? { ...x, enabled: checked } : x));
                          void saveCalendars(next);
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={!previewCalendarUrlBase}
                      onClick={async () => {
                        if (!previewCalendarUrlBase) return;
                        await navigator.clipboard.writeText(`${previewCalendarUrlBase}/${c.id}`);
                        setStatus("Copied preview calendar link");
                      }}
                    >
                      Copy preview
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={!liveCalendarUrlBase}
                      onClick={async () => {
                        if (!liveCalendarUrlBase) return;
                        await navigator.clipboard.writeText(`${liveCalendarUrlBase}/${c.id}`);
                        setStatus("Copied live calendar link");
                      }}
                    >
                      Copy live
                    </button>
                    <a
                      href={previewCalendarUrlBase ? `${previewCalendarUrlBase}/${c.id}` : "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 " +
                        (!previewCalendarUrlBase ? "pointer-events-none opacity-60" : "")
                      }
                    >
                      Preview
                    </a>
                    <a
                      href={liveCalendarUrlBase ? `${liveCalendarUrlBase}/${c.id}` : "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={
                        "rounded-xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 " +
                        (!liveCalendarUrlBase ? "pointer-events-none opacity-60" : "")
                      }
                    >
                      Live
                    </a>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={calSaving}
                      onClick={() => {
                        setSelectedCalendarId(c.id);
                        setStatus(`Editing: ${c.title}`);
                        window.setTimeout(() => setStatus(null), 1200);
                      }}
                      aria-label="Edit"
                      title="Edit"
                    >
                      <IconEdit size={16} />
                      <span className="sr-only">Edit</span>
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      disabled={calSaving}
                      onClick={() => {
                        setCalendarDeleteId(c.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </PortalSettingsSection>

        <div className="lg:col-span-2">
          <PortalSettingsSection
            title="Customization & notifications"
            description="Add an optional header photo, meeting info, and who gets notified when someone books."
            accent="slate"
            collapsible={false}
            dotClassName="hidden"
          >

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-600">Calendar settings</div>
            {calendars.length === 0 ? (
              <div className="mt-2 text-sm text-zinc-600">Create a calendar to edit per-calendar settings.</div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                  <div className="font-medium text-zinc-800">Editing calendar</div>
                  <div className="mt-2">
                    <PortalListboxDropdown
                      value={selectedCalendarId as any}
                      disabled={calSaving}
                      options={calendars.map((c) => ({ value: c.id, label: c.title || c.id })) as any}
                      onChange={(v) => setSelectedCalendarId(String(v || "") || null)}
                      placeholder="Choose a calendar"
                    />
                  </div>
                </label>

                <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                  <div className="font-medium text-zinc-800">Duration</div>
                  <PortalSelectDropdown
                    value={calendarDraftDurationMinutes}
                    onChange={(v) => {
                      setCalendarDraftDurationMinutes(v);
                      void saveSelectedCalendarPatch({ durationMinutes: v });
                    }}
                    options={[15, 20, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m} minutes` }))}
                    className="mt-2 w-full"
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </label>

                <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                  <div className="font-medium text-zinc-800">Title</div>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={calendarDraftTitle}
                    onChange={(e) => setCalendarDraftTitle(e.target.value)}
                    onBlur={() => {
                      const nextTitle = calendarDraftTitle.trim().slice(0, 80);
                      if (!selectedCalendarId) return;
                      if (!nextTitle) {
                        setCalendarDraftTitle(selectedCalendar?.title ?? "");
                        return;
                      }
                      void saveSelectedCalendarPatch({ title: nextTitle });
                    }}
                    placeholder="e.g. Intro call"
                    disabled={!selectedCalendarId || calSaving}
                  />
                  <div className="mt-2 text-xs text-zinc-500">Edits here only affect the selected calendar.</div>
                </label>
              </div>
            )}
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

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  onClick={() => setPhotoPickerOpen(true)}
                >
                  Choose from media library
                </button>
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

          <PortalMediaPickerModal
            open={photoPickerOpen}
            title="Choose a header photo"
            confirmLabel="Use"
            onClose={() => setPhotoPickerOpen(false)}
            onPick={async (item) => {
              if (!String(item.mimeType || "").startsWith("image/")) {
                setError("Please pick an image file");
                setPhotoPickerOpen(false);
                return;
              }
              setError(null);
              setPhotoPickerOpen(false);
              await save({ photoUrl: item.shareUrl });
            }}
          />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="mb-2 font-medium text-zinc-800">Meeting location</div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="meetingPlatform"
                    className="accent-brand-ink"
                    checked={site?.meetingPlatform === "PURELY_CONNECT"}
                    onChange={() => {
                       setSite((prev) => (prev ? { ...prev, meetingPlatform: "PURELY_CONNECT" } : prev));
                       save({ meetingPlatform: "PURELY_CONNECT" });
                    }}
                  />
                  <span>Purely Connect Video</span>
                  <span className="ml-1 rounded bg-brand-lime px-1.5 py-0.5 text-[10px] font-bold text-brand-forest">NEW</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="meetingPlatform"
                    className="accent-brand-ink"
                    checked={site?.meetingPlatform !== "PURELY_CONNECT"}
                    onChange={() => {
                       setSite((prev) => (prev ? { ...prev, meetingPlatform: "OTHER" } : prev));
                       save({ meetingPlatform: "OTHER" });
                    }}
                  />
                  <span>Other (Zoom, Phone, In-person)</span>
                </label>
              </div>

              {site?.meetingPlatform === "PURELY_CONNECT" ? (
                <div className="mt-3 text-xs text-zinc-600">
                  <p>Guests will receive a secure video meeting link automatically. Zero-latency HD video powered by Purely Connect.</p>
                </div>
              ) : (
                <textarea
                  className="mt-2 min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Phone call, Zoom link, in-person address…"
                  value={calendarDraftMeetingLocation}
                  onChange={(e) => setCalendarDraftMeetingLocation(e.target.value)}
                  onBlur={() => {
                    const next = calendarDraftMeetingLocation.trim().slice(0, 400);
                    void saveSelectedCalendarPatch({ meetingLocation: next ? next : undefined });
                  }}
                  disabled={!selectedCalendarId || calSaving}
                />
              )}
            </div>

            <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="font-medium text-zinc-800">Meeting details (optional)</div>
              <textarea
                className="mt-2 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Anything they should know before the call."
                value={calendarDraftMeetingDetails}
                onChange={(e) => setCalendarDraftMeetingDetails(e.target.value)}
                onBlur={() => {
                  const next = calendarDraftMeetingDetails.trim().slice(0, 600);
                  void saveSelectedCalendarPatch({ meetingDetails: next ? next : undefined });
                }}
                disabled={!selectedCalendarId || calSaving}
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
                {!selectedCalendarId ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                    Select a calendar above to set its notification recipients.
                  </div>
                ) : calendarDraftNotificationEmails.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                    Add one or more emails to notify when someone books.
                  </div>
                ) : null}

                {calendarDraftNotificationEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <PortalTypeaheadInput
                      value={email}
                      suggestions={notificationEmailSuggestions}
                      disabled={calSaving || !selectedCalendarId}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={idx === 0 ? "you@company.com" : "another@company.com"}
                      onChange={(nextEmail) => {
                        const next = [...calendarDraftNotificationEmails];
                        next[idx] = nextEmail;
                        setCalendarDraftNotificationEmails(next);
                      }}
                      onBlur={() => {
                        const normalized = sanitizeNotificationEmails(calendarDraftNotificationEmails);
                        void saveSelectedCalendarPatch({ notificationEmails: normalized.length ? normalized : undefined });
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => {
                        const next = calendarDraftNotificationEmails.filter((_, i) => i !== idx);
                        setCalendarDraftNotificationEmails(next);
                        const normalized = sanitizeNotificationEmails(next);
                        void saveSelectedCalendarPatch({ notificationEmails: normalized.length ? normalized : undefined });
                      }}
                      aria-label="Remove email"
                      disabled={calSaving || !selectedCalendarId}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  onClick={() => setCalendarDraftNotificationEmails((prev) => [...prev, ""])}
                  disabled={calSaving || !selectedCalendarId}
                >
                  + Add email
                </button>

                <div className="text-xs text-zinc-500">Emails: {sanitizeNotificationEmails(calendarDraftNotificationEmails).length}</div>
              </div>
            </label>
          </div>

            {saving ? <div className="mt-4 text-sm text-zinc-500">Saving…</div> : null}
          </PortalSettingsSection>
        </div>
      </div>

      <div className="mt-4">
        <PortalSettingsSection
          title="Booking form"
          description="Choose what questions to ask when someone books."
          accent="slate"
          defaultOpen={false}
        >
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
                placeholder="Thanks! You're booked. We'll see you soon."
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
                <ToggleSwitch
                  checked={form.phone.enabled}
                  disabled={formSaving}
                  accent="ink"
                  onChange={(checked) =>
                    void saveForm({
                      ...form,
                      phone: { enabled: checked, required: checked ? form.phone.required : false },
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Phone required</span>
                <ToggleSwitch
                  checked={form.phone.required}
                  disabled={formSaving || !form.phone.enabled}
                  accent="ink"
                  onChange={(checked) => void saveForm({ ...form, phone: { ...form.phone, required: checked } })}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Ask for notes</span>
                <ToggleSwitch
                  checked={form.notes.enabled}
                  disabled={formSaving}
                  accent="ink"
                  onChange={(checked) =>
                    void saveForm({
                      ...form,
                      notes: { enabled: checked, required: checked ? form.notes.required : false },
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Notes required</span>
                <ToggleSwitch
                  checked={form.notes.required}
                  disabled={formSaving || !form.notes.enabled}
                  accent="ink"
                  onChange={(checked) => void saveForm({ ...form, notes: { ...form.notes, required: checked } })}
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

                      <PortalListboxDropdown
                        value={q.kind}
                        disabled={formSaving}
                        onChange={(kind) => {
                          const next = [...form.questions];
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
                        options={[
                          { value: "short", label: "Short answer" },
                          { value: "long", label: "Long answer" },
                          { value: "single_choice", label: "Multiple choice (pick one)" },
                          { value: "multiple_choice", label: "Checkboxes (pick many)" },
                        ]}
                        className="w-full"
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                      />

                      <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
                        <span>Required</span>
                        <ToggleSwitch
                          checked={q.required}
                          disabled={formSaving}
                          accent="ink"
                          onChange={(checked) => {
                            const next = [...form.questions];
                            next[idx] = { ...q, required: checked };
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
        </PortalSettingsSection>
      </div>
        </>
      ) : null}

      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>
      ) : null}

      {contactOpen && contactBooking ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
          <div className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">Send follow-up</div>
            <div className="mt-1 text-sm text-zinc-600">
              {contactBooking.contactName} · {contactBooking.contactEmail}
              {contactBooking.contactPhone ? ` · ${contactBooking.contactPhone}` : ""}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Email</span>
                <ToggleSwitch
                  checked={contactSendEmail}
                  disabled={contactBusy}
                  accent="ink"
                  onChange={(checked) => setContactSendEmail(checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-800">Text</span>
                <ToggleSwitch
                  checked={contactSendSms}
                  disabled={contactBusy || !contactBooking.contactPhone}
                  accent="ink"
                  onChange={(checked) => setContactSendSms(checked)}
                />
              </label>
            </div>
            {!contactBooking.contactPhone ? (
              <div className="mt-2 text-xs text-zinc-500">No phone number on this booking.</div>
            ) : null}

            {contactSendEmail ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">Email subject</div>
                </div>
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

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-zinc-600">Message</div>
              </div>
              <textarea
                className="mt-2 min-h-[140px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                placeholder="Write a quick follow-up…"
                value={contactMessage}
                disabled={contactBusy}
                onChange={(e) => setContactMessage(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                disabled={contactBusy}
                onClick={() => {
                  setContactOpen(false);
                  setContactBooking(null);
                  clearBookingModalUrl();
                }}
              >
                Cancel
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
          <div className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-sm font-semibold text-zinc-900">Reschedule booking</div>
            <div className="mt-1 text-sm text-zinc-600">
              {reschedBooking.contactName} · {new Date(reschedBooking.startAt).toLocaleString()}
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-600">New date/time</div>
              <LocalDateTimePicker
                value={reschedWhen}
                onChange={setReschedWhen}
                disabled={reschedBusy}
                buttonClassName="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:bg-zinc-50"
                placeholder="Select date/time"
              />
              <div className="mt-1 text-xs text-zinc-500">Uses your local time zone.</div>
            </div>

            <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="font-medium text-zinc-800">Force availability</span>
              <ToggleSwitch checked={reschedForce} disabled={reschedBusy} accent="ink" onChange={setReschedForce} />
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
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                disabled={reschedBusy}
                onClick={() => {
                  setReschedOpen(false);
                  setReschedBooking(null);
                  clearBookingModalUrl();
                }}
              >
                Cancel
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

      <AppModal
        open={availabilityOpen}
        title="Availability"
        description="Select times you’re available for bookings."
        onClose={closeAvailability}
        widthClassName="w-[min(1100px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
              onClick={closeAvailability}
            >
              Done
            </button>
          </div>
        }
      >
        <PortalBookingAvailabilityClient variant="modal" />
      </AppModal>

      <AppConfirmModal
        open={Boolean(calendarDeleteId)}
        title="Delete calendar"
        message="Delete this calendar? This cannot be undone."
        confirmLabel={calSaving ? "Deleting…" : "Delete"}
        cancelLabel="Cancel"
        destructive
        onClose={() => {
          if (calSaving) return;
          setCalendarDeleteId(null);
        }}
        onConfirm={() => {
          if (!calendarDeleteId) return;
          const id = calendarDeleteId;
          setCalendarDeleteId(null);
          const next = calendars.filter((x) => x.id !== id);
          void saveCalendars(next);
        }}
      />
    </div>
  );
}
