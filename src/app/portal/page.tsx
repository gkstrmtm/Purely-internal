import Link from "next/link";

import { PortalOffersCarousel } from "@/app/portal/PortalOffersCarousel";

export default async function PortalDashboardPage() {
  return (
    <div className="w-full">
      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
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
              <div className="text-sm font-semibold text-zinc-900">One login</div>
              <div className="mt-2 text-sm text-zinc-600">Services, billing, and access live in one place.</div>
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

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Content + SEO</div>
              <div className="mt-2 text-sm text-zinc-600">Stay consistent without adding workload.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Automated Blogs</div>
                <div>• Newsletter</div>
                <div>• Nurture Campaigns</div>
              </div>
              <div className="mt-5">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Appointments + follow-up</div>
              <div className="mt-2 text-sm text-zinc-600">Book faster and keep momentum after the call.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Booking Automation</div>
                <div>• AI Receptionist</div>
                <div>• AI Outbound</div>
              </div>
              <div className="mt-5">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Reputation + trust</div>
              <div className="mt-2 text-sm text-zinc-600">Get more reviews and build proof customers can verify.</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Reviews + Verified Listing + Q&amp;A</div>
                <div>• Newsletter</div>
                <div>• Nurture Campaigns</div>
              </div>
              <div className="mt-5">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="text-sm font-semibold text-zinc-900">Credits for volume</div>
              <div className="mt-2 text-3xl font-bold text-brand-ink">Credits</div>
              <div className="text-xs text-zinc-500">used only when you need more usage</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <div>• Calls</div>
                <div>• Leads</div>
                <div>• Extra sends</div>
                <div>• Extra content</div>
              </div>
              <div className="mt-5">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Get Started
                </Link>
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
