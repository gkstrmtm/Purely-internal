export const HOSTED_BOOKING_MAIN_PAGE_KEY = "booking_main";

const HOSTED_BOOKING_CALENDAR_PAGE_KEY_PREFIX = "booking_calendar_";

export function getHostedBookingCalendarPageKey(calendarId: string) {
  const cleanCalendarId = String(calendarId || "").trim();
  return cleanCalendarId ? `${HOSTED_BOOKING_CALENDAR_PAGE_KEY_PREFIX}${cleanCalendarId}` : HOSTED_BOOKING_MAIN_PAGE_KEY;
}

export function getHostedBookingCalendarIdFromPageKey(pageKey: string | null | undefined) {
  const cleanPageKey = String(pageKey || "").trim();
  if (!cleanPageKey.startsWith(HOSTED_BOOKING_CALENDAR_PAGE_KEY_PREFIX)) return null;
  const calendarId = cleanPageKey.slice(HOSTED_BOOKING_CALENDAR_PAGE_KEY_PREFIX.length).trim();
  return calendarId || null;
}