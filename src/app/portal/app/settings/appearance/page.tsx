import { requirePortalUser } from "@/lib/portalAuth";

import { PortalAppearanceSettingsClient } from "./PortalAppearanceSettingsClient";

export default async function PortalAppSettingsAppearancePage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Appearance</h1>
      <div className="mt-6">
        <PortalAppearanceSettingsClient />
      </div>
    </div>
  );
}
