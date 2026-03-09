import type { Metadata } from "next";
import Link from "next/link";

import { IconServiceGlyph } from "@/app/portal/PortalIcons";

export const metadata: Metadata = {
  title: "The Sales Loop | Purely Automation",
  description:
    "A conversion package that responds fast, follows up consistently, and books more calls. Built for lead driven teams that want more revenue with less manual work.",
  keywords: [
    "lead follow up automation",
    "AI receptionist",
    "outbound calls automation",
    "booking automation",
    "sales automation",
    "Purely Automation",
  ],
  alternates: { canonical: "/services/the-sales-loop" },
  openGraph: {
    title: "The Sales Loop | Purely Automation",
    description:
      "Respond fast, follow up consistently, and book more calls. The recommended package for lead driven teams.",
    url: "/services/the-sales-loop",
    type: "article",
  },
};

const INCLUDED = [
  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    description: "Answer calls instantly, qualify intent, and capture details.",
    accent: "blue" as const,
  },
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "One place for conversations so you move fast with context.",
    accent: "ink" as const,
  },
  {
    slug: "booking",
    title: "Booking Automation",
    description: "Confirmations, reminders, and simple routing rules that reduce no shows.",
    accent: "coral" as const,
  },
  {
    slug: "nurture-campaigns",
    title: "Nurture Campaigns",
    description: "Long term follow up so leads do not go cold.",
    accent: "blue" as const,
  },
];

const ADD_ONS = [
  {
    slug: "ai-outbound-calls",
    title: "AI outbound",
    description: "Automate outbound calling to follow up fast when leads are hot.",
    accent: "blue" as const,
  },
  {
    slug: "lead-scraping",
    title: "Lead Scraping",
    description: "Targeted leads on demand when you want more volume.",
    accent: "coral" as const,
  },
];

function accentClasses(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]";
  if (accent === "coral") return "bg-[color:rgba(251,113,133,0.16)] text-[color:var(--color-brand-pink)]";
  return "bg-[color:rgba(15,23,42,0.08)] text-[color:rgba(15,23,42,0.85)]";
}

export default function SalesLoopPackagePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "The Sales Loop",
    description:
      "A conversion package that responds fast, follows up consistently, and books more calls for lead driven teams.",
    provider: {
      "@type": "Organization",
      name: "Purely Automation",
      url: "https://purelyautomation.com",
    },
    areaServed: "US",
    url: "https://purelyautomation.com/services/the-sales-loop",
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
              The Sales Loop
            </span>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                Recommended
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The Sales Loop</h1>
              <p className="mt-4 text-base text-white/85 sm:text-lg">
                Respond fast, follow up consistently, and book more calls.
              </p>
              <p className="mt-4 text-sm text-white/80">
                This is the package to push revenue. Leads get handled quickly across calls, SMS, and email. Follow up
                runs automatically so opportunities do not cool off.
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
                Want a fast foundation first?{" "}
                <Link
                  href="/services/the-launch-kit"
                  className="font-semibold underline decoration-white/40 underline-offset-4"
                >
                  View The Launch Kit
                </Link>
                .
              </div>
            </div>

            <div className="hidden md:block">
              <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[color:rgba(255,255,255,0.06)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[color:rgba(251,113,133,0.18)] blur-2xl" />
                <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[color:rgba(255,255,255,0.12)] blur-2xl" />

                <div className="relative">
                  <div className="text-xs font-semibold tracking-wide text-white/75">THE LOOP</div>
                  <div className="mt-2 text-lg font-semibold text-white/95">Capture to close</div>
                  <div className="mt-1 text-sm text-white/70">A simple system that keeps leads moving.</div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {[
                      { title: "Respond", hint: "calls" },
                      { title: "Follow up", hint: "sms" },
                      { title: "Book", hint: "calendar" },
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
                      <linearGradient id="salesFlow" x1="0" y1="0" x2="520" y2="0" gradientUnits="userSpaceOnUse">
                        <stop stopColor="rgba(255,255,255,0.25)" />
                        <stop offset="0.5" stopColor="rgba(29,78,216,0.85)" />
                        <stop offset="1" stopColor="rgba(255,255,255,0.25)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M40 60 C140 25, 180 25, 260 60 C340 95, 380 95, 480 60"
                      stroke="url(#salesFlow)"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <circle cx="40" cy="60" r="8" fill="rgba(255,255,255,0.55)" />
                    <circle cx="260" cy="60" r="8" fill="rgba(29,78,216,0.95)" />
                    <circle cx="480" cy="60" r="8" fill="rgba(255,255,255,0.55)" />
                  </svg>

                  <div className="mt-2 rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4">
                    <div className="text-sm font-semibold text-white/95">Outcome</div>
                    <div className="mt-1 text-xs text-white/65">More speed, more follow up, more booked calls.</div>
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
                A conversion stack that moves leads from first contact to booked calls with less manual effort.
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

              <h3 className="mt-10 text-lg font-semibold text-zinc-900">Optional add ons for more volume</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ADD_ONS.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/services/${encodeURIComponent(s.slug)}`}
                    className="group rounded-3xl border border-zinc-200 bg-white p-5 hover:bg-zinc-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 grid h-10 w-10 place-items-center rounded-2xl ${accentClasses(s.accent)}`}>
                        <IconServiceGlyph slug={s.slug} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
                        <div className="mt-1 text-sm text-zinc-600">{s.description}</div>
                        <div className="mt-3 text-sm font-semibold text-[color:var(--color-brand-blue)]">View details →</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900">Who it is for</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  "Lead driven teams that want faster response",
                  "Businesses that lose deals due to slow follow up",
                  "Owners who want a consistent sales process",
                  "Teams that want more booked calls without adding headcount",
                ].map((t) => (
                  <div key={t} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-semibold text-zinc-800">
                    {t}
                  </div>
                ))}
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900">What changes after you turn it on</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { title: "Speed", desc: "Leads get handled right away." },
                  { title: "Consistency", desc: "Follow up runs without reminders." },
                  { title: "Visibility", desc: "You can see what happened and improve it." },
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
              <div className="mt-2 text-sm text-zinc-600">Start free, then activate the sales loop stack.</div>

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

              <div className="mt-8 rounded-2xl border border-zinc-200 bg-[color:rgba(29,78,216,0.04)] p-5">
                <div className="text-xs font-semibold tracking-wide text-[color:rgba(29,78,216,0.78)]">BEST FOR</div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">Lead driven teams</div>
                <div className="mt-2 text-sm text-zinc-600">
                  If you want more booked calls without the manual chase, this package is the most direct path.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">FAQ</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                {
                  q: "Does this replace my team?",
                  a: "No. It removes the repetitive front end work and makes follow up consistent. Your team focuses on high value conversations.",
                },
                {
                  q: "Can we control who gets contacted?",
                  a: "Yes. Targeting can be based on tags, lists, intake answers, and simple rules.",
                },
                {
                  q: "Do you support after hours coverage?",
                  a: "Yes. The AI receptionist can answer calls and capture details even when your team is unavailable.",
                },
                {
                  q: "What if we want more inbound content too?",
                  a: "Add The Brand Builder if you want stronger visibility and proof over time.",
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
                  <div className="text-lg font-semibold text-white/95">Push revenue with a real loop</div>
                  <div className="mt-1 text-sm text-white/80">Create your portal account, then activate The Sales Loop.</div>
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
