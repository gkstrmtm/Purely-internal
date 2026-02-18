import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { sendOwnerTwilioSms, getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { hasPublicColumn } from "@/lib/dbSchema";
import { ensureStoredBlogSiteSlug, getStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import type { Prisma } from "@prisma/client";

const SERVICE_SLUG = "reviews";

const MAX_EVENTS = 200;
const MAX_SENT_KEYS = 4000;
const MAX_BODY_LEN = 900;
const MAX_DESTINATIONS = 10;

let canUseBlogSlugColumnCache: boolean | null = null;
let canUsePortalBookingCalendarIdColumnCache: boolean | null = null;

function getBasePublicUrl() {
  const raw = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

async function canUseBlogSlugColumn() {
  if (canUseBlogSlugColumnCache !== null) return canUseBlogSlugColumnCache;
  canUseBlogSlugColumnCache = await hasPublicColumn("ClientBlogSite", "slug");
  return canUseBlogSlugColumnCache;
}

async function canUsePortalBookingCalendarIdColumn() {
  if (canUsePortalBookingCalendarIdColumnCache !== null) return canUsePortalBookingCalendarIdColumnCache;
  canUsePortalBookingCalendarIdColumnCache = await hasPublicColumn("PortalBooking", "calendarId");
  return canUsePortalBookingCalendarIdColumnCache;
}

async function getOwnerPublicSiteHandle(ownerId: string): Promise<string | null> {
  const canUse = await canUseBlogSlugColumn();
  const site = (await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { id: true, name: true, ...(canUse ? { slug: true } : {}) },
  } as any)) as any;

  if (!site) {
    const bookingSite = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { slug: true } });
    return bookingSite?.slug ? String(bookingSite.slug) : null;
  }

  if (canUse) {
    return (site.slug as string | null | undefined) || (site.id as string);
  }

  let fallback = await getStoredBlogSiteSlug(ownerId);
  if (!fallback) fallback = await ensureStoredBlogSiteSlug(ownerId, String(site.name || ""));
  return fallback || null;
}

async function resolvePrimarySendLink(
  ownerId: string,
  settings: ReviewRequestsSettings,
): Promise<{ destinationId: string; destinationLabel: string; destinationUrl: string } | null> {
  if (settings.publicPage.enabled) {
    const handle = await getOwnerPublicSiteHandle(ownerId);
    if (handle) {
      return {
        destinationId: "hosted",
        destinationLabel: "Reviews page",
        destinationUrl: `${getBasePublicUrl()}/${handle}/reviews`,
      };
    }
  }

  const destination = pickDestination(settings);
  if (!destination) return null;
  return {
    destinationId: destination.id,
    destinationLabel: destination.label,
    destinationUrl: destination.url,
  };
}

export async function getOwnerPrimaryReviewLink(ownerId: string): Promise<{ label: string; url: string } | null> {
  const cleanOwnerId = String(ownerId || "").trim();
  if (!cleanOwnerId) return null;

  try {
    const data = await getReviewRequestsServiceData(cleanOwnerId);
    const settings = data.settings;
    if (!settings.enabled) return null;

    const resolved = await resolvePrimarySendLink(cleanOwnerId, settings);
    if (!resolved?.destinationUrl) return null;
    return { label: resolved.destinationLabel, url: resolved.destinationUrl };
  } catch {
    return null;
  }
}

export type ReviewDelayUnit = "minutes" | "hours" | "days" | "weeks";

export type ReviewDelay = {
  value: number;
  unit: ReviewDelayUnit;
};

export type ReviewDestination = {
  id: string;
  label: string;
  url: string;
};

export type ReviewsPublicQuestionKind = "short" | "long" | "single_choice" | "multiple_choice";

export type ReviewsPublicQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: ReviewsPublicQuestionKind;
  options?: string[];
};

export type ReviewsPublicFormConfig = {
  version: 1;
  email: { enabled: boolean; required: boolean };
  phone: { enabled: boolean; required: boolean };
  questions: ReviewsPublicQuestion[];
};

export type ReviewsPublicPageSettings = {
  enabled: boolean;
  galleryEnabled: boolean;
  title: string;
  description: string;
  thankYouMessage: string;
  form: ReviewsPublicFormConfig;
  photoUrls: string[];
};

