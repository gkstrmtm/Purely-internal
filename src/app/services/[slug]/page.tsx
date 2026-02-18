import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PORTAL_SERVICES, type PortalService } from "@/app/portal/services/catalog";

type MarketingService = {
  slug: string;
  title: string;
  description: string;
  highlights: string[];
};

type SeoContent = {
  primaryKeyword: string;
  secondaryKeywords: string[];
  intro: string;
  whoItsFor: string[];
  howItWorks: string[];
  integrations: string[];
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
  check: "M20 6 9 17l-5-5",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  chart: "M4 19V5m0 14h16M8 15v-3m4 3V9m4 6v-5",
  message: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z",
  calendar: "M8 2v3m8-3v3M4 9h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.51a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.57-1.1a2 2 0 0 1 2.11-.45c.81.24 1.65.42 2.51.54A2 2 0 0 1 22 16.92Z",
};

function getMarketingService(slug: string): MarketingService | null {
  if (slug === "portal") {
    return {
      slug: "portal",
      title: "Core Portal",
      description: "Your home base for services, billing, onboarding, and reporting.",
      highlights: [
        "Turn services on and off as you grow",
        "One place for billing, credits, and usage",
        "Clear reporting on what ran and what got done",
        "Invite your team and control access",
      ],
    };
  }

  const portal = PORTAL_SERVICES.find((s) => s.slug === slug && !s.hidden);
  if (!portal) return null;

  return {
    slug: portal.slug,
    title: portal.title,
    description: portal.description,
    highlights: portal.highlights ?? [],
  };
}

function portalServiceForSlug(slug: string): PortalService | null {
  const found = PORTAL_SERVICES.find((s) => s.slug === slug && !s.hidden);
  return found ?? null;
}

function contentForSlug(slug: string) {
  switch (slug) {
    case "ai-receptionist":
      return {
        headline: "Answer calls and route requests automatically.",
        outcomes: [
          "Stop missing calls and common questions",
          "Route messages to the right person with context",
          "Capture details before a human handoff",
        ],
        useCases: [
          "After-hours call handling",
          "New customer intake",
          "Service-area qualification",
          "Job scheduling + routing",
        ],
        faq: [
          { q: "Does it replace my team?", a: "No; it handles repetitive front desk work and hands off to a human when needed." },
          { q: "Can it send SMS follow-ups?", a: "Yes. It can log the request and trigger follow-ups depending on your configuration." },
        ],
      };
    case "booking":
      return {
        headline: "Turn more leads into booked appointments; without back-and-forth.",
        outcomes: [
          "Instant confirmations and reminders",
          "Reduce no-shows with simple follow-up flows",
          "Route bookings based on answers or rules",
        ],
        useCases: ["Consultations", "Estimates", "Service calls", "Recurring appointments"],
        faq: [
          { q: "Do you support reminders?", a: "Yes; confirmations, reminders, and follow-ups are built in." },
          { q: "Can we customize intake questions?", a: "Yes. We can tailor the form and routing logic to your workflow." },
        ],
      };
    case "reviews":
      return {
        headline: "Get more reviews consistently (and keep the process simple).",
        outcomes: [
          "Ask at the right time after a job",
          "Increase response rate with SMS-first sends",
          "Track requests and outcomes in one place",
        ],
        useCases: ["Home services", "Local businesses", "Professional services", "Multi-location teams"],
        faq: [
          { q: "Can we control who gets asked?", a: "Yes; use simple rules so you only request reviews from the right customers." },
          { q: "Is there a hosted page?", a: "Yes; your reviews experience can include a hosted page and optional Q&A." },
        ],
      };
    case "blogs":
      return {
        headline: "Stay visible with consistent SEO posting.",
        outcomes: [
          "Publish on a schedule without weekly scramble",
          "Build topical authority over time",
          "Turn articles into leads and follow-ups",
        ],
        useCases: ["Local SEO", "Niche authority", "Service page support", "Email/newsletter repurposing"],
        faq: [
          { q: "Do we review posts before publishing?", a: "You can; drafts and light edits are part of the workflow." },
          { q: "Will this match our tone?", a: "Yes; we can tune prompts and examples so it fits your brand." },
        ],
      };
    case "lead-scraping":
      return {
        headline: "Pull fresh leads on demand; cleaned, deduped, and ready.",
        outcomes: [
          "Search by niche and location",
          "Exclude and dedupe against previous pulls",
          "Queue leads into outbound campaigns when enabled",
        ],
        useCases: ["B2B prospecting", "New territory launches", "Seasonal promos", "Pipeline fill"],
        faq: [
          { q: "Is it usage-based?", a: "Yes; lead pulls use credits based on volume." },
          { q: "Can you filter by region?", a: "Yes; location-based targeting is a core workflow." },
        ],
      };
    case "ai-outbound-calls":
      return {
        headline: "Fast follow-up that doesn’t wait on your team.",
        outcomes: [
          "Call leads automatically based on tags or lists",
          "Log outcomes and next steps",
          "Combine calls with SMS/email follow-ups",
        ],
        useCases: ["Lead follow-up", "Reactivation", "Appointment confirmations", "Post-quote check-ins"],
        faq: [
          { q: "Can we control who gets called?", a: "Yes; targeting is based on tags and simple rules." },
          { q: "Is it compliant?", a: "We’ll help you set up consent-friendly workflows and reasonable sending windows." },
        ],
      };
    default:
      return {
        headline: "A practical automation you can turn on and measure.",
        outcomes: ["Less manual work", "Faster response", "Clear visibility in reporting"],
        useCases: ["Daily operations", "Lead handling", "Customer communication"],
        faq: [
          { q: "How do we start?", a: "Click Get Started in the portal, then activate the service and follow the setup steps." },
          { q: "Can you customize it?", a: "Yes; book a call and we’ll tailor the workflow to your tools and process." },
        ],
      };
  }
}

