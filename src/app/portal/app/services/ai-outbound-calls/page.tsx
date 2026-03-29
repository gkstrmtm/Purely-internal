import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAiOutboundCallsClient } from "@/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient";
import { redirect } from "next/navigation";
import { requestPortalAppBasePath } from "@/lib/portalVariant.server";

export default async function PortalAiOutboundCallsServicePage() {
  const base = await requestPortalAppBasePath();
  redirect(`${base}/services/ai-outbound-calls/calls`);
  return null;
}
