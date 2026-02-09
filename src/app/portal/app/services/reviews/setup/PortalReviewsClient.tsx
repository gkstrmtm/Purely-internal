"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { Lightbox, type LightboxImage } from "@/components/Lightbox";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import type { TemplateVariable } from "@/lib/portalTemplateVars";

type ReviewDelayUnit = "minutes" | "hours" | "days" | "weeks";

const REVIEW_TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "name", label: "Contact name", group: "Contact", appliesTo: "Booking contact" },
  { key: "business", label: "Your business name", group: "Business", appliesTo: "Your business" },
  { key: "link", label: "Review link", group: "Custom", appliesTo: "This message" },
];

type ReviewDelay = {
  value: number;
  unit: ReviewDelayUnit;
};

type ReviewDestination = {
  id: string;
  label: string;
  url: string;
};

type ReviewQuestionKind = "short" | "long" | "single_choice" | "multiple_choice";

type ReviewQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: ReviewQuestionKind;
  options?: string[];
};

type ReviewsPublicFormConfig = {
  version: 1;
  email: { enabled: boolean; required: boolean };
  phone: { enabled: boolean; required: boolean };
  questions: ReviewQuestion[];
};

type ReviewsPublicPageSettings = {
  enabled: boolean;
  galleryEnabled: boolean;
  title: string;
  description: string;
  thankYouMessage: string;
  form: ReviewsPublicFormConfig;
  photoUrls: string[];
};

type ReviewRequestsSettings = {
  version: 1;
  enabled: boolean;
  automation: { autoSend: boolean; manualSend: boolean; calendarIds: string[] };
  sendAfter: ReviewDelay;
  destinations: ReviewDestination[];
  defaultDestinationId?: string;
  messageTemplate: string;
  calendarMessageTemplates?: Record<string, string>;
  publicPage: ReviewsPublicPageSettings;
};

type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

type ReviewRequestEvent = {
  id: string;
  bookingId: string;
  scheduledForIso: string;
  destinationLabel: string;
  destinationUrl: string;
  contactName: string;
  smsTo: string | null;
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
  error?: string;
  createdAtIso: string;
};

type ReceivedReview = {
  id: string;
  rating: number;
  name: string;
  body: string | null;
  email: string | null;
  phone: string | null;
  photoUrls: unknown;
  businessReply?: string | null;
  businessReplyAt?: string | null;
  archivedAt: string | null;
  createdAt: string;
};

type ReviewQuestionRow = {
  id: string;
  name: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
};

