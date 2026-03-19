import Link from "next/link";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppSettingsPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Settings</h1>
      <p className="mt-2 text-sm text-zinc-600">Profile, billing, and account-level configuration.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/portal/app/profile"
          className="group rounded-3xl border border-zinc-200 bg-white p-5 hover:bg-zinc-50"
        >
          <div className="text-sm font-semibold text-zinc-900">Profile</div>
          <div className="mt-1 text-sm text-zinc-600">Business info, integrations, webhooks, and security.</div>
          <div className="mt-4 text-xs font-semibold text-(--color-brand-blue)">Open Profile →</div>
        </Link>

        <Link
          href="/portal/app/billing"
          className="group rounded-3xl border border-zinc-200 bg-white p-5 hover:bg-zinc-50"
        >
          <div className="text-sm font-semibold text-zinc-900">Billing</div>
          <div className="mt-1 text-sm text-zinc-600">Payment details, monthly charges, and credits.</div>
          <div className="mt-4 text-xs font-semibold text-(--color-brand-blue)">Open Billing →</div>
        </Link>
      </div>
    </div>
  );
}
