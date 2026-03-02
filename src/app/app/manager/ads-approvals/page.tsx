import AdsCampaignApprovalsClient from "./AdsCampaignApprovalsClient";

export const dynamic = "force-dynamic";

export default function ManagerAdsApprovalsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <AdsCampaignApprovalsClient />
    </div>
  );
}
