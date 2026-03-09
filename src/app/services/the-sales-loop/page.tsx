import type { Metadata } from "next";
import Link from "next/link";

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
    slug: "booking",
    title: "Booking Automation",
    description: "Confirmations, reminders, and simple routing rules that reduce no shows.",
    accent: "coral" as const,
  },
  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    description: "Answer calls instantly, qualify intent, and capture details.",
    accent: "blue" as const,
  },
  {
    slug: "lead-scraping",
    title: "Lead scraping",
    description: "Targeted leads on demand so you can create more opportunities.",
    accent: "coral" as const,
  },
  {
    slug: "ai-outbound-calls",
    title: "AI outbound",
    description: "Automate outbound calling so you follow up instantly when leads are hot.",
    accent: "blue" as const,
  },
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "One place for conversations so you move fast with context.",
    accent: "ink" as const,
  },
];

const ADD_ONS = [
  {
    slug: "nurture-campaigns",
    title: "Nurture campaigns",
    description: "Long term follow up so leads convert when the timing is right.",
    accent: "ink" as const,
  },
  {
    slug: "reviews",
    title: "Reviews",
    description: "Add consistent review requests to build proof that converts.",
    accent: "coral" as const,
  },
];

function accentClasses(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "bg-[color:rgba(29,78,216,0.95)]";
  if (accent === "coral") return "bg-[color:rgba(251,113,133,0.95)]";
  return "bg-[color:rgba(51,65,85,0.92)]";
}

