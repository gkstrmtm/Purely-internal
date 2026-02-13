import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAiOutboundCallsClient } from "@/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient";

export default async function PortalAiOutboundCallsServicePage() {
  return (
    <PortalServiceGate slug="ai-outbound-calls">
      <PortalAiOutboundCallsClient />
    </PortalServiceGate>
  );
}
