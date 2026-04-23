export type FunnelBookingRouting = {
  calendarId: string | null;
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
  if (id && calendarId) funnelBookingRouting[id] = { calendarId };
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