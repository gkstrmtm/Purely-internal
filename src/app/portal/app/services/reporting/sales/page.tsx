import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalSalesReportingClient } from "@/app/portal/app/services/reporting/sales/PortalSalesReportingClient";

export default async function PortalReportingSalesPage() {
  return (
    <PortalServiceGate slug="reporting">
      <PortalSalesReportingClient />
    </PortalServiceGate>
  );
}
