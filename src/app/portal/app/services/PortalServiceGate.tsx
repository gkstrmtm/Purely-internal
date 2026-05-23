import Link from "next/link";
import { headers } from "next/headers";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { requirePortalUserForAnyService, requirePortalUserForService } from "@/lib/portalAuth";
import { getPortalServiceStatusesForOwner } from "@/lib/portalServicesStatus";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import { normalizePortalVariant, portalBasePath, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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

function benefitCopyForService(serviceSlug: string, entitlementKey?: string, variant: "credit" | "portal" = "portal") {
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
      variant === "credit" ? "Everything stays in one credit workspace" : "Everything stays under one portal login",
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
  const benefit = benefitCopyForService(opts.slug, opts.entitlementKey, opts.basePath === "/credit" ? "credit" : "portal");

  const statusClass =
    opts.state === "paused"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : opts.state === "canceled"
        ? "border-red-200 bg-red-50 text-red-700"
        : opts.state === "coming_soon"
          ? "border-zinc-200 bg-white text-zinc-500"
          : "border-zinc-200 bg-zinc-50 text-zinc-600";

  const billingUnlockHref =
    opts.state === "paused" || opts.state === "canceled"
      ? `${opts.basePath}/app/billing#pa-billing-services`
      : opts.entitlementKey
        ? `${opts.basePath}/app/billing?buy=${encodeURIComponent(opts.entitlementKey)}&autostart=1`
        : `${opts.basePath}/app/billing#pa-billing-services`;
  const helpHref = `${opts.basePath}/tutorials/${opts.slug}`;
  const askPuraHref = `${opts.basePath}/app/ai-chat?onboarding=1`;

  const primaryCta = opts.state === "paused" || opts.state === "canceled" ? `Resume ${opts.title}` : `Enable ${opts.title}`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
            {opts.label || (opts.state === "paused" ? "Paused" : opts.state === "canceled" ? "Canceled" : opts.state === "coming_soon" ? "Coming soon" : "Locked")}
          </div>
          <h1 className="mt-3 text-2xl font-bold text-brand-ink sm:text-3xl">
            {opts.state === "paused" || opts.state === "canceled"
              ? `${opts.title} is ${opts.state}`
              : opts.state === "coming_soon"
                ? `${opts.title} is coming soon`
                : `Unlock ${opts.title}`}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            {opts.state === "paused" || opts.state === "canceled"
              ? "This service is currently off. Resume it from your service access section whenever you are ready to bring it back live."
              : opts.state === "coming_soon"
                ? "This service is still being rolled out. You can preview the walkthrough now so the setup path is already clear when it goes live."
                : "This service isn’t included in your current plan. You can add it any time."}
          </p>
        </div>
        <Link
          href={`${opts.basePath}/app/services`}
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Why teams add this</div>
          <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
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
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
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
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Next step</div>
            <div className="mt-2 text-sm text-zinc-600">
              {opts.state === "paused" || opts.state === "canceled"
                ? "Resume this service from service access, then come back here to continue setup."
                : opts.state === "coming_soon"
                  ? "Use the walkthrough now so you already know the setup path when access opens up."
                  : "Enable this service now, then come back here to configure it."}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {opts.state !== "coming_soon" ? (
                <Link
                  href={billingUnlockHref}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                >
                  {primaryCta}
                </Link>
              ) : null}
              <Link
                href={`${opts.basePath}/app/services`}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Back to services
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Need help getting this live?</div>
            <div className="mt-2 text-sm text-zinc-600">
              Open the walkthrough for the exact setup path, or let Pura help you decide what to unlock, configure, and test first.
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href={helpHref}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
              >
                Open walkthrough
              </Link>
              <Link
                href={askPuraHref}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Ask Pura for help
              </Link>
            </div>
          </div>
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
  const result = await withTimeout(
    getPortalServiceStatusesForOwner({
      ownerId,
      fallbackEmail: user.email,
      portalVariant: variant,
      serviceSlugs: [slug],
    }).catch((error) => {
      console.error("[portal][service-gate] status lookup failed", {
        ownerId,
        slug,
        variant,
        error: error instanceof Error ? error.message : String(error ?? "unknown"),
      });
      return null;
    }),
    2000,
    null,
  );
  if (!result) {
    return children;
  }
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
