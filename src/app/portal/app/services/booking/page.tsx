import { requirePortalUser } from "@/lib/portalAuth";
import { PortalBookingClient } from "@/app/portal/app/services/booking/PortalBookingClient";

export default async function PortalBookingServicePage() {
  await requirePortalUser();

  return <PortalBookingClient />;
}
