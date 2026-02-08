import { requirePortalUser } from "@/lib/portalAuth";
import { PortalBookingAvailabilityClient } from "@/app/portal/app/services/booking/availability/PortalBookingAvailabilityClient";

export default async function PortalBookingAvailabilityPage() {
  await requirePortalUser();

  return <PortalBookingAvailabilityClient />;
}