export type ReviewsAutomationSettings = {
  autoSend: boolean;
  manualSend: boolean;
  calendarIds: string[];
};

export type ReviewRequestsSettings = {
  version: 1;
  enabled: boolean;
  automation: ReviewsAutomationSettings;
  sendAfter: ReviewDelay;
  destinations: ReviewDestination[];
  defaultDestinationId?: string;
  messageTemplate: string;
  calendarMessageTemplates?: Record<string, string>;
  publicPage: ReviewsPublicPageSettings;
};

export type ReviewRequestEvent = {
  id: string;
  bookingId: string;
  calendarId?: string | null;
  bookingEndAtIso: string;
  scheduledForIso: string;

  destinationId: string;
  destinationLabel: string;
  destinationUrl: string;

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

type ReviewsServiceData = {
  version: 1;
  settings: ReviewRequestsSettings;
  sentKeys: string[];
  events: ReviewRequestEvent[];
};

function nowIso() {
  return new Date().toISOString();
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeUnit(raw: unknown): ReviewDelayUnit {
  return raw === "minutes" || raw === "hours" || raw === "days" || raw === "weeks" ? raw : "minutes";
}

function normalizeId(raw: unknown, fallback: string) {
  const v = typeof raw === "string" ? raw.trim() : "";
  const cleaned = v.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || fallback).slice(0, 50);
}

function normalizeUrl(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function normalizeString(raw: unknown, maxLen: number, fallback = "") {
  const v = typeof raw === "string" ? raw : fallback;
  return v.trim().slice(0, maxLen);
}

function toDelayMinutes(delay: ReviewDelay): number {
  const value = clampInt(delay.value, 0, 10_000_000);
  const unit = normalizeUnit(delay.unit);
  const mul = unit === "weeks" ? 60 * 24 * 7 : unit === "days" ? 60 * 24 : unit === "hours" ? 60 : 1;
  return clampInt(value * mul, 0, 60 * 24 * 14);
}

export function parseReviewRequestsSettings(raw: unknown): ReviewRequestsSettings {
  const base: ReviewRequestsSettings = {
    version: 1,
    enabled: false,
    automation: { autoSend: true, manualSend: true, calendarIds: [] },
    sendAfter: { value: 30, unit: "minutes" },
    destinations: [],
    messageTemplate: "Hi {name}, thanks again! If you have 30 seconds, would you leave us a review? {link}",
    calendarMessageTemplates: {},
    publicPage: {
      enabled: true,
      galleryEnabled: true,
      title: "Reviews",
      description: "We’d love to hear about your experience.",
      thankYouMessage: "Thanks! Your review was submitted.",
      form: {
        version: 1,
        email: { enabled: false, required: false },
        phone: { enabled: false, required: false },
        questions: [],
      },
      photoUrls: [],
    },
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;

  const autoRaw = rec.automation && typeof rec.automation === "object" && !Array.isArray(rec.automation) ? (rec.automation as any) : null;
  const calendarIdsRaw = Array.isArray(autoRaw?.calendarIds) ? (autoRaw.calendarIds as unknown[]) : [];
  const calendarIds = calendarIdsRaw
    .flatMap((x) => {
      const v = typeof x === "string" ? x.trim() : "";
      if (!v) return [] as string[];
      return [v.slice(0, 50)];
    })
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 25);

  const automation: ReviewsAutomationSettings = {
    autoSend: typeof autoRaw?.autoSend === "boolean" ? autoRaw.autoSend : base.automation.autoSend,
    manualSend: typeof autoRaw?.manualSend === "boolean" ? autoRaw.manualSend : base.automation.manualSend,
    calendarIds,
  };

  const sendAfterRaw = rec.sendAfter && typeof rec.sendAfter === "object" && !Array.isArray(rec.sendAfter) ? (rec.sendAfter as any) : null;
  const unit = normalizeUnit(sendAfterRaw?.unit);
  const maxByUnit = unit === "weeks" ? 2 : unit === "days" ? 14 : unit === "hours" ? 24 * 14 : 60 * 24 * 14;
  const minByUnit = unit === "minutes" ? 0 : 0;
  const value = clampInt(typeof sendAfterRaw?.value === "number" ? sendAfterRaw.value : base.sendAfter.value, minByUnit, maxByUnit);
  const sendAfter: ReviewDelay = { value, unit };

  const destinationsRaw = Array.isArray(rec.destinations) ? (rec.destinations as unknown[]) : [];
  const destinations: ReviewDestination[] = destinationsRaw
    .flatMap((d, i) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return [] as ReviewDestination[];
      const r = d as Record<string, unknown>;
      const id = normalizeId(r.id, `dest_${i + 1}`);
      const label = normalizeString(r.label, 60, "Review link") || "Review link";
      const url = normalizeUrl(r.url);
      if (!url) return [] as ReviewDestination[];
      return [{ id, label, url }];
    })
    .slice(0, MAX_DESTINATIONS);

  const defaultDestinationId = typeof rec.defaultDestinationId === "string" ? rec.defaultDestinationId.trim().slice(0, 50) : undefined;

  const template = normalizeString(rec.messageTemplate, MAX_BODY_LEN, base.messageTemplate) || base.messageTemplate;

  const calendarTemplatesRaw =
    rec.calendarMessageTemplates && typeof rec.calendarMessageTemplates === "object" && !Array.isArray(rec.calendarMessageTemplates)
      ? (rec.calendarMessageTemplates as Record<string, unknown>)
      : null;
  const calendarMessageTemplates: Record<string, string> = {};
  if (calendarTemplatesRaw) {
    for (const [k, v] of Object.entries(calendarTemplatesRaw)) {
      const calendarId = typeof k === "string" ? k.trim().slice(0, 50) : "";
      if (!calendarId) continue;
      const msg = typeof v === "string" ? v.trim().slice(0, MAX_BODY_LEN) : "";
      if (!msg) continue;
      calendarMessageTemplates[calendarId] = msg;
      if (Object.keys(calendarMessageTemplates).length >= 25) break;
    }
  }

  const publicRaw = rec.publicPage && typeof rec.publicPage === "object" && !Array.isArray(rec.publicPage) ? (rec.publicPage as any) : null;

  const formRaw = publicRaw?.form && typeof publicRaw.form === "object" && !Array.isArray(publicRaw.form) ? (publicRaw.form as any) : null;
  const emailRaw = formRaw?.email && typeof formRaw.email === "object" && !Array.isArray(formRaw.email) ? (formRaw.email as any) : null;
  const phoneRaw = formRaw?.phone && typeof formRaw.phone === "object" && !Array.isArray(formRaw.phone) ? (formRaw.phone as any) : null;

  const questionsRaw = Array.isArray(formRaw?.questions) ? (formRaw.questions as unknown[]) : [];
  const questions: ReviewsPublicQuestion[] = questionsRaw
    .flatMap((q, i) => {
      if (!q || typeof q !== "object" || Array.isArray(q)) return [] as ReviewsPublicQuestion[];
      const r = q as Record<string, unknown>;
      const id = normalizeId(r.id, `q_${i + 1}`);
      const label = normalizeString(r.label, 120, "Question") || "Question";
      const required = typeof r.required === "boolean" ? r.required : false;
      const kind: ReviewsPublicQuestionKind =
        r.kind === "short" || r.kind === "long" || r.kind === "single_choice" || r.kind === "multiple_choice" ? (r.kind as any) : "short";

      const optionsRaw = Array.isArray(r.options) ? (r.options as unknown[]) : [];
      const options = optionsRaw
        .flatMap((x) => {
          const v = typeof x === "string" ? x.trim() : "";
          return v ? [v.slice(0, 80)] : [];
        })
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .slice(0, 12);

      if ((kind === "single_choice" || kind === "multiple_choice") && options.length === 0) return [] as ReviewsPublicQuestion[];
      return [{ id, label, required, kind, ...(options.length ? { options } : {}) }];
    })
    .filter((q, idx, arr) => arr.findIndex((x) => x.id === q.id) === idx)
    .slice(0, 25);

  const form: ReviewsPublicFormConfig = {
    version: 1,
    email: {
      enabled: typeof emailRaw?.enabled === "boolean" ? emailRaw.enabled : base.publicPage.form.email.enabled,
      required: typeof emailRaw?.required === "boolean" ? emailRaw.required : base.publicPage.form.email.required,
    },
    phone: {
      enabled: typeof phoneRaw?.enabled === "boolean" ? phoneRaw.enabled : base.publicPage.form.phone.enabled,
      required: typeof phoneRaw?.required === "boolean" ? phoneRaw.required : base.publicPage.form.phone.required,
    },
    questions,
  };
  const photoUrlsRaw = Array.isArray(publicRaw?.photoUrls) ? (publicRaw.photoUrls as unknown[]) : [];
  const photoUrls = photoUrlsRaw
    .flatMap((x) => {
      const v = typeof x === "string" ? x.trim() : "";
      if (!v) return [] as string[];
      if (v.startsWith("/")) return [v.slice(0, 400)];
      const u = normalizeUrl(v);
      return u ? [u.slice(0, 400)] : ([] as string[]);
    })
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 30);

  // Back-compat: if an old heroPhotoUrl exists, keep it as the first photo.
  const legacyHero = normalizeUrl(publicRaw?.heroPhotoUrl);
  const mergedPhotoUrls = legacyHero ? Array.from(new Set([legacyHero, ...photoUrls])).slice(0, 30) : photoUrls;

  const publicPage: ReviewsPublicPageSettings = {
    enabled: typeof publicRaw?.enabled === "boolean" ? publicRaw.enabled : base.publicPage.enabled,
    galleryEnabled:
      typeof publicRaw?.galleryEnabled === "boolean" ? publicRaw.galleryEnabled : base.publicPage.galleryEnabled,
    title: normalizeString(publicRaw?.title, 60, base.publicPage.title) || base.publicPage.title,
    description: normalizeString(publicRaw?.description, 220, base.publicPage.description) || base.publicPage.description,
    thankYouMessage: normalizeString(publicRaw?.thankYouMessage, 220, base.publicPage.thankYouMessage) || base.publicPage.thankYouMessage,
    form,
    photoUrls: mergedPhotoUrls,
  };

  return {
    version: 1,
    enabled,
    automation,
    sendAfter,
    destinations,
    ...(defaultDestinationId ? { defaultDestinationId } : {}),
    messageTemplate: template,
    calendarMessageTemplates,
    publicPage,
  };
}

