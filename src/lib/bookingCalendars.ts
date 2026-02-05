import { prisma } from "@/lib/db";

export type BookingCalendar = {
  id: string;
  enabled: boolean;
  title: string;
  description?: string;
  durationMinutes?: number;
  meetingLocation?: string;
  meetingDetails?: string;
  notificationEmails?: string[];
};

export type BookingCalendarsConfig = {
  version: 1;
  calendars: BookingCalendar[];
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

    const durationMinutesRaw = item.durationMinutes;
    const durationMinutes =
      typeof durationMinutesRaw === "number" && Number.isFinite(durationMinutesRaw)
        ? Math.max(10, Math.min(180, Math.round(durationMinutesRaw)))
        : undefined;

    calendars.push({
      id,
      enabled: normalizeBool(item.enabled, true),
      title,
      description: description || undefined,
      durationMinutes,
      meetingLocation: meetingLocation || undefined,
      meetingDetails: meetingDetails || undefined,
      notificationEmails: notificationEmails.length ? notificationEmails : undefined,
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
