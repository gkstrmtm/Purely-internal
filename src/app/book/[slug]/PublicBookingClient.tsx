"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useOptionalToast } from "@/components/ToastProvider";
import { notifyParentCreditFunnelEvent, readTrackingContextFromWindow } from "@/components/funnel/clientFunnelTracking";
import { normalizeBookingSurfaceContext, type BookingSurfaceContext } from "@/lib/funnelBookingSurface";
import { deriveHostedBrandTheme, type HostedBrandThemeInput } from "@/lib/hostedBrandTheme";

type Site = {
  enabled: boolean;
  slug: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  timeZone: string;
  hostName?: string | null;
  businessName?: string | null;
  logoUrl?: string | null;
  brandPrimaryHex?: string | null;
  brandSecondaryHex?: string | null;
  brandAccentHex?: string | null;
  brandTextHex?: string | null;
  photoUrl?: string | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  hostedThemeSource?: "account" | "funnel" | null;

  hostedTheme?: HostedBrandThemeInput["overrides"] | null;

  externalHandoff?: {
    enabled: boolean;
    handoffMode: "direct_book" | "lead_first";
    offerName: string;
    providerKey: string;
    providerLabel: string;
    detectionConfidence: "high" | "low";
    destinationHost: string;
    handoffPath: string;
    portalVariant?: "portal" | "credit" | null;
  } | null;

  form?: {
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
};

type Slot = { startAt: string; endAt: string };

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
};

type Step = "date" | "time" | "details";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function normalizeInlineSurfaceText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
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

function getApiError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  return typeof rec.error === "string" ? rec.error : undefined;
}

export type PublicBookingTarget =
  | { kind: "slug"; slug: string; funnelId?: string | null; pageId?: string | null; themeStage?: "current" | "published" | null }
  | {
      kind: "calendar";
      ownerId: string;
      calendarId: string;
      funnelId?: string | null;
      pageId?: string | null;
      themeStage?: "current" | "published" | null;
    };

function bookingApiBase(target: PublicBookingTarget) {
  if (target.kind === "slug") return `/api/public/booking/${encodeURIComponent(target.slug)}`;
  return `/api/public/booking/u/${encodeURIComponent(target.ownerId)}/${encodeURIComponent(target.calendarId)}`;
}

function bookingTargetSearchParams(target: PublicBookingTarget) {
  const funnelId = String(target.funnelId || "").trim();
  const pageId = String(target.pageId || "").trim();
  const themeStage = target.themeStage === "published" ? "published" : target.themeStage === "current" ? "current" : "";
  const params = new URLSearchParams();
  if (funnelId) params.set("funnelId", funnelId);
  if (pageId) params.set("pageId", pageId);
  if (themeStage) params.set("themeStage", themeStage);
  return params;
}

