import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";
import { getHostedBookingCalendarPageKey, HOSTED_BOOKING_MAIN_PAGE_KEY } from "@/lib/hostedPageKeys";

export default async function PortalBookingPageEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ calendarId?: string; pageKey?: string }>;
}) {
  const resolved = (((await searchParams?.catch(() => ({}))) ?? {}) as { calendarId?: string; pageKey?: string });
  const pageKey = typeof resolved.pageKey === "string" ? resolved.pageKey.trim() : "";
  const calendarId = typeof resolved.calendarId === "string" ? resolved.calendarId.trim() : "";
  const defaultPageKey = pageKey || (calendarId ? getHostedBookingCalendarPageKey(calendarId) : HOSTED_BOOKING_MAIN_PAGE_KEY);

  return (
    <PortalServiceGate slug="booking">
      <HostedServicePageEditorClient service="BOOKING" serviceLabel="Booking" backHref="/services/booking" defaultPageKey={defaultPageKey} />
    </PortalServiceGate>
  );
}