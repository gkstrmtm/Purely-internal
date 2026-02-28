import Link from "next/link";
import Image from "next/image";

function IconTarget(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path
        d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        opacity="0.8"
      />
      <path d="M12 13.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" fill="currentColor" />
    </svg>
  );
}

function IconSpark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path
        d="M12 2l1.2 5.1L18 9l-4.8 1.9L12 16l-1.2-5.1L6 9l4.8-1.9L12 2Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M19 13l.7 2.7L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-1.3L19 13Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}

function IconBolt(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path
        d="M13 2 4 14h7l-1 8 10-14h-7l0-6Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function IconShield(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path
        d="M12 2 20 6v6c0 5.25-3.4 9.9-8 10-4.6-.1-8-4.75-8-10V6l8-4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M8.5 12.1 11 14.6 15.7 9.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdsLandingPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-mist pb-28 text-brand-ink">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/brand/purity-5.png" alt="" width={56} height={56} className="h-14 w-14 object-contain" priority />
            <span className="sr-only">Home</span>
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
              Niche targeting · pay-per-click · fast setup
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
              Run ads directly to your niche
            </h1>
            <p className="mt-4 max-w-xl text-sm text-zinc-600 sm:text-base">
              Launch pay‑per‑click campaigns that show up where buyers already are. Target by industry and services, control spend
              with daily budgets, and iterate fast.
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

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                {
                  title: "High-intent reach",
                  body: "Show up at the moment buyers are deciding.",
                  icon: IconTarget,
                  blob: "from-[color:var(--color-brand-blue)]/35 via-[color:var(--color-brand-pink)]/20 to-white/0",
                },
                {
                  title: "Pay-per-click",
                  body: "Only pay when someone clicks.",
                  icon: IconShield,
                  blob: "from-[color:var(--color-brand-pink)]/35 via-[color:var(--color-brand-blue)]/15 to-white/0",
                },
                {
                  title: "Fast creative iterations",
                  body: "Generate, test, and refine in minutes.",
                  icon: IconSpark,
                  blob: "from-[color:var(--color-brand-pink)]/25 via-[color:var(--color-brand-blue)]/25 to-white/0",
                },
                {
                  title: "Guardrails by default",
                  body: "Daily budgets keep spend predictable.",
                  icon: IconBolt,
                  blob: "from-[color:var(--color-brand-blue)]/25 via-[color:var(--color-brand-pink)]/25 to-white/0",
                },
              ].map((c) => (
                <div key={c.title} className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur">
                  <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${c.blob} blur-2xl`} />
                  <div className="relative flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-ink text-white">
                      <c.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
                      <div className="mt-1 text-sm text-zinc-600">{c.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[color:var(--color-brand-pink)]/25 via-white/0 to-[color:var(--color-brand-blue)]/25 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-900">Ads Manager</div>
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
              { title: "Simple budgets", body: "Set daily spend. Guardrails enforce limits automatically." },
            ].map((c) => (
              <div key={c.title} className="relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br from-[color:var(--color-brand-pink)]/20 via-[color:var(--color-brand-blue)]/15 to-white/0 blur-2xl" />
                <div className="relative text-sm font-semibold text-zinc-900">{c.title}</div>
                <div className="relative mt-2 text-sm text-zinc-600">{c.body}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 rounded-[2.5rem] border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-3">
                <Image src="/brand/purity-5.png" alt="" width={56} height={56} className="h-14 w-14 object-contain" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Contact</div>
                  <div className="mt-1 text-sm text-zinc-600">Questions, onboarding, or help.</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">Email</div>
                <a className="text-[color:var(--color-brand-blue)] hover:underline" href="mailto:support@purelyautomation.com">
                  support@purelyautomation.com
                </a>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-zinc-900">Directory</div>
              <div className="mt-4 grid gap-2 text-sm">
                <Link className="text-zinc-700 hover:text-zinc-900" href="/">Home</Link>
                <Link className="text-zinc-700 hover:text-zinc-900" href="/portal">Portal</Link>
                <Link className="text-zinc-700 hover:text-zinc-900" href="/ads/app">Ads Manager</Link>
                <Link className="text-zinc-700 hover:text-zinc-900" href="/blogs">Blog</Link>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-zinc-900">Get started</div>
              <div className="mt-2 text-sm text-zinc-600">Create a campaign in minutes.</div>
              <div className="mt-5 flex flex-col gap-3">
                <Link
                  href="/ads/signup"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Create advertiser account
                </Link>
                <Link
                  href="/ads/login"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
            <div>© {new Date().getFullYear()} Purely Automation</div>
            <div>Ads Manager</div>
          </div>
        </footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Ready to launch your first campaign?</div>
            <div className="mt-0.5 text-sm text-zinc-600">Create targeting and creative in a couple minutes.</div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/ads/app/campaigns/new"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Create a campaign
            </Link>
            <Link
              href="/ads/app"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Open Ads Manager
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