function bookingApiUrl(target: PublicBookingTarget, path: "/settings" | "/suggestions" | "/book") {
  const base = `${bookingApiBase(target)}${path}`;
  const params = bookingTargetSearchParams(target);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PublicBookingClient({
  target,
  showBranding = true,
  presentation = "page",
  surfaceContext = null,
}: {
  target: PublicBookingTarget;
  showBranding?: boolean;
  presentation?: "page" | "inline";
  surfaceContext?: BookingSurfaceContext | null;
}) {
  const toast = useOptionalToast();
  const [site, setSite] = useState<Site | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [step, setStep] = useState<Step>("date");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Booking | null>(null);
  const [rescheduleUrl, setRescheduleUrl] = useState<string | null>(null);
  const [successMeetingLocation, setSuccessMeetingLocation] = useState<string | null>(null);
  const isInlinePresentation = presentation === "inline";
  const resolvedSurfaceContext = useMemo(() => normalizeBookingSurfaceContext(surfaceContext), [surfaceContext]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const bookingBase =
    target.kind === "slug"
      ? `/api/public/booking/${encodeURIComponent(target.slug)}`
      : `/api/public/booking/u/${encodeURIComponent(target.ownerId)}/${encodeURIComponent(target.calendarId)}`;
  const targetKey = `${bookingBase}::${String(target.funnelId || "").trim()}::${String(target.pageId || "").trim()}::${String(target.themeStage || "").trim()}`;
  const settingsUrl = useMemo(() => bookingApiUrl(target, "/settings"), [targetKey]);

  const canBook = useMemo(() => {
    if (!selected) return false;
    if (!name.trim() || !email.trim()) return false;
    const form = site?.form;
    if (form?.phone?.enabled && form.phone.required && !phone.trim()) return false;
    if (form?.notes?.enabled && form.notes.required && !notes.trim()) return false;
    if (form?.questions?.length) {
      for (const q of form.questions) {
        const a = answers[q.id];
        if (!q.required) continue;
        if (q.kind === "multiple_choice") {
          if (!Array.isArray(a) || a.length === 0) return false;
          continue;
        }
        if (typeof a !== "string" || !a.trim()) return false;
      }
    }
    return true;
  }, [answers, email, name, notes, phone, selected, site?.form]);

  const externalHandoff = site?.externalHandoff ?? null;
  const externalHandoffEnabled = Boolean(externalHandoff?.enabled && externalHandoff.handoffPath);
  const leadFirstHandoff = externalHandoff?.handoffMode === "lead_first";
  const canSubmitLeadFirstHandoff = Boolean(name.trim() && (email.trim() || phone.trim()));

  const theme = useMemo(() => {
    const prefersFunnelTheme = site?.hostedThemeSource === "funnel";
    return deriveHostedBrandTheme({
      brandPrimaryHex: prefersFunnelTheme ? null : site?.brandPrimaryHex ?? null,
      brandSecondaryHex: prefersFunnelTheme ? null : site?.brandSecondaryHex ?? null,
      brandAccentHex: prefersFunnelTheme ? null : site?.brandAccentHex ?? null,
      brandTextHex: prefersFunnelTheme ? null : site?.brandTextHex ?? null,
      overrides: site?.hostedTheme ?? null,
    });
  }, [site?.brandAccentHex, site?.brandPrimaryHex, site?.brandSecondaryHex, site?.brandTextHex, site?.hostedTheme, site?.hostedThemeSource]);

  const bookingStyleVars = useMemo(
    () =>
      ({
        ["--booking-bg" as any]: theme.bgHex,
        ["--booking-surface" as any]: theme.cardSurfaceHex,
        ["--booking-soft" as any]: theme.softHex,
        ["--booking-border" as any]: theme.borderHex,
        ["--booking-muted" as any]: theme.mutedTextHex,
        ["--booking-primary" as any]: theme.ctaHex,
        ["--booking-on-primary" as any]: theme.onCtaHex,
        ["--booking-link" as any]: theme.linkHex,
        ["--booking-text" as any]: theme.textHex,
      }) as any,
    [
      theme.bgHex,
      theme.borderHex,
      theme.cardSurfaceHex,
      theme.ctaHex,
      theme.linkHex,
      theme.mutedTextHex,
      theme.onCtaHex,
      theme.softHex,
      theme.textHex,
    ],
  );

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = toYmd(new Date(s.startAt));
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      map.set(k, list);
    }
    return map;
  }, [slots]);

  const daySlots = useMemo(() => {
    if (!selectedDate) return [];
    return slotsByDay.get(selectedDate) ?? [];
  }, [selectedDate, slotsByDay]);

  const inlineShellStyle = resolvedSurfaceContext?.shellStyle ?? "default";
  const inlineShellDensity = resolvedSurfaceContext?.shellDensity ?? "comfortable";
  const compactEditorialSurface = isInlinePresentation && inlineShellStyle === "editorial" && inlineShellDensity === "compact";
  const inlineSurfacePanelStyle = {
    borderColor: "color-mix(in srgb, var(--booking-text) 7%, transparent)",
    background: "color-mix(in srgb, var(--booking-surface) 96%, var(--booking-soft))",
  } as const;
  const inlineSurfaceInsetStyle = {
    borderColor: "color-mix(in srgb, var(--booking-text) 6%, transparent)",
    background: "color-mix(in srgb, var(--booking-bg) 94%, var(--booking-soft))",
  } as const;
  const showInlineSurfaceContext = false;

  const inlineOuterCardClassName = isInlinePresentation
    ? inlineShellDensity === "compact"
      ? "rounded-[28px] border p-5 sm:p-6"
      : "rounded-[30px] border p-6 sm:p-6.5"
    : "rounded-3xl border p-8";

  const inlineHeaderLayoutClassName = compactEditorialSurface
    ? "space-y-3"
    : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]";
  const inlineContextDividerStyle = {
    borderColor: "color-mix(in srgb, var(--booking-text) 6%, transparent)",
  } as const;
  const inlineSurfaceTitleMatchesSite = Boolean(
    normalizeInlineSurfaceText(site?.title) &&
      normalizeInlineSurfaceText(resolvedSurfaceContext?.title) &&
      normalizeInlineSurfaceText(site?.title) === normalizeInlineSurfaceText(resolvedSurfaceContext?.title),
  );
  const showInlineProofPanel = Boolean(!compactEditorialSurface && (resolvedSurfaceContext?.proofLabel || resolvedSurfaceContext?.proofBody));

  const inlineContextPanel = showInlineSurfaceContext ? (
    <div className="mb-4 overflow-hidden rounded-[22px] border" style={inlineSurfacePanelStyle}>
      <div className={classNames("px-5 py-4 sm:px-6", compactEditorialSurface ? "sm:py-4.5" : "sm:py-5", inlineHeaderLayoutClassName)}>
        <div className={classNames(showInlineProofPanel ? "lg:pr-6" : "") }>
          {resolvedSurfaceContext?.kicker ? (
            <div
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--booking-link)" }}
            >
              {resolvedSurfaceContext.kicker}
            </div>
          ) : null}
          {resolvedSurfaceContext?.title && !inlineSurfaceTitleMatchesSite ? (
            <div
              className={classNames("mt-2 font-semibold tracking-[-0.03em]", inlineShellDensity === "compact" ? "text-[1.65rem] leading-[1.05]" : "text-[clamp(1.55rem,2.4vw,2rem)] leading-[1.06]")}
              style={{ color: "var(--booking-text)" }}
            >
              {resolvedSurfaceContext.title}
            </div>
          ) : null}
          {resolvedSurfaceContext?.body ? (
            <p
              className="mt-3 max-w-[60ch] text-sm leading-6.5 sm:text-[15px]"
              style={{ color: "var(--booking-muted)" }}
            >
              {resolvedSurfaceContext.body}
            </p>
          ) : null}
          {resolvedSurfaceContext?.note ? (
            compactEditorialSurface ? (
              <div className="mt-4 border-t pt-4 text-sm leading-6" style={{ ...inlineContextDividerStyle, color: "var(--booking-muted)" }}>
                {resolvedSurfaceContext.note}
              </div>
            ) : (
              <div
                className="mt-4 rounded-2xl border px-4 py-3 text-sm leading-6"
                style={{ ...inlineSurfaceInsetStyle, color: "var(--booking-text)" }}
              >
                {resolvedSurfaceContext.note}
              </div>
            )
          ) : null}
          {compactEditorialSurface && (resolvedSurfaceContext?.proofLabel || resolvedSurfaceContext?.proofBody) ? (
            <div className="mt-4 border-t pt-4" style={inlineContextDividerStyle}>
              {resolvedSurfaceContext?.proofLabel ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--booking-link)" }}>
                  {resolvedSurfaceContext.proofLabel}
                </div>
              ) : null}
              {resolvedSurfaceContext?.proofBody ? (
                <div className="mt-2 text-sm leading-6" style={{ color: "var(--booking-text)" }}>
                  {resolvedSurfaceContext.proofBody}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {showInlineProofPanel ? (
          <div
            className="border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
            style={inlineContextDividerStyle}
          >
            {resolvedSurfaceContext?.proofLabel ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--booking-link)" }}>
                {resolvedSurfaceContext.proofLabel}
              </div>
            ) : null}
            {resolvedSurfaceContext?.proofBody ? (
              <div className="mt-3 text-sm leading-7 sm:text-[15px]" style={{ color: "var(--booking-text)" }}>
                {resolvedSurfaceContext.proofBody}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const loadSettings = useCallback(async () => {
    const res = await fetch(settingsUrl, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(getApiError(body) ?? "Booking page not found");
    setSite((body as { site: Site }).site);
  }, [settingsUrl]);

  async function loadSlots(fromIso?: string) {
    setSlotsLoading(true);
    setError(null);
    try {
      const startAt = fromIso ? new Date(fromIso) : new Date();
      startAt.setHours(0, 0, 0, 0);

      const url = new URL(bookingApiUrl(target, "/suggestions"), window.location.origin);
      url.searchParams.set("startAt", startAt.toISOString());
      url.searchParams.set("days", "30");
      url.searchParams.set("durationMinutes", String(site?.durationMinutes ?? 30));
      url.searchParams.set("limit", "50");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiError(body) ?? "Failed to load available times");
      setSlots((body as { slots?: Slot[] }).slots ?? []);
    } finally {
      setSlotsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadSettings();
        if (!mounted) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Booking page not found");
        setLoading(false);
        return;
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [loadSettings, targetKey]);

  useEffect(() => {
    // When changing months, reset selection and load a fresh 30-day window.
    if (!site) return;
    if (site.externalHandoff?.enabled) {
      setSlots([]);
      setSelected(null);
      setSelectedDate(null);
      setStep("date");
      return;
    }
    if (!site.enabled) {
      setSlots([]);
      setSelected(null);
      setSelectedDate(null);
      setStep("date");
      return;
    }
    setSelected(null);
    setSelectedDate(null);
    setStep("date");
    loadSlots(month.toISOString()).catch((e) => setError(e instanceof Error ? e.message : "Failed to load times"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.getTime(), site?.slug, site?.durationMinutes]);

  function continueToDirectHandoff() {
    if (!externalHandoff?.handoffPath || handoffBusy) return;
    setHandoffBusy(true);
    setError(null);
    window.location.assign(externalHandoff.handoffPath);
  }

  async function submitLeadFirstHandoff() {
    if (!externalHandoff?.handoffPath || handoffBusy) return;
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Please add an email or phone number before continuing.");
      return;
    }

    setHandoffBusy(true);
    setError(null);

    try {
      const res = await fetch(externalHandoff.handoffPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(getApiError(body) ?? "Could not continue to the external booking page.");
        setHandoffBusy(false);
        return;
      }

      const redirectTo = typeof (body as any)?.redirectTo === "string" ? String((body as any).redirectTo).trim() : "";
      if (!redirectTo) {
        setError("Could not continue to the external booking page.");
        setHandoffBusy(false);
        return;
      }

      window.location.assign(redirectTo);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not continue to the external booking page.");
      setHandoffBusy(false);
    }
  }

  async function book() {
    if (!selected) return;
    if (!site?.enabled) {
      setError("This booking link isn’t accepting bookings yet.");
      return;
    }

    const form = site?.form;
    if (form?.phone?.enabled && form.phone.required && !phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (form?.notes?.enabled && form.notes.required && !notes.trim()) {
      setError("Please add notes.");
      return;
    }
    if (form?.questions?.length) {
      for (const q of form.questions) {
        const a = answers[q.id];
        if (!q.required) continue;
        if (q.kind === "multiple_choice") {
          if (!Array.isArray(a) || a.length === 0) {
            setError(`Please answer: ${q.label}`);
            return;
          }
          continue;
        }
        if (typeof a !== "string" || !a.trim()) {
          setError(`Please answer: ${q.label}`);
          return;
        }
      }
    }

    setBookingBusy(true);
    setError(null);

    const res = await fetch(bookingApiUrl(target, "/book"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startAt: selected,
        contactName: name,
        contactEmail: email,
        contactPhone: form?.phone?.enabled ? (phone.trim() ? phone : null) : null,
        notes: form?.notes?.enabled ? (notes.trim() ? notes : null) : null,
        answers,
        trackingContext: readTrackingContextFromWindow(),
      }),
    });

    const body = await res.json().catch(() => ({}));
    setBookingBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Could not book that time.");
      if (res.status === 409) {
        await loadSlots(selected).catch(() => null);
      }
      return;
    }

    setSuccess((body as { booking: Booking }).booking);
    setRescheduleUrl(typeof (body as any).rescheduleUrl === "string" ? ((body as any).rescheduleUrl as string) : null);
    setSuccessMeetingLocation(typeof (body as any).meetingLocation === "string" ? ((body as any).meetingLocation as string) : null);
    notifyParentCreditFunnelEvent({
      eventType: "booking_created",
      pageId: readTrackingContextFromWindow().pageId || null,
      payload: { bookingId: (body as any)?.booking?.id || null },
    });
  }

  if (loading) {
    return (
      <div
        className={isInlinePresentation ? "w-full" : "min-h-screen"}
        style={{ ...(bookingStyleVars as any), backgroundColor: isInlinePresentation ? "transparent" : "var(--booking-bg)", color: "var(--booking-text)" }}
      >
        <div className={isInlinePresentation ? "w-full" : "mx-auto max-w-3xl px-6 py-12"}>
          <div
            aria-busy="true"
            className={isInlinePresentation ? inlineOuterCardClassName : "rounded-3xl border p-8"}
            style={{ borderColor: "var(--booking-border)", backgroundColor: "var(--booking-surface)" }}
          >
            <div className="animate-pulse">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="h-6 w-40 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--booking-text) 10%, transparent)" }} />
                  <div className="mt-3 h-4 w-full max-w-xl rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--booking-text) 8%, transparent)" }} />
                  <div className="mt-2 h-4 w-40 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--booking-text) 8%, transparent)" }} />
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="h-4 w-28 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--booking-text) 10%, transparent)" }} />
                  <div className="mt-4 h-10 w-full rounded-2xl" style={{ backgroundColor: "color-mix(in srgb, var(--booking-soft) 82%, var(--booking-surface))", border: "1px solid var(--booking-border)" }} />
                  <div className="mt-4 grid grid-cols-7 gap-2">
                    {Array.from({ length: 14 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 rounded-2xl"
                        style={{ backgroundColor: "color-mix(in srgb, var(--booking-soft) 88%, var(--booking-surface))", border: "1px solid var(--booking-border)" }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="h-4 w-20 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--booking-text) 10%, transparent)" }} />
                  <div className="mt-3 space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 rounded-2xl"
                        style={{ backgroundColor: "color-mix(in srgb, var(--booking-soft) 88%, var(--booking-surface))", border: "1px solid var(--booking-border)" }}
                      />
                    ))}
                    <div
                      className="h-11 rounded-2xl"
                      style={{ backgroundColor: "color-mix(in srgb, var(--booking-primary) 22%, var(--booking-surface))" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !site) {
    return (
      <div
        className={isInlinePresentation ? "w-full" : "min-h-screen"}
        style={{ ...(bookingStyleVars as any), backgroundColor: isInlinePresentation ? "transparent" : "var(--booking-bg)", color: "var(--booking-text)" }}
      >
        <div className={isInlinePresentation ? "w-full" : "mx-auto max-w-3xl px-6 py-12"}>
          <div className="rounded-3xl border p-6" style={{ borderColor: "var(--booking-border)", backgroundColor: "var(--booking-surface)" }}>
            <div className="text-base font-semibold" style={{ color: "var(--booking-text)" }}>
              Booking page not found
            </div>
            <div className="mt-2 text-sm" style={{ color: "var(--booking-muted)" }}>
              {error}
            </div>
            <div className="mt-6">
              <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: "var(--booking-link)" }}>
                Back to Purely Automation
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success && site) {
    const thankYou = (site.form?.thankYouMessage ?? "").trim();
    return (
      <div
        className={isInlinePresentation ? "w-full" : "min-h-screen"}
        style={{
          ...(bookingStyleVars as any),
          backgroundColor: isInlinePresentation ? "transparent" : "var(--booking-bg)",
          color: "var(--booking-text)",
        }}
      >
        <div className={isInlinePresentation ? "w-full" : "mx-auto max-w-3xl px-6 py-12"}>
          <div className={isInlinePresentation ? inlineOuterCardClassName : "rounded-3xl border p-8"} style={{ borderColor: "var(--booking-border)", backgroundColor: "var(--booking-surface)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--booking-link)" }}>
              Booked
            </div>
            <div className="mt-3 flex items-center gap-3">
              {site.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.businessName ?? site.title} className="h-9 w-auto" />
              ) : null}
              <h1 className="text-2xl font-bold" style={{ color: "var(--booking-text)" }}>
                You’re all set.
              </h1>
            </div>
            <p className="mt-3 text-sm" style={{ color: "var(--booking-muted)" }}>
              {new Date(success.startAt).toLocaleString()} ({site.durationMinutes} minutes)
            </p>
            {(successMeetingLocation || site.meetingLocation) ? (
              <div className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--booking-muted)" }}>
                Location: {successMeetingLocation || site.meetingLocation}
              </div>
            ) : null}
            {site.meetingDetails ? (
              <div className="mt-1 text-sm" style={{ color: "var(--booking-muted)" }}>
                {site.meetingDetails}
              </div>
            ) : null}
            <div className="mt-6 text-sm" style={{ color: "var(--booking-text)" }}>
              {thankYou ? thankYou : "You can close this window."}
            </div>

            {rescheduleUrl ? (
              <div className="mt-6">
                <a
                  href={rescheduleUrl}
                  className="inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:brightness-[0.99]"
                  style={{ borderColor: "var(--booking-border)", backgroundColor: "var(--booking-surface)", color: "var(--booking-text)" }}
                >
                  Reschedule
                </a>
              </div>
            ) : null}

            {showBranding ? (
              <div className="mt-8 border-t pt-6 text-center text-xs" style={{ borderColor: "var(--booking-border)", color: "var(--booking-muted)" }}>
                <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--booking-link)" }}>
                  Powered by Purely Automation
                </Link>
                <span className="px-2">•</span>
                <Link href="/#demo" className="font-semibold hover:underline" style={{ color: "var(--booking-link)" }}>
                  Create your own booking link
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (site && externalHandoffEnabled) {
    const externalHandoffData = externalHandoff!;
    const handoffTitle = externalHandoffData.offerName.trim() || site.title || "Booking handoff";
    const providerLabel = externalHandoffData.providerLabel || "External booking page";

    return (
      <div
        className={isInlinePresentation ? "w-full" : "min-h-screen"}
        style={{
          ...(bookingStyleVars as any),
          backgroundColor: isInlinePresentation ? "transparent" : "var(--booking-bg)",
          color: "var(--booking-text)",
        }}
      >
        <div className={isInlinePresentation ? "w-full" : "mx-auto max-w-4xl px-6 py-12"}>
          <div className={isInlinePresentation ? inlineOuterCardClassName : "rounded-3xl border p-8"} style={{ borderColor: "var(--booking-border)", backgroundColor: "var(--booking-surface)" }}>
            {inlineContextPanel}
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,360px)] lg:items-start">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--booking-link)" }}>
                  External booking handoff
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight" style={{ color: "var(--booking-text)" }}>
                  {handoffTitle}
                </h1>
                <p className="mt-3 max-w-[62ch] text-sm leading-6" style={{ color: "var(--booking-muted)" }}>
                  {leadFirstHandoff
                    ? `Tell us where to follow up, then Purely will send you to ${providerLabel}. Capturing your details does not confirm a completed booking.`
                    : `Purely can track this handoff, then send you to ${providerLabel}. A click does not prove the appointment was completed.`}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--booking-border)", backgroundColor: "color-mix(in srgb, var(--booking-soft) 72%, var(--booking-surface))" }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--booking-link)" }}>
                      Provider
                    </div>
                    <div className="mt-2 text-sm font-semibold" style={{ color: "var(--booking-text)" }}>
                      {providerLabel}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--booking-muted)" }}>
                      {externalHandoffData.detectionConfidence === "high" ? "High-confidence match" : "Custom or lower-confidence match"}
                    </div>
                  </div>
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--booking-border)", backgroundColor: "color-mix(in srgb, var(--booking-soft) 72%, var(--booking-surface))" }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--booking-link)" }}>
                      Destination
                    </div>
                    <div className="mt-2 text-sm font-semibold break-all" style={{ color: "var(--booking-text)" }}>
                      {externalHandoffData.destinationHost}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--booking-muted)" }}>
                      {leadFirstHandoff ? "Lead-first handoff" : "Direct tracked handoff"}
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border px-4 py-4 text-sm leading-6" style={{ borderColor: "var(--booking-border)", backgroundColor: "color-mix(in srgb, var(--booking-bg) 94%, var(--booking-soft))", color: "var(--booking-text)" }}>
                  Purely tracks the handoff truthfully. It does not claim booking confirmation, calendar sync, or double-booking prevention unless a real provider redirect, webhook, API, or platform-owned booking flow confirms that outcome.
                </div>
              </div>

              <div className="rounded-[28px] border p-5 sm:p-6" style={{ borderColor: "var(--booking-border)", backgroundColor: "color-mix(in srgb, var(--booking-surface) 96%, var(--booking-soft))" }}>
                <div className="text-sm font-semibold" style={{ color: "var(--booking-text)" }}>
                  {leadFirstHandoff ? "Before you continue" : "Continue to booking"}
                </div>
                <div className="mt-2 text-sm leading-6" style={{ color: "var(--booking-muted)" }}>
                  {leadFirstHandoff
                    ? "Share your name and at least one contact method so this handoff can be measured and tied to the right workspace."
                    : "Open the tracked handoff to continue to the external scheduler."}
                </div>

                {leadFirstHandoff ? (
                  <div className="mt-5 space-y-3">
                    <input
                      className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                      style={{ borderColor: "var(--booking-border)" }}
                      placeholder="Name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <input
                      className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                      style={{ borderColor: "var(--booking-border)" }}
                      placeholder="Email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                      className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                      style={{ borderColor: "var(--booking-border)" }}
                      placeholder="Phone (optional)"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => void submitLeadFirstHandoff()}
                      disabled={!canSubmitLeadFirstHandoff || handoffBusy}
                      className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ backgroundColor: "var(--booking-primary)", color: "var(--booking-on-primary)" }}
                    >
                      {handoffBusy ? "Saving and continuing..." : `Continue to ${providerLabel}`}
                    </button>
                  </div>
                ) : (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={continueToDirectHandoff}
                      disabled={handoffBusy}
                      className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ backgroundColor: "var(--booking-primary)", color: "var(--booking-on-primary)" }}
                    >
                      {handoffBusy ? "Opening scheduler..." : `Open ${providerLabel}`}
                    </button>
                  </div>
                )}

                {error ? (
                  <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2", color: "#991b1b" }}>
                    {error}
                  </div>
                ) : null}
              </div>
            </div>

            {showBranding ? (
              <div className="mt-8 border-t pt-6 text-center text-xs" style={{ borderColor: "var(--booking-border)", color: "var(--booking-muted)" }}>
                <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--booking-link)" }}>
                  Powered by Purely Automation
                </Link>
                <span className="px-2">•</span>
                <span>Clicks and lead capture do not prove a completed booking.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={isInlinePresentation ? "w-full" : "min-h-screen"}
      style={{
        ...(bookingStyleVars as any),
        backgroundColor: isInlinePresentation ? "transparent" : "var(--booking-bg)",
        color: "var(--booking-text)",
      }}
    >
      <div className={isInlinePresentation ? "w-full" : "mx-auto max-w-5xl px-6 py-12"}>
          <div
            className={isInlinePresentation ? inlineOuterCardClassName : "rounded-3xl border p-8"}
            style={{
              borderColor: "var(--booking-border)",
              backgroundColor: "var(--booking-surface)",
              boxShadow: isInlinePresentation ? "0 1px 0 rgba(15,23,42,0.03)" : undefined,
            }}
          >
          {inlineContextPanel}
          {!site?.enabled ? (
            isInlinePresentation ? (
              <div className="mb-4 text-sm" style={{ color: "var(--booking-muted)" }}>
                This booking link isn’t accepting bookings yet.
              </div>
            ) : (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                This booking link isn’t accepting bookings yet.
              </div>
            )
          ) : null}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {site?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.businessName ?? site.title} className="h-10 w-auto" />
              ) : null}
              <h1 className="truncate text-2xl font-bold" style={{ color: "var(--booking-text)" }}>
                {site?.title ?? "Book a call"}
              </h1>
            </div>
            {site?.description ? (
              <p className="mt-2 text-sm" style={{ color: "var(--booking-muted)" }}>
                {site.description}
              </p>
            ) : null}
            <div className="mt-2 text-xs" style={{ color: "var(--booking-muted)" }}>
              Meeting length: {site?.durationMinutes ?? 30} minutes
            </div>
            {site?.meetingLocation ? (
              <div className="mt-1 whitespace-pre-line text-xs" style={{ color: "var(--booking-muted)" }}>
                Location: {site.meetingLocation}
              </div>
            ) : null}
            {site?.meetingDetails ? (
              <div className="mt-1 text-xs" style={{ color: "var(--booking-muted)" }}>
                {site.meetingDetails}
              </div>
            ) : null}
          </div>
        </div>

        {site?.photoUrl ? (
          <div className="mt-6 overflow-hidden rounded-3xl border" style={{ borderColor: "var(--booking-border)", backgroundColor: "var(--booking-soft)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.photoUrl} alt="" className="h-48 w-full object-cover" />
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold" style={{ color: "var(--booking-text)" }}>
                {step === "date" ? "Pick a date" : step === "time" ? "Pick a time" : "Confirm details"}
              </div>
              <div className="text-xs font-semibold" style={{ color: "var(--booking-muted)" }}>
                {step === "date" ? "Step 1/3" : step === "time" ? "Step 2/3" : "Step 3/3"}
              </div>
            </div>

            {step === "date" ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="rounded-2xl border bg-(--booking-surface) px-3 py-2 text-sm font-semibold text-(--booking-text) transition hover:bg-(--booking-soft)"
                    style={{ borderColor: "var(--booking-border)" }}
                    onClick={() => setMonth((m) => addMonths(m, -1))}
                  >
                    Prev
                  </button>
                  <div className="text-sm font-semibold" style={{ color: "var(--booking-text)" }}>
                    {monthLabel(month)}
                  </div>
                  <button
                    type="button"
                    className="rounded-2xl border bg-(--booking-surface) px-3 py-2 text-sm font-semibold text-(--booking-text) transition hover:bg-(--booking-soft)"
                    style={{ borderColor: "var(--booking-border)" }}
                    onClick={() => setMonth((m) => addMonths(m, 1))}
                  >
                    Next
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-(--booking-muted)">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-2">
                  {makeMonthGrid(month).map((d) => {
                    const ymd = toYmd(d);
                    const inMonth = d.getMonth() === month.getMonth();
                    const hasTimes = (slotsByDay.get(ymd)?.length ?? 0) > 0;
                    const isSelected = selectedDate === ymd;
                    return (
                      <button
                        key={ymd}
                        type="button"
                        disabled={!hasTimes}
                        onClick={() => {
                          setSelectedDate(ymd);
                          setSelected(null);
                          setStep("time");
                        }}
                        className={
                          "rounded-2xl border px-2 py-3 text-sm font-semibold transition " +
                          (hasTimes
                            ? isSelected
                              ? "border-(--booking-link) bg-[color-mix(in_srgb,var(--booking-link)_10%,var(--booking-surface))] text-(--booking-text)"
                              : "border-(--booking-border) bg-(--booking-surface) text-(--booking-text) hover:bg-(--booking-soft)"
                            : "cursor-not-allowed border-(--booking-border) bg-(--booking-soft) text-(--booking-muted) opacity-50") +
                          (!inMonth ? " opacity-60" : "")
                        }
                        aria-label={d.toDateString()}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-xs text-(--booking-muted)">
                  {slotsLoading ? "Loading available days…" : "Select a highlighted day to see times."}
                  {site?.timeZone ? ` (${site.timeZone})` : ""}
                </div>

              </div>
            ) : null}

            {step === "time" ? (
              <div className="mt-4">
                <button
                  type="button"
                  className="rounded-2xl border bg-(--booking-surface) px-3 py-2 text-sm font-semibold text-(--booking-text) transition hover:bg-(--booking-soft)"
                  style={{ borderColor: "var(--booking-border)" }}
                  onClick={() => {
                    setStep("date");
                    setSelected(null);
                  }}
                >
                  Back
                </button>

                <div className="mt-4">
                  <div className="text-sm font-semibold" style={{ color: "var(--booking-text)" }}>
                    {selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString() : ""}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--booking-muted)" }}>
                    Time zone: {site?.timeZone ?? ""}
                  </div>
                </div>

                <div className="mt-4">
                  {slotsLoading ? (
                    <div className="rounded-2xl border bg-(--booking-soft) p-4 text-sm text-(--booking-text)" style={{ borderColor: "var(--booking-border)" }}>
                      Loading times…
                    </div>
                  ) : daySlots.length === 0 ? (
                    <div className="rounded-2xl border bg-(--booking-soft) p-4 text-sm text-(--booking-text)" style={{ borderColor: "var(--booking-border)" }}>
                      No times available on this day.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {daySlots.map((s) => (
                        <button
                          key={s.startAt}
                          type="button"
                          onClick={() => {
                            setSelected(s.startAt);
                            setStep("details");
                          }}
                          className={
                            "rounded-2xl border px-4 py-3 text-left text-sm transition-colors " +
                            (selected === s.startAt
                              ? "border-(--booking-link) bg-[color-mix(in_srgb,var(--booking-link)_10%,var(--booking-surface))]"
                              : "border-(--booking-border) bg-(--booking-surface) hover:bg-(--booking-soft)")
                          }
                        >
                          <div className="font-semibold text-(--booking-text)">
                            {new Date(s.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </div>
                          <div className="mt-1 text-xs text-(--booking-muted)">
                            {site?.durationMinutes ?? 30} minutes
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ) : null}

            {step === "details" ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="rounded-2xl border bg-(--booking-surface) px-3 py-2 text-sm font-semibold text-(--booking-text) transition hover:bg-(--booking-soft)"
                    style={{ borderColor: "var(--booking-border)" }}
                    onClick={() => setStep("time")}
                  >
                    Back
                  </button>
                  <div className="text-xs font-semibold" style={{ color: "var(--booking-muted)" }}>
                    {selected ? new Date(selected).toLocaleString() : ""}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--booking-text)" }}>
              Your info
            </div>
            <div className="mt-3 space-y-3">
              <input
                className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                style={{ borderColor: "var(--booking-border)" }}
                placeholder="Name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                style={{ borderColor: "var(--booking-border)" }}
                placeholder="Email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {site?.form?.phone?.enabled ? (
                <input
                  className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                  style={{ borderColor: "var(--booking-border)" }}
                  placeholder={site.form.phone.required ? "Phone" : "Phone (optional)"}
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              ) : null}

              {site?.form?.notes?.enabled ? (
                <textarea
                  className="h-28 w-full resize-none rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                  style={{ borderColor: "var(--booking-border)" }}
                  placeholder={site.form.notes.required ? "Notes" : "Notes (optional)"}
                  autoComplete="off"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              ) : null}

              {(site?.form?.questions ?? []).map((q) => (
                <div key={q.id}>
                  {q.kind === "long" ? (
                    <textarea
                      className="h-28 w-full resize-none rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                      style={{ borderColor: "var(--booking-border)" }}
                      placeholder={q.required ? `${q.label}` : `${q.label} (optional)`}
                      value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  ) : q.kind === "single_choice" ? (
                    <div className="rounded-2xl border bg-(--booking-surface) px-4 py-3" style={{ borderColor: "var(--booking-border)" }}>
                      <div className="text-sm font-semibold text-(--booking-text)">{q.label}</div>
                      <div className="mt-2 space-y-2">
                        {(Array.isArray(q.options) ? q.options : []).map((opt) => {
                          const current = typeof answers[q.id] === "string" ? (answers[q.id] as string) : "";
                          const checked = current === opt;
                          return (
                            <label key={opt} className="flex items-center gap-2 text-sm text-(--booking-text)">
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={checked}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : q.kind === "multiple_choice" ? (
                    <div className="rounded-2xl border bg-(--booking-surface) px-4 py-3" style={{ borderColor: "var(--booking-border)" }}>
                      <div className="text-sm font-semibold text-(--booking-text)">{q.label}</div>
                      <div className="mt-2 space-y-2">
                        {(Array.isArray(q.options) ? q.options : []).map((opt) => {
                          const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                          const checked = current.includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-2 text-sm text-(--booking-text)">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAnswers((prev) => {
                                    const list = Array.isArray(prev[q.id]) ? ([...(prev[q.id] as string[])] as string[]) : [];
                                    const next = list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt];
                                    return { ...prev, [q.id]: next };
                                  });
                                }}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-2xl border bg-(--booking-surface) px-4 py-3 text-sm text-(--booking-text) placeholder:text-(--booking-muted)"
                      style={{ borderColor: "var(--booking-border)" }}
                      placeholder={q.required ? `${q.label}` : `${q.label} (optional)`}
                      autoComplete="off"
                      value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <button
                type="button"
                disabled={!canBook || bookingBusy}
                onClick={() => book()}
                className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold hover:opacity-95 disabled:opacity-60"
                style={{ backgroundColor: "var(--booking-primary)", color: "var(--booking-on-primary)" }}
              >
                {bookingBusy ? "Booking…" : "Confirm booking"}
              </button>

            </div>
          </div>
        </div>

        {showBranding ? (
          <div className="mt-10 border-t pt-6 text-center text-xs" style={{ borderColor: "var(--booking-border)", color: "var(--booking-muted)" }}>
            <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--booking-link)" }}>
              Powered by Purely Automation
            </Link>
            <span className="px-2">•</span>
            <Link href="/#demo" className="font-semibold hover:underline" style={{ color: "var(--booking-link)" }}>
              Create your own booking link
            </Link>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
