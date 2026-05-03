import { DateTime } from "luxon";

export type FunnelBookingPresetId = "consult" | "demo" | "application-review" | "office-hours";
export type FunnelBookingAvailabilityTemplateId =
  | "weekday-mornings"
  | "weekday-afternoons"
  | "weekday-full"
  | "tue-thu-extended";

export type FunnelBookingDefaults = {
  presetId: FunnelBookingPresetId;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  availabilityTemplateId: FunnelBookingAvailabilityTemplateId;
  timeZone: string;
};

type AvailabilityTemplateWindow = {
  weekdays: number[];
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
};

type BookingPresetDefinition = {
  id: FunnelBookingPresetId;
  label: string;
  description: string;
  defaults: Omit<FunnelBookingDefaults, "presetId">;
};

type BookingAvailabilityTemplateDefinition = {
  id: FunnelBookingAvailabilityTemplateId;
  label: string;
  description: string;
  windows: AvailabilityTemplateWindow[];
};

const DEFAULT_TIME_ZONE = "America/New_York";

const BOOKING_PRESET_DEFINITIONS: BookingPresetDefinition[] = [
  {
    id: "consult",
    label: "Consultation call",
    description: "Standard sales or strategy calls with enough time to understand the situation and recommend a next step.",
    defaults: {
      durationMinutes: 45,
      minimumNoticeMinutes: 12 * 60,
      availabilityTemplateId: "weekday-afternoons",
      timeZone: DEFAULT_TIME_ZONE,
    },
  },
  {
    id: "demo",
    label: "Product demo",
    description: "Short walkthroughs for showing the product quickly, answering questions, and moving someone toward a decision.",
    defaults: {
      durationMinutes: 30,
      minimumNoticeMinutes: 4 * 60,
      availabilityTemplateId: "weekday-mornings",
      timeZone: DEFAULT_TIME_ZONE,
    },
  },
  {
    id: "application-review",
    label: "Application review",
    description: "Review a submitted application together, clarify fit, and talk through the right way to help.",
    defaults: {
      durationMinutes: 60,
      minimumNoticeMinutes: 24 * 60,
      availabilityTemplateId: "tue-thu-extended",
      timeZone: DEFAULT_TIME_ZONE,
    },
  },
  {
    id: "office-hours",
    label: "Office hours / support",
    description: "Flexible short sessions for follow-up questions, support, or lighter check-ins across the day.",
    defaults: {
      durationMinutes: 20,
      minimumNoticeMinutes: 60,
      availabilityTemplateId: "weekday-full",
      timeZone: DEFAULT_TIME_ZONE,
    },
  },
];

const BOOKING_AVAILABILITY_TEMPLATE_DEFINITIONS: BookingAvailabilityTemplateDefinition[] = [
  {
    id: "weekday-mornings",
    label: "Weekday mornings",
    description: "Monday through Friday, 9:00 AM to 12:00 PM.",
    windows: [{ weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 12 }],
  },
  {
    id: "weekday-afternoons",
    label: "Weekday afternoons",
    description: "Monday through Friday, 1:00 PM to 5:00 PM.",
    windows: [{ weekdays: [1, 2, 3, 4, 5], startHour: 13, endHour: 17 }],
  },
  {
    id: "weekday-full",
    label: "Full weekday",
    description: "Monday through Friday, 9:00 AM to 5:00 PM.",
    windows: [{ weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }],
  },
  {
    id: "tue-thu-extended",
    label: "Tue to Thu extended",
    description: "Tuesday through Thursday, 10:00 AM to 6:00 PM.",
    windows: [{ weekdays: [2, 3, 4], startHour: 10, endHour: 18 }],
  },
];

export const FUNNEL_BOOKING_PRESET_OPTIONS = BOOKING_PRESET_DEFINITIONS.map((preset) => ({
  value: preset.id,
  label: preset.label,
  hint: preset.description,
}));

export const FUNNEL_BOOKING_AVAILABILITY_TEMPLATE_OPTIONS = BOOKING_AVAILABILITY_TEMPLATE_DEFINITIONS.map((template) => ({
  value: template.id,
  label: template.label,
  hint: template.description,
}));

function clampInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeFunnelBookingPresetId(raw: unknown): FunnelBookingPresetId | null {
  const next = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return BOOKING_PRESET_DEFINITIONS.some((preset) => preset.id === next) ? (next as FunnelBookingPresetId) : null;
}

export function normalizeFunnelBookingAvailabilityTemplateId(raw: unknown): FunnelBookingAvailabilityTemplateId | null {
  const next = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return BOOKING_AVAILABILITY_TEMPLATE_DEFINITIONS.some((template) => template.id === next)
    ? (next as FunnelBookingAvailabilityTemplateId)
    : null;
}

export function normalizeFunnelBookingTimeZone(raw: unknown): string | null {
  const next = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  if (!next) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: next }).format(new Date());
    return next;
  } catch {
    return null;
  }
}

export function getFunnelBookingPresetDefinition(presetId: FunnelBookingPresetId): BookingPresetDefinition {
  return BOOKING_PRESET_DEFINITIONS.find((preset) => preset.id === presetId) ?? BOOKING_PRESET_DEFINITIONS[0];
}

export function getFunnelBookingAvailabilityTemplateDefinition(
  templateId: FunnelBookingAvailabilityTemplateId,
): BookingAvailabilityTemplateDefinition {
  return BOOKING_AVAILABILITY_TEMPLATE_DEFINITIONS.find((template) => template.id === templateId) ?? BOOKING_AVAILABILITY_TEMPLATE_DEFINITIONS[0];
}

export function resolveFunnelBookingDefaults(raw: unknown): FunnelBookingDefaults {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const presetId = normalizeFunnelBookingPresetId(record.presetId) ?? "consult";
  const preset = getFunnelBookingPresetDefinition(presetId);

  return {
    presetId,
    durationMinutes: clampInt(record.durationMinutes, 10, 180) ?? preset.defaults.durationMinutes,
    minimumNoticeMinutes: clampInt(record.minimumNoticeMinutes, 0, 60 * 24 * 14) ?? preset.defaults.minimumNoticeMinutes,
    availabilityTemplateId:
      normalizeFunnelBookingAvailabilityTemplateId(record.availabilityTemplateId) ?? preset.defaults.availabilityTemplateId,
    timeZone: normalizeFunnelBookingTimeZone(record.timeZone) ?? preset.defaults.timeZone,
  };
}

export function buildAvailabilityBlocksFromTemplate(opts: {
  templateId: FunnelBookingAvailabilityTemplateId;
  timeZone: string;
  anchorDate?: Date;
  weeks?: number;
}): Array<{ startAt: string; endAt: string }> {
  const template = getFunnelBookingAvailabilityTemplateDefinition(opts.templateId);
  const zone = normalizeFunnelBookingTimeZone(opts.timeZone) ?? DEFAULT_TIME_ZONE;
  const nowLocal = DateTime.fromJSDate(opts.anchorDate ?? new Date(), { zone });
  const startOfDay = nowLocal.startOf("day");
  const weeks = clampInt(opts.weeks, 1, 12) ?? 6;
  const out: Array<{ startAt: string; endAt: string }> = [];

  for (let dayOffset = 0; dayOffset < weeks * 7; dayOffset += 1) {
    const day = startOfDay.plus({ days: dayOffset });
    for (const window of template.windows) {
      if (!window.weekdays.includes(day.weekday)) continue;
      const startAt = day.set({ hour: window.startHour, minute: window.startMinute ?? 0, second: 0, millisecond: 0 });
      const endAt = day.set({ hour: window.endHour, minute: window.endMinute ?? 0, second: 0, millisecond: 0 });
      if (!startAt.isValid || !endAt.isValid || endAt <= startAt || endAt <= nowLocal) continue;
      out.push({
        startAt: startAt.toUTC().toISO() ?? startAt.toUTC().toString(),
        endAt: endAt.toUTC().toISO() ?? endAt.toUTC().toString(),
      });
      if (out.length >= 1000) return out;
    }
  }

  return out;
}