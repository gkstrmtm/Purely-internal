import Link from "next/link";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalServiceNewsletterPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Newsletter</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">Newsletter campaigns are coming soon.</p>
        </div>
        <Link
          href="/portal/app/services"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">What to expect</div>
        <div className="mt-2 text-sm text-zinc-600">
          You’ll be able to build segments from your contacts, send newsletters, and track basic delivery + engagement.
        </div>
      </div>
    </div>
  );
}
