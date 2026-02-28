import Link from "next/link";
import Image from "next/image";

export default function AdsLandingPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-mist text-brand-ink">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="relative h-10 w-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <Image src="/brand/purity-5.png" alt="Purely" fill className="object-contain p-1" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-zinc-900">Purely</div>
              <div className="text-xs text-zinc-500">Portal Ads</div>
            </div>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/ads/login"
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-white/70"
            >
              Sign in
            </Link>
            <Link
              href="/ads/signup"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Get started
            </Link>
          </nav>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700">
              Reach portal users when they’re ready to buy
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
              Run high-intent ads inside the portal
            </h1>
            <p className="mt-4 max-w-xl text-sm text-zinc-600 sm:text-base">
              Launch CPC campaigns, target by industry and services, and control spend with daily budgets — all from a
              clean, simple Ads Manager.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/ads/signup"
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
              >
                Start advertising
              </Link>
              <Link
                href="/ads/app"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Open Ads Manager
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["CPC billing (charged on click)", "Daily budget guardrails", "Audience profiles (saved targeting)", "Upload images and video"].map(
                (t) => (
                  <div key={t} className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-sm text-zinc-700">
                    {t}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[color:var(--color-brand-pink)]/25 via-white/0 to-[color:var(--color-brand-blue)]/25 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-900">Ads Manager</div>
                  <div className="text-xs text-zinc-500">Preview</div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  {["Balance", "Spend (7d)", "Campaigns"].map((k) => (
                    <div key={k} className="rounded-3xl border border-zinc-200 bg-white p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{k}</div>
                      <div className="mt-3 h-7 w-24 rounded-xl bg-zinc-100" />
                      <div className="mt-3 h-3 w-32 rounded-xl bg-zinc-100" />
                    </div>
                  ))}
                </div>

                <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200">
                  <div className="border-b border-zinc-200 px-5 py-4">
                    <div className="text-sm font-semibold text-zinc-900">Your campaigns</div>
                    <div className="mt-1 text-sm text-zinc-600">Targeting, budgets, and quick edits.</div>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="h-4 w-44 max-w-full rounded-xl bg-zinc-100" />
                            <div className="mt-2 h-3 w-60 max-w-full rounded-xl bg-zinc-100" />
                          </div>
                          <div className="h-8 w-20 rounded-2xl bg-zinc-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-14">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "Targeting that feels native", body: "Industry, business model, services, and targeting buckets." },
              { title: "Premium placements", body: "Sidebar banners, top banners, and popup cards." },
              { title: "Simple budgets", body: "Set daily spend + CPC. Guardrails enforce limits automatically." },
            ].map((c) => (
              <div key={c.title} className="rounded-[2rem] border border-zinc-200 bg-white p-6">
                <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
                <div className="mt-2 text-sm text-zinc-600">{c.body}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-[2rem] border border-zinc-200 bg-white p-6 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Ready to launch your first campaign?</div>
              <div className="mt-1 text-sm text-zinc-600">It takes ~2 minutes to create targeting + creative.</div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/ads/app/campaigns/new"
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
              >
                Create a campaign
              </Link>
              <Link
                href="/ads/login"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
