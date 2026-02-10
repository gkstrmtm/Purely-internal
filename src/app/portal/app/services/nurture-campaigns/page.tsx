import Link from "next/link";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalServiceNurtureCampaignsPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Nurture Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">Nurture sequences are coming soon.</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">What to expect</div>
        <div className="mt-2 text-sm text-zinc-600">
          Build longer-running sequences with delays, conditions, and multi-channel messaging.
        </div>
      </div>
    </div>
  );
}
