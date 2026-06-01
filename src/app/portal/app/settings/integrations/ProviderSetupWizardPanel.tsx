"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { ProviderSetupStatus, ProviderSetupWizardPayload } from "@/lib/providerSetupWizard";

type ProviderSetupResponse =
  | { ok: true; providerSetup: ProviderSetupWizardPayload }
  | { ok: false; error?: string };

function statusLabel(status: ProviderSetupStatus) {
  switch (status) {
    case "not_started":
      return "Not started";
    case "needs_setup":
      return "Needs setup";
    case "connected":
      return "Connected";
    case "test_ready":
      return "Test ready";
    case "live_ready":
      return "Live ready";
    case "blocked":
      return "Blocked";
    case "coming_soon":
      return "Coming soon";
  }
}

function statusBadgeClasses(status: ProviderSetupStatus) {
  switch (status) {
    case "live_ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "test_ready":
    case "connected":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "coming_soon":
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function primaryActionLabel(status: ProviderSetupStatus) {
  switch (status) {
    case "live_ready":
    case "test_ready":
    case "connected":
      return "Review setup";
    case "blocked":
      return "Resolve setup";
    case "coming_soon":
      return "Review posture";
    default:
      return "Set up";
  }
}

export function ProviderSetupWizardPanel() {
  const searchParams = useSearchParams();
  const focusedKey = (searchParams?.get("setup") || "").trim();
  const fallbackBase = typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "/credit" : "/portal";
  const [payload, setPayload] = useState<ProviderSetupWizardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/portal/provider-setup", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ProviderSetupResponse | null;
        if (!res.ok || !json || json.ok !== true) {
          throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Unable to load provider setup.");
        }
        if (!cancelled) setPayload(json.providerSetup);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load provider setup.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = useMemo(() => payload?.items.filter((item) => item.key !== "meta") ?? [], [payload]);

  const visibleSummary = useMemo(() => {
    return visibleItems.reduce(
      (summary, item) => {
        summary.totalCount += 1;
        if (item.status !== "coming_soon") summary.actionableCount += 1;
        if (item.status === "live_ready") summary.liveReadyCount += 1;
        if (item.status === "test_ready") summary.testReadyCount += 1;
        if (item.status === "blocked") summary.blockedCount += 1;
        if (item.status === "live_ready" || item.status === "test_ready" || item.status === "connected") {
          summary.configuredCount += 1;
        }
        return summary;
      },
      {
        configuredCount: 0,
        actionableCount: 0,
        totalCount: 0,
        liveReadyCount: 0,
        testReadyCount: 0,
        blockedCount: 0,
      },
    );
  }, [visibleItems]);

  const progress = useMemo(() => {
    if (visibleSummary.actionableCount <= 0) return 0;
    return Math.round((visibleSummary.configuredCount / visibleSummary.actionableCount) * 100);
  }, [visibleSummary]);

  return (
    <section id="provider-setup-wizard" className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-blue">Provider setup wizard</div>
          <h2 className="mt-2 text-2xl font-semibold text-brand-ink">See what Purely can actually run</h2>
          <p className="mt-2 text-sm text-zinc-600">
            This page keeps provider setup honest: what is missing, what it unlocks, whether it is only test-ready or truly live-ready, and the next safe place to configure it.
          </p>
        </div>
        {payload ? (
          <div className="min-w-72 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Overall progress</div>
            <div className="mt-2 text-3xl font-semibold text-brand-ink">{progress}%</div>
            <div className="mt-1 text-sm text-zinc-600">
              {visibleSummary.configuredCount} of {visibleSummary.actionableCount || visibleSummary.totalCount} actionable providers are configured well enough to use.
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full rounded-full bg-linear-to-r from-sky-500 to-emerald-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Live ready: {visibleSummary.liveReadyCount} • Test ready: {visibleSummary.testReadyCount} • Blocked: {visibleSummary.blockedCount}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
          <div className="font-semibold text-zinc-900">Checking provider readiness…</div>
          <div className="mt-1">Purely is verifying which providers are connected, which ones are only safe for testing, and which workflows still stay manual for now.</div>
        </div>
      ) : error || !payload ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
          <div className="font-semibold">Provider readiness could not be checked right now.</div>
          <div className="mt-1">The detailed readiness check failed, so this page is falling back to the existing settings and service controls. Nothing is being guessed or faked here.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`${fallbackBase}/app/services`} className="inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Open services
            </Link>
            <Link href={`${fallbackBase}/app/settings/integrations#provider-setup-controls`} className="inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Open existing integration controls
            </Link>
          </div>
          {error ? <div className="mt-3 text-xs text-amber-800">{error}</div> : null}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleItems.map((item) => {
            const focused = focusedKey === item.key;
            return (
              <article
                key={item.key}
                id={`provider-setup-${item.key}`}
                className={[
                  "rounded-3xl border bg-zinc-50 p-5 transition",
                  focused ? "border-brand-blue ring-2 ring-[rgba(29,78,216,0.14)]" : "border-zinc-200",
                ].join(" ")}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{item.category}</div>
                    <h3 className="mt-1 text-lg font-semibold text-brand-ink">{item.displayName}</h3>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClasses(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>

                <div className="mt-4 text-sm text-zinc-700">{item.reason}</div>
                <div className="mt-3 rounded-2xl border border-white bg-white px-4 py-3 text-sm text-zinc-700">
                  <span className="font-semibold text-zinc-900">Unlocks:</span> {item.businessOutcome}
                </div>
                {item.connectedLabel ? (
                  <div className="mt-3 text-xs font-semibold text-zinc-500">Connected detail: {item.connectedLabel}</div>
                ) : null}
                {item.liveActionWarning ? (
                  <div className="mt-3 text-xs text-zinc-500">Live-use note: {item.liveActionWarning}</div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={item.setupHref} className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95">
                    {primaryActionLabel(item.status)}
                  </Link>
                  {item.testActionHref && item.testActionLabel ? (
                    <Link href={item.testActionHref} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100">
                      {item.testActionLabel}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}