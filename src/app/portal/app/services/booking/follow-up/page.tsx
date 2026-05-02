import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalBookingClient } from "@/app/portal/app/services/booking/PortalBookingClient";

export default async function PortalBookingFollowUpSlugPage() {
  return (
    <PortalServiceGate slug="booking">
      <PortalBookingClient initialTopTab="follow-up" />
    </PortalServiceGate>
  );
}
