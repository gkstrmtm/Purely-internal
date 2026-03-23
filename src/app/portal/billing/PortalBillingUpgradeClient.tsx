"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ToastProvider";
import {
  monthlyTotalUsd,
  oneTimeTotalUsd,
  planById,
  planQuantity,
} from "@/lib/portalOnboardingWizardCatalog";
import { formatUsd } from "@/lib/pricing.shared";

type BundleId = "launch-kit" | "sales-loop" | "brand-builder";

function bundleTitle(id: BundleId) {
  if (id === "launch-kit") return "The Launch Kit";
  if (id === "sales-loop") return "The Sales Loop";
  return "The Brand Builder";
}

function bundlePlanIds(id: BundleId): string[] {
  switch (id) {
    case "launch-kit":
      return ["core", "automations", "ai-receptionist", "blogs"];
    case "sales-loop":
      return ["core", "booking", "ai-receptionist", "lead-scraping-b2b", "ai-outbound"];
    case "brand-builder":
      return ["core", "blogs", "reviews", "newsletter", "nurture"];
    default:
      return ["core"];
  }
}

function describeBundle(id: BundleId) {
  if (id === "launch-kit") return "A fast start for new or rebuilding businesses.";
  if (id === "sales-loop") return "Appointments + outbound + lead generation focused.";
  return "Content + reviews + newsletter and nurture automation.";
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalBillingUpgradeClient({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [busy, setBusy] = useState<BundleId | null>(null);

  const fromMobileApp = useMemo(() => {
    if (searchParams?.get("pa_mobileapp") === "1") return true;
    if (typeof window === "undefined") return false;
    return String(window.location.hostname || "").toLowerCase().includes("purely-mobile");
  }, [searchParams]);

  const bundles: BundleId[] = ["launch-kit", "sales-loop", "brand-builder"];

  const pricingByBundle = useMemo(() => {
    const out: Record<string, { monthlyUsd: number; dueTodayUsd: number }> = {};
    for (const id of bundles) {
      const planIds = bundlePlanIds(id);
      const quantities: Record<string, number> = {};
      for (const pid of planIds) {
        const p = planById(pid);
        if (p?.quantityConfig) quantities[pid] = planQuantity(p, quantities);
      }
      const monthlyUsd = monthlyTotalUsd(planIds, quantities);
      const oneTimeUsd = oneTimeTotalUsd(planIds, quantities);
      out[id] = { monthlyUsd, dueTodayUsd: monthlyUsd + oneTimeUsd };
    }
    return out;
  }, [bundles]);

  async function startCheckout(bundleId: BundleId) {
    if (busy) return;
    setBusy(bundleId);

    const res = await fetch("/api/portal/billing/upgrade-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ bundleId }),
    }).catch(() => null);

    const json = res ? await res.json().catch(() => null) : null;
    setBusy(null);

    if (!res || !res.ok || !json?.ok || !json?.url) {
      const msg = json?.error || (!res ? "Unable to reach server" : "Unable to start checkout");
      toast.error(msg);
      return;
    }

    window.location.assign(String(json.url));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {embedded ? null : (
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            onClick={() => {
              const next = fromMobileApp
                ? "/portal/app/settings?tab=billing&pa_mobileapp=1"
                : "/portal/app/settings?tab=billing";
              router.push(next);
            }}
            disabled={busy !== null}
          >
            Back
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {bundles.map((id) => {
          const pricing = pricingByBundle[id];
          const monthly = pricing ? pricing.monthlyUsd : 0;
          const dueToday = pricing ? pricing.dueTodayUsd : 0;

          return (
            <div key={id} className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-lg font-bold text-brand-ink">{bundleTitle(id)}</div>
              <div className="mt-1 text-sm text-zinc-600">{describeBundle(id)}</div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs text-zinc-500">Monthly</div>
                  <div className="mt-1 text-lg font-bold text-brand-ink">
                    {monthly ? `${formatUsd(monthly, { maximumFractionDigits: 0 })}/mo` : "$0/mo"}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs text-zinc-500">Due today</div>
                  <div className="mt-1 text-lg font-bold text-brand-ink">
                    {dueToday ? formatUsd(dueToday, { maximumFractionDigits: 0 }) : "$0"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={classNames(
                  "mt-5 w-full rounded-2xl bg-(--color-brand-blue) px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60",
                )}
                onClick={() => void startCheckout(id)}
                disabled={busy !== null}
              >
                {busy === id ? "Opening checkout…" : "Choose this package"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-zinc-500">
        You&apos;ll be taken to a secure Stripe checkout. After payment, your billing mode switches to monthly.
      </div>
    </div>
  );
}
