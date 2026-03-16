import { redirect } from "next/navigation";

import { requestPortalAppBasePath } from "@/lib/portalVariant.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalAiOutboundCallsServiceTabPage({
  params,
}: {
  params: Promise<{ tab?: string }>;
}) {
  const resolved = await params;
  const raw = String(resolved?.tab || "calls").toLowerCase();

  if (raw !== "calls" && raw !== "messages" && raw !== "settings") {
    const base = await requestPortalAppBasePath();
    redirect(`${base}/services/ai-outbound-calls/calls`);
  }

  return null;
}
