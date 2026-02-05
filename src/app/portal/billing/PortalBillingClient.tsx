"use client";

import { useEffect, useState } from "react";

type BillingStatus = { configured: boolean };

export function PortalBillingClient() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Unable to load billing status");
        setLoading(false);
        return;
      }
      setStatus((await res.json()) as BillingStatus);
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
      body: JSON.stringify({ returnPath: "/portal/billing" }),
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
    <div className="rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Billing portal</div>
          <div className="mt-1 text-sm text-zinc-600">
            {status?.configured
              ? "Update your plan, invoices, and payment method."
              : "Stripe is not configured."}
          </div>
        </div>
        <button
          className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          onClick={manage}
          disabled={!status?.configured}
        >
          Manage
        </button>
      </div>
    </div>
  );
}
