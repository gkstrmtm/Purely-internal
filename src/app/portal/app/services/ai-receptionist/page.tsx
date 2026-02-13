import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAiReceptionistClient } from "@/app/portal/app/services/ai-receptionist/PortalAiReceptionistClient";

export default async function PortalAiReceptionistServicePage() {
  return (
    <PortalServiceGate slug="ai-receptionist">
      <PortalAiReceptionistClient />
    </PortalServiceGate>
  );
}
