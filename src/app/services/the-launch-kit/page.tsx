import type { Metadata } from "next";
import Link from "next/link";

import { IconServiceGlyph } from "@/app/portal/PortalIcons";

export const metadata: Metadata = {
  title: "The Launch Kit | Purely Automation",
  description:
    "A fast start package that sets up your intake, routing, and follow-up so you convert leads consistently without adding more admin work.",
  keywords: [
    "automation launch package",
    "lead follow up",
    "booking automation",
    "inbox automation",
    "small business automation",
    "Purely Automation",
  ],
  alternates: { canonical: "/services/the-launch-kit" },
  openGraph: {
    title: "The Launch Kit | Purely Automation",
    description:
      "Start converting leads with clean intake, routing, and follow-up. Launch fast, measure results, and scale when ready.",
    url: "/services/the-launch-kit",
    type: "article",
  },
};

const INCLUDED = [
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "Keep SMS and email history in one place and reply with full context.",
    accent: "blue" as const,
  },
  {
    slug: "booking",
    title: "Booking Automation",
    description: "Scheduling, confirmations, reminders, and simple handoff rules.",
    accent: "coral" as const,
  },
  {
    slug: "funnel-builder",
    title: "Funnel Builder",
    description: "A clean intake path so leads raise their hand and you capture details.",
    accent: "ink" as const,
  },
  {
    slug: "reporting",
    title: "Reporting",
    description: "Visibility into what ran, what happened, and what to improve next.",
    accent: "blue" as const,
  },
];

function accentClasses(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]";
  if (accent === "coral") return "bg-[color:rgba(251,113,133,0.16)] text-[color:var(--color-brand-pink)]";
  return "bg-[color:rgba(15,23,42,0.08)] text-[color:rgba(15,23,42,0.85)]";
}

