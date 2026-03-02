import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalStripeSalesClient } from "@/app/portal/app/services/reporting/stripe/PortalStripeSalesClient";

export default async function PortalReportingStripePage() {
  return (
    <PortalServiceGate slug="reporting">
      <PortalStripeSalesClient />
    </PortalServiceGate>
  );
}
