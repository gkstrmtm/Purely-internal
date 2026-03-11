import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Brand Builder | Purely Automation",
  description:
    "A visibility package that builds trust and inbound demand with SEO content, newsletters, and reviews so you look established and stay top of mind.",
  keywords: [
    "brand building automation",
    "local SEO content",
    "newsletter automation",
    "review request automation",
    "reputation management",
    "Purely Automation",
  ],
  alternates: { canonical: "/services/the-brand-builder" },
  openGraph: {
    title: "The Brand Builder | Purely Automation",
    description:
      "Build trust and inbound momentum with automated SEO content, newsletters, and reviews. Stay visible without posting every day.",
    url: "/services/the-brand-builder",
    type: "article",
  },
};

const INCLUDED = [
  {
    slug: "blogs",
    title: "Automated Blogs",
    description: "Consistent SEO posting to build topical authority and long term traffic.",
    accent: "blue" as const,
  },
  {
    slug: "newsletter",
    title: "Newsletter",
    description: "Stay top of mind with consistent updates that drive replies.",
    accent: "coral" as const,
  },
  {
    slug: "reviews",
    title: "Reviews",
    description: "Automate review requests and build proof that converts.",
    accent: "ink" as const,
  },
  {
    slug: "nurture-campaigns",
    title: "Nurture Campaigns",
    description: "Long term follow up that turns interest into booked calls.",
    accent: "blue" as const,
  },
];

function accentClasses(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "bg-[color:rgba(29,78,216,0.95)]";
  if (accent === "coral") return "bg-[color:rgba(251,113,133,0.95)]";
  return "bg-[color:rgba(51,65,85,0.92)]";
}

export default function BrandBuilderPackagePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "The Brand Builder",
    description:
      "A visibility package that builds trust and inbound demand with SEO content, newsletters, reviews, and nurture follow up.",
    provider: {
      "@type": "Organization",
      name: "Purely Automation",
      url: "https://purelyautomation.com",
    },
    areaServed: "US",
    url: "https://purelyautomation.com/services/the-brand-builder",
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
              The Brand Builder
            </span>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold tracking-wide text-white/70">PACKAGE</div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The Brand Builder</h1>
              <p className="mt-4 text-base text-white/85 sm:text-lg">Build trust and inbound demand without posting every day.</p>
              <p className="mt-4 text-sm text-white/80">
                This package gives you a compounding visibility engine: consistent SEO content, newsletters that keep you top of mind,
                review automation that builds proof, and nurture follow-up so leads convert when they are ready.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/portal/get-started"
                  className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] px-6 py-3 text-base font-semibold text-white shadow-sm hover:opacity-90"
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
                  <div className="text-xs font-semibold tracking-wide text-white/75">CONSISTENCY</div>
                  <div className="mt-2 text-lg font-semibold text-white/95">Content plus proof</div>
                  <div className="mt-1 text-sm text-white/70">Look active and credible without daily effort.</div>

                  <div className="mt-6 space-y-3">
                    {[
                      { title: "SEO posts", hint: "publish consistently" },
                      { title: "Newsletters", hint: "stay top of mind" },
                      { title: "Reviews", hint: "build proof" },
                      { title: "Nurture", hint: "convert later" },
                    ].map((n) => (
                      <div
                        key={n.title}
                        className="flex items-center justify-between rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4"
                      >
                        <div className="text-sm font-semibold text-white/95">{n.title}</div>
                        <div className="text-xs text-white/65">{n.hint}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4">
                    <div className="text-sm font-semibold text-white/95">Result</div>
                    <div className="mt-1 text-xs text-white/65">More inbound interest, higher trust, and warmer leads when they reach out.</div>
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
                A brand visibility engine that compounds. You publish consistently, collect proof, and nurture leads automatically.
              </p>

              <div className="mt-10 border-t border-zinc-200 pt-10">
                <h3 className="text-lg font-semibold text-brand-ink">Who it is for</h3>
                <ul className="mt-4 space-y-3 text-sm text-zinc-600 sm:text-base">
                  {[
                    "Service businesses that want more inbound demand",
                    "Teams that need consistent touchpoints without daily posting",
                    "Owners who want trust built before the sales conversation",
                    "Anyone tired of looking inactive online",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span
                        className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[color:rgba(251,113,133,0.95)]"
                        aria-hidden="true"
                      />
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
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Compounding cycle</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-brand-ink">Visibility → trust → conversions</div>
                <div className="mt-3 text-sm text-zinc-600 sm:text-base">
                  You do not need daily output. You need consistent signals that make prospects feel like you are established and active.
                </div>

                <div className="mt-8 grid gap-5">
                  {[
                    { title: "Publish", desc: "SEO posts and newsletters keep you visible.", accent: "blue" as const },
                    { title: "Proof", desc: "Reviews and social proof remove friction.", accent: "coral" as const },
                    { title: "Nurture", desc: "Follow up converts when the timing is right.", accent: "ink" as const },
                  ].map((s, idx) => (
                    <div key={s.title} className="relative pl-8">
                      {idx !== 2 ? (
                        <div
                          className="absolute left-[10px] top-[22px] h-[calc(100%-10px)] w-px bg-[color:rgba(51,65,85,0.20)]"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div
                        className="absolute left-0 top-1.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-[color:rgba(51,65,85,0.15)]"
                        aria-hidden="true"
                      >
                        <div className={`mx-auto mt-[7px] h-2.5 w-2.5 rounded-full ${accentClasses(s.accent)}`} />
                      </div>
                      <div className="text-sm font-semibold text-brand-ink">{s.title}</div>
                      <div className="mt-1 text-sm text-zinc-600">{s.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link
                    href="/services/the-launch-kit"
                    className="inline-flex items-center justify-between rounded-2xl border border-[color:rgba(51,65,85,0.20)] bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80"
                  >
                    The Launch Kit
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link
                    href="/services/the-sales-loop"
                    className="inline-flex items-center justify-between rounded-2xl border border-[color:rgba(51,65,85,0.20)] bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80"
                  >
                    The Sales Loop
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
                  q: "How long until we see results?",
                  a: "Some improvements show quickly, but the big win is compounding. Consistency builds trust and search presence over time.",
                },
                {
                  q: "Do we have to write content?",
                  a: "No. We handle the content automation and keep it aligned to your offer and brand voice.",
                },
                {
                  q: "Will this work for my niche?",
                  a: "Yes. We tailor the topics and nurture messaging to what your customers actually care about.",
                },
                {
                  q: "Can we add faster conversion too?",
                  a: "Yes. Add The Sales Loop when you want more speed to lead and stronger conversion follow up.",
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

          <section className="mt-14 w-full rounded-3xl bg-linear-to-r from-[color:var(--color-brand-blue)] to-[color:var(--color-brand-pink)] text-white">
            <div className="px-7 py-10">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-lg font-semibold text-white/95">Build your brand engine</div>
                  <div className="mt-1 text-sm text-white/80">Create your portal account, then activate the Brand Builder stack.</div>
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
