import type { Metadata } from "next";
import Link from "next/link";

import { IconServiceGlyph } from "@/app/portal/PortalIcons";
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

function accentTextColor(accent: "blue" | "coral" | "ink") {
  if (accent === "blue") return "text-[color:var(--color-brand-blue)]";
  if (accent === "coral") return "text-[color:var(--color-brand-pink)]";
  return "text-zinc-700";
}

export default function ServicesIndexPage() {
  // Marketing /services page: hide credit-only services, but keep Funnel Builder.
  const visiblePortalServices = PORTAL_SERVICES.filter((s) => !s.hidden).filter(
    (s) => s.slug !== "dispute-letters" && s.slug !== "credit-reports",
  );

  // Start with the default grouping, then remove the Credit section and move Funnel Builder into Lead generation.
  const groups = (() => {
    const initial = groupPortalServices(visiblePortalServices);
    const creditGroup = initial.find((g) => g.key === "credit");
    const funnel = creditGroup?.services?.find((s) => s.slug === "funnel-builder");

    const withoutCredit = initial.filter((g) => g.key !== "credit");
    if (!funnel) return withoutCredit;

    const leadsGroup = withoutCredit.find((g) => g.key === "leads");
    if (leadsGroup) {
      return withoutCredit.map((g) => (g.key === "leads" ? { ...g, services: [funnel, ...g.services] } : g));
    }

    return [
      ...withoutCredit,
      {
        key: "leads",
        title: "Lead generation",
        services: [funnel],
      },
    ];
  })();

  const directoryItems = [
    { slug: "portal", title: "Core Portal" },
    { slug: "the-launch-kit", title: "The Launch Kit" },
    { slug: "the-sales-loop", title: "The Sales Loop" },
    { slug: "the-brand-builder", title: "The Brand Builder" },
    ...groups
      .flatMap((g) => g.services)
      .map((s) => ({ slug: s.slug, title: s.title }))
      .filter((item, idx, all) => all.findIndex((x) => x.slug === item.slug) === idx),
  ];

  return (
    <main className="min-h-screen bg-white">
      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="max-w-3xl">
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
              <details className="group relative">
                <summary className="cursor-pointer list-none select-none rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90 hover:bg-white/15 [&::-webkit-details-marker]:hidden">
                  Directory
                  <span className="ml-1 text-white/70" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="absolute left-0 top-[calc(100%+10px)] z-10 w-[min(320px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2 shadow-xl backdrop-blur">
                  <div className="max-h-72 overflow-auto">
                    {directoryItems.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/services/${encodeURIComponent(item.slug)}`}
                        className="block rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </details>
            </div>

            <div className="text-xs font-semibold tracking-wide text-white/70">SERVICES</div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">One portal. Many automations.</h1>
            <p className="mt-4 text-base text-white/85 sm:text-lg">
              Pick one service to start, or stack a few. Everything stays in one place; billing, reporting,
              and your activity trail.
            </p>

            <div className="mt-4 text-sm text-white/80">Start for free. Activate services when you’re ready.</div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {["ai-receptionist", "booking", "inbox", "reviews"].map((slug) => (
                <div
                  key={slug}
                  className="flex items-start gap-3 rounded-3xl border border-white/15 bg-white/10 p-4"
                >
                  <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white/95">
                    <IconServiceGlyph slug={slug} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/95">
                      {slug === "ai-receptionist"
                        ? "Calls answered"
                        : slug === "booking"
                          ? "Booking + follow-up"
                          : slug === "inbox"
                            ? "Inbox and reply"
                            : "Reviews + reputation"}
                    </div>
                    <div className="mt-1 text-sm text-white/75">
                      {slug === "ai-receptionist"
                        ? "Capture lead details and route requests automatically."
                        : slug === "booking"
                          ? "Scheduling automation, confirmations, and reminders."
                          : slug === "inbox"
                            ? "Keep SMS + email history together with full context."
                            : "Consistent review requests that build trust."}
                    </div>
                  </div>
                </div>
              ))}
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
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-base font-semibold text-white hover:opacity-95"
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
          <div className="rounded-3xl border border-zinc-200 bg-white p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-brand-ink sm:text-2xl">Which package should I get?</h2>
                <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                  If you’re not sure where to start, pick the outcome you want most. You can stack services later.
                </p>
              </div>
              <Link
                href="/portal/get-started"
                className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
              >
                Start free
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fast launch</div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">The Launch Kit</div>
                <div className="mt-2 text-sm text-zinc-600">
                  For teams that want to get set up quickly and start converting leads without overthinking it.
                </div>
                <div className="mt-4 space-y-1 text-sm text-zinc-700">
                  <div>• Funnel Builder for intake</div>
                  <div>• Automation Builder for routing + follow-up</div>
                  <div>• AI receptionist + automated blogs</div>
                </div>
                <div className="mt-5">
                  <Link
                    href="/services/the-launch-kit"
                    className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                  >
                    View package →
                  </Link>
                </div>
              </div>

              <div className="relative rounded-3xl border-2 border-[color:rgba(29,78,216,0.45)] bg-[color:rgba(29,78,216,0.05)] p-6">
                <div className="absolute right-5 top-5 inline-flex items-center rounded-full bg-[color:rgba(29,78,216,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-blue)]">
                  Recommended
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[color:rgba(29,78,216,0.78)]">Close faster</div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">The Sales Loop</div>
                <div className="mt-2 text-sm text-zinc-600">
                  For lead-driven teams that need faster response, consistent follow-up, and more booked calls.
                </div>
                <div className="mt-4 space-y-1 text-sm text-zinc-700">
                  <div>• Booking automation + confirmations</div>
                  <div>• AI receptionist for inbound lead handling</div>
                  <div>• Lead scraping + AI outbound included</div>
                </div>
                <div className="mt-5">
                  <Link
                    href="/services/the-sales-loop"
                    className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                  >
                    View package →
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Build trust</div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">The Brand Builder</div>
                <div className="mt-2 text-sm text-zinc-600">
                  For businesses that want consistent visibility and proof without posting every day.
                </div>
                <div className="mt-4 space-y-1 text-sm text-zinc-700">
                  <div>• Automated blogs for SEO momentum</div>
                  <div>• Reviews that build credibility</div>
                  <div>• Newsletter to stay top-of-mind</div>
                </div>
                <div className="mt-5">
                  <Link
                    href="/services/the-brand-builder"
                    className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                  >
                    View package →
                  </Link>
                </div>
              </div>
            </div>

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
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
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

          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
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
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                          <span className={accentTextColor(s.accent)}>
                            <IconServiceGlyph slug={s.slug} />
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
                          <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
                        </div>
                      </div>
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
        </div>
      </section>
    </main>
  );
}
