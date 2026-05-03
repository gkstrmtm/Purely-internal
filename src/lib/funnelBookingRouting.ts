import {
  normalizeFunnelBookingAvailabilityTemplateId,
  normalizeFunnelBookingPresetId,
  normalizeFunnelBookingTimeZone,
  type FunnelBookingAvailabilityTemplateId,
  type FunnelBookingDefaults,
  type FunnelBookingPresetId,
} from "@/lib/funnelBookingDefaults";

export type FunnelBookingRouting = {
  calendarId: string | null;
  presetId?: FunnelBookingPresetId | null;
  durationMinutes?: number | null;
  minimumNoticeMinutes?: number | null;
  availabilityTemplateId?: FunnelBookingAvailabilityTemplateId | null;
  timeZone?: string | null;
};

type BookingCalendarLike = {
  id?: unknown;
  enabled?: unknown;
};

export function normalizeFunnelBookingCalendarId(raw: unknown): string | null {
  const next = String(typeof raw === "string" ? raw : "")
    .trim()
    .slice(0, 80);
  return next || null;
}

function normalizeFunnelBookingNumber(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

export function funnelBookingDefaultsToRouting(defaults: FunnelBookingDefaults): Omit<FunnelBookingRouting, "calendarId"> {
  return {
    presetId: defaults.presetId,
    durationMinutes: defaults.durationMinutes,
    minimumNoticeMinutes: defaults.minimumNoticeMinutes,
    availabilityTemplateId: defaults.availabilityTemplateId,
    timeZone: defaults.timeZone,
  };
}

export function readFunnelBookingRouting(settingsJson: unknown, funnelId: string): FunnelBookingRouting | null {
  const id = String(funnelId || "").trim();
  if (!id) return null;
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;

  const raw = (settingsJson as any).funnelBookingRouting;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const row = (raw as any)[id];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;

  return {
    calendarId: normalizeFunnelBookingCalendarId((row as any).calendarId),
    presetId: normalizeFunnelBookingPresetId((row as any).presetId),
    durationMinutes: normalizeFunnelBookingNumber((row as any).durationMinutes, 10, 180),
    minimumNoticeMinutes: normalizeFunnelBookingNumber((row as any).minimumNoticeMinutes, 0, 60 * 24 * 14),
    availabilityTemplateId: normalizeFunnelBookingAvailabilityTemplateId((row as any).availabilityTemplateId),
    timeZone: normalizeFunnelBookingTimeZone((row as any).timeZone),
  };
}

export function writeFunnelBookingRouting(
  settingsJson: unknown,
  funnelId: string,
  routing: FunnelBookingRouting | null,
) {
  const id = String(funnelId || "").trim();
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
  const funnelBookingRouting =
    base.funnelBookingRouting && typeof base.funnelBookingRouting === "object" && !Array.isArray(base.funnelBookingRouting)
      ? { ...(base.funnelBookingRouting as any) }
      : {};

  const calendarId = normalizeFunnelBookingCalendarId(routing?.calendarId ?? null);
  const presetId = normalizeFunnelBookingPresetId(routing?.presetId ?? null);
  const durationMinutes = normalizeFunnelBookingNumber(routing?.durationMinutes ?? null, 10, 180);
  const minimumNoticeMinutes = normalizeFunnelBookingNumber(routing?.minimumNoticeMinutes ?? null, 0, 60 * 24 * 14);
  const availabilityTemplateId = normalizeFunnelBookingAvailabilityTemplateId(routing?.availabilityTemplateId ?? null);
  const timeZone = normalizeFunnelBookingTimeZone(routing?.timeZone ?? null);
  const hasDefaults = Boolean(presetId || durationMinutes !== null || minimumNoticeMinutes !== null || availabilityTemplateId || timeZone);

  if (id && (calendarId || hasDefaults)) {
    funnelBookingRouting[id] = {
      calendarId,
      ...(presetId ? { presetId } : {}),
      ...(durationMinutes !== null ? { durationMinutes } : {}),
      ...(minimumNoticeMinutes !== null ? { minimumNoticeMinutes } : {}),
      ...(availabilityTemplateId ? { availabilityTemplateId } : {}),
      ...(timeZone ? { timeZone } : {}),
    };
  }
  else if (id) delete funnelBookingRouting[id];

  base.funnelBookingRouting = funnelBookingRouting;
  return base;
}

export function resolveFunnelBookingCalendarId(
  settingsJson: unknown,
  funnelId: string,
  calendars: BookingCalendarLike[],
): string {
  const enabledCalendarIds = (Array.isArray(calendars) ? calendars : [])
    .map((calendar) => {
      if (!calendar || typeof calendar !== "object") return "";
      if (calendar.enabled === false) return "";
      return String(calendar.id || "").trim().slice(0, 80);
    })
    .filter(Boolean);

  const preferredCalendarId = readFunnelBookingRouting(settingsJson, funnelId)?.calendarId ?? null;
  if (preferredCalendarId && enabledCalendarIds.includes(preferredCalendarId)) return preferredCalendarId;
  return enabledCalendarIds[0] || "";
}