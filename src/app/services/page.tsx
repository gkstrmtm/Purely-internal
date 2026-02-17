import type { Metadata } from "next";
import Link from "next/link";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";

export const metadata: Metadata = {
  title: "Services | Purely Automation",
  description:
    "Explore Purely Automation services: booking automation, AI receptionist, reviews, newsletters, lead scraping, reporting, and more.",
  alternates: { canonical: "/services" },
};

export default function ServicesIndexPage() {
  const visiblePortalServices = PORTAL_SERVICES.filter((s) => !s.hidden);
  const groups = groupPortalServices(visiblePortalServices);

  return (
    <main className="min-h-screen bg-white">
      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold tracking-wide text-white/70">SERVICES</div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">One portal. Many automations.</h1>
            <p className="mt-4 text-base text-white/85 sm:text-lg">
              Pick one service to start, or stack a few. Everything stays in one place—billing, reporting,
              and the activity trail.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/portal/get-started"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-base font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
              >
                Get Started
              </Link>
              <Link
                href="/book-a-call"
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-pink)] px-6 py-3 text-base font-semibold text-white hover:opacity-95"
              >
                Book a Call
              </Link>
            </div>

            <div className="mt-4 text-sm text-white/80">
              Already a client?{" "}
              <Link href="/login" className="font-semibold underline decoration-white/40 underline-offset-4">
                Sign in
              </Link>
              .
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-brand-mist">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Core Portal</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Your home base for services, billing, onboarding, and reporting.
                </div>
              </div>
              <Link
                href="/services/portal"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Learn more
              </Link>
            </div>
          </div>

          <div className="mt-10 space-y-10">
            {groups.map((group) => (
              <div key={group.key} className="space-y-4">
                <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">{group.title}</h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.services.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/services/${encodeURIComponent(s.slug)}`}
                      className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg"
                    >
                      <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
                      <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
                      {s.highlights?.length ? (
                        <div className="mt-4 space-y-1 text-sm text-zinc-700">
                          {s.highlights.slice(0, 3).map((h) => (
                            <div key={h}>• {h}</div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-5 text-sm font-semibold text-[color:var(--color-brand-blue)]">
                        View details →
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-zinc-200 bg-white p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-zinc-900">Not seeing your exact workflow?</div>
                <div className="mt-1 text-sm text-zinc-600">
                  We can tailor automations, reporting, and integrations to your stack.
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/book-a-call"
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:rgba(15,23,42,0.96)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:rgba(15,23,42,1)]"
                >
                  Book a Call
                </Link>
                <Link
                  href="/portal"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Visit the Portal
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
