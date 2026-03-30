import { requirePortalUser } from "@/lib/portalAuth";
import { SettingsTabsClient } from "./SettingsTabsClient";

export default async function PortalAppSettingsPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Settings</h1>

      <SettingsTabsClient generalOnly />
    </div>
  );
}
