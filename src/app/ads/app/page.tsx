"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CampaignRow = {
  id: string;
  name: string;
  enabled: boolean;
  placement: string;
  startAt: string | null;
  endAt: string | null;
  targetJson: any;
  creativeJson: any;
  createdAt: string;
  updatedAt: string;
};

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdsAppHomePage() {
  const [me, setMe] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topupUsd, setTopupUsd] = useState("50");
  const [topupBusy, setTopupBusy] = useState(false);

  const balanceCents = Number(me?.account?.balanceCents || 0);

  const activeCount = useMemo(() => (campaigns || []).filter((c) => c.enabled).length, [campaigns]);

  async function load() {
    setError(null);
    const [meRes, campaignsRes] = await Promise.all([
      fetch("/ads/api/me").then((r) => r.json()).catch(() => null),
      fetch("/ads/api/campaigns").then((r) => r.json()).catch(() => null),
    ]);

    if (!meRes?.ok) {
      setError("Failed to load account");
      return;
    }
    setMe(meRes);

    if (!campaignsRes?.ok) {
      setError("Failed to load campaigns");
      return;
    }
    setCampaigns(campaignsRes.campaigns || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function doTopup() {
    const amountUsd = Number(topupUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;

    setTopupBusy(true);
    try {
      const amountCents = Math.round(amountUsd * 100);
      const res = await fetch("/ads/api/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Top up failed"));
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Top up failed"));
    } finally {
      setTopupBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Balance</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{usd(balanceCents)}</div>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={topupUsd}
              onChange={(e) => setTopupUsd(e.target.value)}
              inputMode="decimal"
              className="w-24 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              aria-label="Top up amount"
            />
            <button
              onClick={doTopup}
              disabled={topupBusy}
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {topupBusy ? "Adding…" : "Add funds"}
            </button>
          </div>
          <div className="mt-2 text-xs text-zinc-500">Manual top-up (dev placeholder).</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Campaigns</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{campaigns ? campaigns.length : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">{campaigns ? `${activeCount} enabled` : "Loading…"}</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Create</div>
          <div className="mt-2 text-sm text-zinc-600">Launch a new ad campaign.</div>
          <Link
            href="/ads/app/campaigns/new"
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            New campaign
          </Link>
        </div>
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}

      <div className="rounded-3xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="text-sm font-semibold text-zinc-900">Your campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">Campaigns you created in Ads Manager.</div>
        </div>

        <div className="divide-y divide-zinc-100">
          {(campaigns || []).map((c) => {
            const billing = c?.targetJson?.billing;
            const dailyBudgetCents = Number(billing?.dailyBudgetCents || 0);
            const costPerClickCents = Number(billing?.costPerClickCents || 0);

            return (
              <div key={c.id} className="px-6 py-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{c.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {c.placement} · {c.enabled ? "Enabled" : "Paused"}
                      {dailyBudgetCents ? ` · ${usd(dailyBudgetCents)}/day` : ""}
                      {costPerClickCents ? ` · ${usd(costPerClickCents)}/click` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">Updated {new Date(c.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            );
          })}

          {campaigns && campaigns.length === 0 ? (
            <div className="px-6 py-10 text-sm text-zinc-600">No campaigns yet.</div>
          ) : null}

          {!campaigns ? <div className="px-6 py-10 text-sm text-zinc-600">Loading…</div> : null}
        </div>
      </div>
    </div>
  );
}