function pickMessageTemplate(settings: ReviewRequestsSettings, calendarId: string | null | undefined) {
  const cal = typeof calendarId === "string" ? calendarId.trim() : "";
  if (cal && settings.calendarMessageTemplates && typeof settings.calendarMessageTemplates === "object") {
    const v = settings.calendarMessageTemplates[cal];
    if (typeof v === "string" && v.trim()) return v;
  }
  return settings.messageTemplate;
}

function parseServiceData(raw: unknown): ReviewsServiceData {
  const base: ReviewsServiceData = {
    version: 1,
    settings: parseReviewRequestsSettings(null),
    sentKeys: [],
    events: [],
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const settings = parseReviewRequestsSettings(rec.settings);
  const sentKeys = Array.isArray(rec.sentKeys)
    ? (rec.sentKeys as unknown[]).flatMap((x) => (typeof x === "string" && x.trim() ? [x] : [])).slice(0, MAX_SENT_KEYS)
    : [];

  const events = Array.isArray(rec.events)
    ? (rec.events as unknown[])
        .flatMap((e) => {
          if (!e || typeof e !== "object" || Array.isArray(e)) return [] as ReviewRequestEvent[];
          const r = e as Record<string, unknown>;
          const bookingId = typeof r.bookingId === "string" ? r.bookingId : "";
          const bookingEndAtIso = typeof r.bookingEndAtIso === "string" ? r.bookingEndAtIso : "";
          const scheduledForIso = typeof r.scheduledForIso === "string" ? r.scheduledForIso : "";
          const destinationId = typeof r.destinationId === "string" ? r.destinationId : "";
          const destinationLabel = typeof r.destinationLabel === "string" ? r.destinationLabel : "";
          const destinationUrl = typeof r.destinationUrl === "string" ? r.destinationUrl : "";
          const contactName = typeof r.contactName === "string" ? r.contactName : "";
          const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : nowIso();
          const status = r.status === "SENT" || r.status === "SKIPPED" || r.status === "FAILED" ? r.status : "SKIPPED";
          if (!bookingId || !bookingEndAtIso || !scheduledForIso || !destinationUrl) return [] as ReviewRequestEvent[];

          const evt: ReviewRequestEvent = {
            id: typeof r.id === "string" ? r.id : `evt_${bookingId}`,
            bookingId,
            bookingEndAtIso,
            scheduledForIso,

            destinationId: destinationId || "dest",
            destinationLabel: destinationLabel || "Review link",
            destinationUrl,

            contactName,
            contactPhoneRaw: typeof r.contactPhoneRaw === "string" ? r.contactPhoneRaw : null,
            smsTo: typeof r.smsTo === "string" ? r.smsTo : null,
            smsBody: typeof r.smsBody === "string" ? r.smsBody : null,

            status,
            ...(typeof r.reason === "string" ? { reason: r.reason } : {}),
            ...(typeof r.smsMessageSid === "string" ? { smsMessageSid: r.smsMessageSid } : {}),
            ...(typeof r.error === "string" ? { error: r.error } : {}),
            createdAtIso,
          };
          return [evt];
        })
        .slice(0, MAX_EVENTS)
    : [];

  return { version: 1, settings, sentKeys, events };
}

export async function getReviewRequestsServiceData(ownerId: string): Promise<ReviewsServiceData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseServiceData(row?.dataJson ?? null);
}