function seoForSlug(slug: string, title: string): SeoContent {
  switch (slug) {
    case "ai-receptionist":
      return {
        primaryKeyword: "AI receptionist",
        secondaryKeywords: [
          "virtual receptionist",
          "AI call answering",
          "call routing automation",
          "after hours call answering",
          "AI phone answering service",
        ],
        intro:
          "An AI receptionist answers calls, routes requests, and captures details automatically so you respond faster and stop missing opportunities.",
        whoItsFor: [
          "Local service businesses that miss calls",
          "Teams that need after-hours coverage",
          "Owners who want consistent intake and routing",
        ],
        howItWorks: [
          "Calls come in; the agent answers immediately",
          "The agent qualifies the request and captures details",
          "Your team gets a clear handoff and activity log",
        ],
        integrations: ["Phone + SMS", "Email", "Your booking workflow", "Internal reporting"],
      };
    case "booking":
      return {
        primaryKeyword: "appointment booking automation",
        secondaryKeywords: [
          "appointment scheduling automation",
          "calendar booking system",
          "appointment reminders",
          "no show reduction",
          "follow up automation",
        ],
        intro:
          "Automate appointment scheduling, confirmations, reminders, and follow-ups so more leads get booked and fewer appointments fall through.",
        whoItsFor: ["Teams that schedule calls", "Businesses that battle no-shows", "Owners who want faster lead response"],
        howItWorks: [
          "Lead picks a time; your calendar stays in sync",
          "Confirmations and reminders go out automatically",
          "Follow-ups run when someone does not book or no-shows",
        ],
        integrations: ["Calendar", "SMS + email", "Forms", "Reporting"],
      };
    case "reviews":
      return {
        primaryKeyword: "review request automation",
        secondaryKeywords: [
          "reputation management",
          "Google review requests",
          "SMS review requests",
          "customer feedback automation",
          "verified reviews page",
        ],
        intro:
          "Automate review requests with simple timing and rules so you consistently collect more reviews and build trust that converts.",
        whoItsFor: ["Local businesses", "Home services", "Teams that want consistent reputation growth"],
        howItWorks: [
          "Trigger a request after a job or milestone",
          "Send via SMS or email; personalize automatically",
          "Track delivery, replies, and outcomes in reporting",
        ],
        integrations: ["SMS", "Email", "Contact lists", "Reporting"],
      };
    case "lead-scraping":
      return {
        primaryKeyword: "lead scraping",
        secondaryKeywords: [
          "lead generation",
          "B2B lead lists",
          "prospecting lists",
          "targeted leads by location",
          "pipeline fill",
        ],
        intro:
          "Generate targeted lead lists by niche and location; dedupe, exclude, and deliver leads ready for outreach and follow-up automation.",
        whoItsFor: ["B2B prospecting", "New markets", "Sales teams that need consistent pipeline"],
        howItWorks: [
          "Define niche and location filters",
          "Run pulls with exclusions and dedupe",
          "Send leads into follow-up workflows when enabled",
        ],
        integrations: ["Outbound campaigns", "SMS + email", "Tags and lists", "Reporting"],
      };
    case "ai-outbound-calls":
      return {
        primaryKeyword: "AI outbound calls",
        secondaryKeywords: [
          "automated outbound calls",
          "lead follow up automation",
          "AI call campaigns",
          "sales follow up automation",
          "SMS and email follow up",
        ],
        intro:
          "Automated AI outbound calls follow up fast, log outcomes, and trigger next steps so hot leads do not cool off.",
        whoItsFor: ["Lead-driven businesses", "Teams that cannot call instantly", "Owners who want consistent follow-up"],
        howItWorks: [
          "Tag or segment contacts to target",
          "Calls run automatically with a tuned script",
          "Outcomes and follow-ups get logged and routed",
        ],
        integrations: ["Phone", "SMS", "Email", "Reporting"],
      };
    default:
      return {
        primaryKeyword: title.toLowerCase(),
        secondaryKeywords: ["automation", "workflow automation", "SMS automation", "email automation", "reporting"],
        intro: "Practical automation that saves time, improves response speed, and stays visible in reporting.",
        whoItsFor: ["Small teams", "Busy operators", "Businesses that want predictable follow-up"],
        howItWorks: ["Turn it on", "Connect your settings", "Track activity and outcomes"],
        integrations: ["Portal", "Messaging", "Reporting"],
      };
  }
}

