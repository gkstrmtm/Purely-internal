import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppSettingsIntegrationsPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Integrations</h1>
      <div className="mt-6">
        <PortalProfileClient embedded mode="integrations" />
      </div>
    </div>
  );
}
