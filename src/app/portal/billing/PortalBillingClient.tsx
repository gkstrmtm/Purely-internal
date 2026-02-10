"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";

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
  const [packages, setPackages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [billingRes, meRes, summaryRes, creditsRes] = await Promise.all([
        fetch("/api/billing/status", { cache: "no-store" }),
        fetch("/api/customer/me", { cache: "no-store", headers: { "x-pa-app": "portal" } }),
        fetch("/api/portal/billing/summary", { cache: "no-store" }),
        fetch("/api/portal/credits", { cache: "no-store" }),
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
        };
        setCredits(typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : 0);
        setAutoTopUp(Boolean(c.autoTopUp));
        setPurchaseAvailable(Boolean(c.purchaseAvailable));
      } else {
        setCredits(0);
        setAutoTopUp(false);
        setPurchaseAvailable(false);
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
    };
    setCredits(typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : 0);
    setAutoTopUp(Boolean(c.autoTopUp));
    setPurchaseAvailable(Boolean(c.purchaseAvailable));
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

  const monthlyNote = !status?.configured
    ? "Stripe isn’t configured on this environment yet."
    : summary && "ok" in summary && summary.ok === false
      ? summary.error ?? "Unable to load summary"
      : "Shown once billing is connected.";

  const sub = summary && "ok" in summary && summary.ok === true && summary.configured ? summary.subscription : undefined;
  const hasActiveSub = Boolean(sub?.id && ["active", "trialing", "past_due"].includes(String(sub.status)));
  const periodEndText =
    sub?.currentPeriodEnd && typeof sub.currentPeriodEnd === "number"
      ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString()
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Payment</div>
            <div className="mt-1 text-sm text-zinc-600">
              Manage your subscription right here. Card updates and invoices use Stripe’s secure hosted flow.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              onClick={manage}
              disabled={!status?.configured || actionBusy === "manage"}
            >
              {actionBusy === "manage" ? "Opening…" : "Update card / invoices"}
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
            <div className="text-xs text-zinc-500">Credits</div>
            <div className="mt-1 text-lg font-bold text-brand-ink">{credits ?? "—"}</div>
            <div className="mt-1 text-xs text-zinc-500">Used by AI and other usage-based actions.</div>

            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-700">Auto top-up</span>
                <input
                  type="checkbox"
                  checked={autoTopUp}
                  disabled={actionBusy !== null}
                  onChange={(e) => void saveAutoTopUp(e.target.checked)}
                />
              </label>
              <div className="text-xs text-zinc-500">If enabled, we’ll send you to top up when you run out.</div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-auto"
                  value={packages}
                  onChange={(e) => setPackages(Number(e.target.value))}
                  disabled={actionBusy !== null || !purchaseAvailable}
                >
                  <option value={1}>1 package</option>
                  <option value={2}>2 packages</option>
                  <option value={4}>4 packages</option>
                </select>
                <button
                  type="button"
                  className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={actionBusy !== null || !purchaseAvailable}
                  onClick={() => void topUp()}
                >
                  {actionBusy === "topup" ? "Processing…" : "Buy credits"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-sm font-semibold text-zinc-900">Subscription</div>
          <div className="mt-1 text-sm text-zinc-600">
            {hasActiveSub ? (
              <>
                Status: <span className="font-medium text-zinc-800">{String(sub?.status)}</span>
                {sub?.cancelAtPeriodEnd ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    Canceling
                  </span>
                ) : null}
                {periodEndText ? <div className="mt-1 text-xs text-zinc-500">Renews/ends: {periodEndText}</div> : null}
              </>
            ) : (
              "No active subscription."
            )}
          </div>

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
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Services included</div>
        <div className="mt-2 text-sm text-zinc-600">Based on your active plan.</div>

        <div className="mt-4 space-y-2 text-sm text-zinc-700">
          <div className="flex items-center justify-between">
            <span>Automated Blogs</span>
            <span className="text-xs font-semibold text-zinc-500">
              {me?.entitlements?.blog ? "Active" : "Locked"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Booking Automation</span>
            <span className="text-xs font-semibold text-zinc-500">
              {me?.entitlements?.booking ? "Active" : "Locked"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Follow-up Automation</span>
            <span className="text-xs font-semibold text-zinc-500">
              {me?.entitlements?.crm ? "Active" : "Locked"}
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          Want to add more services? Open any locked service to see options.
        </div>
      </div>
    </div>
  );
}
