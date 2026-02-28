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

  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Balance</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{usd(balanceCents)}</div>
          <div className="mt-3 text-sm text-zinc-600">
            {stats ? (
              <>
                {stats.account.autoTopUpEnabled ? "Auto-reload enabled" : "Auto-reload disabled"}
                {stats.topups.last30dCents ? ` · ${usd(stats.topups.last30dCents)} added (30d)` : ""}
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/ads/app/billing"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Add funds
            </Link>
            <Link
              href="/ads/app/settings"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Auto-reload
            </Link>
          </div>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Quick actions</div>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/ads/app/campaigns/new"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Create a campaign
            </Link>
            <Link
              href="/ads/app/billing"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Billing
            </Link>
            <Link
              href="/ads/app/settings"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Settings
            </Link>
          </div>
          <div className="mt-3 text-xs text-zinc-500">Auto-reload and thresholds live under Settings.</div>
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
          <div className="mt-1 text-sm text-zinc-600">Budgets and billing are enforced automatically.</div>
        </div>

        <div className="divide-y divide-zinc-100">
          {(campaigns || []).map((c) => {
            const billing = c?.targetJson?.billing;
            const dailyBudgetCents = Number(billing?.dailyBudgetCents || 0);

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
