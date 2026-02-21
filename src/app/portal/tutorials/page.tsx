import Link from "next/link";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";
import { IconServiceGlyph } from "@/app/portal/PortalIcons";
import { requirePortalUser } from "@/lib/portalAuth";

function getCoreWhatYoullLearn(slug: string): string {
  switch (slug) {
    case "getting-started":
      return "How to use your first session to turn on the right services, wire up the basics, and avoid feeling overwhelmed.";
    case "dashboard":
      return "How to read the snapshot of hours saved and activity so you can see which services are actually doing work for you.";
    case "people":
      return "How to search, filter, and understand contacts so you always know who you are talking to and what has happened so far.";
    case "billing":
      return "How to read your plan, invoices, and usage so there are no surprises on renewals or credit consumption.";
    case "credits":
      return "How usage-based credits are consumed, what happens when they run low, and where to see and top them up.";
    case "profile":
      return "How to safely update your login, notifications, and integrations without locking yourself out or breaking automations.";
    default:
      return "How this page fits into your workflow and what to check if numbers or details do not look right.";
  }
}

function getServiceWhatYoullLearn(slug: string): string {
  switch (slug) {
    case "inbox":
      return "How to keep email and SMS threads in one queue, reply from the portal, and leave notes so your team stays in sync.";
    case "media-library":
      return "How to organize photos, videos, and files once and reuse them across emails, SMS, and campaigns without re-uploading.";
    case "tasks":
      return "How to create, assign, and close tasks so human to dos stay tied to what your automations and services are doing.";
    case "ai-receptionist":
      return "How to connect your number, tune the script, and review calls so AI Receptionist reliably answers and routes for you.";
    case "newsletter":
      return "How to draft a simple campaign, choose the right audience, and read basic stats after you send.";
    case "booking":
      return "How to connect your calendar, share a booking link, and reduce back-and-forth while keeping your schedule accurate.";
    case "ai-outbound-calls":
      return "How to define who should be called, set the script, and review outcomes so you do not have to dial one by one.";
    case "lead-scraping":
      return "How to set up searches, exclusions, and schedules so fresh leads keep appearing without paying for duplicates.";
    case "automations":
      return "How to connect triggers and steps into simple flows so repetitive work runs automatically.";
    case "blogs":
      return "How to approve topics and let automated drafts keep blog content going out on a steady schedule.";
    case "reviews":
      return "How to send review requests at the right time and track who responded and where.";
    case "nurture-campaigns":
      return "How to build simple nurture sequences that keep leads warm without overwhelming their inbox.";
    case "reporting":
      return "How to read the hours-saved snapshot and service activity so you know what is working.";
    default:
      return "How this service works in your portal, what it automates, and how to read the results it produces.";
  }
}

export default async function PortalTutorialsPage() {
  await requirePortalUser();

  const services = PORTAL_SERVICES.filter((s) => !s.hidden && (!s.variants || s.variants.includes("portal")));
  const serviceGroups = groupPortalServices(services);
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
                <p className="text-sm text-zinc-600">{getCoreWhatYoullLearn(s.slug)}</p>
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
          <div className="mt-4 space-y-10">
            {serviceGroups.map((group) => (
              <section key={group.key}>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.services.map((s) => (
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
                        <p className="text-sm text-zinc-600">{getServiceWhatYoullLearn(s.slug)}</p>
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
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
