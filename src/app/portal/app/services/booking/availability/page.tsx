import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalBookingAvailabilityClient } from "@/app/portal/app/services/booking/availability/PortalBookingAvailabilityClient";

export default async function PortalBookingAvailabilityPage() {
  return (
    <PortalServiceGate slug="booking">
      <PortalBookingAvailabilityClient />
    </PortalServiceGate>
  );
}