function mutedTextClasses(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "text-[color:rgba(29,78,216,0.95)]";
  if (accent === "coral") return "text-[color:rgba(251,113,133,0.95)]";
  return "text-brand-ink";
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

      <section className="relative w-full overflow-hidden bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(900px 380px at 18% 0%, rgba(29,78,216,0.12), transparent 60%), radial-gradient(700px 320px at 95% 8%, rgba(251,113,133,0.12), transparent 55%)",
          }}
        />

        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">
                A sales loop your team can run
              </h2>
              <p className="mt-4 max-w-prose text-sm text-zinc-600 sm:text-base">
                The Sales Loop is built for speed and consistency. New leads get handled across calls, SMS, and email.
                Follow up runs automatically so you book more calls without chasing.
              </p>

              <dl className="mt-8 grid grid-cols-2 gap-6">
                {[
                  { label: "Reply speed", value: "Instant" },
                  { label: "Follow up", value: "Consistent" },
                  { label: "Visibility", value: "Clear" },
                  { label: "Setup", value: "Simple" },
                ].map((s) => (
                  <div key={s.label} className="border-t border-zinc-200 pt-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.label}</dt>
                    <dd className="mt-1 text-lg font-semibold text-brand-ink">{s.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/portal/get-started"
                  className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-6 py-3 text-base font-semibold text-white shadow-sm hover:opacity-90"
                >
                  Start free
                </Link>
              </div>
            </div>

            <div className="relative lg:col-span-7">
              <svg
                className="pointer-events-none absolute -right-10 -top-10 hidden h-48 w-48 text-[color:rgba(29,78,216,0.10)] sm:block"
                viewBox="0 0 240 240"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20 120 C55 55, 90 55, 120 120 C150 185, 185 185, 220 120"
                  stroke="currentColor"
                  strokeWidth="18"
                  strokeLinecap="round"
                />
              </svg>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-lg font-semibold text-brand-ink">Included services</h3>
                <Link
                  href="/services"
                  className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline hover:decoration-[color:rgba(29,78,216,0.35)] hover:underline-offset-4"
                >
                  Browse all services →
                </Link>
              </div>

              <div className="mt-4 border-t border-zinc-200">
                {INCLUDED.map((s) => (
                  <div
                    key={s.slug}
                    className="flex flex-col gap-2 border-b border-zinc-200 py-6 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="max-w-xl">
                      <div className="flex items-center gap-3">
                        <span className={`mt-0.5 inline-block h-2.5 w-2.5 rounded-full ${accentClasses(s.accent)}`} />
                        <div className="text-base font-semibold text-brand-ink">{s.title}</div>
                      </div>
                      <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
                    </div>
                    <Link
                      href={`/services/${encodeURIComponent(s.slug)}`}
                      className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline hover:decoration-[color:rgba(29,78,216,0.35)] hover:underline-offset-4"
                    >
                      View service →
                    </Link>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-lg font-semibold text-brand-ink">Optional add ons</h3>
                <div className="text-sm text-zinc-600">When you want more lift.</div>
              </div>

              <div className="mt-4 border-t border-zinc-200">
                {ADD_ONS.map((s) => (
                  <div
                    key={s.slug}
                    className="flex flex-col gap-2 border-b border-zinc-200 py-6 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="max-w-xl">
                      <div className="flex items-center gap-3">
                        <span className={`mt-0.5 inline-block h-2.5 w-2.5 rounded-full ${accentClasses(s.accent)}`} />
                        <div className="text-base font-semibold text-brand-ink">{s.title}</div>
                        <span className={`text-xs font-semibold ${mutedTextClasses(s.accent)}`}>Add on</span>
                      </div>
                      <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
                    </div>
                    <Link
                      href={`/services/${encodeURIComponent(s.slug)}`}
                      className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline hover:decoration-[color:rgba(29,78,216,0.35)] hover:underline-offset-4"
                    >
                      View details →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold text-brand-ink">Who it is for</h3>
              <ul className="mt-4 space-y-3 text-sm text-zinc-600 sm:text-base">
                {[
                  "Lead driven teams that want faster response",
                  "Businesses that lose deals due to slow follow up",
                  "Owners who want a consistent sales process",
                  "Teams that want more booked calls without adding headcount",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[color:rgba(29,78,216,0.95)]" aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 border-t border-zinc-200 pt-10">
                <h3 className="text-lg font-semibold text-brand-ink">What changes after you turn it on</h3>
                <div className="mt-6 space-y-6">
                  {[
                    {
                      title: "Speed",
                      desc: "Leads get handled right away so they do not cool off.",
                    },
                    {
                      title: "Consistency",
                      desc: "Follow up runs automatically, even when your team is busy.",
                    },
                    {
                      title: "Visibility",
                      desc: "You can see what happened, measure it, and improve it.",
                    },
                  ].map((b) => (
                    <div key={b.title} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-start">
                      <div className="sm:col-span-4">
                        <div className="text-sm font-semibold text-brand-ink">{b.title}</div>
                      </div>
                      <div className="sm:col-span-8">
                        <div className="text-sm text-zinc-600 sm:text-base">{b.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-brand-mist p-8 sm:p-10">
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[color:rgba(251,113,133,0.22)] blur-2xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-14 -left-14 h-52 w-52 rounded-full bg-[color:rgba(29,78,216,0.18)] blur-2xl" aria-hidden="true" />

              <div className="relative">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">A simple loop</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-brand-ink">Response to booked call</div>
                <div className="mt-3 text-sm text-zinc-600 sm:text-base">
                  A clean timeline that keeps leads moving without your team remembering every follow up.
                </div>

                <div className="mt-8 grid gap-5">
                  {[
                    {
                      title: "Respond",
                      desc: "Calls and messages get captured and routed immediately.",
                      accent: "blue" as const,
                    },
                    {
                      title: "Follow up",
                      desc: "SMS and email sequences run until the lead converts or opts out.",
                      accent: "coral" as const,
                    },
                    {
                      title: "Book",
                      desc: "Scheduling links and reminders reduce friction and no shows.",
                      accent: "ink" as const,
                    },
                  ].map((s, idx) => (
                    <div key={s.title} className="relative pl-8">
                      {idx !== 2 ? (
                        <div className="absolute left-[10px] top-[22px] h-[calc(100%-10px)] w-px bg-[color:rgba(51,65,85,0.20)]" aria-hidden="true" />
                      ) : null}
                      <div className="absolute left-0 top-1.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-[color:rgba(51,65,85,0.15)]" aria-hidden="true">
                        <div className={`mx-auto mt-[7px] h-2.5 w-2.5 rounded-full ${accentClasses(s.accent)}`} />
                      </div>
                      <div className="text-sm font-semibold text-brand-ink">{s.title}</div>
                      <div className="mt-1 text-sm text-zinc-600">{s.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/portal/get-started"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 sm:w-auto"
                  >
                    Get started
                  </Link>
                  <Link
                    href="/services"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-[color:rgba(51,65,85,0.35)] bg-white px-6 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80 sm:w-auto"
                  >
                    Browse services
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 border-t border-zinc-200 pt-12">
            <h2 className="text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">FAQ</h2>
            <div className="mt-6 border-t border-zinc-200">
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
                <details key={f.q} className="group border-b border-zinc-200 py-5">
                  <summary className="cursor-pointer list-none text-base font-semibold text-brand-ink">
                    <span>{f.q}</span>
                    <span className="float-right text-zinc-500 transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <div className="mt-3 max-w-3xl text-sm text-zinc-600 sm:text-base">{f.a}</div>
                </details>
              ))}
            </div>
          </div>

          <section className="mt-14 w-full rounded-3xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) text-white">
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
