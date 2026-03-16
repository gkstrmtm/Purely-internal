import Link from "next/link";
import { headers } from "next/headers";

import { PortalOffersCarousel } from "@/app/portal/PortalOffersCarousel";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export default async function PortalDashboardPage() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const getStartedHref = variant === "credit" ? "/credit/get-started" : "/portal/get-started";
  const signInHref = variant === "credit" ? "/credit/login" : "/login";
  const getStartedPackageHref = (pkg: string) => `${getStartedHref}?package=${encodeURIComponent(pkg)}`;

  const directoryItems = [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/book-a-call", label: "Book a call" },
    { href: getStartedHref, label: "Get started" },
  ];

  return (
    <div className="w-full">
      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/85">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90 hover:bg-white/15"
                >
                  <span aria-hidden="true">←</span>
                  Home
                </Link>
                <span className="text-white/40" aria-hidden="true">
                  /
                </span>
                <details className="group relative">
                  <summary className="cursor-pointer list-none select-none rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90 hover:bg-white/15 [&::-webkit-details-marker]:hidden">
                    Directory
                    <span className="ml-1 text-white/70" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <div className="absolute left-0 top-[calc(100%+10px)] z-10 w-[min(280px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2 shadow-xl backdrop-blur">
                    {directoryItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </details>
              </div>

              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
                Activate your automations and keep everything in one place.
              </h1>
              <p className="mt-4 text-base text-[color:rgba(255,255,255,0.86)] sm:text-lg">
                Stop juggling tools and guessing what happened. Run your lead follow-up, booking, and customer communication from one portal; with clear visibility into what ran and what got done.
              </p>

              <div className="mt-4 text-sm text-white/80">Start for free. Add services when you’re ready.</div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={getStartedHref}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-base font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
                >
                  Get Started
                </Link>
                <Link
                  href={signInHref}
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
                  <div className="mt-1 text-sm text-white/70">A quick snapshot of what your portal keeps running.</div>

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
                Automations stay easy and accessible, even if you’re not technical. Turn things on, see what ran, and make changes without getting lost.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-2xl bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M21 3 10.5 13.5M21 3l-6.8 19-3.7-8.5L2 10.8 21 3Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Invite your team</div>
              <div className="mt-2 text-sm text-zinc-600">Invite as many users as you want and manage access in one place.</div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-2xl bg-[color:rgba(251,113,133,0.16)] text-[color:var(--color-brand-pink)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7 7h14M7 12h14M7 17h14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M4 7h.01M4 12h.01M4 17h.01"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Add when it makes sense</div>
                  <div className="mt-2 text-sm text-zinc-600">Turn on the next service when you need it.</div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-2xl bg-[color:rgba(15,23,42,0.08)] text-[color:rgba(15,23,42,0.85)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 20V10M10 20V4M16 20v-8M22 20H2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Clear reporting</div>
                  <div className="mt-2 text-sm text-zinc-600">See what ran and what’s active at a glance.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Pricing that stays flexible</div>
              <div className="mt-1 text-sm text-zinc-600">Start for free and pay for what you use.</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="group flex min-h-[360px] flex-col rounded-3xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Build a real brand</div>
              <div className="mt-2 text-lg font-semibold text-brand-ink">The Brand Builder</div>
              <div className="mt-2 text-sm text-zinc-600">Look established, stay visible, and build trust without posting every day.</div>
              <div className="mt-3 text-xs text-zinc-500">Recommended for: service businesses that want consistent inbound and stronger credibility.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Automated blogs that keep you discoverable</div>
                <div>• Newsletter and reviews that build proof</div>
                <div>• Nurture campaigns that turn interest into booked calls</div>
              </div>
              <Link
                href="/services/the-brand-builder"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline hover:decoration-[color:rgba(29,78,216,0.35)] hover:underline-offset-4"
              >
                Learn more <span aria-hidden="true">→</span>
              </Link>
              <div className="mt-auto pt-6">
                <Link
                  href={getStartedPackageHref("brand-builder")}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-px hover:opacity-95 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(29,78,216,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
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
              <div className="mt-2 text-lg font-semibold text-brand-ink">The Sales Loop</div>
              <div className="mt-2 text-sm text-zinc-600">Make more money faster with less work. Respond faster, follow up automatically, and book more calls.</div>
              <div className="mt-3 text-xs text-zinc-500">Recommended for: teams that want faster response, higher conversion, and less manual chasing.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Booking automation that removes friction</div>
                <div>• AI receptionist that answers and qualifies</div>
                <div>• Lead scraping that fills your pipeline</div>
                <div>• AI outbound that follows up consistently</div>
              </div>
              <Link
                href="/services/the-sales-loop"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline hover:decoration-[color:rgba(29,78,216,0.35)] hover:underline-offset-4"
              >
                Learn more <span aria-hidden="true">→</span>
              </Link>
              <div className="mt-auto pt-6">
                <Link
                  href={getStartedPackageHref("sales-loop")}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-[color:rgba(51,65,85,0.55)] bg-white px-4 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-px hover:border-[color:rgba(51,65,85,0.85)] hover:bg-[color:rgba(51,65,85,0.04)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(29,78,216,0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="group flex min-h-[360px] flex-col rounded-3xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Get established fast</div>
              <div className="mt-2 text-lg font-semibold text-brand-ink">The Launch Kit</div>
              <div className="mt-2 text-sm text-zinc-600">Get out there fast with a clean funnel, a strong foundation, and a simple path to bookings.</div>
              <div className="mt-3 text-xs text-zinc-500">Recommended for: new offers, new markets, or businesses that want to look legit and start converting quickly.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Funnel builder that makes your offer clear</div>
                <div>• Automation builder that keeps delivery consistent</div>
                <div>• AI receptionist that captures and books leads</div>
                <div>• Automated blogs that keep you visible</div>
              </div>
              <Link
                href="/services/the-launch-kit"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline hover:decoration-[color:rgba(29,78,216,0.35)] hover:underline-offset-4"
              >
                Learn more <span aria-hidden="true">→</span>
              </Link>
              <div className="mt-auto pt-6">
                <Link
                  href={getStartedPackageHref("launch-kit")}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-pink)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-px hover:opacity-95 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(251,113,133,0.40)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
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

      <section className="w-full bg-linear-to-r from-[color:var(--color-brand-blue)] to-[color:var(--color-brand-pink)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-white/90">Ready to get started?</div>
              <div className="mt-1 text-sm text-white/80">
                Create your portal account, then activate the services you want.
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href={getStartedHref}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 sm:w-auto"
              >
                Start free
              </Link>
              <Link
                href={signInHref}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15 sm:w-auto"
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
