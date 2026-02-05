"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PortalServicePageClient({ slug }: { slug: string }) {
  const service = useMemo(
    () => PORTAL_SERVICES.find((s) => s.slug === slug) ?? null,
    [slug],
  );

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/customer/me", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }
      setMe((await res.json()) as Me);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const isFullDemo = (me?.user.email ?? "").toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const unlocked =
    isFullDemo ||
    (service?.entitlementKey ? Boolean(me?.entitlements?.[service.entitlementKey]) : false);

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
    // Placeholder pricing model: some flat-rate, some usage/credits.
    const flatRate = 299;
    const creditsIncluded = 25000;

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
              <div className="text-sm font-semibold text-zinc-900">Flat-rate</div>
              <div className="mt-2 text-3xl font-bold text-brand-ink">{formatMoney(flatRate)}</div>
              <div className="text-xs text-zinc-500">/ month</div>
              <div className="mt-3 text-sm text-zinc-700">Best when you want predictable billing.</div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="text-sm font-semibold text-zinc-900">Usage-based</div>
              <div className="mt-2 text-3xl font-bold text-brand-ink">Credits</div>
              <div className="text-xs text-zinc-500">Monthly included: {creditsIncluded.toLocaleString()}</div>
              <div className="mt-3 text-sm text-zinc-700">
                For higher volume, add more credits.
              </div>
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
          <div className="mt-2 text-sm text-zinc-600">
            This area will hold your settings, history, and results.
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Coming next: service setup and controls.
          </div>
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
