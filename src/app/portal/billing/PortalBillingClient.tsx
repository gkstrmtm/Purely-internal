"use client";

import { useEffect, useState } from "react";

type BillingStatus = { configured: boolean };

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
  billing: { configured: boolean };
};

export function PortalBillingClient() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [billingRes, meRes] = await Promise.all([
        fetch("/api/billing/status", { cache: "no-store" }),
        fetch("/api/customer/me", { cache: "no-store" }),
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
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function manage() {
    setError(null);
    const res = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: "/portal/app/billing" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to open billing portal");
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
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
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Payment</div>
            <div className="mt-1 text-sm text-zinc-600">
              Change payment info, view invoices, and manage your subscription.
            </div>
          </div>
          <button
            className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            onClick={manage}
            disabled={!status?.configured}
          >
            Change payment info
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Monthly payment</div>
            <div className="mt-1 text-lg font-bold text-brand-ink">—</div>
            <div className="mt-1 text-xs text-zinc-500">Shown after billing is connected.</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Credits</div>
            <div className="mt-1 text-lg font-bold text-brand-ink">—</div>
            <div className="mt-1 text-xs text-zinc-500">Usage-based services will show here.</div>
          </div>
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