export async function setReviewRequestsSettings(ownerId: string, settings: ReviewRequestsSettings): Promise<ReviewRequestsSettings> {
  const current = await getReviewRequestsServiceData(ownerId);

  const payload: ReviewsServiceData = {
    version: 1,
    settings,
    sentKeys: current.sentKeys.slice(0, MAX_SENT_KEYS),
    events: current.events.slice(0, MAX_EVENTS),
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
    update: { status: "COMPLETE", dataJson: payload as any },
    select: { dataJson: true },
  });

  return parseServiceData(row.dataJson).settings;
}

export async function listReviewRequestEvents(ownerId: string, limit = 50): Promise<ReviewRequestEvent[]> {
  const data = await getReviewRequestsServiceData(ownerId);
  const n = clampInt(limit, 1, 200);
  return data.events
    .slice()
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
    .slice(0, n);
}

export function renderReviewRequestBody(template: string, vars: Record<string, string>) {
  const safe = String(template || "").slice(0, MAX_BODY_LEN);
  return renderTextTemplate(safe, vars).trim();
}

function appendExternalDestinations(body: string, destinations: ReviewDestination[]) {
  const xs = Array.isArray(destinations) ? destinations : [];
  if (xs.length === 0) return body;

  const lines = xs
    .slice(0, 3)
    .map((d) => {
      const label = (d.label || "Review").trim().slice(0, 40) || "Review";
      const url = (d.url || "").trim();
      if (!url) return null;
      return `${label}: ${url}`;
    })
    .filter(Boolean) as string[];

  if (lines.length === 0) return body;

  const next = `${body}\n\nOther review links:\n${lines.join("\n")}`.trim();
  return next.slice(0, MAX_BODY_LEN);
}

