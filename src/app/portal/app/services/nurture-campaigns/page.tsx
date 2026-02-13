import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalNurtureCampaignsClient } from "@/app/portal/app/services/nurture-campaigns/PortalNurtureCampaignsClient";

export default async function PortalServiceNurtureCampaignsPage() {
  return (
    <PortalServiceGate slug="nurture-campaigns">
      <PortalNurtureCampaignsClient />
    </PortalServiceGate>
  );
}
