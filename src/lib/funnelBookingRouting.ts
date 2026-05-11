import {
  normalizeFunnelBookingAvailabilityTemplateId,
  normalizeFunnelBookingPresetId,
  normalizeFunnelBookingTimeZone,
  type FunnelBookingAvailabilityTemplateId,
  type FunnelBookingDefaults,
  type FunnelBookingPresetId,
} from "@/lib/funnelBookingDefaults";

export type FunnelBookingHostedTheme = {
  version: 1;
  bgHex: string | null;
  surfaceHex: string | null;
  softHex: string | null;
  borderHex: string | null;
  textHex: string | null;
  mutedTextHex: string | null;
  primaryHex: string | null;
  accentHex: string | null;
  linkHex: string | null;
};

const EMPTY_FUNNEL_BOOKING_HOSTED_THEME: FunnelBookingHostedTheme = {
  version: 1,
  bgHex: null,
  surfaceHex: null,
  softHex: null,
  borderHex: null,
  textHex: null,
  mutedTextHex: null,
  primaryHex: null,
  accentHex: null,
  linkHex: null,
};

export type FunnelBookingRouting = {
  calendarId: string | null;
  presetId?: FunnelBookingPresetId | null;
  durationMinutes?: number | null;
  minimumNoticeMinutes?: number | null;
  availabilityTemplateId?: FunnelBookingAvailabilityTemplateId | null;
  timeZone?: string | null;
  hostedTheme?: FunnelBookingHostedTheme | null;
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

function normalizeHex(value: unknown): string | null {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next) return null;
  const short = /^#([0-9a-fA-F]{3})$/.exec(next);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(next);
  if (full) return `#${full[1]}`.toLowerCase();
  return null;
}

function normalizeFunnelBookingHostedTheme(raw: unknown): FunnelBookingHostedTheme | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const next: FunnelBookingHostedTheme = {
    version: 1,
    bgHex: normalizeHex(record.bgHex),
    surfaceHex: normalizeHex(record.surfaceHex),
    softHex: normalizeHex(record.softHex),
    borderHex: normalizeHex(record.borderHex),
    textHex: normalizeHex(record.textHex),
    mutedTextHex: normalizeHex(record.mutedTextHex),
    primaryHex: normalizeHex(record.primaryHex),
    accentHex: normalizeHex(record.accentHex),
    linkHex: normalizeHex(record.linkHex),
  };
  return hasFunnelBookingHostedTheme(next) ? next : null;
}

function hasFunnelBookingHostedTheme(theme: FunnelBookingHostedTheme | null | undefined) {
  if (!theme) return false;
  return Boolean(
    theme.bgHex ||
      theme.surfaceHex ||
      theme.softHex ||
      theme.borderHex ||
      theme.textHex ||
      theme.mutedTextHex ||
      theme.primaryHex ||
      theme.accentHex ||
      theme.linkHex,
  );
}

export function mergeFunnelBookingHostedTheme(
  base: FunnelBookingHostedTheme | null | undefined,
  override: FunnelBookingHostedTheme | null | undefined,
): FunnelBookingHostedTheme {
  const baseTheme = normalizeFunnelBookingHostedTheme(base) ?? EMPTY_FUNNEL_BOOKING_HOSTED_THEME;
  const overrideTheme = normalizeFunnelBookingHostedTheme(override);
  if (!overrideTheme) return { ...baseTheme };
  return {
    version: 1,
    bgHex: overrideTheme.bgHex ?? baseTheme.bgHex,
    surfaceHex: overrideTheme.surfaceHex ?? baseTheme.surfaceHex,
    softHex: overrideTheme.softHex ?? baseTheme.softHex,
    borderHex: overrideTheme.borderHex ?? baseTheme.borderHex,
    textHex: overrideTheme.textHex ?? baseTheme.textHex,
    mutedTextHex: overrideTheme.mutedTextHex ?? baseTheme.mutedTextHex,
    primaryHex: overrideTheme.primaryHex ?? baseTheme.primaryHex,
    accentHex: overrideTheme.accentHex ?? baseTheme.accentHex,
    linkHex: overrideTheme.linkHex ?? baseTheme.linkHex,
  };
}

export function funnelBookingDefaultsToRouting(
  defaults: FunnelBookingDefaults,
): Omit<FunnelBookingRouting, "calendarId" | "hostedTheme"> {
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
    hostedTheme: normalizeFunnelBookingHostedTheme((row as any).hostedTheme),
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
  const hostedTheme = normalizeFunnelBookingHostedTheme(routing?.hostedTheme ?? null);
  const hasDefaults = Boolean(presetId || durationMinutes !== null || minimumNoticeMinutes !== null || availabilityTemplateId || timeZone);
  const hasHostedTheme = hasFunnelBookingHostedTheme(hostedTheme);

  if (id && (calendarId || hasDefaults || hasHostedTheme)) {
    funnelBookingRouting[id] = {
      calendarId,
      ...(presetId ? { presetId } : {}),
      ...(durationMinutes !== null ? { durationMinutes } : {}),
      ...(minimumNoticeMinutes !== null ? { minimumNoticeMinutes } : {}),
      ...(availabilityTemplateId ? { availabilityTemplateId } : {}),
      ...(timeZone ? { timeZone } : {}),
      ...(hasHostedTheme ? { hostedTheme } : {}),
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