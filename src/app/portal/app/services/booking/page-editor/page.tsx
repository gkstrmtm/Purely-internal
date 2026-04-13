import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalBookingPageEditorPage() {
  return (
    <PortalServiceGate slug="booking">
      <HostedServicePageEditorClient service="BOOKING" serviceLabel="Booking" backHref="/services/booking" defaultPageKey="booking_main" />
    </PortalServiceGate>
  );
}