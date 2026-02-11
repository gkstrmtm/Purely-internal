import { requirePortalUser } from "@/lib/portalAuth";
import { PortalNurtureCampaignsClient } from "@/app/portal/app/services/nurture-campaigns/PortalNurtureCampaignsClient";

export default async function PortalServiceNurtureCampaignsPage() {
  await requirePortalUser();

  return <PortalNurtureCampaignsClient />;
}
