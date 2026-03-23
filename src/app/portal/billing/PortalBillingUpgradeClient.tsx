"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ToastProvider";

type BundleId = "launch-kit" | "sales-loop" | "brand-builder";

function bundleTitle(id: BundleId) {
  if (id === "launch-kit") return "The Launch Kit";
  if (id === "sales-loop") return "The Sales Loop";
  return "The Brand Builder";
}

function bundleKicker(id: BundleId) {
  if (id === "brand-builder") return "Build a real brand";
  if (id === "sales-loop") return "Most popular";
  return "Get established fast";
}

function bundleLearnMoreHref(id: BundleId) {
  if (id === "brand-builder") return "/services/the-brand-builder";
  if (id === "sales-loop") return "/services/the-sales-loop";
  return "/services/the-launch-kit";
}

function bundleBlurb(id: BundleId) {
  if (id === "brand-builder") {
    return "Look established, stay visible, and build trust without posting every day.";
  }
  if (id === "sales-loop") {
    return "Make more money faster with less work. Respond faster, follow up automatically, and book more calls.";
  }
  return "Get out there fast with a clean funnel, a strong foundation, and a simple path to bookings.";
}

function bundleRecommended(id: BundleId) {
  if (id === "brand-builder") {
    return "Recommended for: service businesses that want consistent inbound and stronger credibility.";
  }
  if (id === "sales-loop") {
    return "Recommended for: teams that want faster response, higher conversion, and less manual chasing.";
  }
  return "Recommended for: new offers, new markets, or businesses that want to look legit and start converting quickly.";
}

function bundleBullets(id: BundleId) {
  if (id === "brand-builder") {
    return [
      "• Automated blogs that keep you discoverable",
      "• Newsletter and reviews that build proof",
      "• Nurture campaigns that turn interest into booked calls",
    ];
  }
  if (id === "sales-loop") {
    return [
      "• Booking automation that removes friction",
      "• AI receptionist that answers and qualifies",
      "• Lead scraping that fills your pipeline",
      "• AI outbound that follows up consistently",
    ];
  }
  return [
    "• Funnel builder that makes your offer clear",
    "• Automation builder that keeps delivery consistent",
    "• AI receptionist that captures and books leads",
    "• Automated blogs that keep you visible",
  ];
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
          return (
            <div
              key={id}
              className={classNames(
                "group flex min-h-90 flex-col rounded-3xl p-6 transition hover:-translate-y-0.5",
                id === "sales-loop"
                  ? "relative border-2 border-[rgba(29,78,216,0.45)] bg-[rgba(29,78,216,0.05)] hover:border-[rgba(29,78,216,0.65)] hover:shadow-xl"
                  : "border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg",
              )}
            >
              {id === "sales-loop" ? (
                <div className="absolute right-5 top-5 inline-flex items-center rounded-full bg-[rgba(29,78,216,0.12)] px-3 py-1 text-xs font-semibold text-(--color-brand-blue)">
                  Most popular
                </div>
              ) : null}

              <div
                className={classNames(
                  "text-xs font-semibold uppercase tracking-wide",
                  id === "sales-loop" ? "text-[rgba(29,78,216,0.78)]" : "text-zinc-500",
                )}
              >
                {bundleKicker(id)}
              </div>
              <div className="mt-2 text-lg font-semibold text-brand-ink">{bundleTitle(id)}</div>
              <div className="mt-2 text-sm text-zinc-600">{bundleBlurb(id)}</div>
              <div className="mt-3 text-xs text-zinc-500">{bundleRecommended(id)}</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                {bundleBullets(id).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <Link
                href={bundleLearnMoreHref(id)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-(--color-brand-blue) hover:underline hover:decoration-[rgba(29,78,216,0.35)] hover:underline-offset-4"
              >
                Learn more <span aria-hidden="true">→</span>
              </Link>

              <div className="mt-auto pt-6">
                <button
                  type="button"
                  className={classNames(
                    "inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60",
                    id === "brand-builder"
                      ? "bg-(--color-brand-blue) text-white hover:-translate-y-px hover:opacity-95 hover:shadow-md focus-visible:ring-[rgba(29,78,216,0.45)]"
                      : id === "sales-loop"
                        ? "border border-[rgba(51,65,85,0.55)] bg-white text-brand-ink hover:-translate-y-px hover:border-[rgba(51,65,85,0.85)] hover:bg-[rgba(51,65,85,0.04)] hover:shadow-md focus-visible:ring-[rgba(29,78,216,0.55)]"
                        : "bg-(--color-brand-pink) text-white hover:-translate-y-px hover:opacity-95 hover:shadow-md focus-visible:ring-[rgba(251,113,133,0.40)]",
                  )}
                  onClick={() => void startCheckout(id)}
                  disabled={busy !== null}
                >
                  {busy === id ? "Opening checkout…" : "Get Started"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
