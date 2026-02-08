import { PortalDashboardClient } from "@/app/portal/PortalDashboardClient";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppHomePage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">Your services, billing, and automation stats.</p>
        </div>
      </div>

      <div className="mt-6">
        <PortalDashboardClient />
      </div>
    </div>
  );
}
