import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalMissedCallTextBackClient } from "@/app/portal/app/services/missed-call-textback/PortalMissedCallTextBackClient";

export default async function PortalMissedCallTextBackServicePage() {
  return (
    <PortalServiceGate slug="missed-call-textback">
      <PortalMissedCallTextBackClient />
    </PortalServiceGate>
  );
}
