import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Launch Kit | Purely Automation",
  description:
    "A fast start package that sets up your intake, routing, and follow-up so you convert leads consistently without adding more admin work.",
  keywords: [
    "automation launch package",
    "lead follow up",
    "funnel builder",
    "automations",
    "AI receptionist",
    "automated blogs",
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
    slug: "funnel-builder",
    title: "Funnel Builder",
    description: "A clean intake path so leads raise their hand and you capture details.",
    accent: "ink" as const,
  },
  {
    slug: "automations",
    title: "Automation Builder",
    description: "Build routing + follow-up flows so your team stops doing repetitive work.",
    accent: "blue" as const,
  },
  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    description: "Answer calls instantly, qualify intent, and capture details.",
    accent: "coral" as const,
  },
  {
    slug: "blogs",
    title: "Automated Blogs",
    description: "Publish consistently to build local SEO momentum without daily posting.",
    accent: "ink" as const,
  },
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "Keep SMS and email history in one place and reply with full context.",
    accent: "blue" as const,
  },
];

function accentClasses(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "bg-[color:rgba(29,78,216,0.95)]";
  if (accent === "coral") return "bg-[color:rgba(251,113,133,0.95)]";
  return "bg-[color:rgba(51,65,85,0.92)]";
}

export default function LaunchKitPackagePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "The Launch Kit",
    description:
      "A fast start automation package that sets up lead intake and core workflows so you can convert consistently.",
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
                simple automation builder, and an AI receptionist so leads do not fall through.
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
                  <div className="mt-2 text-lg font-semibold text-white/95">Intake, automations, consistency</div>
                  <div className="mt-1 text-sm text-white/70">A simple system that makes it obvious what happens next.</div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    {[
                      { title: "Funnel", hint: "intake path" },
                      { title: "Automations", hint: "routing" },
                      { title: "AI receptionist", hint: "answer calls" },
                      { title: "Blogs", hint: "SEO momentum" },
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

      <section className="relative w-full overflow-hidden bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(900px 380px at 18% 0%, rgba(29,78,216,0.10), transparent 60%), radial-gradient(700px 320px at 95% 8%, rgba(251,113,133,0.10), transparent 55%)",
          }}
        />

        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">What you get</h2>
              <p className="mt-4 max-w-prose text-sm text-zinc-600 sm:text-base">
                A practical starter stack that takes you from lead intake to booked appointments, with visibility into
                what ran and what happened.
              </p>

              <div className="mt-10 border-t border-zinc-200 pt-10">
                <h3 className="text-lg font-semibold text-brand-ink">Who it is for</h3>
                <ul className="mt-4 space-y-3 text-sm text-zinc-600 sm:text-base">
                  {[
                    "Businesses that want a clean setup fast",
                    "Teams that are missing leads due to slow response",
                    "Owners who want consistent follow-up without micromanaging",
                    "Anyone tired of scattered tools and unclear next steps",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[color:rgba(251,113,133,0.95)]" aria-hidden="true" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative lg:col-span-7">
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

              <div className="mt-12 rounded-3xl bg-brand-mist p-8 sm:p-10">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Launch path</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-brand-ink">Intake to consistency</div>
                <div className="mt-3 text-sm text-zinc-600 sm:text-base">
                  A clean first version that your team can actually run, then you stack into Sales Loop or Brand Builder.
                </div>

                <div className="mt-8 grid gap-5">
                  {[
                    {
                      title: "Capture",
                      desc: "A simple funnel and intake that collects the right details.",
                      accent: "coral" as const,
                    },
                    {
                      title: "Automate",
                      desc: "Routing and follow-up flows so nothing gets missed.",
                      accent: "blue" as const,
                    },
                    {
                      title: "Answer",
                      desc: "AI receptionist handles calls and captures intent automatically.",
                      accent: "ink" as const,
                    },
                    {
                      title: "Publish",
                      desc: "Automated blogs build visibility while you focus on delivery.",
                      accent: "coral" as const,
                    },
                  ].map((s, idx, all) => (
                    <div key={s.title} className="relative pl-8">
                      {idx !== all.length - 1 ? (
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

                <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link
                    href="/services/the-sales-loop"
                    className="inline-flex items-center justify-between rounded-2xl border border-[color:rgba(51,65,85,0.20)] bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80"
                  >
                    The Sales Loop
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link
                    href="/services/the-brand-builder"
                    className="inline-flex items-center justify-between rounded-2xl border border-[color:rgba(51,65,85,0.20)] bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80"
                  >
                    The Brand Builder
                    <span aria-hidden="true">→</span>
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
