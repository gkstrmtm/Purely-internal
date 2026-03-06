import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAiOutboundCallsClient } from "@/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TabKey = "calls" | "messages" | "settings";

export default async function PortalAiOutboundCallsServiceTabPage({
  params,
}: {
  params: Promise<{ tab?: string }>;
}) {
  const resolved = await params;
  const raw = String(resolved?.tab || "calls").toLowerCase();

  if (raw !== "calls" && raw !== "messages" && raw !== "settings") {
    redirect("/portal/app/services/ai-outbound-calls/calls");
  }

  return (
    <PortalServiceGate slug="ai-outbound-calls">
      <PortalAiOutboundCallsClient initialTab={raw as TabKey} />
    </PortalServiceGate>
  );
}
