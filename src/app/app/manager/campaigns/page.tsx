import PortalAdCampaignsClient from "../../staff/portal-campaigns/PortalAdCampaignsClient";

export const dynamic = "force-dynamic";

export default function ManagerCampaignsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <PortalAdCampaignsClient />
    </div>
  );
}
