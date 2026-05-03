import { createQuickBookingCalendar, getBookingCalendarsConfig, setBookingCalendarsConfig, type BookingCalendar, type BookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getCreditFunnelBuilderSettings, mutateCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { buildAvailabilityBlocksFromTemplate, resolveFunnelBookingDefaults, type FunnelBookingDefaults } from "@/lib/funnelBookingDefaults";
import { funnelBookingDefaultsToRouting, readFunnelBookingRouting, writeFunnelBookingRouting } from "@/lib/funnelBookingRouting";

export type EnsureFunnelBookingCalendarResult =
  | {
      ok: true;
      calendar: BookingCalendar;
      config: BookingCalendarsConfig;
      created: boolean;
      routingUpdated: boolean;
    }
  | {
      ok: false;
      status: 402 | 500;
      error: string;
    };

function cleanLabel(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function buildFunnelCalendarTitle(opts: {
  funnelName?: string | null;
  pageTitle?: string | null;
  requestedTitle?: string | null;
}) {
  const requestedTitle = cleanLabel(opts.requestedTitle, 80);
  if (requestedTitle) return requestedTitle;

  const funnelName = cleanLabel(opts.funnelName, 60);
  const pageTitle = cleanLabel(opts.pageTitle, 40);
  if (funnelName && pageTitle && funnelName.toLowerCase() !== pageTitle.toLowerCase()) {
    return `${funnelName} ${pageTitle} calendar`.slice(0, 80).trim();
  }
  if (funnelName) {
    return `${funnelName}${/calendar/i.test(funnelName) ? "" : " calendar"}`.slice(0, 80).trim();
  }
  if (pageTitle) {
    return `${pageTitle}${/calendar/i.test(pageTitle) ? "" : " calendar"}`.slice(0, 80).trim();
  }
  return "Quick calendar";
}

function buildFunnelCalendarDescription(opts: {
  funnelName?: string | null;
  pageTitle?: string | null;
  requestedDescription?: string | null;
  title: string;
}) {
  const requestedDescription = cleanLabel(opts.requestedDescription, 400);
  if (requestedDescription) return requestedDescription;

  const funnelName = cleanLabel(opts.funnelName, 120);
  const pageTitle = cleanLabel(opts.pageTitle, 120);
  if (funnelName && pageTitle && funnelName.toLowerCase() !== pageTitle.toLowerCase()) {
    return `Booking calendar for the ${pageTitle} step in ${funnelName}. Configure availability, duration, and routing details later.`.slice(0, 400);
  }
  if (funnelName) {
    return `Booking calendar for ${funnelName}. Configure availability, duration, and routing details later.`.slice(0, 400);
  }
  return `Booking calendar for ${opts.title}. Configure availability, duration, and routing details later.`.slice(0, 400);
}

export async function ensureFunnelBookingCalendar(opts: {
  ownerId: string;
  funnelId: string;
  funnelName?: string | null;
  pageTitle?: string | null;
  requestedTitle?: string | null;
  requestedDescription?: string | null;
  bookingDefaults?: FunnelBookingDefaults | null;
}): Promise<EnsureFunnelBookingCalendarResult> {
  const ownerId = cleanLabel(opts.ownerId, 120);
  const funnelId = cleanLabel(opts.funnelId, 120);
  if (!ownerId || !funnelId) {
    return { ok: false, status: 500, error: "Failed to resolve funnel booking calendar" };
  }

  try {
    const [settings, calendarConfig] = await Promise.all([
      getCreditFunnelBuilderSettings(ownerId).catch(() => ({})),
      getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] })),
    ]);

    const currentRouting = readFunnelBookingRouting(settings, funnelId);
    const routedCalendarId = currentRouting?.calendarId ?? null;
    const resolvedBookingDefaults = resolveFunnelBookingDefaults({
      ...(currentRouting ?? {}),
      ...(opts.bookingDefaults ?? {}),
    });
    const calendars = Array.isArray(calendarConfig?.calendars) ? calendarConfig.calendars : [];
    const routedCalendar = routedCalendarId ? calendars.find((calendar) => calendar.id === routedCalendarId) ?? null : null;

    if (routedCalendar) {
      if (routedCalendar.enabled !== false) {
        return {
          ok: true,
          calendar: routedCalendar,
          config: calendarConfig,
          created: false,
          routingUpdated: false,
        };
      }

      const nextConfig = await setBookingCalendarsConfig(ownerId, {
        version: 1,
        calendars: calendars.map((calendar) =>
          calendar.id === routedCalendar.id
            ? {
                ...calendar,
                enabled: true,
              }
            : calendar,
        ),
      });
      const enabledCalendar = nextConfig.calendars.find((calendar) => calendar.id === routedCalendar.id) ?? {
        ...routedCalendar,
        enabled: true,
      };
      return {
        ok: true,
        calendar: enabledCalendar,
        config: nextConfig,
        created: false,
        routingUpdated: false,
      };
    }

    const title = buildFunnelCalendarTitle(opts);
    const description = buildFunnelCalendarDescription({
      funnelName: opts.funnelName,
      pageTitle: opts.pageTitle,
      requestedDescription: opts.requestedDescription,
      title,
    });
    const created = await createQuickBookingCalendar(ownerId, {
      title,
      description,
      durationMinutes: resolvedBookingDefaults.durationMinutes,
      minimumNoticeMinutes: resolvedBookingDefaults.minimumNoticeMinutes,
      availabilityBlocks: buildAvailabilityBlocksFromTemplate({
        templateId: resolvedBookingDefaults.availabilityTemplateId,
        timeZone: resolvedBookingDefaults.timeZone,
      }),
    });
    if (!created.ok) {
      return created;
    }

    await mutateCreditFunnelBuilderSettings(ownerId, (current) => ({
      next: writeFunnelBookingRouting(current, funnelId, {
        calendarId: created.calendar.id,
        ...funnelBookingDefaultsToRouting(resolvedBookingDefaults),
      }),
      value: created.calendar.id,
    }));

    return {
      ok: true,
      calendar: created.calendar,
      config: created.config,
      created: true,
      routingUpdated: true,
    };
  } catch {
    return { ok: false, status: 500, error: "Failed to resolve funnel booking calendar" };
  }
}