export default function LaunchKitPackagePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "The Launch Kit",
    description:
      "A fast start automation package that sets up lead intake, routing, booking, and follow-up so you convert consistently.",
    provider: {
      "@type": "Organization",
      name: "Purely Automation",
      url: "https://purelyautomation.com",
    },
    areaServed: "US",
    url: "https://purelyautomation.com/services/the-launch-kit",
  };

  return (
    <main className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="mb-7 flex flex-wrap items-center gap-2 text-sm text-white/85">
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
            <Link
              href="/services"
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90 hover:bg-white/15"
            >
              Services
            </Link>
            <span className="text-white/40" aria-hidden="true">
              /
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90">
              The Launch Kit
            </span>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold tracking-wide text-white/70">PACKAGE</div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The Launch Kit</h1>
              <p className="mt-4 text-base text-white/85 sm:text-lg">
                Launch fast. Capture leads cleanly. Follow up consistently.
              </p>
              <p className="mt-4 text-sm text-white/80">
                This is the fastest way to get a real automation foundation in place. You get a clear intake path, a
                single place for messages, and booking with reminders so leads do not fall through.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/portal/get-started"
                  className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-6 py-3 text-base font-semibold text-white shadow-sm hover:opacity-90"
                >
                  Start free
                </Link>
                <Link
                  href="/book-a-call"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-base font-semibold text-white hover:opacity-95"
                >
                  Book a call
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

            <div className="hidden md:block">
              <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[color:rgba(255,255,255,0.06)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[color:rgba(251,113,133,0.18)] blur-2xl" />
                <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[color:rgba(255,255,255,0.12)] blur-2xl" />

                <div className="relative">
                  <div className="text-xs font-semibold tracking-wide text-white/75">WHAT YOU SHIP</div>
                  <div className="mt-2 text-lg font-semibold text-white/95">Intake, routing, booking</div>
                  <div className="mt-1 text-sm text-white/70">A simple system that makes it obvious what happens next.</div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    {[
                      { title: "Lead intake", hint: "forms, pages" },
                      { title: "Inbox", hint: "sms, email" },
                      { title: "Booking", hint: "confirm, remind" },
                      { title: "Reporting", hint: "visibility" },
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

                  <svg className="mt-5 h-20 w-full" viewBox="0 0 520 120" fill="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="launchFlow" x1="0" y1="0" x2="520" y2="0" gradientUnits="userSpaceOnUse">
                        <stop stopColor="rgba(255,255,255,0.25)" />
                        <stop offset="0.5" stopColor="rgba(251,113,133,0.65)" />
                        <stop offset="1" stopColor="rgba(255,255,255,0.25)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M40 60 C140 25, 180 25, 260 60 C340 95, 380 95, 480 60"
                      stroke="url(#launchFlow)"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <circle cx="40" cy="60" r="8" fill="rgba(255,255,255,0.55)" />
                    <circle cx="260" cy="60" r="8" fill="rgba(251,113,133,0.85)" />
                    <circle cx="480" cy="60" r="8" fill="rgba(255,255,255,0.55)" />
                  </svg>

                  <div className="mt-2 rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4">
                    <div className="text-sm font-semibold text-white/95">Goal</div>
                    <div className="mt-1 text-xs text-white/65">
                      Respond fast, reduce leakage, and keep the process easy for your team.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-brand-mist">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm lg:col-span-2">
              <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">What you get</h2>
              <p className="mt-3 max-w-3xl text-sm text-zinc-600">
                A practical starter stack that takes you from lead intake to booked appointments, with visibility into
                what ran and what happened.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {INCLUDED.map((s) => (
                  <div key={s.slug} className="rounded-3xl border border-zinc-200 bg-white p-5">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 grid h-10 w-10 place-items-center rounded-2xl ${accentClasses(s.accent)}`}>
                        <IconServiceGlyph slug={s.slug} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
                        <div className="mt-1 text-sm text-zinc-600">{s.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900">Who it is for</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  "Businesses that want a clean setup fast",
                  "Teams that are missing leads due to slow response",
                  "Owners who want consistent follow-up without micromanaging",
                  "Anyone tired of scattered tools and unclear next steps",
                ].map((t) => (
                  <div key={t} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-semibold text-zinc-800">
                    {t}
                  </div>
                ))}
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900">What changes after you launch</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { title: "Faster replies", desc: "You see new leads and respond with context." },
                  { title: "More bookings", desc: "Confirmations and reminders keep schedules full." },
                  { title: "Clear visibility", desc: "Reporting makes activity easy to track." },
                ].map((b) => (
                  <div key={b.title} className="rounded-3xl border border-zinc-200 bg-white p-6">
                    <div className="text-sm font-semibold text-zinc-900">{b.title}</div>
                    <div className="mt-2 text-sm text-zinc-600">{b.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">Next step</div>
              <div className="mt-2 text-sm text-zinc-600">Start free, then activate the services you want.</div>

              <div className="mt-5 grid grid-cols-1 gap-2">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                >
                  Start free
                </Link>
                <Link
                  href="/book-a-call"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Book a call
                </Link>
                <Link
                  href="/services"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Browse services
                </Link>
              </div>

              <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-xs font-semibold tracking-wide text-zinc-600">GOOD DEFAULT</div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">Launch Kit first, then stack</div>
                <div className="mt-2 text-sm text-zinc-600">
                  Add The Sales Loop if you want faster conversions, or add The Brand Builder if you want more inbound.
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <Link
                    href="/services/the-sales-loop"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  >
                    The Sales Loop →
                  </Link>
                  <Link
                    href="/services/the-brand-builder"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  >
                    The Brand Builder →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">FAQ</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                {
                  q: "How fast can we launch?",
                  a: "Fast. The Launch Kit is designed to get a clean foundation in place quickly so you can start capturing and converting leads.",
                },
                {
                  q: "Do I need to be technical?",
                  a: "No. The point is a simple system your team can actually use. We keep the workflows practical and easy to maintain.",
                },
                {
                  q: "Can we customize this later?",
                  a: "Yes. Once the foundation is live, we can add conditions, handoffs, and integrations as your workflow evolves.",
                },
                {
                  q: "What if I want more inbound content?",
                  a: "Add The Brand Builder to build trust and visibility through reviews, newsletters, and SEO content.",
                },
              ].map((f) => (
                <div key={f.q} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="text-sm font-semibold text-zinc-900">{f.q}</div>
                  <div className="mt-2 text-sm text-zinc-600">{f.a}</div>
                </div>
              ))}
            </div>
          </div>

          <section className="mt-10 w-full rounded-3xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) text-white">
            <div className="px-7 py-10">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-lg font-semibold text-white/95">Start with a clean foundation</div>
                  <div className="mt-1 text-sm text-white/80">Create your portal account, then activate the Launch Kit stack.</div>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Link
                    href="/portal/get-started"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50 sm:w-auto"
                  >
                    Get started
                  </Link>
                  <Link
                    href="/book-a-call"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15 sm:w-auto"
                  >
                    Book a call
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
