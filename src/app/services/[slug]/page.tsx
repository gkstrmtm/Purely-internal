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
          { q: "Does it replace my team?", a: "No—it handles the repetitive front desk work and hands off to a human when needed." },
          { q: "Can it send SMS follow-ups?", a: "Yes. It can log the request and trigger follow-ups depending on your configuration." },
        ],
      };
    case "booking":
      return {
        headline: "Turn more leads into booked appointments—without back-and-forth.",
        outcomes: [
          "Instant confirmations and reminders",
          "Reduce no-shows with simple follow-up flows",
          "Route bookings based on answers or rules",
        ],
        useCases: ["Consultations", "Estimates", "Service calls", "Recurring appointments"],
        faq: [
          { q: "Do you support reminders?", a: "Yes—confirmations, reminders, and follow-ups are built in." },
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
          { q: "Can we control who gets asked?", a: "Yes—use simple rules so you only request reviews from the right customers." },
          { q: "Is there a hosted page?", a: "Yes—your reviews experience can include a hosted page and optional Q&A." },
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
          { q: "Do we review posts before publishing?", a: "You can—drafts and light edits are part of the workflow." },
          { q: "Will this match our tone?", a: "Yes—we can tune prompts and examples so it fits your brand." },
        ],
      };
    case "lead-scraping":
      return {
        headline: "Pull fresh leads on demand—cleaned, deduped, and ready.",
        outcomes: [
          "Search by niche and location",
          "Exclude and dedupe against previous pulls",
          "Queue leads into outbound campaigns when enabled",
        ],
        useCases: ["B2B prospecting", "New territory launches", "Seasonal promos", "Pipeline fill"],
        faq: [
          { q: "Is it usage-based?", a: "Yes—lead pulls use credits based on volume." },
          { q: "Can you filter by region?", a: "Yes—location-based targeting is a core workflow." },
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
          { q: "Can we control who gets called?", a: "Yes—targeting is based on tags and simple rules." },
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
          { q: "Can you customize it?", a: "Yes—book a call and we’ll tailor the workflow to your tools and process." },
        ],
      };
  }
}

export async function generateStaticParams() {
  const slugs = PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => s.slug);
  return [{ slug: "portal" }, ...slugs.map((slug) => ({ slug }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = getMarketingService(slug);
  if (!s) return {};

  const title = `${s.title} | Purely Automation`;
  const description = s.description;

  return {
    title,
    description,
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

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold tracking-wide text-white/70">SERVICE</div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{service.title}</h1>
            <p className="mt-4 text-base text-white/85 sm:text-lg">{content.headline}</p>
            <p className="mt-4 text-sm text-white/80">{service.description}</p>

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
                    <div className="text-sm font-semibold text-zinc-900">{h}</div>
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-lg font-semibold text-zinc-900">Outcomes</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                {content.outcomes.map((o) => (
                  <div key={o}>• {o}</div>
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
