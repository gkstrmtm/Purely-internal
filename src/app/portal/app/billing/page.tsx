import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { requirePortalUserForService } from "@/lib/portalAuth";

export default async function PortalAppBillingPage() {
  await requirePortalUserForService("billing", "view");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Billing</h1>
      <div className="mt-6">
        <PortalBillingClient embedded />
      </div>
    </div>
  );
}
