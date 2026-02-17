import Link from "next/link";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconServiceGlyph } from "@/app/portal/PortalIcons";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalTutorialsPage() {
  await requirePortalUser();

  const services = PORTAL_SERVICES.filter((s) => !s.hidden);
  const corePages = [
    {
      slug: "getting-started",
      title: "Getting started",
      description: "First-time walkthrough of how the portal fits together and what to do first.",
      accent: "blue" as const,
    },
    {
      slug: "dashboard",
      title: "Dashboard",
      description: "Snapshot of what is live and how much time you are saving.",
      accent: "blue" as const,
    },
    {
      slug: "people",
      title: "People",
      description: "Contacts and basic details about who you are talking to.",
      accent: "coral" as const,
    },
    {
      slug: "billing",
      title: "Billing",
      description: "Plan, invoices, and credit balance for this portal account.",
      accent: "ink" as const,
    },
    {
      slug: "credits",
      title: "Credits",
      description: "How usage-based credits work, how they are consumed, and what happens when you run low.",
      accent: "ink" as const,
    },
    {
      slug: "profile",
      title: "Profile",
      description: "Your login details, notifications, and integrations.",
      accent: "blue" as const,
    },
  ];

  return (
    <div className="w-full bg-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Help &amp; tutorials</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
              Short walkthroughs for each service: what it does, how to use it, and how everything fits together.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {corePages.map((s) => (
            <div key={s.slug} className="flex flex-col rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
                  <span
                    className={
                      s.accent === "blue"
                        ? "text-[color:var(--color-brand-blue)]"
                        : s.accent === "coral"
                          ? "text-[color:var(--color-brand-pink)]"
                          : "text-zinc-700"
                    }
                  >
                    <IconServiceGlyph slug={s.slug} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold text-brand-ink">{s.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">Portal page</div>
                </div>
              </div>

              <div className="mt-3 text-sm text-zinc-600">{s.description}</div>

              <div className="mt-4 space-y-1 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">What you&apos;ll learn</div>
                <p className="text-sm text-zinc-600">
                  How this page fits into your workflow and what to check if numbers or details do not look right.
                </p>
              </div>

              <div className="mt-5 flex justify-end">
                <Link
                  href={`/portal/tutorials/${s.slug}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  Go
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Service tutorials</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
            <div key={s.slug} className="flex flex-col rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
                  <span
                    className={
                      s.accent === "blue"
                        ? "text-[color:var(--color-brand-blue)]"
                        : s.accent === "coral"
                          ? "text-[color:var(--color-brand-pink)]"
                          : "text-zinc-700"
                    }
                  >
                    <IconServiceGlyph slug={s.slug} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold text-brand-ink">{s.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">Service tutorial</div>
                </div>
              </div>

              <div className="mt-3 text-sm text-zinc-600">{s.description}</div>

              <div className="mt-4 space-y-1 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">What you&apos;ll learn</div>
                <p className="text-sm text-zinc-600">
                  How this service works in your portal, what it automates, and how to read the results it produces.
                </p>
              </div>

              <div className="mt-5 flex justify-end">
                <Link
                  href={`/portal/tutorials/${s.slug}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  Go
                </Link>
              </div>
            </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
