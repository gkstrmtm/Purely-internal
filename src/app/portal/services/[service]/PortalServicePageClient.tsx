"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type PortalPricing = {
  ok: true;
  stripeConfigured: boolean;
  credits: { usdValue: number; rollOver: boolean; topup: { creditsPerPackage: number } };
  modules: {
    blog: { monthlyCents: number; currency: string } | null;
    booking: { monthlyCents: number; currency: string } | null;
    automations: { monthlyCents: number; currency: string } | null;
    reviews: { monthlyCents: number; currency: string } | null;
    newsletter: { monthlyCents: number; currency: string } | null;
    nurture: { monthlyCents: number; currency: string } | null;
    aiReceptionist: { monthlyCents: number; currency: string } | null;
    crm: { monthlyCents: number; currency: string } | null;
    leadOutbound: { monthlyCents: number; currency: string } | null;
  };
};

type ServiceStatusRes =
  | {
      ok: true;
      statuses: Record<string, { state: "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled"; label: string }>;
    }
  | { ok: false; error?: string };

function formatMonthly(cents: number, currency: string) {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const curr = (currency || "usd").toUpperCase();
  const amount = (value / 100).toFixed(2);
  return `${curr} ${amount}`;
}

function statusBadgeClass(state: string) {
  switch (state) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_setup":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "canceled":
      return "border-red-200 bg-red-50 text-red-700";
    case "coming_soon":
      return "border-zinc-200 bg-white text-zinc-500";
    case "locked":
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
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

  if (serviceSlug === "follow-up" || key === "crm") {
    return {
      title: "Follow up faster (and never drop leads)",
      bullets: [
        "Automate follow-ups so every lead gets touched",
        "Standardize messaging while staying personal",
        "See what’s working and iterate",
        "Spend time closing, not chasing",
      ],
    };
  }

  if (serviceSlug === "ai-outbound-calls" || key === "leadOutbound") {
    return {
      title: "Scale outbound without hiring a call team",
      bullets: [
        "Qualify leads consistently and route the best ones",
        "Increase speed-to-lead with 24/7 coverage",
        "Keep your team focused on warm conversations",
        "Turn outbound into a predictable channel",
      ],
    };
  }

  return {
    title: "Unlock this service",
    bullets: [
      "Add it in Billing and start configuring right away",
      "Keep everything under one portal login",
      "Upgrade or remove add-ons any time",
    ],
  };
}

