import type { Metadata } from "next";
import Link from "next/link";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";

export const metadata: Metadata = {
  title: "Services | Purely Automation",
  description:
    "Explore automation services: appointment booking automation, AI receptionist, review requests, SMS and email follow-up, newsletters, lead scraping, reporting dashboards, and more.",
  keywords: [
    "automation services",
    "business automation",
    "appointment booking automation",
    "AI receptionist",
    "review requests",
    "reputation management",
    "lead generation",
    "lead scraping",
    "SMS automation",
    "email automation",
    "marketing automation",
    "reporting dashboard",
  ],
  alternates: { canonical: "/services" },
};

function Icon({ path, title }: { path: string; title: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-[color:var(--color-brand-blue)]"
      fill="none"
    >
      <title>{title}</title>
      <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  calendar: "M8 2v3m8-3v3M4 9h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.51a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.57-1.1a2 2 0 0 1 2.11-.45c.81.24 1.65.42 2.51.54A2 2 0 0 1 22 16.92Z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2Z",
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
              Pick one service to start, or stack a few. Everything stays in one place; billing, reporting,
              and your activity trail.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-3xl border border-white/15 bg-white/10 p-4">
                <Icon path={ICONS.bolt} title="Automation" />
                <div>
                  <div className="text-sm font-semibold text-white/95">Automation you can measure</div>
                  <div className="mt-1 text-sm text-white/75">See what ran, when it ran, and what it produced.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-3xl border border-white/15 bg-white/10 p-4">
                <Icon path={ICONS.calendar} title="Booking" />
                <div>
                  <div className="text-sm font-semibold text-white/95">Booking + follow-up</div>
                  <div className="mt-1 text-sm text-white/75">Appointment scheduling automation and reminders.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-3xl border border-white/15 bg-white/10 p-4">
                <Icon path={ICONS.phone} title="Calls" />
                <div>
                  <div className="text-sm font-semibold text-white/95">Calls, SMS, email</div>
                  <div className="mt-1 text-sm text-white/75">Centralized communication and fast response workflows.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-3xl border border-white/15 bg-white/10 p-4">
                <Icon path={ICONS.star} title="Reputation" />
                <div>
                  <div className="text-sm font-semibold text-white/95">Reviews + reputation</div>
                  <div className="mt-1 text-sm text-white/75">Review request automation that stays consistent.</div>
                </div>
              </div>
            </div>

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