function pickDestination(settings: ReviewRequestsSettings): ReviewDestination | null {
  const xs = Array.isArray(settings.destinations) ? settings.destinations : [];
  if (xs.length === 0) return null;
  const preferred = settings.defaultDestinationId ? xs.find((d) => d.id === settings.defaultDestinationId) : null;
  return preferred ?? xs[0];
}

function isCalendarAllowed(settings: ReviewRequestsSettings, calendarId: string | null | undefined) {
  const allowed = Array.isArray(settings.automation.calendarIds) ? settings.automation.calendarIds : [];
  if (allowed.length === 0) return true; // empty means "all calendars"
  const cal = typeof calendarId === "string" ? calendarId.trim() : "";
  if (!cal) return false;
  return allowed.includes(cal);
}

export async function sendReviewRequestForBooking(opts: { ownerId: string; bookingId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerId = String(opts.ownerId || "");
  const bookingId = String(opts.bookingId || "");
  if (!ownerId || !bookingId) return { ok: false, error: "Missing ownerId/bookingId" };

  const hasCalendarId = await canUsePortalBookingCalendarIdColumn();
  const bookingSelect: Prisma.PortalBookingSelect = {
    id: true,
    siteId: true,
    status: true,
    endAt: true,
    contactName: true,
    contactPhone: true,
    ...(hasCalendarId ? { calendarId: true } : {}),
  };

  const [data, site, booking, profile, twilio] = await Promise.all([
    getReviewRequestsServiceData(ownerId),
    prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, timeZone: true, slug: true, title: true } }),
    prisma.portalBooking.findUnique({ where: { id: bookingId }, select: bookingSelect }),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }),
    getOwnerTwilioSmsConfig(ownerId),
  ]);

  if (!site || !booking || booking.siteId !== site.id) return { ok: false, error: "Not found" };
  if (booking.status !== "SCHEDULED") return { ok: false, error: "Booking is not scheduled" };
  if (booking.endAt.getTime() > Date.now()) return { ok: false, error: "Appointment has not ended yet" };

  const settings = data.settings;
  if (!settings.enabled) return { ok: false, error: "Review requests are turned off" };
  if (!settings.automation.manualSend) return { ok: false, error: "Manual sending is turned off" };

  const bookingCalendarId = hasCalendarId ? ((booking as any).calendarId as string | null | undefined) : null;
  if (hasCalendarId && !isCalendarAllowed(settings, bookingCalendarId)) {
    return { ok: false, error: "This calendar is not enabled for review requests" };
  }
  if (!twilio) return { ok: false, error: "Twilio not configured" };

  const resolved = await resolvePrimarySendLink(ownerId, settings);
  if (!resolved) return { ok: false, error: "No review link configured" };

  const parsed = booking.contactPhone ? normalizePhoneStrict(booking.contactPhone) : { ok: false as const, error: "Missing phone" };
  if (!parsed.ok || !parsed.e164) return { ok: false, error: "Missing/invalid phone" };

  const business = profile?.businessName?.trim() || site.title || "Purely Automation";
  const vars = {
    ...buildPortalTemplateVars({
      contact: { name: booking.contactName },
      business: { name: business },
    }),
    link: resolved.destinationUrl,
  };

  const body = renderReviewRequestBody(pickMessageTemplate(settings, bookingCalendarId), vars);
  const smsBody = appendExternalDestinations(body, settings.destinations);

  const key = `${booking.id}:manual`;
  const sentKeys = data.sentKeys.slice();
  if (sentKeys.includes(key)) return { ok: false, error: "Already sent" };

  const now = Date.now();
  const scheduledForIso = new Date(now).toISOString();
  const bookingEndAtIso = booking.endAt.toISOString();

  try {
    const result = await sendOwnerTwilioSms({ ownerId, to: parsed.e164, body: smsBody });
    const status: ReviewRequestEvent["status"] = result.ok ? "SENT" : "FAILED";
    const evt: ReviewRequestEvent = {
      id: `evt_${booking.id}_manual_${resolved.destinationId}`,
      bookingId: booking.id,
      calendarId: bookingCalendarId ?? null,
      bookingEndAtIso,
      scheduledForIso,
      destinationId: resolved.destinationId,
      destinationLabel: resolved.destinationLabel,
      destinationUrl: resolved.destinationUrl,
      contactName: booking.contactName,
      contactPhoneRaw: booking.contactPhone ?? null,
      smsTo: parsed.e164,
      smsBody,
      status,
      ...(result.ok && result.messageSid ? { smsMessageSid: result.messageSid } : {}),
      ...(result.ok ? {} : { error: result.error }),
      createdAtIso: nowIso(),
    };

    const nextPayload: ReviewsServiceData = {
      version: 1,
      settings,
      sentKeys: [key, ...sentKeys].slice(0, MAX_SENT_KEYS),
      events: [evt, ...data.events].slice(0, MAX_EVENTS),
    };

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: nextPayload as any },
      update: { status: "COMPLETE", dataJson: nextPayload as any },
      select: { id: true },
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function processDueReviewRequests(opts?: { ownersLimit?: number; perOwnerLimit?: number; windowMinutes?: number }) {
  const ownersLimit = clampInt(opts?.ownersLimit ?? 1000, 1, 5000);
  const perOwnerLimit = clampInt(opts?.perOwnerLimit ?? 25, 1, 100);
  const windowMinutes = clampInt(opts?.windowMinutes ?? 5, 1, 60);

  let scannedOwners = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  let cursorId: string | undefined;

  while (scannedOwners < ownersLimit) {
    const rows = await prisma.portalServiceSetup.findMany({
      where: { serviceSlug: SERVICE_SLUG },
      orderBy: { id: "asc" },
      take: Math.min(200, ownersLimit - scannedOwners),
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true, ownerId: true, dataJson: true },
    });

    if (rows.length === 0) break;
    cursorId = rows[rows.length - 1].id;

    for (const row of rows) {
      scannedOwners += 1;
      const serviceData = parseServiceData(row.dataJson);
      const settings = serviceData.settings;
      if (!settings.enabled) continue;
      if (!settings.automation.autoSend) continue;

      const delayMinutes = toDelayMinutes(settings.sendAfter);
      const now = Date.now();
      const targetEnd = new Date(now - delayMinutes * 60_000);
      const windowStart = new Date(targetEnd.getTime() - windowMinutes * 60_000);
      const windowEnd = targetEnd;

      const ownerId = row.ownerId;
      const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, title: true } });
      if (!site) continue;

      const hasCalendarId = await canUsePortalBookingCalendarIdColumn();

      const twilio = await getOwnerTwilioSmsConfig(ownerId);
      const resolved = await resolvePrimarySendLink(ownerId, settings);
      if (!resolved) continue;

      let mutated = false;
      let sentKeys = serviceData.sentKeys.slice();
      let sentSet = new Set<string>(sentKeys);
      let events = serviceData.events.slice();

      const upsert = async () => {
        if (!mutated) return;
        const payload: ReviewsServiceData = {
          version: 1,
          settings,
          sentKeys: sentKeys.slice(0, MAX_SENT_KEYS),
          events: events.slice(0, MAX_EVENTS),
        };
        await prisma.portalServiceSetup.upsert({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
          create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
          update: { status: "COMPLETE", dataJson: payload as any },
          select: { id: true },
        });
        mutated = false;
      };

      const select: Prisma.PortalBookingSelect = {
        id: true,
        endAt: true,
        contactName: true,
        contactPhone: true,
        ...(hasCalendarId ? { calendarId: true } : {}),
      };

      const bookings = await prisma.portalBooking.findMany({
        where: {
          siteId: site.id,
          status: "SCHEDULED",
          endAt: { gte: windowStart, lt: windowEnd },
          ...(hasCalendarId && settings.automation.calendarIds.length ? { calendarId: { in: settings.automation.calendarIds } } : {}),
        },
        orderBy: { endAt: "asc" },
        take: perOwnerLimit,
        select,
      });

      for (const booking of bookings) {
        const key = `${booking.id}:${resolved.destinationId}`;
        if (sentSet.has(key)) continue;

        const bookingEndAtIso = booking.endAt.toISOString();
        const scheduledForIso = new Date(now).toISOString();

        const bookingCalendarId = hasCalendarId ? ((booking as any).calendarId as string | null | undefined) : null;

        if (!twilio) {
          skipped += 1;
          const evt: ReviewRequestEvent = {
            id: `evt_${booking.id}_${resolved.destinationId}`,
            bookingId: booking.id,
            calendarId: bookingCalendarId ?? null,
            bookingEndAtIso,
            scheduledForIso,
            destinationId: resolved.destinationId,
            destinationLabel: resolved.destinationLabel,
            destinationUrl: resolved.destinationUrl,
            contactName: booking.contactName,
            contactPhoneRaw: booking.contactPhone ?? null,
            smsTo: null,
            smsBody: null,
            status: "SKIPPED",
            reason: "Twilio not configured",
            createdAtIso: nowIso(),
          };
          events.unshift(evt);
          sentKeys.unshift(key);
          sentSet.add(key);
          mutated = true;
          continue;
        }

        const parsed = booking.contactPhone ? normalizePhoneStrict(booking.contactPhone) : { ok: false as const, error: "Missing phone" };
        if (!parsed.ok || !parsed.e164) {
          skipped += 1;
          const evt: ReviewRequestEvent = {
            id: `evt_${booking.id}_${resolved.destinationId}`,
            bookingId: booking.id,
            calendarId: bookingCalendarId ?? null,
            bookingEndAtIso,
            scheduledForIso,
            destinationId: resolved.destinationId,
            destinationLabel: resolved.destinationLabel,
            destinationUrl: resolved.destinationUrl,
            contactName: booking.contactName,
            contactPhoneRaw: booking.contactPhone ?? null,
            smsTo: null,
            smsBody: null,
            status: "SKIPPED",
            reason: "Missing/invalid phone",
            createdAtIso: nowIso(),
          };
          events.unshift(evt);
          sentKeys.unshift(key);
          sentSet.add(key);
          mutated = true;
          continue;
        }

        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const business = profile?.businessName?.trim() || site.title || "Purely Automation";
        const vars = {
          ...buildPortalTemplateVars({
            contact: { name: booking.contactName },
            business: { name: business },
          }),
          link: resolved.destinationUrl,
        };

        const body = renderReviewRequestBody(pickMessageTemplate(settings, bookingCalendarId), vars);
        const smsBody = appendExternalDestinations(body, settings.destinations);

        try {
          const result = await sendOwnerTwilioSms({ ownerId, to: parsed.e164, body: smsBody });
          if (!result.ok) {
            failed += 1;
            const evt: ReviewRequestEvent = {
              id: `evt_${booking.id}_${resolved.destinationId}`,
              bookingId: booking.id,
              calendarId: bookingCalendarId ?? null,
              bookingEndAtIso,
              scheduledForIso,
              destinationId: resolved.destinationId,
              destinationLabel: resolved.destinationLabel,
              destinationUrl: resolved.destinationUrl,
              contactName: booking.contactName,
              contactPhoneRaw: booking.contactPhone ?? null,
              smsTo: parsed.e164,
              smsBody,
              status: "FAILED",
              error: result.error,
              createdAtIso: nowIso(),
            };
            events.unshift(evt);
            sentKeys.unshift(key);
            sentSet.add(key);
            mutated = true;
            continue;
          }

          sent += 1;
          const evt: ReviewRequestEvent = {
            id: `evt_${booking.id}_${resolved.destinationId}`,
            bookingId: booking.id,
            calendarId: bookingCalendarId ?? null,
            bookingEndAtIso,
            scheduledForIso,
            destinationId: resolved.destinationId,
            destinationLabel: resolved.destinationLabel,
            destinationUrl: resolved.destinationUrl,
            contactName: booking.contactName,
            contactPhoneRaw: booking.contactPhone ?? null,
            smsTo: parsed.e164,
            smsBody,
            status: "SENT",
            ...(result.messageSid ? { smsMessageSid: result.messageSid } : {}),
            createdAtIso: nowIso(),
          };
          events.unshift(evt);
          sentKeys.unshift(key);
          sentSet.add(key);
          mutated = true;
        } catch (err) {
          failed += 1;
          const evt: ReviewRequestEvent = {
            id: `evt_${booking.id}_${resolved.destinationId}`,
            bookingId: booking.id,
            calendarId: (booking as any).calendarId ?? null,
            bookingEndAtIso,
            scheduledForIso,
            destinationId: resolved.destinationId,
            destinationLabel: resolved.destinationLabel,
            destinationUrl: resolved.destinationUrl,
            contactName: booking.contactName,
            contactPhoneRaw: booking.contactPhone ?? null,
            smsTo: parsed.e164,
            smsBody: body,
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
            createdAtIso: nowIso(),
          };
          events.unshift(evt);
          sentKeys.unshift(key);
          sentSet.add(key);
          mutated = true;
        }

        if (events.length > MAX_EVENTS || sentKeys.length > MAX_SENT_KEYS) {
          events = events.slice(0, MAX_EVENTS);
          sentKeys = sentKeys.slice(0, MAX_SENT_KEYS);
          sentSet = new Set<string>(sentKeys);
        }
      }

      await upsert();
    }
  }

  return { ok: true as const, scannedOwners, sent, failed, skipped };
}
