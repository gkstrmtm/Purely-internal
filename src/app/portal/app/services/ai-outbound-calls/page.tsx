import { requirePortalUser } from "@/lib/portalAuth";
import { PortalAiOutboundCallsClient } from "@/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient";

export default async function PortalAiOutboundCallsServicePage() {
  await requirePortalUser();

  return <PortalAiOutboundCallsClient />;
}