export function PortalServicePageClient({ slug }: { slug: string }) {
  const pathname = usePathname();
  const variant = pathname === "/credit" || pathname.startsWith("/credit/") ? "credit" : "portal";
  const portalBase = variant === "credit" ? "/credit" : "/portal";
  const appBase = `${portalBase}/app`;

  const service = useMemo(
    () => {
      const s = PORTAL_SERVICES.find((x) => x.slug === slug) ?? null;
      if (!s) return null;
      if (!s.variants) return s;
      return s.variants.includes(variant) ? s : null;
    },
    [slug, variant],
  );

  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<PortalPricing | null>(null);
  const [statusRes, setStatusRes] = useState<ServiceStatusRes | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [pricingRes, statusRes] = await Promise.all([
        fetch("/api/portal/pricing", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/services/status", { cache: "no-store" }).catch(() => null as any),
      ]);
      if (!mounted) return;
      if (pricingRes && pricingRes.ok) {
        const body = (await pricingRes.json().catch(() => null)) as PortalPricing | null;
        setPricing(body && (body as any).ok === true ? body : null);
      } else {
        setPricing(null);
      }

      if (statusRes && statusRes.ok) {
        const body = (await statusRes.json().catch(() => null)) as ServiceStatusRes | null;
        setStatusRes(body);
      } else {
        setStatusRes(null);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const serviceStatus = statusRes && statusRes.ok === true ? statusRes.statuses?.[slug] ?? null : null;
  const state = String(serviceStatus?.state || "").toLowerCase();
  const isPaused = state === "paused";
  const isCanceled = state === "canceled";
  const isLocked = state === "locked";
  const isComingSoon = state === "coming_soon";

  // Canonical ownership lives in `/api/portal/services/status` (computed for the owner).
  // If we can't load status, default to safe behavior: only included services render as unlocked.
  const unlocked = serviceStatus
    ? !(isPaused || isCanceled || isLocked || isComingSoon)
    : Boolean(service?.included);

  const modulePrice =
    service?.entitlementKey && pricing?.modules
      ? (pricing.modules as any)[service.entitlementKey as any]
      : null;

  const entitlementKey = service?.entitlementKey;
  const benefit = benefitCopyForService(slug, entitlementKey);

  const billingUnlockHref =
    isPaused || isCanceled
      ? `${appBase}/billing`
      : entitlementKey
        ? `${appBase}/billing?buy=${encodeURIComponent(entitlementKey)}&autostart=1`
        : `${appBase}/billing`;

  if (!service) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-base font-semibold text-brand-ink">Service not found</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(state)}`}>
              {serviceStatus?.label || (isPaused ? "Paused" : isCanceled ? "Canceled" : isComingSoon ? "Coming soon" : "Locked")}
            </div>
            <h1 className="mt-3 text-2xl font-bold text-brand-ink sm:text-3xl">
              {isPaused || isCanceled ? `${service.title} is ${isPaused ? "paused" : "canceled"}` : `Unlock ${service.title}`}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            {isPaused || isCanceled
              ? "This service is turned off in Billing. Resume it any time to regain access."
              : isComingSoon
                ? "This service isn’t available yet. It will appear here once it’s ready."
                : "This service isn’t included in your current plan. You can add it any time."}
            </p>
          </div>
          <Link
            href={`${appBase}/services`}
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

            {service.highlights?.length ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">What you get</div>
                <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                  {service.highlights.slice(0, 4).map((h) => (
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
              <div className="text-sm font-semibold text-zinc-900">Monthly add-on</div>
              <div className="mt-2 text-3xl font-bold text-brand-ink">
                {modulePrice ? formatMonthly(modulePrice.monthlyCents, modulePrice.currency) : "See Billing"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {modulePrice ? "/ month" : "Pricing depends on your active modules"}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Next step</div>
              <div className="mt-2 text-sm text-zinc-600">
                {isPaused || isCanceled
                  ? "Open Billing to turn this service back on."
                  : isComingSoon
                    ? "Keep using the rest of your services while this one is being prepared."
                    : "Turn this service on in Billing, then come back here to configure it."}
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {!isComingSoon ? (
                  <Link
                    href={billingUnlockHref}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                  >
                    {isPaused || isCanceled ? "Open Billing" : "Unlock in Billing"}
                  </Link>
                ) : null}
                <Link
                  href={`${appBase}/services`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Back to services
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-600">
          Need help picking the right setup? Email{" "}
          <a className="font-semibold text-brand-ink hover:underline" href="mailto:support@purelyautomation.dev">
            support@purelyautomation.dev
          </a>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{service.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">{service.description}</p>
        </div>
        <Link
          href={`${appBase}/services`}
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Overview</div>
          {slug === "blogs" ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                Manage drafts, export Markdown, and connect an optional custom domain.
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`${appBase}/services/blogs`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Blogs
                </Link>
                <Link
                  href={`${appBase}/onboarding`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Onboarding
                </Link>
              </div>
            </div>
          ) : slug === "booking" ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                Publish a booking link, set availability, and capture appointments.
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`${appBase}/services/booking`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Booking
                </Link>
                <Link
                  href={`${appBase}/onboarding`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Onboarding
                </Link>
              </div>
            </div>
          ) : slug === "lead-scraping" ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                Pull fresh leads from business directories with exclusions, de-dupe, and scheduling.
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`${appBase}/services/lead-scraping`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Lead Scraping
                </Link>
                <Link
                  href={`${appBase}/billing`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Billing
                </Link>
              </div>
            </div>
          ) : slug === "reporting" ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                See a dashboard-style view of activity, outcomes, and credit usage.
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`${appBase}/services/reporting`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Reporting
                </Link>
                <Link
                  href={`${appBase}/billing`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Billing
                </Link>
              </div>
            </div>
          ) : slug === "inbox" ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                View email and SMS threads, and send messages from one inbox.
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`${appBase}/services/inbox`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Inbox
                </Link>
                <Link
                  href={`${appBase}/onboarding`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Onboarding
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                This service uses the same billing, credits, and setup flow as the rest of your Purely services.
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={entitlementKey ? `${appBase}/billing?buy=${encodeURIComponent(entitlementKey)}&autostart=1` : `${appBase}/billing`}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Billing
                </Link>
                <Link
                  href={`${appBase}/services`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Back to services
                </Link>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                Need help getting this one live? Email{" "}
                <a className="font-semibold text-brand-ink hover:underline" href="mailto:support@purelyautomation.dev">
                  support@purelyautomation.dev
                </a>
                .
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Service details</div>
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs text-zinc-500">Status</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{serviceStatus?.label || (service.included ? "Included" : "Available")}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs text-zinc-500">Billing</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {modulePrice ? formatMonthly(modulePrice.monthlyCents, modulePrice.currency) : service.included ? "Included in plan" : "See Billing"}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs text-zinc-500">Credits</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">Usage-based actions draw from credits as needed.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
