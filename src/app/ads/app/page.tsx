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

type AdsStats = {
  account: {
    balanceCents: number;
    currency: string;
    autoTopUpEnabled: boolean;
    autoTopUpThresholdCents: number;
    autoTopUpAmountCents: number;
  };
  campaigns: { total: number; enabled: number };
  spend: { todayCents: number; last7dCents: number };
  topups: { last30dCents: number };
  clicks: { chargedToday: number; chargedLast7d: number };
};

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdsAppHomePage() {
  const [me, setMe] = useState<any>(null);
  const [stats, setStats] = useState<AdsStats | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topupUsd, setTopupUsd] = useState("50");
  const [topupBusy, setTopupBusy] = useState(false);

  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoThresholdUsd, setAutoThresholdUsd] = useState("20");
  const [autoAmountUsd, setAutoAmountUsd] = useState("50");
  const [autoBusy, setAutoBusy] = useState(false);

  const balanceCents = Number(me?.account?.balanceCents || 0);

  const activeCount = useMemo(() => (campaigns || []).filter((c) => c.enabled).length, [campaigns]);

  async function load() {
    setError(null);
    const [meRes, statsRes, campaignsRes] = await Promise.all([
      fetch("/ads/api/me").then((r) => r.json()).catch(() => null),
      fetch("/ads/api/stats", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/ads/api/campaigns").then((r) => r.json()).catch(() => null),
    ]);

    if (!meRes?.ok) {
      setError("Failed to load account");
      return;
    }
    setMe(meRes);

    if (statsRes?.ok) {
      setStats(statsRes as AdsStats);
      const a = (statsRes as AdsStats).account;
      setAutoEnabled(Boolean(a?.autoTopUpEnabled));
      setAutoThresholdUsd(String(Math.round(Number(a?.autoTopUpThresholdCents || 0) / 100)));
      setAutoAmountUsd(String(Math.round(Number(a?.autoTopUpAmountCents || 0) / 100)));
    } else {
      setStats(null);
    }

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

  async function setCampaignEnabled(campaignId: string, enabled: boolean) {
    setToggleBusyId(campaignId);
    setError(null);
    try {
      const res = await fetch(`/ads/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Update failed"));
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Update failed"));
    } finally {
      setToggleBusyId(null);
    }
  }

  async function saveAutoTopUp(next: {
    enabled: boolean;
    thresholdUsd: string;
    amountUsd: string;
  }) {
    const thresholdUsdNum = Number(next.thresholdUsd);
    const amountUsdNum = Number(next.amountUsd);

    if (!Number.isFinite(thresholdUsdNum) || thresholdUsdNum < 0) {
      setError("Invalid auto top-up threshold");
      return;
    }
    if (!Number.isFinite(amountUsdNum) || amountUsdNum <= 0) {
      setError("Invalid auto top-up amount");
      return;
    }

    setAutoBusy(true);
    setError(null);
    try {
      const res = await fetch("/ads/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          autoTopUpEnabled: next.enabled,
          autoTopUpThresholdCents: Math.round(thresholdUsdNum * 100),
          autoTopUpAmountCents: Math.round(amountUsdNum * 100),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Save failed"));
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Save failed"));
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
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
          <div className="mt-2 text-xs text-zinc-500">Manual top-up.</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Spend</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{stats ? usd(stats.spend.last7dCents) : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">{stats ? `${usd(stats.spend.todayCents)} today` : "Loading…"}</div>
          <div className="mt-3 text-xs text-zinc-500">
            {stats ? `${stats.clicks.chargedLast7d.toLocaleString()} charged clicks (7d)` : ""}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Campaigns</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{stats ? stats.campaigns.total : campaigns ? campaigns.length : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">
            {stats ? `${stats.campaigns.enabled} enabled` : campaigns ? `${activeCount} enabled` : "Loading…"}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Auto top-up</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">Auto-reload</div>
            <button
              onClick={() => {
                const next = !autoEnabled;
                setAutoEnabled(next);
                void saveAutoTopUp({ enabled: next, thresholdUsd: autoThresholdUsd, amountUsd: autoAmountUsd });
              }}
              disabled={autoBusy}
              className={
                "rounded-2xl px-3 py-2 text-sm font-semibold disabled:opacity-60 " +
                (autoEnabled ? "bg-brand-ink text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              {autoBusy ? "Saving…" : autoEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Threshold ($)</div>
              <input
                value={autoThresholdUsd}
                onChange={(e) => setAutoThresholdUsd(e.target.value)}
                inputMode="decimal"
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </label>
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Reload ($)</div>
              <input
                value={autoAmountUsd}
                onChange={(e) => setAutoAmountUsd(e.target.value)}
                inputMode="decimal"
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </label>
          </div>
          <button
            onClick={() => void saveAutoTopUp({ enabled: autoEnabled, thresholdUsd: autoThresholdUsd, amountUsd: autoAmountUsd })}
            disabled={autoBusy}
            className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {autoBusy ? "Saving…" : "Save auto top-up"}
          </button>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-lg font-bold text-zinc-900">Campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">Create, pause, and monitor your portal campaigns.</div>
        </div>
        <Link
          href="/ads/app/campaigns/new"
          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
        >
          New campaign
        </Link>
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}

      <div className="rounded-3xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="text-sm font-semibold text-zinc-900">Your campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">Budgets and CPC billing are enforced automatically.</div>
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
                    <Link href={`/ads/app/campaigns/${c.id}`} className="text-sm font-semibold text-zinc-900 hover:underline">
                      {c.name}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500">
                      {c.placement} · {c.enabled ? "Enabled" : "Paused"}
                      {dailyBudgetCents ? ` · ${usd(dailyBudgetCents)}/day` : ""}
                      {costPerClickCents ? ` · ${usd(costPerClickCents)}/click` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/ads/app/campaigns/${c.id}`}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => void setCampaignEnabled(c.id, !c.enabled)}
                      disabled={toggleBusyId === c.id}
                      className={
                        "rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-60 " +
                        (c.enabled
                          ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          : "bg-brand-ink text-white hover:opacity-95")
                      }
                    >
                      {toggleBusyId === c.id ? "Saving…" : c.enabled ? "Pause" : "Enable"}
                    </button>
                    <div className="hidden text-xs text-zinc-500 sm:block">Updated {new Date(c.updatedAt).toLocaleString()}</div>
                  </div>
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
