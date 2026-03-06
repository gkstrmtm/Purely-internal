import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAiOutboundCallsClient } from "@/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient";
import { redirect } from "next/navigation";

export default async function PortalAiOutboundCallsServicePage() {
  redirect("/portal/app/services/ai-outbound-calls/calls");
  return (
    <PortalServiceGate slug="ai-outbound-calls">
      <PortalAiOutboundCallsClient />
    </PortalServiceGate>
  );
}
