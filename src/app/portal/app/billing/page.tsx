import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppBillingPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Billing</h1>
      <p className="mt-2 text-sm text-zinc-600">Payment details, monthly charges, and credits.</p>

      <div className="mt-6">
        <PortalBillingClient />
      </div>
    </div>
  );
}
