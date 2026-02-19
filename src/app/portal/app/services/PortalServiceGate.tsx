import Link from "next/link";
import { headers } from "next/headers";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { requirePortalUserForAnyService, requirePortalUserForService } from "@/lib/portalAuth";
import { getPortalServiceStatusesForOwner } from "@/lib/portalServicesStatus";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import { normalizePortalVariant, portalBasePath, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

function serviceKeysForSlug(slug: string): readonly PortalServiceKey[] {
  switch (slug) {
    case "inbox":
      return ["inbox", "outbox"];
    case "media-library":
      return ["media"];
    case "ai-receptionist":
      return ["aiReceptionist"];
    case "ai-outbound-calls":
      return ["aiOutboundCalls"];
    case "lead-scraping":
      return ["leadScraping"];
    case "missed-call-textback":
      return ["missedCallTextback"];
    case "follow-up":
      return ["followUp"];
    case "nurture-campaigns":
      return ["nurtureCampaigns"];
    default:
      // Most slugs map 1:1 (blogs, booking, automations, tasks, reviews, reporting, etc.)
      return [slug as PortalServiceKey];
  }
}

function benefitCopyForService(serviceSlug: string, entitlementKey?: string) {
  const key = (entitlementKey || "").trim();
  if (serviceSlug === "blogs" || key === "blog") {
    return {
      title: "Turn your website into a lead engine",
      bullets: [
        "Publish consistent, SEO-ready content without the weekly grind",
        "Generate on-brand drafts from your topics and goals",
        "Keep momentum with an automation schedule you control",
        "Build trust with prospects before they ever talk to you",
      ],
    };
  }

  if (serviceSlug === "booking" || key === "booking") {
    return {
      title: "Book more appointments with less back-and-forth",
      bullets: [
        "Share a clean booking link that works 24/7",
        "Capture the details you need up-front",
        "Reduce no-shows with reminders",
        "Stay organized with a single source of truth",
      ],
    };
  }

  if (serviceSlug === "reviews" || key === "reviews") {
    return {
      title: "Get more reviews (without nagging)",
      bullets: [
        "Send requests at the right time",
        "Follow up automatically",
        "Track responses in one place",
        "Build social proof that converts",
      ],
    };
  }

  if (serviceSlug === "ai-receptionist" || key === "aiReceptionist") {
    return {
      title: "Answer calls and route requests automatically",
      bullets: [
        "Front desk-style answering 24/7",
        "Collect details before handoff",
        "Forward calls to your team when needed",
        "See activity and outcomes in the portal",
      ],
    };
  }

  return {
    title: "Unlock this service",
    bullets: [
      "Add it in Billing and start configuring right away",
      "Upgrade or remove add-ons any time",
      "Everything stays under one portal login",
    ],
  };
}

function LockedShell(opts: {
  basePath: "/portal" | "/credit";
  slug: string;
  title: string;
  description: string;
  highlights?: string[];
  entitlementKey?: string;
  state: "locked" | "paused" | "canceled" | "coming_soon";
  label: string;
}) {
  const benefit = benefitCopyForService(opts.slug, opts.entitlementKey);

  const billingUnlockHref =
    opts.state === "paused" || opts.state === "canceled"
      ? `${opts.basePath}/app/billing`
      : opts.entitlementKey
        ? `${opts.basePath}/app/billing?buy=${encodeURIComponent(opts.entitlementKey)}&autostart=1`
        : `${opts.basePath}/app/billing`;

  const primaryCta = opts.state === "paused" || opts.state === "canceled" ? "Open Billing" : `Unlock ${opts.title}`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-[color:rgba(251,113,133,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-pink)]">
          <span className="inline-flex"><span className="sr-only">Locked</span></span>
          {opts.state === "paused" ? "Paused" : opts.state === "canceled" ? "Canceled" : opts.state === "coming_soon" ? "Coming soon" : "Locked"}
        </div>

        <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">
          {opts.state === "paused" || opts.state === "canceled"
            ? `${opts.title} is ${opts.state}`
            : opts.state === "coming_soon"
              ? `${opts.title} is coming soon`
              : `Unlock ${opts.title}`}
        </h1>

        <p className="mt-3 max-w-2xl text-sm text-zinc-600">
          {opts.state === "paused" || opts.state === "canceled"
            ? "This service is turned off in Billing. Resume it any time to regain access."
            : opts.state === "coming_soon"
              ? "This service isn’t available yet. We’ll show it here as soon as it’s ready."
              : "This service isn’t included in your current plan. You can add it any time."}
        </p>

        <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
          <div className="text-sm font-semibold text-zinc-900">{benefit.title}</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            {benefit.bullets.slice(0, 4).map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {opts.highlights?.length ? (
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-sm font-semibold text-zinc-900">What you get</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {opts.highlights.slice(0, 4).map((h) => (
                <li key={h} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {opts.state !== "coming_soon" ? (
            <Link
              href={billingUnlockHref}
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              {primaryCta}
            </Link>
          ) : null}
          <Link
            href={`${opts.basePath}/app/services`}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Back to services
          </Link>
        </div>
      </div>
    </div>
  );
}

export async function PortalServiceGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  const basePath = portalBasePath(variant);

  const service = PORTAL_SERVICES.find((s) => s.slug === slug) ?? null;
  if (!service) return children;

  // Permissions gating only. Ownership gating is represented by the service status below.
  const keys = serviceKeysForSlug(slug);
  const user =
    keys.length === 1
      ? await requirePortalUserForService(keys[0], "view")
      : await requirePortalUserForAnyService(keys.slice(), "view");

  const ownerId = user.id;
  const result = await getPortalServiceStatusesForOwner({ ownerId, fallbackEmail: user.email });
  const st = result.statuses?.[slug];
  const state = String(st?.state || "").toLowerCase();

  if (state === "locked" || state === "paused" || state === "canceled" || state === "coming_soon") {
    return (
      <LockedShell
        basePath={basePath}
        slug={slug}
        title={service.title}
        description={service.description}
        highlights={service.highlights}
        entitlementKey={service.entitlementKey}
        state={state as any}
        label={String(st?.label || "")}
      />
    );
  }

  return children;
}
