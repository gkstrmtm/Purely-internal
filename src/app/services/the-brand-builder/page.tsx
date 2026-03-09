import type { Metadata } from "next";
import Link from "next/link";

import { IconServiceGlyph } from "@/app/portal/PortalIcons";

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
  if (accent === "blue") return "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]";
  if (accent === "coral") return "bg-[color:rgba(251,113,133,0.16)] text-[color:var(--color-brand-pink)]";
  return "bg-[color:rgba(15,23,42,0.08)] text-[color:rgba(15,23,42,0.85)]";
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
              <p className="mt-4 text-base text-white/85 sm:text-lg">
                Stay visible, look established, and build trust that converts.
              </p>
              <p className="mt-4 text-sm text-white/80">
                This package is built for inbound momentum. You show up consistently with helpful content, collect more
                reviews, and keep leads warm until they are ready to book.
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
                Prefer a faster close loop?{" "}
                <Link
                  href="/services/the-sales-loop"
                  className="font-semibold underline decoration-white/40 underline-offset-4"
                >
                  View The Sales Loop
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
                    <div className="mt-1 text-xs text-white/65">
                      More inbound interest, higher trust, and warmer leads when they reach out.
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
                A consistent visibility engine. You publish, collect proof, and nurture leads in the background.
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
                  "Service businesses that want stronger credibility",
                  "Owners who want inbound momentum without daily posting",
                  "Teams that want more warm leads from existing interest",
                  "Businesses that want a long term content foundation",
                ].map((t) => (
                  <div key={t} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-semibold text-zinc-800">
                    {t}
                  </div>
                ))}
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900">What you can expect</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { title: "More trust", desc: "Reviews and consistency reduce friction." },
                  { title: "More inbound", desc: "SEO content compounds over time." },
                  { title: "Higher conversion", desc: "Nurture keeps you top of mind." },
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
              <div className="mt-2 text-sm text-zinc-600">Start free, then turn on your visibility stack.</div>

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
                <div className="text-xs font-semibold tracking-wide text-zinc-600">TIP</div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">Pair with The Launch Kit</div>
                <div className="mt-2 text-sm text-zinc-600">
                  If you need intake and booking first, start with The Launch Kit, then add Brand Builder for inbound.
                </div>
                <div className="mt-4">
                  <Link
                    href="/services/the-launch-kit"
                    className="block rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  >
                    The Launch Kit →
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
                  q: "Do we control topics and tone?",
                  a: "Yes. We tune your prompts, examples, and structure so content matches your brand and services.",
                },
                {
                  q: "How does this help sales?",
                  a: "Visibility plus proof reduces hesitation. You stay present until leads are ready to book.",
                },
                {
                  q: "Can we review before publishing?",
                  a: "Yes. You can review drafts, request edits, and publish on your schedule.",
                },
                {
                  q: "What if we want faster conversion?",
                  a: "Add The Sales Loop to respond faster and follow up consistently when leads come in.",
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
                  <div className="text-lg font-semibold text-white/95">Build a brand that sells</div>
                  <div className="mt-1 text-sm text-white/80">Create your portal account, then activate Brand Builder.</div>
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
