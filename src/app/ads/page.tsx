import Link from "next/link";

export default function AdsLandingPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-mist text-brand-ink">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700">
          Portal Ads
        </div>
        <h1 className="mt-5 text-3xl font-bold sm:text-5xl">Run ads inside the portal</h1>
        <p className="mt-4 max-w-2xl text-sm text-zinc-600 sm:text-base">
          Create campaigns, target by industry and business model, and control your daily budget.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/ads/app"
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            Open Ads Manager
          </Link>
          <Link
            href="/ads/login"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { title: "Targeting", body: "Industry, business model, services, and preset buckets." },
            { title: "Placements", body: "Sidebar, top banner, and popup cards." },
            { title: "Budget", body: "Set a daily budget and cost-per-click." },
          ].map((c) => (
            <div key={c.title} className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
              <div className="mt-2 text-sm text-zinc-600">{c.body}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