function relatedServiceSlugs(slug: string): string[] {
  const candidates: Record<string, string[]> = {
    portal: ["automations", "reporting", "inbox", "booking"],
    booking: ["ai-receptionist", "inbox", "follow-up", "reporting"],
    "ai-receptionist": ["booking", "missed-call-textback", "inbox", "reporting"],
    reviews: ["inbox", "newsletter", "nurture-campaigns", "reporting"],
    blogs: ["newsletter", "nurture-campaigns", "reporting"],
    "lead-scraping": ["ai-outbound-calls", "nurture-campaigns", "inbox", "reporting"],
    "ai-outbound-calls": ["lead-scraping", "inbox", "nurture-campaigns", "reporting"],
  };

  const list = candidates[slug] ?? ["inbox", "automations", "reporting"];
  return Array.from(new Set(list.filter((s) => s !== slug)));
}

export async function generateStaticParams() {
  const slugs = PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => s.slug);
  return [{ slug: "portal" }, ...slugs.map((slug) => ({ slug }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = getMarketingService(slug);
  if (!s) return {};

  const seo = seoForSlug(slug, s.title);

  const title = `${s.title} | Purely Automation`;
  const description = `${seo.primaryKeyword}: ${s.description}`.slice(0, 160);

  return {
    title,
    description,
    keywords: [seo.primaryKeyword, ...seo.secondaryKeywords, "Purely Automation"],
    alternates: { canonical: `/services/${encodeURIComponent(slug)}` },
    openGraph: {
      title,
      description,
      url: `/services/${encodeURIComponent(slug)}`,
      type: "article",
    },
  };
}

export default async function ServiceFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getMarketingService(slug);
  if (!service) notFound();

  const portalService = portalServiceForSlug(slug);
  const content = contentForSlug(slug);
  const seo = seoForSlug(slug, service.title);

  const related = relatedServiceSlugs(slug)
    .map((s) => getMarketingService(s))
    .filter((s): s is MarketingService => Boolean(s));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.description,
    provider: {
      "@type": "Organization",
      name: "Purely Automation",
      url: "https://purelyautomation.com",
    },
    areaServed: "US",
    url: `https://purelyautomation.com/services/${encodeURIComponent(slug)}`,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold tracking-wide text-white/70">SERVICE</div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{service.title}</h1>
            <p className="mt-4 text-base text-white/85 sm:text-lg">{content.headline}</p>
            <p className="mt-4 text-sm text-white/80">{service.description}</p>

            <div className="mt-5 rounded-3xl border border-white/15 bg-white/10 p-5">
              <div className="text-xs font-semibold tracking-wide text-white/70">SEO KEYWORDS</div>
              <div className="mt-2 text-sm text-white/85">
                <span className="font-semibold text-white/95">{seo.primaryKeyword}</span>
                <span className="text-white/70">; {seo.secondaryKeywords.slice(0, 4).join(", ")}</span>
              </div>
              <div className="mt-2 text-sm text-white/80">{seo.intro}</div>
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
              <Link
                href="/services"
                className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-base font-semibold text-white hover:bg-white/15"
              >
                All services
              </Link>
            </div>

            {portalService?.entitlementKey ? (
              <div className="mt-4 text-sm text-white/75">
                Available as an add-on service in the portal.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="w-full bg-brand-mist">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm lg:col-span-2">
              <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">What you get</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {service.highlights.map((h) => (
                  <div key={h} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <Icon path={ICONS.check} title="Included" />
                      <div className="text-sm font-semibold text-zinc-900">{h}</div>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-lg font-semibold text-zinc-900">Outcomes</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                {content.outcomes.map((o) => (
                  <div key={o} className="flex items-start gap-3">
                    <Icon path={ICONS.bolt} title="Outcome" />
                    <div>{o}</div>
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-lg font-semibold text-zinc-900">Common use cases</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {content.useCases.map((u) => (
                  <div
                    key={u}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800"
                  >
                    {u}
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-lg font-semibold text-zinc-900">Who it is for</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {seo.whoItsFor.map((w) => (
                  <div key={w} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <Icon path={ICONS.message} title="Who it is for" />
                      <div className="text-sm font-semibold text-zinc-900">{w}</div>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-lg font-semibold text-zinc-900">How it works</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                {seo.howItWorks.map((step, idx) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-[color:rgba(29,78,216,0.10)] text-xs font-bold text-[color:var(--color-brand-blue)]">
                      {idx + 1}
                    </div>
                    <div>{step}</div>
                  </div>
                ))}
              </div>

              {slug === "blogs" ? (
                <div className="mt-8 rounded-3xl border border-zinc-200 bg-gradient-to-br from-white to-[color:rgba(29,78,216,0.06)] p-6">
                  <div className="flex items-start gap-3">
                    <Icon path={ICONS.chart} title="Demo" />
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">See what it looks like</div>
                      <div className="mt-1 text-sm text-zinc-700">
                        Visit our live demo blog to see real posts, formatting, and the structure we publish with.
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Link
                          href="/blogs"
                          className="inline-flex items-center justify-center rounded-2xl bg-[color:rgba(15,23,42,0.96)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[color:rgba(15,23,42,1)]"
                        >
                          View the /blogs demo
                        </Link>
                        <div className="text-xs text-zinc-600">purelyautomation.com/blogs</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <h3 className="mt-8 text-lg font-semibold text-zinc-900">Integrations and channels</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {seo.integrations.map((i) => (
                  <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <Icon path={ICONS.chart} title="Integrations" />
                      <div className="text-sm font-semibold text-zinc-900">{i}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">Next step</div>
              <div className="mt-2 text-sm text-zinc-600">
                Start with plug-and-play setup in the portal, or book a call if you want something tailored.
              </div>

              <div className="mt-6 space-y-3">
                <Link
                  href="/portal/get-started"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:rgba(15,23,42,0.96)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[color:rgba(15,23,42,1)]"
                >
                  Get Started
                </Link>
                <Link
                  href="/book-a-call"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Book a Call
                </Link>
                <Link
                  href="/services"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Browse services
                </Link>
              </div>

              <div className="mt-6 rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-600">
                Tip: If you’re already a client, you can also sign in and activate services directly.
              </div>

              <div className="mt-3 text-center">
                <Link href="/login" className="text-sm font-semibold text-brand-blue hover:underline">
                  Client sign in
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">FAQ</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {content.faq.map((f) => (
                <div key={f.q} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="text-sm font-semibold text-zinc-900">{f.q}</div>
                  <div className="mt-2 text-sm text-zinc-600">{f.a}</div>
                </div>
              ))}
            </div>
          </div>

          {related.length ? (
            <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
              <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">Related services</h2>
              <div className="mt-2 text-sm text-zinc-600">
                Build a stack that covers lead response, follow-up, and reporting.
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/services/${encodeURIComponent(r.slug)}`}
                    className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg"
                  >
                    <div className="text-sm font-semibold text-zinc-900">{r.title}</div>
                    <div className="mt-2 text-sm text-zinc-600">{r.description}</div>
                    <div className="mt-4 text-sm font-semibold text-[color:var(--color-brand-blue)]">View details →</div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-10 flex flex-col items-start justify-between gap-3 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:flex-row sm:items-center">
            <div>
              <div className="text-lg font-semibold text-zinc-900">Ready to turn this on?</div>
              <div className="mt-1 text-sm text-zinc-600">Get started in the portal, or book a call for a custom build.</div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/portal/get-started"
                className="inline-flex items-center justify-center rounded-2xl bg-[color:rgba(15,23,42,0.96)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:rgba(15,23,42,1)]"
              >
                Get Started
              </Link>
              <Link
                href="/book-a-call"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Book a Call
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
