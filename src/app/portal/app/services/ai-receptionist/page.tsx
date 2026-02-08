import { requirePortalUser } from "@/lib/portalAuth";
import { PortalAiReceptionistClient } from "@/app/portal/app/services/ai-receptionist/PortalAiReceptionistClient";

export default async function PortalAiReceptionistServicePage() {
  await requirePortalUser();

  return <PortalAiReceptionistClient />;
}
