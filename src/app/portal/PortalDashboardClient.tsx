"use client";

import { useEffect, useMemo, useState } from "react";

type ModuleKey = "blog" | "booking" | "crm";

type MeResponse = {
  user: { email: string; name: string; role: string };
  entitlements: Record<ModuleKey, boolean>;
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
  billing: { configured: boolean };
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-3 text-sm text-zinc-700">{children}</div>
    </div>
  );
}

export function PortalDashboardClient() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/customer/me", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Unable to load portal");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as MeResponse;
      setData(json);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const modules = useMemo(
    () =>
      [
        { key: "blog" as const, name: "Blog Automation" },
        { key: "booking" as const, name: "Booking Automation" },
        { key: "crm" as const, name: "CRM / Follow-up" },
      ].map((m) => ({ ...m, enabled: !!data?.entitlements?.[m.key] })),
    [data],
  );

  async function manageBilling() {
    setError(null);
    const res = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: "/portal" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to open billing portal");
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
  }

  async function upgrade(module: ModuleKey) {
    setError(null);
    const res = await fetch("/api/billing/checkout-module", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module, successPath: "/portal", cancelPath: "/portal" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to start checkout");
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

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card title="Hours saved">
        <div className="text-2xl font-bold text-brand-ink">
          {Math.round(data.metrics.hoursSavedThisWeek)}h
        </div>
        <div className="mt-1 text-xs text-zinc-500">This week</div>
        <div className="mt-3 text-sm text-zinc-700">
          All-time:{" "}
          <span className="font-semibold">{Math.round(data.metrics.hoursSavedAllTime)}h</span>
        </div>
      </Card>

      <Card title="Billing">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-zinc-700">
            {data.billing.configured
              ? "Manage your plan and payment method."
              : "Billing is not configured yet."}
          </div>
          <button
            className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            onClick={manageBilling}
            disabled={!data.billing.configured}
          >
            Manage
          </button>
        </div>
      </Card>

      <div className="sm:col-span-2">
        <Card title="Your modules">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m.key}
                className={
                  "rounded-2xl border p-4 " +
                  (m.enabled
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-zinc-200 bg-zinc-50")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {m.enabled ? "Included in your plan" : "Not enabled"}
                    </div>
                  </div>
                  {!m.enabled ? (
                    <button
                      className="shrink-0 rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => upgrade(m.key)}
                      disabled={!data.billing.configured}
                    >
                      Upgrade
                    </button>
                  ) : null}
                </div>

                {!m.enabled ? (
                  <div className="mt-3 text-xs text-zinc-600">
                    {data.billing.configured
                      ? "Upgrade to unlock this module."
                      : "Billing is not configured yet."}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
            Next: wire each enabled module to its setup + automation controls.
          </div>
        </Card>
      </div>
    </div>
  );
}
