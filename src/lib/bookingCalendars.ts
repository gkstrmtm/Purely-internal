import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";

export type BookingCalendar = {
  id: string;
  enabled: boolean;
  title: string;
  description?: string;
  durationMinutes?: number;
  minimumNoticeMinutes?: number;
  meetingLocation?: string;
  meetingDetails?: string;
  notificationEmails?: string[];
  availabilityBlocks?: Array<{ startAt: string; endAt: string }>;
};

export type BookingCalendarsConfig = {
  version: 1;
  calendars: BookingCalendar[];
};

export type EnsureBookingCalendarResult =
  | {
      ok: true;
      config: BookingCalendarsConfig;
      calendar: BookingCalendar;
      created: boolean;
      enabledExisting: boolean;
    }
  | {
      ok: false;
      status: 402 | 500;
      error: string;
    };

const SERVICE_SLUG = "booking_calendars";

function normalizeId(raw: unknown, fallback: string) {
  const v = typeof raw === "string" ? raw.trim() : "";
  const cleaned = v.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function normalizeBool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function normalizeString(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
}

function normalizeStringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function toTitleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeQuickCalendarTitle(raw: unknown) {
  const text = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  if (!text) return "Quick calendar";
  return text;
}

function makeUniqueCalendarTitle(existing: BookingCalendar[], requestedTitle?: string) {
  const base = normalizeQuickCalendarTitle(requestedTitle);
  const taken = new Set(existing.map((calendar) => String(calendar.title || "").trim().toLowerCase()).filter(Boolean));
  if (!taken.has(base.toLowerCase())) return base;
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base} ${index}`.slice(0, 80).trim();
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now().toString(36).slice(-4)}`.slice(0, 80).trim();
}

function makeUniqueCalendarId(existing: BookingCalendar[], requestedTitle?: string) {
  const existingIds = new Set(existing.map((calendar) => String(calendar.id || "").trim()).filter(Boolean));
  const seed = normalizeQuickCalendarTitle(requestedTitle);
  const base = normalizeId(seed.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "quick-calendar");
  if (!existingIds.has(base)) return base;
  for (let index = 2; index <= 99; index += 1) {
    const candidate = normalizeId(`${base}-${index}`, `quick-calendar-${index}`);
    if (!existingIds.has(candidate)) return candidate;
  }
  return normalizeId(`${base}-${Date.now().toString(36).slice(-4)}`, "quick-calendar");
}

function normalizeStringList(v: unknown, max: number): string[] {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeAvailabilityBlocks(v: unknown): Array<{ startAt: string; endAt: string }> | undefined {
  const list = Array.isArray(v) ? v : [];
  const out: Array<{ startAt: string; endAt: string }> = [];

  for (const item of list) {
    const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!rec) continue;
    const startAt = typeof rec.startAt === "string" ? rec.startAt.trim() : "";
    const endAt = typeof rec.endAt === "string" ? rec.endAt.trim() : "";
    if (!startAt || !endAt) continue;
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    out.push({ startAt: start.toISOString(), endAt: end.toISOString() });
    if (out.length >= 1000) break;
  }

  return out.length ? out : undefined;
}

export function defaultBookingCalendarsConfig(): BookingCalendarsConfig {
  return { version: 1, calendars: [] };
}

