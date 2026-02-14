import Link from "next/link";

import { PortalOffersCarousel } from "@/app/portal/PortalOffersCarousel";

export default async function PortalDashboardPage() {
  return (
    <div className="w-full">
      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="max-w-3xl">
              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
                Activate your automations and keep everything in one place.
              </h1>
              <p className="mt-4 text-base text-[color:rgba(255,255,255,0.86)] sm:text-lg">
                Turn services on, manage billing, and see what’s running. Use credits only when you need more volume like calls, leads, extra sends, or extra content.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/portal/get-started"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-base font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
                >
                  Get Started
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-pink)] px-6 py-3 text-base font-semibold text-white hover:opacity-95"
                >
                  Sign In
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
                <div>Invite as many users as you want to your account.</div>
                <Link
                  href="/book-a-call"
                  className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:text-white/95"
                >
                  Want something custom? Book a call.
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-[color:rgba(255,255,255,0.18)] bg-[color:rgba(255,255,255,0.08)] p-5">
                  <div className="text-sm font-semibold">Clear access</div>
                  <div className="mt-2 text-sm text-[color:rgba(255,255,255,0.80)]">
                    See what’s active, what it costs, and what it’s doing.
                  </div>
                </div>
                <div className="rounded-3xl border border-[color:rgba(255,255,255,0.18)] bg-[color:rgba(255,255,255,0.08)] p-5">
                  <div className="text-sm font-semibold">Easy upgrades</div>
                  <div className="mt-2 text-sm text-[color:rgba(255,255,255,0.80)]">
                    Add a service in minutes when you’re ready.
                  </div>
                </div>
                <div className="rounded-3xl border border-[color:rgba(255,255,255,0.18)] bg-[color:rgba(255,255,255,0.08)] p-5">
                  <div className="text-sm font-semibold">Simple tracking</div>
                  <div className="mt-2 text-sm text-[color:rgba(255,255,255,0.80)]">
                    Track what ran and what got done, without digging.
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[color:rgba(255,255,255,0.06)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[color:rgba(251,113,133,0.18)] blur-2xl" />
                <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[color:rgba(255,255,255,0.12)] blur-2xl" />

                <div className="relative">
                  <div className="text-xs font-semibold tracking-wide text-white/75">AUTOMATION FLOW</div>
                  <div className="mt-2 text-lg font-semibold text-white/95">Capture → route → follow up</div>
                  <div className="mt-1 text-sm text-white/70">A simple visual that hints at what the portal keeps running.</div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {[
                      { title: "Lead", hint: "form / call" },
                      { title: "Workflow", hint: "rules" },
                      { title: "Result", hint: "booked" },
                    ].map((n) => (
                      <div
                        key={n.title}
                        className="rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4"
                      >
                        <div className="text-sm font-semibold text-white/95">{n.title}</div>
                        <div className="mt-1 text-xs text-white/65">{n.hint}</div>
                      </div>
                    ))}
                  </div>

                  <svg
                    className="mt-5 h-20 w-full"
                    viewBox="0 0 520 120"
                    fill="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="flow" x1="0" y1="0" x2="520" y2="0" gradientUnits="userSpaceOnUse">
                        <stop stopColor="rgba(255,255,255,0.25)" />
                        <stop offset="0.5" stopColor="rgba(251,113,133,0.65)" />
                        <stop offset="1" stopColor="rgba(255,255,255,0.25)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M40 60 C140 25, 180 25, 260 60 C340 95, 380 95, 480 60"
                      stroke="url(#flow)"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <circle cx="40" cy="60" r="8" fill="rgba(255,255,255,0.55)" />
                    <circle cx="260" cy="60" r="8" fill="rgba(251,113,133,0.85)" />
                    <circle cx="480" cy="60" r="8" fill="rgba(255,255,255,0.55)" />
                  </svg>

                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4">
                      <div className="text-sm font-semibold text-white/95">Notifications</div>
                      <div className="mt-1 text-xs text-white/65">email + sms</div>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4">
                      <div className="text-sm font-semibold text-white/95">Reporting</div>
                      <div className="mt-1 text-xs text-white/65">what ran, when</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <PortalOffersCarousel />
        </div>
      </section>

      <section className="w-full bg-brand-mist">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-bold text-brand-ink sm:text-3xl">Built to stay simple</h2>
              <p className="mt-3 max-w-2xl text-sm text-zinc-600 sm:text-base">
                This portal shows what you’re running today and what you can add next, without a mess.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Invite your team</div>
              <div className="mt-2 text-sm text-zinc-600">Invite as many users as you want and manage access in one place.</div>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Add when it makes sense</div>
              <div className="mt-2 text-sm text-zinc-600">Turn on the next service when you need it.</div>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Clear reporting</div>
              <div className="mt-2 text-sm text-zinc-600">See what ran and what’s active at a glance.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Pricing that stays flexible</div>
              <div className="mt-1 text-sm text-zinc-600">Pay monthly for services. Use credits only for volume.</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="group flex min-h-[360px] flex-col rounded-3xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">More reach</div>
              <div className="mt-2 text-lg font-semibold text-zinc-900">Content + SEO</div>
              <div className="mt-2 text-sm text-zinc-600">Best for staying visible and generating inbound over time.</div>
              <div className="mt-3 text-xs text-zinc-500">Recommended for: businesses that want steady inbound.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Automated Blogs</div>
                <div>• Newsletter</div>
                <div>• Nurture Campaigns</div>
              </div>
              <div className="mt-auto pt-6">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:rgba(15,23,42,0.96)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-[color:rgba(15,23,42,1)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="group relative flex min-h-[360px] flex-col rounded-3xl border-2 border-[color:rgba(29,78,216,0.45)] bg-[color:rgba(29,78,216,0.05)] p-6 transition hover:-translate-y-0.5 hover:border-[color:rgba(29,78,216,0.65)] hover:shadow-xl">
              <div className="absolute right-5 top-5 inline-flex items-center rounded-full bg-[color:rgba(29,78,216,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-blue)]">
                Most popular
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[color:rgba(29,78,216,0.78)]">Most popular</div>
              <div className="mt-2 text-lg font-semibold text-zinc-900">Appointments + follow-up</div>
              <div className="mt-2 text-sm text-zinc-600">Best for turning leads into booked calls and keeping momentum.</div>
              <div className="mt-3 text-xs text-zinc-500">Recommended for: teams that want faster response and higher conversion.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Booking Automation</div>
                <div>• AI Receptionist</div>
                <div>• AI Outbound</div>
              </div>
              <div className="mt-auto pt-6">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-[color:rgba(15,23,42,0.75)] bg-white px-4 py-3 text-sm font-semibold text-[color:rgba(15,23,42,0.96)] transition hover:-translate-y-px hover:border-[color:rgba(15,23,42,0.95)] hover:bg-[color:rgba(15,23,42,0.04)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(29,78,216,0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="group flex min-h-[360px] flex-col rounded-3xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Build trust</div>
              <div className="mt-2 text-lg font-semibold text-zinc-900">Reputation + trust</div>
              <div className="mt-2 text-sm text-zinc-600">Best for improving conversion and closing more work.</div>
              <div className="mt-3 text-xs text-zinc-500">Recommended for: businesses that win on reputation and proof.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Reviews + Verified Listing + Q&amp;A</div>
                <div>• Newsletter</div>
                <div>• Nurture Campaigns</div>
              </div>
              <div className="mt-auto pt-6">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:rgba(15,23,42,0.96)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-[color:rgba(15,23,42,1)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 lg:col-span-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Credits for volume</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Pay monthly for services. Credits are only used when you need more usage.
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-brand-ink">Credits</div>
                  <div className="text-xs text-zinc-500">calls, leads, extra sends, extra content</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Calls</div>
                  <div className="mt-1 text-xs text-zinc-600">Inbound and outbound volume</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Leads</div>
                  <div className="mt-1 text-xs text-zinc-600">Scraping and enrichment volume</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Extra sends</div>
                  <div className="mt-1 text-xs text-zinc-600">SMS and email beyond base</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Extra content</div>
                  <div className="mt-1 text-xs text-zinc-600">Additional posts and campaigns</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-[color:rgba(251,113,133,0.12)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-brand-ink">Ready to get started?</div>
              <div className="mt-1 text-sm text-zinc-700">
                Create your portal account, then activate the services you want.
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/portal/get-started"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95 sm:w-auto"
              >
                Create account
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50 sm:w-auto"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
