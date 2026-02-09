import { requirePortalUser } from "@/lib/portalAuth";
import { PortalAutomationsClient } from "@/app/portal/app/services/automations/PortalAutomationsClient";

export default async function PortalAutomationsServicePage() {
  await requirePortalUser();

  return <PortalAutomationsClient />;
}