export function parseBookingCalendarsConfig(value: unknown): BookingCalendarsConfig {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const raw = rec?.calendars;
  const list = Array.isArray(raw) ? raw : [];

  const calendars: BookingCalendar[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] && typeof list[i] === "object" ? (list[i] as Record<string, unknown>) : null;
    if (!item) continue;

    const id = normalizeId(item.id, `cal${i + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);

    const title = normalizeString(item.title, "Calendar").trim().slice(0, 80);
    if (!title) continue;

    const description = (normalizeStringOrUndefined(item.description) ?? "").trim().slice(0, 400);

    const meetingLocation = (normalizeStringOrUndefined(item.meetingLocation) ?? "").trim().slice(0, 120);
    const meetingDetails = (normalizeStringOrUndefined(item.meetingDetails) ?? "").trim().slice(0, 600);

    const rawEmails = normalizeStringList(item.notificationEmails, 20);
    const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const notificationEmails = rawEmails
      .map((x) => x.toLowerCase())
      .filter((x) => emailLike.test(x))
      .slice(0, 20);
    const availabilityBlocks = normalizeAvailabilityBlocks(item.availabilityBlocks);

    const durationMinutesRaw = item.durationMinutes;
    const durationMinutes =
      typeof durationMinutesRaw === "number" && Number.isFinite(durationMinutesRaw)
        ? Math.max(10, Math.min(180, Math.round(durationMinutesRaw)))
        : undefined;
    const minimumNoticeMinutesRaw = item.minimumNoticeMinutes;
    const minimumNoticeMinutes =
      typeof minimumNoticeMinutesRaw === "number" && Number.isFinite(minimumNoticeMinutesRaw)
        ? Math.max(0, Math.min(60 * 24 * 14, Math.round(minimumNoticeMinutesRaw)))
        : undefined;

    calendars.push({
      id,
      enabled: normalizeBool(item.enabled, true),
      title,
      description: description || undefined,
      durationMinutes,
      minimumNoticeMinutes,
      meetingLocation: meetingLocation || undefined,
      meetingDetails: meetingDetails || undefined,
      notificationEmails: notificationEmails.length ? notificationEmails : undefined,
      availabilityBlocks,
    });

    if (calendars.length >= 25) break;
  }

  return { version: 1, calendars };
}

export async function getBookingCalendarsConfig(ownerId: string): Promise<BookingCalendarsConfig> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseBookingCalendarsConfig(row?.dataJson);
}

export async function setBookingCalendarsConfig(
  ownerId: string,
  config: BookingCalendarsConfig,
): Promise<BookingCalendarsConfig> {
  const normalized = parseBookingCalendarsConfig(config);

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: normalized },
    update: { dataJson: normalized, status: "COMPLETE" },
    select: { dataJson: true },
  });

  return parseBookingCalendarsConfig(row.dataJson);
}

export async function createQuickBookingCalendar(
  ownerId: string,
  input?: {
    title?: string;
    description?: string;
    durationMinutes?: number;
    minimumNoticeMinutes?: number;
    availabilityBlocks?: Array<{ startAt: string; endAt: string }>;
  },
): Promise<EnsureBookingCalendarResult> {
  try {
    const current = await getBookingCalendarsConfig(ownerId);
    const title = makeUniqueCalendarTitle(current.calendars, input?.title);
    const id = makeUniqueCalendarId(current.calendars, title);
    const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.bookingCalendarCreate);
    if (!charged.ok) {
      return { ok: false, status: 402, error: "Insufficient credits" };
    }

    const nextCalendar: BookingCalendar = {
      id,
      enabled: true,
      title,
      description: (typeof input?.description === "string" && input.description.trim()
        ? input.description.trim().slice(0, 400)
        : `Quick booking calendar for ${toTitleCaseWords(title)}`).slice(0, 400),
      durationMinutes:
        typeof input?.durationMinutes === "number" && Number.isFinite(input.durationMinutes)
          ? Math.max(10, Math.min(180, Math.round(input.durationMinutes)))
          : undefined,
      minimumNoticeMinutes:
        typeof input?.minimumNoticeMinutes === "number" && Number.isFinite(input.minimumNoticeMinutes)
          ? Math.max(0, Math.min(60 * 24 * 14, Math.round(input.minimumNoticeMinutes)))
          : undefined,
      availabilityBlocks: normalizeAvailabilityBlocks(input?.availabilityBlocks),
    };
    const saved = await setBookingCalendarsConfig(ownerId, {
      version: 1,
      calendars: [...current.calendars, nextCalendar],
    });
    const persisted = saved.calendars.find((calendar) => calendar.id === id) || nextCalendar;
    return { ok: true, config: saved, calendar: persisted, created: true, enabledExisting: false };
  } catch {
    return { ok: false, status: 500, error: "Failed to create booking calendar" };
  }
}

export async function ensureEnabledBookingCalendar(
  ownerId: string,
  input?: { title?: string; description?: string },
): Promise<EnsureBookingCalendarResult> {
  try {
    const current = await getBookingCalendarsConfig(ownerId);
    const existingEnabled = current.calendars.find((calendar) => calendar.enabled !== false) || null;
    if (existingEnabled) {
      return {
        ok: true,
        config: current,
        calendar: existingEnabled,
        created: false,
        enabledExisting: false,
      };
    }

    if (current.calendars.length > 0) {
      const nextConfig = await setBookingCalendarsConfig(ownerId, {
        version: 1,
        calendars: current.calendars.map((calendar, index) => ({
          ...calendar,
          enabled: index === 0 ? true : calendar.enabled !== false,
        })),
      });
      const enabledCalendar = nextConfig.calendars.find((calendar) => calendar.enabled !== false) || nextConfig.calendars[0] || null;
      if (enabledCalendar) {
        return {
          ok: true,
          config: nextConfig,
          calendar: enabledCalendar,
          created: false,
          enabledExisting: true,
        };
      }
    }

    return await createQuickBookingCalendar(ownerId, input);
  } catch {
    return { ok: false, status: 500, error: "Failed to resolve booking calendar" };
  }
}
