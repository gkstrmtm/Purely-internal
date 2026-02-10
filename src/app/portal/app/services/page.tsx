import { requirePortalUser } from "@/lib/portalAuth";
import { PortalServicesClient } from "@/app/portal/app/services/PortalServicesClient";

export default async function PortalAppServicesPage() {
  await requirePortalUser();

  return <PortalServicesClient />;
}
