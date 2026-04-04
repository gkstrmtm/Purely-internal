import { redirect } from "next/navigation";
import { requestPortalAppBasePath } from "@/lib/portalVariant.server";

export default async function PortalAiOutboundCallsServicePage() {
  const base = await requestPortalAppBasePath();
  redirect(`${base}/services/ai-outbound-calls/calls`);
  return null;
}
