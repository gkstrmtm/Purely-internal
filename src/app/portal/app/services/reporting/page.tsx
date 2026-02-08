import { requirePortalUser } from "@/lib/portalAuth";
import { PortalReportingClient } from "@/app/portal/app/services/reporting/PortalReportingClient";

export default async function PortalReportingServicePage() {
  await requirePortalUser();

  return <PortalReportingClient />;
}
