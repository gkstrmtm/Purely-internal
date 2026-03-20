import { PortalBillingUpgradeClient } from "@/app/portal/billing/PortalBillingUpgradeClient";
import { requirePortalUserForService } from "@/lib/portalAuth";

export default async function PortalBillingUpgradePage() {
  await requirePortalUserForService("billing", "view");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Upgrade to a monthly plan</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Pick a package, check out securely, and we&apos;ll switch your account from credits-only to a monthly plan.
      </p>

      <div className="mt-6">
        <PortalBillingUpgradeClient />
      </div>
    </div>
  );
}
