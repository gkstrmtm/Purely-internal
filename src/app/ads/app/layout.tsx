import Link from "next/link";

import { requireAdsUser } from "@/lib/adsAuth";
import { AdsSignOutButton } from "@/app/ads/app/signout/AdsSignOutButton";

export default async function AdsAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdsUser();

  return (
    <div className="min-h-[100dvh] bg-brand-mist text-brand-ink">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/ads" className="text-sm font-semibold text-zinc-900">
              Ads Manager
            </Link>
            <span className="hidden text-xs text-zinc-500 sm:inline">{user.email}</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/ads/app"
              className="rounded-2xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Campaigns
            </Link>
            <Link
              href="/ads/app/campaigns/new"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              New campaign
            </Link>
            <AdsSignOutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
