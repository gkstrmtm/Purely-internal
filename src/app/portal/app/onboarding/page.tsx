import { requirePortalUserForService } from "@/lib/portalAuth";
import { PortalOnboardingClient } from "@/app/portal/app/onboarding/PortalOnboardingClient";

export default async function PortalOnboardingPage() {
  await requirePortalUserForService("businessProfile", "edit");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Onboarding</h1>
      <p className="mt-2 text-sm text-zinc-600">
        A quick setup to make your services work smoothly.
      </p>

      <div className="mt-6">
        <PortalOnboardingClient />
      </div>
    </div>
  );
}
