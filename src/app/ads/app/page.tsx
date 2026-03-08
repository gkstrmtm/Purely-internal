"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CampaignRow = {
  id: string;
  name: string;
  enabled: boolean;
  reviewStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
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
  const [pauseConfirm, setPauseConfirm] = useState<null | { id: string; name: string }>(null);

  const balanceCents = Number(me?.account?.balanceCents || 0);

  const activeCount = useMemo(
    () => (campaigns || []).filter((c) => c.enabled && c.reviewStatus === "APPROVED").length,
    [campaigns],
  );

  const avgCpc7dLabel = useMemo(() => {
    if (!stats) return "";
    const clicks = Number(stats.clicks.chargedLast7d || 0);
    if (!clicks) return "—";
    const cents = Math.round(Number(stats.spend.last7dCents || 0) / clicks);
    return usd(cents);
  }, [stats]);

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

  async function requestCampaignReview(campaignId: string) {
    setToggleBusyId(campaignId);
    setError(null);
    try {
      const res = await fetch(`/ads/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestReview: true }),
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
      {pauseConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-lg font-bold text-zinc-900">Pause campaign?</div>
            <div className="mt-2 text-sm text-zinc-600">
              Are you sure you want to pause “{pauseConfirm.name}”? This will stop your ad from running.
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPauseConfirm(null)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = pauseConfirm.id;
                  setPauseConfirm(null);
                  void setCampaignEnabled(id, false);
                }}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Pause campaign
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-lg font-bold text-zinc-900">Ads Manager</div>
          <div className="mt-1 text-sm text-zinc-600">Overview of balance, spend, clicks, and campaigns.</div>
        </div>

        <div className="w-full rounded-3xl border border-zinc-200 bg-white p-3 sm:w-auto">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Quick actions</div>
          <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/ads/app/campaigns/new"
              className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Create a campaign
            </Link>
            <Link
              href="/ads/app/settings"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Settings
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Balance</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{usd(balanceCents)}</div>
          <div className="mt-3 text-sm text-zinc-600">
            {stats ? (
              <>
                {stats.topups.last30dCents ? `${usd(stats.topups.last30dCents)} added (30d)` : "Funds available for charged clicks."}
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <div className="mt-4">
            <Link
              href="/ads/app/settings"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Settings
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
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Clicks</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{stats ? stats.clicks.chargedLast7d.toLocaleString() : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">{stats ? `${stats.clicks.chargedToday.toLocaleString()} today` : "Loading…"}</div>
          <div className="mt-3 text-xs text-zinc-500">Charged clicks are billable clicks.</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Avg CPC (7d)</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{stats ? avgCpc7dLabel : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">{stats ? `Based on ${stats.clicks.chargedLast7d.toLocaleString()} clicks` : "Loading…"}</div>
          <div className="mt-3 text-xs text-zinc-500">Spend ÷ charged clicks.</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top-ups</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{stats ? usd(stats.topups.last30dCents) : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">{stats ? "Added to your Ads balance (30d)" : "Loading…"}</div>
          <div className="mt-3 text-xs text-zinc-500">Auto top-up is configurable in Settings.</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Campaigns</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{stats ? stats.campaigns.total : campaigns ? campaigns.length : "…"}</div>
          <div className="mt-2 text-sm text-zinc-600">
            {stats ? `${stats.campaigns.enabled} enabled` : campaigns ? `${activeCount} enabled` : "Loading…"}
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-lg font-bold text-zinc-900">Campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">Create, pause, and monitor your portal campaigns.</div>
        </div>
        <Link
          href="/ads/app/campaigns/new"
          className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
        >
          New campaign
        </Link>
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}

      <div className="rounded-3xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="text-sm font-semibold text-zinc-900">Your campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">You’re charged when someone clicks. Set a daily budget to control spend.</div>
        </div>

        <div className="divide-y divide-zinc-100">
          {(campaigns || []).map((c) => {
            const billing = c?.targetJson?.billing;
            const dailyBudgetCents = Number(billing?.dailyBudgetCents || 0);

            const reviewStatus = c.reviewStatus ?? null;
            const isApproved = reviewStatus === "APPROVED";
            const isPending = reviewStatus === "PENDING";
            const isRejected = reviewStatus === "REJECTED";
            const statusLabel = isPending ? "Pending review" : isRejected ? "Needs changes" : "Approved";

            return (
              <div key={c.id} className="px-6 py-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <Link href={`/ads/app/campaigns/${c.id}`} className="text-sm font-semibold text-zinc-900 hover:underline">
                      {c.name}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500">
                      {statusLabel} · {c.enabled ? "Enabled" : "Paused"}
                      {dailyBudgetCents ? ` · ${usd(dailyBudgetCents)}/day` : ""}
                    </div>
                    {isRejected && c.reviewNotes ? (
                      <div className="mt-1 text-xs font-semibold text-rose-700">Manager notes: {String(c.reviewNotes)}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/ads/app/campaigns/${c.id}`}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      View / edit
                    </Link>

                    {isRejected ? (
                      <button
                        type="button"
                        onClick={() => void requestCampaignReview(c.id)}
                        disabled={toggleBusyId === c.id}
                        className="rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      >
                        {toggleBusyId === c.id ? "Saving…" : "Request review"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        if (c.enabled) {
                          setPauseConfirm({ id: c.id, name: c.name });
                          return;
                        }
                        void setCampaignEnabled(c.id, true);
                      }}
                      disabled={toggleBusyId === c.id || (!isApproved && !c.enabled)}
                      className={
                        "rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-60 " +
                        (c.enabled
                          ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95")
                      }
                      title={!isApproved && !c.enabled ? "This campaign will go live after manager approval." : undefined}
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
