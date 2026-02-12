"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean; leadOutbound: boolean };
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
};

type PortalPricing = {
  ok: true;
  stripeConfigured: boolean;
  credits: { usdValue: number; rollOver: boolean; topup: { creditsPerPackage: number } };
  modules: {
    blog: { monthlyCents: number; currency: string } | null;
    booking: { monthlyCents: number; currency: string } | null;
    crm: { monthlyCents: number; currency: string } | null;
    leadOutbound: { monthlyCents: number; currency: string } | null;
  };
};

function formatMonthly(cents: number, currency: string) {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const curr = (currency || "usd").toUpperCase();
  const amount = (value / 100).toFixed(2);
  return `${curr} ${amount}`;
}

export function PortalServicePageClient({ slug }: { slug: string }) {
  const service = useMemo(
    () => PORTAL_SERVICES.find((s) => s.slug === slug) ?? null,
    [slug],
  );

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<PortalPricing | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [res, pricingRes] = await Promise.all([
        fetch("/api/customer/me", {
          cache: "no-store",
          headers: { "x-pa-app": "portal" },
        }),
        fetch("/api/portal/pricing", { cache: "no-store" }).catch(() => null as any),
      ]);
      if (!mounted) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }
      setMe((await res.json()) as Me);
      if (pricingRes && pricingRes.ok) {
        const body = (await pricingRes.json().catch(() => null)) as PortalPricing | null;
        setPricing(body && (body as any).ok === true ? body : null);
      } else {
        setPricing(null);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const isFullDemo = (me?.user.email ?? "").toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const unlocked =
    isFullDemo ||
    Boolean(service?.included) ||
    (service?.entitlementKey ? Boolean(me?.entitlements?.[service.entitlementKey]) : false);

  const modulePrice =
    service?.entitlementKey && pricing?.modules
      ? (pricing.modules as any)[service.entitlementKey as any]
      : null;

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
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[color:rgba(251,113,133,0.14)] px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-pink)]">
            <span className="inline-flex"><span className="sr-only">Locked</span></span>
            Locked
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">
            Unlock {service.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-600">
            This service isn’t included in your current plan. You can add it any time.
          </p>

          {service.highlights?.length ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
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

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="text-sm font-semibold text-zinc-900">Monthly add-on</div>
              <div className="mt-2 text-3xl font-bold text-brand-ink">
                {modulePrice ? formatMonthly(modulePrice.monthlyCents, modulePrice.currency) : "See Billing"}
              </div>
              <div className="text-xs text-zinc-500">
                {modulePrice ? "/ month" : "Pricing depends on your active modules"}
              </div>
              <div className="mt-3 text-sm text-zinc-700">
                Turn this service on in Billing. You can add or remove modules any time.
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="text-sm font-semibold text-zinc-900">Usage credits</div>
              <div className="mt-2 text-3xl font-bold text-brand-ink">Credits</div>
              <div className="text-xs text-zinc-500">for usage-based actions</div>
              <div className="mt-3 text-sm text-zinc-700">Credits roll over. Top up any time in Billing.</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/billing"
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in billing
            </Link>
            <Link
              href="/portal/app/services"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Back to services
            </Link>
          </div>

          <div className="mt-6 text-sm text-zinc-600">
            Need help picking the right setup? Email{" "}
            <a className="font-semibold text-brand-ink hover:underline" href="mailto:support@purelyautomation.dev">
              support@purelyautomation.dev
            </a>
            .
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{service.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">{service.description}</p>
        </div>
        <Link
          href="/portal/app/services"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Overview</div>
          {slug === "blogs" ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                Manage drafts, export Markdown, and connect an optional custom domain.
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/portal/app/services/blogs"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Blogs
                </Link>
                <Link
                  href="/portal/app/onboarding"
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
                  href="/portal/app/services/booking"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Booking
                </Link>
                <Link
                  href="/portal/app/onboarding"
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
                  href="/portal/app/services/lead-scraping"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Lead Scraping
                </Link>
                <Link
                  href="/portal/app/billing"
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
                  href="/portal/app/services/reporting"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Reporting
                </Link>
                <Link
                  href="/portal/app/billing"
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
                  href="/portal/app/services/inbox"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open Inbox
                </Link>
                <Link
                  href="/portal/app/onboarding"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Onboarding
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                We’re rolling out service-specific setup screens.
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/portal/app/onboarding"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Complete onboarding
                </Link>
                <Link
                  href="/portal/app/billing"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Billing
                </Link>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                Need this service live faster? Email{" "}
                <a className="font-semibold text-brand-ink hover:underline" href="mailto:support@purelyautomation.dev">
                  support@purelyautomation.dev
                </a>
                .
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Quick stats</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs text-zinc-500">Hours saved (week)</div>
              <div className="mt-1 text-lg font-bold text-brand-ink">
                {me?.metrics?.hoursSavedThisWeek ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs text-zinc-500">Hours saved (all time)</div>
              <div className="mt-1 text-lg font-bold text-brand-ink">
                {me?.metrics?.hoursSavedAllTime ?? 0}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
