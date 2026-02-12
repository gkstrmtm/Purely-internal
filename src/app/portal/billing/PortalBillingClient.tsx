"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { CREDIT_USD_VALUE, formatUsd } from "@/lib/pricing.shared";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type BillingStatus = { configured: boolean };

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
  billing: { configured: boolean };
};

type BillingSummary =
  | { ok: true; configured: false }
  | {
      ok: true;
      configured: true;
      monthlyCents: number;
      currency: string;
      subscription?: {
        id: string;
        status: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: number | null;
      };
    }
  | { ok: false; configured: boolean; error?: string; details?: string };

type ServicesStatusResponse =
  | { ok: true; statuses: Record<string, { state: "active" | "needs_setup" | "locked" | "coming_soon"; label: string }> }
  | { ok: false; error?: string };

function formatMoney(cents: number, currency: string) {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const curr = (currency || "usd").toUpperCase();
  const amount = (value / 100).toFixed(2);
  return `${curr} ${amount}`;
}

export function PortalBillingClient() {
  const toast = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [purchaseAvailable, setPurchaseAvailable] = useState(false);
  const [creditsPerPackage, setCreditsPerPackage] = useState<number | null>(null);
  const [packages, setPackages] = useState(1);
  const [services, setServices] = useState<ServicesStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [billingRes, meRes, summaryRes, creditsRes, servicesRes] = await Promise.all([
        fetch("/api/billing/status", { cache: "no-store" }),
        fetch("/api/customer/me", { cache: "no-store", headers: { "x-pa-app": "portal" } }),
        fetch("/api/portal/billing/summary", { cache: "no-store" }),
        fetch("/api/portal/credits", { cache: "no-store" }),
        fetch("/api/portal/services/status", { cache: "no-store" }),
      ]);
      if (!mounted) return;
      if (!billingRes.ok) {
        const body = await billingRes.json().catch(() => ({}));
        setError(body?.error ?? "Unable to load billing");
        setLoading(false);
        return;
      }

      setStatus((await billingRes.json()) as BillingStatus);
      if (meRes.ok) {
        setMe((await meRes.json()) as Me);
      }

      if (summaryRes.ok) {
        setSummary((await summaryRes.json().catch(() => null)) as BillingSummary | null);
      } else {
        setSummary(null);
      }

      if (creditsRes.ok) {
        const c = (await creditsRes.json().catch(() => ({}))) as {
          credits?: number;
          autoTopUp?: boolean;
          purchaseAvailable?: boolean;
          creditsPerPackage?: number;
        };
        setCredits(typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : 0);
        setAutoTopUp(Boolean(c.autoTopUp));
        setPurchaseAvailable(Boolean(c.purchaseAvailable));
        setCreditsPerPackage(
          typeof c.creditsPerPackage === "number" && Number.isFinite(c.creditsPerPackage) ? c.creditsPerPackage : null,
        );
      } else {
        setCredits(0);
        setAutoTopUp(false);
        setPurchaseAvailable(false);
        setCreditsPerPackage(null);
      }

      if (servicesRes.ok) {
        setServices((await servicesRes.json().catch(() => null)) as ServicesStatusResponse | null);
      } else {
        setServices(null);
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function purchaseModule(module: "blog" | "booking" | "crm") {
    setError(null);
    setActionBusy(`module:${module}`);
    const res = await fetch("/api/billing/checkout-module", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        module,
        successPath: "/portal/app/billing?checkout=success",
        cancelPath: "/portal/app/billing?checkout=cancel",
      }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setError(body?.error ?? "Unable to start checkout");
      return;
    }
    if (body?.url && typeof body.url === "string") {
      window.location.href = body.url;
      return;
    }
    setError("Unable to start checkout");
  }

  async function manage() {
    setError(null);
    setActionBusy("manage");
    const res = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: "/portal/app/billing" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to open billing portal");
      setActionBusy(null);
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
  }

  async function refreshSummary() {
    const res = await fetch("/api/portal/billing/summary", { cache: "no-store" });
    if (!res.ok) {
      setSummary(null);
      return;
    }
    setSummary((await res.json().catch(() => null)) as BillingSummary | null);
  }

  async function refreshCredits() {
    const res = await fetch("/api/portal/credits", { cache: "no-store" });
    if (!res.ok) return;
    const c = (await res.json().catch(() => ({}))) as {
      credits?: number;
      autoTopUp?: boolean;
      purchaseAvailable?: boolean;
      creditsPerPackage?: number;
    };
    setCredits(typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : 0);
    setAutoTopUp(Boolean(c.autoTopUp));
    setPurchaseAvailable(Boolean(c.purchaseAvailable));
    setCreditsPerPackage(
      typeof c.creditsPerPackage === "number" && Number.isFinite(c.creditsPerPackage) ? c.creditsPerPackage : null,
    );
  }

  async function saveAutoTopUp(next: boolean) {
    setError(null);
    setActionBusy("auto-topup");
    const res = await fetch("/api/portal/credits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoTopUp: next }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setError(body?.error ?? "Unable to update auto top-up");
      return;
    }
    setAutoTopUp(Boolean(body?.autoTopUp));
    setCredits(typeof body?.credits === "number" ? body.credits : credits);
  }

  async function topUp() {
    setError(null);
    setActionBusy("topup");
    const res = await fetch("/api/portal/credits/topup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packages }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);

    if (!res.ok) {
      setError(body?.error ?? "Unable to purchase credits");
      return;
    }

    if (body?.url && typeof body.url === "string") {
      window.location.href = body.url;
      return;
    }

    // Dev/test fallback credits add.
    await refreshCredits();
  }

  async function cancelSubscription(immediate: boolean) {
    setError(null);
    setActionBusy(immediate ? "cancel-now" : "cancel");
    const res = await fetch("/api/portal/billing/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ immediate }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Unable to cancel subscription");
      setActionBusy(null);
      return;
    }

    await refreshSummary();
    setActionBusy(null);
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        Something went wrong loading billing. Please refresh.
      </div>
    );
  }

  const monthlyText =
    summary && summary.configured && "monthlyCents" in summary && "currency" in summary
      ? formatMoney(summary.monthlyCents, summary.currency)
      : "—";

  const sub = summary && "ok" in summary && summary.ok === true && summary.configured ? summary.subscription : undefined;
  const hasActiveSub = Boolean(sub?.id && ["active", "trialing", "past_due"].includes(String(sub.status)));

  const monthlyNote = !status?.configured
    ? "Billing isn’t configured on this environment yet."
    : summary && "ok" in summary && summary.ok === false
      ? summary.error ?? "Unable to load summary"
      : Boolean(sub?.id && ["active", "trialing", "past_due"].includes(String(sub.status)))
        ? "Your subscription is active."
        : "No active subscription.";
  const periodEndText =
    sub?.currentPeriodEnd && typeof sub.currentPeriodEnd === "number"
      ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString()
      : null;

  const creditsTotal = creditsPerPackage ? packages * creditsPerPackage : null;
  const creditsTotalUsd = creditsTotal ? creditsTotal * CREDIT_USD_VALUE : null;

  const serviceStatuses = services && "ok" in services && services.ok ? services.statuses : null;

  const badgeClass = (state: string) => {
    if (state === "active") return "bg-emerald-100 text-emerald-900";
    if (state === "needs_setup") return "bg-amber-100 text-amber-900";
    if (state === "locked") return "bg-zinc-100 text-zinc-700";
    return "bg-zinc-100 text-zinc-700";
  };

  const statusDotClass = hasActiveSub ? "bg-emerald-500" : "bg-zinc-300";

  const packagePresets = (() => {
    const base = creditsPerPackage ?? 25;
    const options = [10, 20, 40];
    return options
      .map((p) => ({ packages: p, credits: p * base }))
      .filter((x) => x.packages >= 1 && x.packages <= 20);
  })();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Billing</div>
            <div className="mt-1 text-sm text-zinc-600">
              Update payment method, view invoices, and manage your subscription.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              onClick={manage}
              disabled={!status?.configured || actionBusy === "manage"}
            >
              {actionBusy === "manage" ? "Opening…" : "Manage billing"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Monthly payment</div>
            <div className="mt-1 text-lg font-bold text-brand-ink">{monthlyText}</div>
            <div className="mt-1 text-xs text-zinc-500">{monthlyNote}</div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Subscription status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
              <div className="text-sm font-semibold text-brand-ink">
                {hasActiveSub ? "Active" : "Not active"}
              </div>
              {sub?.cancelAtPeriodEnd ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  Canceling
                </span>
              ) : null}
            </div>
            {periodEndText ? <div className="mt-1 text-xs text-zinc-500">Renews/ends: {periodEndText}</div> : null}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-sm font-semibold text-zinc-900">Subscription actions</div>
          <div className="mt-1 text-sm text-zinc-600">Cancel any time. Changes apply to your account owner.</div>

          {hasActiveSub ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={!status?.configured || Boolean(sub?.cancelAtPeriodEnd) || actionBusy !== null}
                onClick={() => cancelSubscription(false)}
              >
                {sub?.cancelAtPeriodEnd ? "Cancel scheduled" : "Cancel at period end"}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                disabled={!status?.configured || actionBusy !== null}
                onClick={() => {
                  const ok = window.confirm(
                    "Cancel immediately? This ends access right away. Click OK to confirm.",
                  );
                  if (!ok) return;
                  void cancelSubscription(true);
                }}
              >
                Cancel now
              </button>
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No active subscription to manage.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Credits</div>
            <div className="mt-1 text-sm text-zinc-600">Usage-based actions spend credits.</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500">Balance</div>
            <div className="mt-1 text-2xl font-bold text-brand-ink">{credits ?? "—"}</div>
          </div>
        </div>

        <div className="mt-2 text-xs text-zinc-500">1 credit = {formatUsd(CREDIT_USD_VALUE)}.</div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Auto top-up</div>
              <div className="mt-1 text-xs text-zinc-500">
                When enabled, we’ll automatically charge your saved card and add credits when you run out (no redirects).
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoTopUp}
              disabled={actionBusy !== null}
              onChange={(e) => void saveAutoTopUp(e.target.checked)}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold text-zinc-900">Buy credits</div>
          <div className="mt-1 text-xs text-zinc-500">
            Credits roll over. Choose an amount that lasts at least a few days.
          </div>

          {purchaseAvailable ? (
            <div className="mt-3 grid gap-2">
              <div className="flex flex-wrap gap-2">
                {packagePresets.map((p) => (
                  <button
                    key={p.packages}
                    type="button"
                    onClick={() => setPackages(p.packages)}
                    disabled={actionBusy !== null}
                    className={
                      "rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 " +
                      (packages === p.packages
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    {p.credits.toLocaleString()} credits
                  </button>
                ))}

                <select
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={packages}
                  onChange={(e) => setPackages(Number(e.target.value))}
                  disabled={actionBusy !== null}
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((pkg) => {
                    const c = creditsPerPackage ? pkg * creditsPerPackage : null;
                    return (
                      <option key={pkg} value={pkg}>
                        {pkg} package{pkg === 1 ? "" : "s"}{c ? ` (${c.toLocaleString()} credits)` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="text-xs text-zinc-500">
                {creditsTotal ? (
                  <>
                    Total: <span className="font-semibold text-zinc-700">{creditsTotal.toLocaleString()}</span> credits
                    {creditsTotalUsd ? (
                      <> • <span className="font-semibold text-zinc-700">{formatUsd(creditsTotalUsd)}</span></>
                    ) : null}
                  </>
                ) : (
                  ""
                )}
              </div>

              <button
                type="button"
                className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={actionBusy !== null}
                onClick={() => void topUp()}
              >
                {actionBusy === "topup" ? "Processing…" : "Buy credits"}
              </button>
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">Credit purchasing is unavailable right now.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
        <div className="text-sm font-semibold text-zinc-900">Add services</div>
        <div className="mt-2 text-sm text-zinc-600">Enable add-ons right here in the portal.</div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Automated Blogs</div>
            <div className="mt-1 text-xs text-zinc-500">Enable blogging automation.</div>
            <button
              type="button"
              className="mt-3 w-full rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={Boolean(me?.entitlements?.blog) || actionBusy !== null}
              onClick={() => void purchaseModule("blog")}
            >
              {me?.entitlements?.blog ? "Enabled" : actionBusy === "module:blog" ? "Opening…" : "Enable"}
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Booking Automation</div>
            <div className="mt-1 text-xs text-zinc-500">Enable booking and reminders.</div>
            <button
              type="button"
              className="mt-3 w-full rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={Boolean(me?.entitlements?.booking) || actionBusy !== null}
              onClick={() => void purchaseModule("booking")}
            >
              {me?.entitlements?.booking ? "Enabled" : actionBusy === "module:booking" ? "Opening…" : "Enable"}
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Follow-up Automation</div>
            <div className="mt-1 text-xs text-zinc-500">Enable CRM and follow-up automation.</div>
            <button
              type="button"
              className="mt-3 w-full rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={Boolean(me?.entitlements?.crm) || actionBusy !== null}
              onClick={() => void purchaseModule("crm")}
            >
              {me?.entitlements?.crm ? "Enabled" : actionBusy === "module:crm" ? "Opening…" : "Enable"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Services included</div>
        <div className="mt-2 text-sm text-zinc-600">Live status from your account.</div>

        <div className="mt-4 space-y-2 text-sm text-zinc-700">
          {PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => {
            const st = serviceStatuses?.[s.slug];
            const state = st?.state ?? "active";
            const label = st?.label ?? "Ready";
            return (
              <div key={s.slug} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{s.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass(state)}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-brand-ink/10 bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white p-4 text-sm text-zinc-800">
          <div className="font-semibold text-zinc-900">Want to add more?</div>
          <div className="mt-1 text-sm text-zinc-700">
            Enable add-ons above, or open a service to configure it.
          </div>
        </div>
      </div>
    </div>
  );
}
