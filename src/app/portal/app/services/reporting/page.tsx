import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalReportingClient } from "@/app/portal/app/services/reporting/PortalReportingClient";

export default async function PortalReportingServicePage() {
  return (
    <PortalServiceGate slug="reporting">
      <PortalReportingClient />
    </PortalServiceGate>
  );
}