const DEFAULT_SETTINGS: ReviewRequestsSettings = {
  version: 1,
  enabled: false,
  automation: { autoSend: true, manualSend: true, calendarIds: [] },
  sendAfter: { value: 30, unit: "minutes" },
  destinations: [],
  messageTemplate: "Hi {name} — thanks again! If you have 30 seconds, would you leave us a review? {link}",
  calendarMessageTemplates: {},
  publicPage: {
    enabled: true,
    galleryEnabled: true,
    title: "Reviews",
    description: "We’d love to hear about your experience.",
    thankYouMessage: "Thanks — your review was submitted.",
    form: {
      version: 1,
      email: { enabled: false, required: false },
      phone: { enabled: false, required: false },
      questions: [],
    },
    photoUrls: [],
  },
};

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeUrl(raw: string) {
  const v = (raw || "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function idFromLabel(label: string) {
  const cleaned = (label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || `dest-${Date.now()}`;
}

export default function PortalReviewsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReviewRequestsSettings>(DEFAULT_SETTINGS);

  const [tab, setTab] = useState<"reviews" | "settings">("reviews");

  function setTabWithUrl(nextTab: "reviews" | "settings") {
    setTab(nextTab);
    try {
      const url = new URL(window.location.href);
      if (nextTab === "reviews") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }

  const lastSavedSettingsJsonRef = useRef<string>(JSON.stringify(DEFAULT_SETTINGS));

  const [publicSiteSlug, setPublicSiteSlug] = useState<string | null>(null);

  const uploadsInputRef = useRef<HTMLInputElement | null>(null);
  const [publicPhotosPickerOpen, setPublicPhotosPickerOpen] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadPickerCount, setUploadPickerCount] = useState(0);

  const [calendars, setCalendars] = useState<Array<{ id: string; title: string; enabled?: boolean }>>([]);

  const [events, setEvents] = useState<ReviewRequestEvent[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<ReceivedReview[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySavingId, setReplySavingId] = useState<string | null>(null);
  const [replyEditingId, setReplyEditingId] = useState<string | null>(null);

  const [qaQuestions, setQaQuestions] = useState<ReviewQuestionRow[]>([]);
  const [qaSavingId, setQaSavingId] = useState<string | null>(null);
  const [qaEditingId, setQaEditingId] = useState<string | null>(null);
  const [qaAnswerDrafts, setQaAnswerDrafts] = useState<Record<string, string>>({});

  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varPickerTarget, setVarPickerTarget] = useState<null | { kind: "default" } | { kind: "calendar"; calendarId: string }>(null);
  const activeTemplateElRef = useRef<HTMLTextAreaElement | null>(null);

  function insertAtCursor(current: string, insert: string, el: HTMLTextAreaElement | null) {
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    return { next, cursor: start + insert.length };
  }

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  function openLightbox(urls: string[], startIndex: number) {
    const images = urls
      .flatMap((u) => {
        const v = typeof u === "string" ? u.trim() : "";
        return v ? ([{ src: v }] as LightboxImage[]) : ([] as LightboxImage[]);
      })
      .slice(0, 200);
    if (!images.length) return;
    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(images.length - 1, Math.floor(startIndex || 0))));
    setLightboxOpen(true);
  }

  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [upcomingBookings, setUpcomingBookings] = useState<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      status: "SCHEDULED" | "CANCELED";
      calendarId?: string | null;
      contactName: string;
      contactEmail: string;
      contactPhone: string | null;
      canceledAt: string | null;
    }>
  >([]);
  const [recentBookings, setRecentBookings] = useState<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      status: "SCHEDULED" | "CANCELED";
      calendarId?: string | null;
      contactName: string;
      contactEmail: string;
      contactPhone: string | null;
      canceledAt: string | null;
    }>
  >([]);
  const [bookingQuery, setBookingQuery] = useState("");

  const [newDestLabel, setNewDestLabel] = useState("Google Reviews");
  const [newDestUrl, setNewDestUrl] = useState("");

  const previewLink = useMemo(() => {
    if (settings.publicPage.enabled && publicSiteSlug) return `/${publicSiteSlug}/reviews`;
    const preferred = settings.defaultDestinationId
      ? settings.destinations.find((d) => d.id === settings.defaultDestinationId)
      : null;
    return preferred?.url || settings.destinations[0]?.url || "";
  }, [publicSiteSlug, settings.defaultDestinationId, settings.destinations, settings.publicPage.enabled]);

  const previewBody = useMemo(() => {
    const business = "{business}";
    return (settings.messageTemplate || "")
      .replaceAll("{name}", "Sam")
      .replaceAll("{link}", previewLink || "https://example.com/review")
      .replaceAll("{business}", business)
      .trim();
  }, [settings.messageTemplate, previewLink]);

  const maxValue = useMemo(() => {
    const unit = settings.sendAfter.unit;
    if (unit === "weeks") return 2;
    if (unit === "days") return 14;
    if (unit === "hours") return 24 * 14;
    return 60 * 24 * 14;
  }, [settings.sendAfter.unit]);

  async function readJsonSafe<T>(res: Response): Promise<JsonResult<T>> {
    const status = res.status;
    const text = await res.text().catch(() => "");
    if (!text) {
      return { ok: false, error: `Empty response (HTTP ${status})`, status };
    }
    try {
      const data = JSON.parse(text) as T;
      return { ok: true, data };
    } catch {
      return { ok: false, error: `Invalid JSON (HTTP ${status}): ${text.slice(0, 200)}`, status };
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, e, handle, cals, inbox, qa] = await Promise.all([
        fetch("/api/portal/reviews/settings", { cache: "no-store" }).then((r) => readJsonSafe<any>(r)),
        fetch("/api/portal/reviews/events?limit=50", { cache: "no-store" }).then((r) => readJsonSafe<any>(r)),
        fetch("/api/portal/reviews/handle", { cache: "no-store" }).then((r) => readJsonSafe<any>(r)).catch(() => null),
        fetch("/api/portal/booking/calendars", { cache: "no-store" })
          .then((r) => readJsonSafe<any>(r))
          .catch(() => null),
        fetch("/api/portal/reviews/inbox?includeArchived=1", { cache: "no-store" }).then((r) => readJsonSafe<any>(r)),
        fetch("/api/portal/reviews/questions", { cache: "no-store" }).then((r) => readJsonSafe<any>(r)).catch(() => null),
      ]);
      if (!s || !s.ok) throw new Error((s as any)?.error || "Failed to load settings");
      const sData = s.data;
      if (!sData?.ok) throw new Error(sData?.error || "Failed to load settings");
      const nextSettings = sData.settings || DEFAULT_SETTINGS;
      setSettings(nextSettings);
      lastSavedSettingsJsonRef.current = JSON.stringify(nextSettings);

      const eData = e.ok ? e.data : null;
      setEvents(Array.isArray(eData?.events) ? eData.events : []);

      const inboxData = inbox.ok ? inbox.data : null;
      setReceivedReviews(Array.isArray(inboxData?.reviews) ? inboxData.reviews : []);

      setReplyDrafts(() => {
        const next: Record<string, string> = {};
        const list = Array.isArray(inboxData?.reviews) ? (inboxData?.reviews as any[]) : [];
        for (const r of list) {
          const id = typeof r?.id === "string" ? r.id : "";
          if (!id) continue;
          next[id] = typeof r?.businessReply === "string" ? r.businessReply : "";
        }
        return next;
      });

      const qaData = qa && (qa as any).ok ? (qa as any).data : null;
      if (qaData?.ok) {
        const nextQuestions = Array.isArray(qaData.questions) ? qaData.questions : [];
        setQaQuestions(nextQuestions);
        setQaAnswerDrafts(() => {
          const next: Record<string, string> = {};
          for (const q of nextQuestions as any[]) {
            const id = typeof q?.id === "string" ? q.id : "";
            if (!id) continue;
            next[id] = typeof q?.answer === "string" ? q.answer : "";
          }
          return next;
        });
      } else {
        setQaQuestions([]);
        setQaAnswerDrafts({});
      }

      const handleData = handle && (handle as any).ok ? (handle as any).data : null;
      const slug = typeof handleData?.handle === "string" ? handleData.handle : null;
      setPublicSiteSlug(slug || null);

      const calsData = cals && (cals as any).ok ? (cals as any).data : null;
      const list = Array.isArray(calsData?.config?.calendars) ? calsData.config.calendars : [];
      setCalendars(
        list
          .filter((x: any) => x && typeof x.id === "string" && typeof x.title === "string")
          .map((x: any) => ({ id: x.id, title: x.title, enabled: x.enabled })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveReviewReply(reviewId: string, nextReplyOverride?: string) {
    setReplySavingId(reviewId);
    setError(null);
    try {
      const reply = (typeof nextReplyOverride === "string" ? nextReplyOverride : (replyDrafts[reviewId] || "")).trim();
      const res = await fetch("/api/portal/reviews/reply", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewId, reply }),
      }).then((r) => readJsonSafe<any>(r));
      if (!res.ok) throw new Error(res.error || "Failed to save reply");
      if (!res.data?.ok) throw new Error(res.data?.error || "Failed to save reply");

      setReceivedReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                businessReply: reply ? reply : null,
                businessReplyAt: reply ? new Date().toISOString() : null,
              }
            : r,
        ),
      );

      setReplyDrafts((prev) => ({ ...prev, [reviewId]: reply }));
      setReplyEditingId((prev) => (prev === reviewId ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReplySavingId(null);
    }
  }

  async function saveQaAnswer(id: string, answer: string) {
    setQaSavingId(id);
    setError(null);
    try {
      const res = await fetch("/api/portal/reviews/questions/answer", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, answer }),
      }).then((r) => readJsonSafe<any>(r));
      if (!res.ok) throw new Error(res.error || "Failed to save answer");
      if (!res.data?.ok) throw new Error(res.data?.error || "Failed to save answer");
      const trimmed = answer.trim();
      setQaQuestions((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                answer: trimmed ? trimmed : null,
                answeredAt: trimmed ? new Date().toISOString() : null,
              }
            : q,
        ),
      );
      setQaAnswerDrafts((prev) => ({ ...prev, [id]: trimmed }));
      setQaEditingId((prev) => (prev === id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setQaSavingId(null);
    }
  }

  async function setReviewArchived(reviewId: string, archived: boolean) {
    setError(null);
    try {
      const res = await fetch("/api/portal/reviews/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewId, archived }),
      }).then((r) => readJsonSafe<any>(r));
      if (!res.ok) throw new Error(res.error || "Failed to update");
      if (!res.data?.ok) throw new Error(res.data?.error || "Failed to update");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadBookings() {
    setBookingsLoading(true);
    setError(null);
    try {
      const parsed = await fetch("/api/portal/booking/bookings", { cache: "no-store" }).then((r) => readJsonSafe<any>(r));
      if (!parsed.ok) throw new Error(parsed.error || "Failed to load bookings");
      const res = parsed.data;
      if (!res?.ok) throw new Error(res?.error || "Failed to load bookings");

      const upcoming = Array.isArray(res.upcoming) ? res.upcoming : [];
      const recent = Array.isArray(res.recent) ? res.recent : [];
      setUpcomingBookings(upcoming);
      setRecentBookings(recent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBookingsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("tab");
      if (t === "settings" || t === "reviews") setTab(t);
    } catch {
      // ignore
    }
  }, []);

  async function save(next: ReviewRequestsSettings) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/reviews/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: next }),
      }).then((r) => readJsonSafe<any>(r));
      if (!res.ok) throw new Error(res.error || "Failed to save");
      if (!res.data?.ok) throw new Error(res.data?.error || "Failed to save");
      const nextSettings = res.data.settings || next;
      setSettings(nextSettings);
      lastSavedSettingsJsonRef.current = JSON.stringify(nextSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const isDirty = useMemo(() => {
    try {
      return JSON.stringify(settings) !== lastSavedSettingsJsonRef.current;
    } catch {
      return true;
    }
  }, [settings]);

  async function uploadPublicPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    setError(null);
    try {
      const nextUrls: string[] = [];
      const selected = Array.from(files).slice(0, 12);
      setUploadPickerCount(selected.length);
      for (const f of selected) {
        const form = new FormData();
        form.append("file", f);
        const parsed = await fetch("/api/uploads", { method: "POST", body: form }).then((r) => readJsonSafe<any>(r));
        if (!parsed.ok) throw new Error(parsed.error || "Upload failed");
        if (!parsed.data?.url) throw new Error(parsed.data?.error || "Upload failed");
        nextUrls.push(String(parsed.data.url));
      }
      setSettings({
        ...settings,
        publicPage: {
          ...settings.publicPage,
          photoUrls: Array.from(new Set([...(settings.publicPage.photoUrls || []), ...nextUrls])).slice(0, 30),
        },
      });
      if (uploadsInputRef.current) uploadsInputRef.current.value = "";
      setUploadPickerCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingPhotos(false);
    }
  }

  function getCalendarTemplate(calendarId: string) {
    const m = settings.calendarMessageTemplates && typeof settings.calendarMessageTemplates === "object" ? settings.calendarMessageTemplates : {};
    return typeof m[calendarId] === "string" ? m[calendarId] : "";
  }

  function setCalendarTemplate(calendarId: string, template: string) {
    const current = settings.calendarMessageTemplates && typeof settings.calendarMessageTemplates === "object" ? settings.calendarMessageTemplates : {};
    const nextMap: Record<string, string> = { ...current };
    const v = (template || "").slice(0, 900);
    if (!v.trim()) {
      delete nextMap[calendarId];
    } else {
      nextMap[calendarId] = v;
    }
    setSettings({ ...settings, calendarMessageTemplates: nextMap });
  }

  function setSendAfter(partial: Partial<ReviewDelay>) {
    const next: ReviewRequestsSettings = {
      ...settings,
      sendAfter: {
        value: clampInt(partial.value ?? settings.sendAfter.value, 0, maxValue),
        unit: (partial.unit ?? settings.sendAfter.unit) as ReviewDelayUnit,
      },
    };
    setSettings(next);
  }

  function addDestination() {
    const url = normalizeUrl(newDestUrl);
    if (!url) {
      setError("Please enter a valid http(s) URL.");
      return;
    }
    const label = (newDestLabel || "Review link").trim().slice(0, 60) || "Review link";
    const id = idFromLabel(label);
    const dest: ReviewDestination = { id, label, url };
    const nextDestinations = [...settings.destinations, dest].slice(0, 10);
    const next: ReviewRequestsSettings = {
      ...settings,
      destinations: nextDestinations,
      defaultDestinationId: settings.defaultDestinationId || dest.id,
    };
    setSettings(next);
    setNewDestUrl("");
  }

  function removeDestination(id: string) {
    const nextDestinations = settings.destinations.filter((d) => d.id !== id);
    const nextDefault =
      settings.defaultDestinationId === id ? nextDestinations[0]?.id : settings.defaultDestinationId;
    const next: ReviewRequestsSettings = {
      ...settings,
      destinations: nextDestinations,
      ...(nextDefault ? { defaultDestinationId: nextDefault } : {}),
    };
    setSettings(next);
  }

  async function manualSend(bookingId: string) {
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const res = await fetch("/api/portal/reviews/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId }),
      }).then((r) => readJsonSafe<any>(r));
      if (!res.ok) throw new Error(res.error || "Failed to send");
      if (!res.data?.ok) throw new Error(res.data?.error || "Failed to send");
      setSendResult("Sent");
      await load();
    } catch (err) {
      setSendResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  const filteredUpcoming = useMemo(() => {
    const q = bookingQuery.trim().toLowerCase();
    if (!q) return upcomingBookings;
    return upcomingBookings.filter((b) => {
      const hay = `${b.contactName} ${b.contactEmail} ${b.contactPhone || ""} ${b.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookingQuery, upcomingBookings]);

  const filteredRecent = useMemo(() => {
    const q = bookingQuery.trim().toLowerCase();
    if (!q) return recentBookings;
    return recentBookings.filter((b) => {
      const hay = `${b.contactName} ${b.contactEmail} ${b.contactPhone || ""} ${b.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookingQuery, recentBookings]);

  const calendarTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calendars) m.set(c.id, c.title);
    return m;
  }, [calendars]);

  const calendarFilterEnabled = settings.automation.calendarIds.length > 0;

  function isCalendarAllowedForBooking(calendarId?: string | null) {
    if (!calendarFilterEnabled) return true;
    // If calendarId isn't available (e.g. older DB missing the column), don't block manual sends.
    if (calendarId == null) return true;
    return settings.automation.calendarIds.includes(calendarId);
  }

  function calendarLabel(calendarId?: string | null) {
    if (calendarId == null) return "(calendar unknown)";
    return calendarTitleById.get(calendarId) || "(unknown calendar)";
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Lightbox
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      <div className="flex flex-col gap-1">
        <div className="text-2xl font-semibold">Review Requests</div>
        <div className="text-sm text-neutral-600">
          Send a review link after an appointment, and optionally host a public Reviews page.
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTabWithUrl("reviews")}
          aria-current={tab === "reviews" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "reviews"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Reviews
        </button>
        <button
          type="button"
          onClick={() => setTabWithUrl("settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          className={
            "flex-1 min-w-[200px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "settings"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Requests / Settings
        </button>
      </div>

      <div className="mt-4">
        <div className={tab === "settings" ? "" : "hidden"}>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col gap-1">
              <div className="text-lg font-semibold text-zinc-900">Requests / Settings</div>
              <div className="text-sm text-zinc-600">Automation, public reviews page, message template, and destinations.</div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                <button
                  type="button"
                  className={
                    (settings.enabled
                      ? "bg-white text-brand-ink hover:bg-zinc-50"
                      : "bg-brand-ink text-white") +
                    " px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  }
                  disabled={saving}
                  onClick={() => setSettings({ ...settings, enabled: false })}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={
                    (settings.enabled
                      ? "bg-brand-ink text-white"
                      : "bg-white text-brand-ink hover:bg-zinc-50") +
                    " px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  }
                  disabled={saving}
                  onClick={() => setSettings({ ...settings, enabled: true })}
                >
                  On
                </button>
              </div>

              {(() => {
                const canPreview = Boolean(settings.publicPage.enabled && publicSiteSlug);
                return (
                  <a
                    className={
                      "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 " +
                      (!canPreview ? "pointer-events-none opacity-50" : "")
                    }
                    href={canPreview ? `/${publicSiteSlug}/reviews` : "#"}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!canPreview}
                    title={!canPreview ? "Enable the public page and ensure you have a site slug." : ""}
                  >
                    Preview public reviews page
                  </a>
                );
              })()}
            </div>

            <div className="mt-6 space-y-4">
              <PortalSettingsSection
                title="Send mode"
                description="Auto-send, manual sends, and calendar filters."
                accent="slate"
                status={settings.enabled ? "on" : "off"}
                defaultOpen
              >
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">Auto-send after appointments</span>
                      <span className="mt-0.5 block text-xs text-neutral-600">When on, the scheduler sends automatically after the delay.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.automation.autoSend}
                      onChange={(e) => setSettings({ ...settings, automation: { ...settings.automation, autoSend: e.target.checked } })}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">Allow manual sends</span>
                      <span className="mt-0.5 block text-xs text-neutral-600">When off, you can’t use the Reviews tab to send manually.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.automation.manualSend}
                      onChange={(e) => setSettings({ ...settings, automation: { ...settings.automation, manualSend: e.target.checked } })}
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium">Calendars</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Pick which calendars can send review requests. Empty list means all calendars.
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">All calendars</span>
                      <input
                        type="checkbox"
                        checked={settings.automation.calendarIds.length === 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSettings({ ...settings, automation: { ...settings.automation, calendarIds: [] } });
                          } else {
                            const enabled = calendars.filter((c) => c.enabled !== false);
                            const first = enabled[0]?.id ? [enabled[0].id] : [];
                            setSettings({ ...settings, automation: { ...settings.automation, calendarIds: first } });
                          }
                        }}
                      />
                    </label>

                    {settings.automation.calendarIds.length ? (
                      <div className="mt-2 grid gap-2 rounded-lg border border-zinc-200 bg-white p-3">
                        {calendars.filter((c) => c.enabled !== false).length === 0 ? (
                          <div className="text-xs text-neutral-600">No calendars found. Add calendars in Booking Automation.</div>
                        ) : (
                          calendars
                            .filter((c) => c.enabled !== false)
                            .map((c) => {
                              const checked = settings.automation.calendarIds.includes(c.id);
                              return (
                                <label key={c.id} className="flex items-center justify-between gap-3 text-sm">
                                  <span className="truncate">{c.title}</span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? Array.from(new Set([...settings.automation.calendarIds, c.id]))
                                        : settings.automation.calendarIds.filter((id) => id !== c.id);
                                      setSettings({ ...settings, automation: { ...settings.automation, calendarIds: next } });
                                    }}
                                  />
                                </label>
                              );
                            })
                        )}
                        <div className="text-xs text-neutral-500">Tip: turn on “All calendars” to clear the selection.</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-sm font-medium">Per-calendar messages</div>
                  <div className="mt-1 text-xs text-neutral-600">Optional overrides by calendar.</div>

                  {settings.automation.calendarIds.length ? (
                    <>
                      <div className="mt-2 text-xs text-neutral-600">
                        If set, the message below overrides the default SMS template for bookings under that calendar.
                      </div>
                      <div className="mt-3 grid gap-3">
                        {settings.automation.calendarIds.map((calendarId) => (
                          <div key={calendarId} className="rounded-lg border border-zinc-200 bg-white p-3">
                            <div className="text-sm font-semibold text-zinc-900">
                              {calendarTitleById.get(calendarId) || "Calendar"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">Calendar ID: {calendarId}</div>
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-zinc-700">Message template</div>
                              <button
                                type="button"
                                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                onClick={() => {
                                  setVarPickerTarget({ kind: "calendar", calendarId });
                                  setVarPickerOpen(true);
                                }}
                              >
                                Insert variable
                              </button>
                            </div>
                            <textarea
                              className="mt-2 min-h-[96px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Leave blank to use the default template"
                              value={getCalendarTemplate(calendarId)}
                              onChange={(e) => setCalendarTemplate(calendarId, e.target.value)}
                              onFocus={(e) => {
                                activeTemplateElRef.current = e.currentTarget;
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-zinc-600">
                      To set different messages per calendar, turn off “All calendars” and select specific calendars.
                    </div>
                  )}
                </div>
              </PortalSettingsSection>

              <PortalSettingsSection title="Timing" description="Send after appointment ends." accent="slate" defaultOpen={false}>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="h-10 w-24 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                    value={settings.sendAfter.value}
                    onChange={(e) => setSendAfter({ value: clampInt(Number(e.target.value), 0, maxValue) })}
                    type="number"
                    min={0}
                    max={maxValue}
                  />
                  <select
                    className="h-10 w-32 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                    value={settings.sendAfter.unit}
                    onChange={(e) => {
                      const unit = e.target.value as ReviewDelayUnit;
                      const nextMax = unit === "weeks" ? 2 : unit === "days" ? 14 : unit === "hours" ? 24 * 14 : 60 * 24 * 14;
                      const nextValue = clampInt(settings.sendAfter.value, 0, nextMax);
                      setSendAfter({ unit, value: nextValue });
                    }}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                  </select>
                  <div className="text-xs text-neutral-500">Max 2 weeks.</div>
                </div>
              </PortalSettingsSection>

              <PortalSettingsSection title="Review destinations" description="Where the review link goes (Google, Yelp, etc)." accent="slate" defaultOpen={false}>
                <div className="mt-2 space-y-2">
                  {settings.destinations.length === 0 ? (
                    <div className="text-sm text-zinc-600">
                      Optional. If you add links (Google, Yelp, etc), they’ll appear on your hosted reviews page.
                    </div>
                  ) : null}

                  {settings.destinations.map((d) => (
                    <div key={d.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.label}</div>
                        <div className="truncate text-xs text-neutral-500">{d.url}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-neutral-700">
                          <input
                            type="radio"
                            checked={
                              settings.defaultDestinationId === d.id ||
                              (!settings.defaultDestinationId && settings.destinations[0]?.id === d.id)
                            }
                            onChange={() => setSettings({ ...settings, defaultDestinationId: d.id })}
                          />
                          default
                        </label>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs hover:bg-zinc-50"
                          onClick={() => removeDestination(d.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                    placeholder="Label (e.g. Google Reviews)"
                    value={newDestLabel}
                    onChange={(e) => setNewDestLabel(e.target.value)}
                  />
                  <input
                    className="h-10 flex-[2] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                    placeholder="https://..."
                    value={newDestUrl}
                    onChange={(e) => setNewDestUrl(e.target.value)}
                  />
                  <button
                    className="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white"
                    onClick={addDestination}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </PortalSettingsSection>

              <PortalSettingsSection title="SMS template" description="Controls the message body for review request texts." accent="slate" defaultOpen={false}>
                <div className="mt-2 text-xs text-neutral-500">Use placeholders: {"{name}"}, {"{link}"}, {"{business}"}</div>
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                    onClick={() => {
                      setVarPickerTarget({ kind: "default" });
                      setVarPickerOpen(true);
                    }}
                  >
                    Insert variable
                  </button>
                </div>
                <textarea
                  className="mt-2 min-h-[120px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.messageTemplate}
                  onChange={(e) => setSettings({ ...settings, messageTemplate: e.target.value })}
                  onFocus={(e) => {
                    activeTemplateElRef.current = e.currentTarget;
                  }}
                />
                <div className="mt-2 rounded-lg border border-zinc-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                  <div className="font-medium">Preview</div>
                  <div className="mt-1 whitespace-pre-wrap">{previewBody}</div>
                </div>
              </PortalSettingsSection>

              <PortalSettingsSection title="Hosted reviews page" description="Configure the public reviews page and its form." accent="slate" defaultOpen={false}>
                {publicSiteSlug ? (
                  <div className="mt-1 text-xs text-neutral-500">
                    Public URL: <span className="font-mono">/{publicSiteSlug}/reviews</span>
                  </div>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.publicPage.enabled}
                      onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, enabled: e.target.checked } })}
                    />
                    Enable public page
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.publicPage.galleryEnabled}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          publicPage: { ...settings.publicPage, galleryEnabled: e.target.checked },
                        })
                      }
                    />
                    Show photo gallery
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Hero title</div>
                    <input
                      className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      placeholder="e.g. Reviews"
                      value={settings.publicPage.title}
                      onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, title: e.target.value } })}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <input
                      ref={uploadsInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingPhotos}
                      onChange={(e) => void uploadPublicPhotos(e.target.files)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={uploadingPhotos}
                        onClick={() => uploadsInputRef.current?.click()}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {uploadingPhotos ? "Uploading…" : "Choose files"}
                      </button>
                      <button
                        type="button"
                        disabled={uploadingPhotos}
                        onClick={() => setPublicPhotosPickerOpen(true)}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Choose from media library
                      </button>
                    </div>
                    <div className="text-xs text-zinc-500">{uploadPickerCount ? `${uploadPickerCount} selected` : "No files chosen"}</div>
                  </div>
                </div>

                <PortalMediaPickerModal
                  open={publicPhotosPickerOpen}
                  title="Choose a gallery photo"
                  confirmLabel="Add"
                  onClose={() => setPublicPhotosPickerOpen(false)}
                  onPick={(item) => {
                    if (!String(item.mimeType || "").startsWith("image/")) {
                      setError("Please pick an image file");
                      setPublicPhotosPickerOpen(false);
                      return;
                    }

                    setSettings({
                      ...settings,
                      publicPage: {
                        ...settings.publicPage,
                        photoUrls: Array.from(new Set([...(settings.publicPage.photoUrls || []), item.shareUrl])).slice(0, 30),
                      },
                    });
                    setPublicPhotosPickerOpen(false);
                  }}
                />

                {settings.publicPage.photoUrls?.length ? (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-zinc-700">Photos</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {settings.publicPage.photoUrls.slice(0, 12).map((u) => (
                        <button
                          key={u}
                          type="button"
                          className="h-16 w-16 overflow-hidden rounded-xl"
                          onClick={() => openLightbox(settings.publicPage.photoUrls, settings.publicPage.photoUrls.indexOf(u))}
                          aria-label="Open photo"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-red-700 hover:underline disabled:opacity-60"
                      disabled={uploadingPhotos}
                      onClick={() => setSettings({ ...settings, publicPage: { ...settings.publicPage, photoUrls: [] } })}
                    >
                      Clear photos
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-zinc-500">Upload one or more photos (optional).</div>
                )}

                <div className="mt-3">
                  <div className="text-xs font-semibold text-zinc-700">Hero subtitle</div>
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="e.g. We’d love to hear about your experience."
                    value={settings.publicPage.description}
                    onChange={(e) => setSettings({ ...settings, publicPage: { ...settings.publicPage, description: e.target.value } })}
                  />
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-zinc-700">Thank you message</div>
                  <div className="mt-1 text-xs text-zinc-500">Shown after someone submits a review on your public page.</div>
                  <textarea
                    className="mt-2 min-h-[70px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="e.g. Thanks! We appreciate you."
                    value={settings.publicPage.thankYouMessage}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        publicPage: { ...settings.publicPage, thankYouMessage: e.target.value },
                      })
                    }
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">Public form</div>
                  <div className="mt-1 text-xs text-zinc-600">Choose what info to collect on the public reviews page.</div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                          <input
                            type="checkbox"
                            checked={settings.publicPage.form.email.enabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                publicPage: {
                                  ...settings.publicPage,
                                  form: {
                                    ...settings.publicPage.form,
                                    email: {
                                      ...settings.publicPage.form.email,
                                      enabled: e.target.checked,
                                      required: e.target.checked ? settings.publicPage.form.email.required : false,
                                    },
                                  },
                                },
                              })
                            }
                          />
                          Collect email
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            checked={settings.publicPage.form.email.enabled && settings.publicPage.form.email.required}
                            disabled={!settings.publicPage.form.email.enabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                publicPage: {
                                  ...settings.publicPage,
                                  form: {
                                    ...settings.publicPage.form,
                                    email: { ...settings.publicPage.form.email, required: e.target.checked },
                                  },
                                },
                              })
                            }
                          />
                          Required
                        </label>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                          <input
                            type="checkbox"
                            checked={settings.publicPage.form.phone.enabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                publicPage: {
                                  ...settings.publicPage,
                                  form: {
                                    ...settings.publicPage.form,
                                    phone: {
                                      ...settings.publicPage.form.phone,
                                      enabled: e.target.checked,
                                      required: e.target.checked ? settings.publicPage.form.phone.required : false,
                                    },
                                  },
                                },
                              })
                            }
                          />
                          Collect phone (SMS)
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            checked={settings.publicPage.form.phone.enabled && settings.publicPage.form.phone.required}
                            disabled={!settings.publicPage.form.phone.enabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                publicPage: {
                                  ...settings.publicPage,
                                  form: {
                                    ...settings.publicPage.form,
                                    phone: { ...settings.publicPage.form.phone, required: e.target.checked },
                                  },
                                },
                              })
                            }
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Custom questions</div>
                        <div className="mt-1 text-xs text-zinc-600">Optional. Add questions you want customers to answer.</div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                        onClick={() => {
                          const id = `q_${Date.now().toString(36)}`;
                          const next: ReviewQuestion = { id, label: "Question", required: false, kind: "short" };
                          setSettings({
                            ...settings,
                            publicPage: {
                              ...settings.publicPage,
                              form: { ...settings.publicPage.form, questions: [...(settings.publicPage.form.questions || []), next].slice(0, 25) },
                            },
                          });
                        }}
                      >
                        Add question
                      </button>
                    </div>

                    {settings.publicPage.form.questions?.length ? (
                      <div className="mt-3 space-y-3">
                        {settings.publicPage.form.questions.map((q) => (
                          <div key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <div className="space-y-3">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-zinc-600">Question</div>
                                <input
                                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                                  value={q.label}
                                  onChange={(e) => {
                                    const nextQs = (settings.publicPage.form.questions || []).map((x) =>
                                      x.id === q.id ? { ...x, label: e.target.value.slice(0, 120) } : x,
                                    );
                                    setSettings({
                                      ...settings,
                                      publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: nextQs } },
                                    });
                                  }}
                                  placeholder="e.g. What service did you get?"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  onClick={() => {
                                    const qs = settings.publicPage.form.questions || [];
                                    const idx = qs.findIndex((x) => x.id === q.id);
                                    if (idx <= 0) return;
                                    const next = [...qs];
                                    const tmp = next[idx - 1];
                                    next[idx - 1] = next[idx];
                                    next[idx] = tmp;
                                    setSettings({
                                      ...settings,
                                      publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: next } },
                                    });
                                  }}
                                >
                                  Up
                                </button>

                                <button
                                  type="button"
                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  onClick={() => {
                                    const qs = settings.publicPage.form.questions || [];
                                    const idx = qs.findIndex((x) => x.id === q.id);
                                    if (idx < 0 || idx >= qs.length - 1) return;
                                    const next = [...qs];
                                    const tmp = next[idx + 1];
                                    next[idx + 1] = next[idx];
                                    next[idx] = tmp;
                                    setSettings({
                                      ...settings,
                                      publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: next } },
                                    });
                                  }}
                                >
                                  Down
                                </button>

                                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                                  <input
                                    type="checkbox"
                                    checked={q.required}
                                    onChange={(e) => {
                                      const nextQs = (settings.publicPage.form.questions || []).map((x) =>
                                        x.id === q.id ? { ...x, required: e.target.checked } : x,
                                      );
                                      setSettings({
                                        ...settings,
                                        publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: nextQs } },
                                      });
                                    }}
                                  />
                                  Required
                                </label>

                                <select
                                  className="h-9 min-w-[170px] rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                                  value={q.kind}
                                  onChange={(e) => {
                                    const kind = e.target.value as ReviewQuestionKind;
                                    const nextQs = (settings.publicPage.form.questions || []).map((x) => {
                                      if (x.id !== q.id) return x;
                                      const next: ReviewQuestion = { ...x, kind };
                                      if (kind !== "single_choice" && kind !== "multiple_choice") delete (next as any).options;
                                      if ((kind === "single_choice" || kind === "multiple_choice") && (!next.options || next.options.length === 0)) {
                                        next.options = ["Option 1", "Option 2"];
                                      }
                                      return next;
                                    });
                                    setSettings({
                                      ...settings,
                                      publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: nextQs } },
                                    });
                                  }}
                                >
                                  <option value="short">Short answer</option>
                                  <option value="long">Long answer</option>
                                  <option value="single_choice">Single choice</option>
                                  <option value="multiple_choice">Multiple choice</option>
                                </select>

                                <button
                                  type="button"
                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-zinc-50"
                                  onClick={() => {
                                    const nextQs = (settings.publicPage.form.questions || []).filter((x) => x.id !== q.id);
                                    setSettings({
                                      ...settings,
                                      publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: nextQs } },
                                    });
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            {q.kind === "single_choice" || q.kind === "multiple_choice" ? (
                              <div className="mt-3">
                                <div className="text-xs font-semibold text-zinc-600">Options (one per line)</div>
                                <textarea
                                  className="mt-1 min-h-[90px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  value={(q.options || []).join("\n")}
                                  onChange={(e) => {
                                    const options = e.target.value
                                      .split("\n")
                                      .map((x) => x.trim())
                                      .filter(Boolean)
                                      .slice(0, 12);
                                    const nextQs = (settings.publicPage.form.questions || []).map((x) => (x.id === q.id ? { ...x, options } : x));
                                    setSettings({
                                      ...settings,
                                      publicPage: { ...settings.publicPage, form: { ...settings.publicPage.form, questions: nextQs } },
                                    });
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-zinc-600">No custom questions yet.</div>
                    )}
                  </div>
                </div>
              </PortalSettingsSection>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={saving || !isDirty}
                onClick={() => save(settings)}
                type="button"
              >
                {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
              </button>
              <button
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm hover:bg-zinc-50"
                onClick={load}
                type="button"
              >
                Refresh
              </button>
              {saving ? <div className="text-xs text-neutral-500">Please wait…</div> : null}
            </div>
          </div>
        </div>

        <div className={tab === "reviews" ? "" : "hidden"}>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col gap-1">
              <div className="text-lg font-semibold text-zinc-900">Reviews</div>
              <div className="text-sm text-zinc-600">Manual sends, recent activity, and received reviews.</div>
            </div>

          {!settings.automation.manualSend ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Manual sends are off in Settings.
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Search bookings by name, email, phone, or ID"
              value={bookingQuery}
              onChange={(e) => setBookingQuery(e.target.value)}
              disabled={!settings.automation.manualSend}
            />
            <button
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm hover:bg-zinc-50"
              disabled={bookingsLoading || !settings.automation.manualSend}
              onClick={loadBookings}
              type="button"
            >
              {bookingsLoading ? "Loading…" : "Load bookings"}
            </button>
          </div>
          {sendResult ? <div className="mt-2 text-sm text-emerald-700">{sendResult}</div> : null}

          <div className="mt-4">
            <div className="text-sm font-medium">Recent bookings</div>
            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <div className="grid grid-cols-1 gap-0">
                {(filteredRecent.length === 0 && filteredUpcoming.length === 0) ? (
                  <div className="p-4 text-sm text-neutral-600">No bookings loaded yet.</div>
                ) : null}

                {filteredRecent.slice(0, 25).map((b) => {
                  const ended = Date.now() >= new Date(b.endAt).getTime();
                  const calendarAllowed = isCalendarAllowedForBooking(b.calendarId);
                  const canSend = settings.automation.manualSend && ended && b.status === "SCHEDULED" && calendarAllowed && !sending;
                  return (
                    <div key={b.id} className="flex flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{b.contactName}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                          <span>{new Date(b.startAt).toLocaleString()}</span>
                          <span className="truncate">{b.contactPhone || "(no phone)"}</span>
                          <span className={b.status === "CANCELED" ? "text-red-700" : ""}>{b.status}</span>
                          <span className="truncate">{calendarLabel(b.calendarId)}</span>
                          {!ended ? <span className="text-amber-700">Not ended yet</span> : null}
                          {!calendarAllowed ? <span className="text-amber-700">Calendar is off</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="h-9 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-60"
                          disabled={!canSend}
                          onClick={() => manualSend(b.id)}
                          type="button"
                        >
                          {sending ? "Sending…" : "Send"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {filteredUpcoming.length ? (
              <div className="mt-4">
                <div className="text-sm font-medium">Upcoming bookings</div>
                <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  {filteredUpcoming.slice(0, 10).map((b) => (
                    <div key={b.id} className="flex flex-col gap-1 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{b.contactName}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                          <span>{new Date(b.startAt).toLocaleString()}</span>
                          <span className="truncate">{b.contactPhone || "(no phone)"}</span>
                          <span>{b.status}</span>
                          <span className="truncate">{calendarLabel(b.calendarId)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-amber-700">
                        {!isCalendarAllowedForBooking(b.calendarId) ? "Calendar is off" : "Can’t send until it ends"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="text-lg font-semibold">Recent activity</div>
            <div className="mt-3 space-y-2">
              {events.length === 0 ? <div className="text-sm text-neutral-600">No activity yet.</div> : null}
              {events.map((e) => (
                <div key={e.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {e.status} — {e.contactName || "(no name)"}
                    </div>
                    <div className="text-xs text-neutral-500">{new Date(e.createdAtIso).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Booking: <span className="font-mono">{e.bookingId}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">To: {e.smsTo || "—"}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Link: <a className="underline" href={e.destinationUrl} target="_blank" rel="noreferrer">
                      {e.destinationLabel}
                    </a>
                  </div>
                  {e.reason ? <div className="mt-1 text-xs text-amber-700">Reason: {e.reason}</div> : null}
                  {e.error ? <div className="mt-1 text-xs text-red-700">Error: {e.error}</div> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-lg font-semibold">Received reviews</div>
            <div className="mt-1 text-sm text-zinc-600">Reviews submitted on your public reviews page.</div>

            <div className="mt-3 space-y-2">
              {receivedReviews.length === 0 ? <div className="text-sm text-zinc-600">No reviews yet.</div> : null}

              {receivedReviews.slice(0, 50).map((r) => {
                const rating = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
                const photos = Array.isArray(r.photoUrls) ? (r.photoUrls as string[]) : [];
                const archived = Boolean(r.archivedAt);
                const isEditingReply = replyEditingId === r.id;
                return (
                  <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{r.name}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                          <span className="font-mono">{r.id.slice(0, 10)}…</span>
                          <span>•</span>
                          <span>{new Date(r.createdAt).toLocaleString()}</span>
                          {archived ? (
                            <>
                              <span>•</span>
                              <span className="text-amber-700 font-semibold">Archived</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                        onClick={() => void setReviewArchived(r.id, !archived)}
                      >
                        {archived ? "Unarchive" : "Archive"}
                      </button>
                    </div>

                    <div className="mt-2 text-sm text-zinc-900">
                      {"★".repeat(rating)}
                      <span className="text-zinc-300">{"★".repeat(5 - rating)}</span>
                    </div>

                    {r.body ? <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{r.body}</div> : null}

                    {photos.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {photos.slice(0, 8).map((u) => (
                          <button
                            key={u}
                            type="button"
                            className="h-20 w-20 overflow-hidden rounded-xl"
                            onClick={() => openLightbox(photos, photos.indexOf(u))}
                            aria-label="Open photo"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      {r.businessReply && !isEditingReply ? (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-zinc-700">Public response</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                onClick={() => {
                                  setReplyDrafts((prev) => ({ ...prev, [r.id]: typeof r.businessReply === "string" ? r.businessReply : "" }));
                                  setReplyEditingId(r.id);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-zinc-50"
                                disabled={replySavingId === r.id}
                                onClick={() => {
                                  if (!window.confirm("Delete this public response?")) return;
                                  setReplyDrafts((prev) => ({ ...prev, [r.id]: "" }));
                                  void saveReviewReply(r.id, "");
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{r.businessReply}</div>
                          <div className="mt-2 text-xs text-zinc-500">
                            {r.businessReplyAt ? `Last replied: ${new Date(r.businessReplyAt).toLocaleString()}` : null}
                          </div>
                        </div>
                      ) : null}

                      {!r.businessReply && !isEditingReply ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs text-zinc-600">No public response yet.</div>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-60"
                            disabled={replySavingId === r.id}
                            onClick={() => {
                              setReplyDrafts((prev) => ({ ...prev, [r.id]: prev[r.id] ?? "" }));
                              setReplyEditingId(r.id);
                            }}
                          >
                            Write reply
                          </button>
                        </div>
                      ) : null}

                      {isEditingReply ? (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-zinc-700">Public reply (shows on your reviews page)</div>
                          <textarea
                            className="mt-2 min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            value={replyDrafts[r.id] ?? ""}
                            onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            placeholder="Write a response…"
                          />
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-zinc-500">
                              {r.businessReplyAt ? `Last replied: ${new Date(r.businessReplyAt).toLocaleString()}` : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                disabled={replySavingId === r.id}
                                onClick={() => {
                                  setReplyDrafts((prev) => ({
                                    ...prev,
                                    [r.id]: typeof r.businessReply === "string" ? r.businessReply : "",
                                  }));
                                  setReplyEditingId(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-60"
                                disabled={replySavingId === r.id}
                                onClick={() => void saveReviewReply(r.id)}
                              >
                                {replySavingId === r.id ? "Saving…" : "Save reply"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-lg font-semibold">Q&amp;A</div>
            <div className="mt-1 text-sm text-zinc-600">Questions asked by visitors on your public reviews page.</div>

            <div className="mt-3 space-y-2">
              {qaQuestions.length === 0 ? <div className="text-sm text-zinc-600">No questions yet.</div> : null}
              {qaQuestions.slice(0, 50).map((q) => (
                <div key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{q.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{new Date(q.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-xs font-mono text-zinc-500">{q.id.slice(0, 10)}…</div>
                  </div>

                  <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{q.question}</div>

                  <div className="mt-3">
                    {q.answer && qaEditingId !== q.id ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-700">Answer</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                              onClick={() => {
                                setQaAnswerDrafts((prev) => ({ ...prev, [q.id]: typeof q.answer === "string" ? q.answer : "" }));
                                setQaEditingId(q.id);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-zinc-50"
                              disabled={qaSavingId === q.id}
                              onClick={() => {
                                if (!window.confirm("Delete this answer?")) return;
                                setQaAnswerDrafts((prev) => ({ ...prev, [q.id]: "" }));
                                void saveQaAnswer(q.id, "");
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{q.answer}</div>
                        <div className="mt-2 text-xs text-zinc-500">
                          {q.answeredAt ? `Answered: ${new Date(q.answeredAt).toLocaleString()}` : null}
                        </div>
                      </div>
                    ) : null}

                    {!q.answer && qaEditingId !== q.id ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs text-zinc-600">Not answered yet.</div>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-60"
                          disabled={qaSavingId === q.id}
                          onClick={() => {
                            setQaAnswerDrafts((prev) => ({ ...prev, [q.id]: prev[q.id] ?? "" }));
                            setQaEditingId(q.id);
                          }}
                        >
                          Write answer
                        </button>
                      </div>
                    ) : null}

                    {qaEditingId === q.id ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-700">Answer</div>
                        <textarea
                          className="mt-2 min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={qaAnswerDrafts[q.id] ?? ""}
                          onChange={(e) => setQaAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Write an answer…"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-zinc-500">
                            {q.answeredAt ? `Answered: ${new Date(q.answeredAt).toLocaleString()}` : ""}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                              disabled={qaSavingId === q.id}
                              onClick={() => {
                                setQaAnswerDrafts((prev) => ({ ...prev, [q.id]: typeof q.answer === "string" ? q.answer : "" }));
                                setQaEditingId(null);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-60"
                              disabled={qaSavingId === q.id}
                              onClick={() => void saveQaAnswer(q.id, qaAnswerDrafts[q.id] ?? "")}
                            >
                              {qaSavingId === q.id ? "Saving…" : "Save answer"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>

      <PortalVariablePickerModal
        open={varPickerOpen}
        onClose={() => setVarPickerOpen(false)}
        variables={REVIEW_TEMPLATE_VARIABLES}
        title="Insert variable"
        onPick={(key) => {
          const target = varPickerTarget;
          if (!target) return;

          const token = `{${key}}`;

          if (target.kind === "default") {
            const { next, cursor } = insertAtCursor(settings.messageTemplate || "", token, activeTemplateElRef.current);
            setSettings({ ...settings, messageTemplate: next });
            queueMicrotask(() => {
              const el = activeTemplateElRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
            return;
          }

          const currentMap =
            settings.calendarMessageTemplates && typeof settings.calendarMessageTemplates === "object" ? settings.calendarMessageTemplates : {};
          const base = String(currentMap[target.calendarId] ?? "");
          const { next, cursor } = insertAtCursor(base, token, activeTemplateElRef.current);
          const nextMap = { ...currentMap, [target.calendarId]: next };
          setSettings({ ...settings, calendarMessageTemplates: nextMap });
          queueMicrotask(() => {
            const el = activeTemplateElRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(cursor, cursor);
          });
        }}
      />
    </div>
  );
}
