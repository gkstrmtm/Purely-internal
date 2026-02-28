"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AdsStats = {
  account: {
    balanceCents: number;
    currency: string;
    autoTopUpEnabled: boolean;
    autoTopUpThresholdCents: number;
    autoTopUpAmountCents: number;
  };
};

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdsSettingsPage() {
  const [stats, setStats] = useState<AdsStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [thresholdUsd, setThresholdUsd] = useState("20");
  const [amountUsd, setAmountUsd] = useState("50");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    const statsRes = await fetch("/ads/api/stats", { cache: "no-store" }).then((r) => r.json()).catch(() => null);

    if (!statsRes?.ok) {
      setStats(null);
      return;
    }

    const next = statsRes as AdsStats;
    setStats(next);
    const a = next.account;
    setEnabled(Boolean(a.autoTopUpEnabled));
    setThresholdUsd(String(Math.round(Number(a.autoTopUpThresholdCents || 0) / 100)));
    setAmountUsd(String(Math.round(Number(a.autoTopUpAmountCents || 0) / 100)));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(next: { enabled: boolean; thresholdUsd: string; amountUsd: string }) {
    const thresholdUsdNum = Number(next.thresholdUsd);
    const amountUsdNum = Number(next.amountUsd);

    if (!Number.isFinite(thresholdUsdNum) || thresholdUsdNum < 0) {
      setError("Enter a valid threshold");
      return;
    }
    if (!Number.isFinite(amountUsdNum) || amountUsdNum <= 0) {
      setError("Enter a valid reload amount");
      return;
    }

    setBusy(true);
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
      setBusy(false);
    }
  }

  const exampleReloadCents = Math.round(Number(amountUsd || "0") * 100);
  const exampleThresholdCents = Math.round(Number(thresholdUsd || "0") * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-lg font-bold text-zinc-900">Settings</div>
          <div className="mt-1 text-sm text-zinc-600">Auto-reload keeps your campaigns running.</div>
        </div>
        <Link
          href="/ads/app"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Back to overview
        </Link>
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Auto-reload</div>
              <div className="mt-1 text-sm text-zinc-600">
                When your balance drops below the threshold, we automatically add the reload amount.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !enabled;
                setEnabled(next);
                void save({ enabled: next, thresholdUsd, amountUsd });
              }}
              disabled={busy}
              className={
                "rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 " +
                (enabled ? "bg-brand-ink text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              {busy ? "Saving…" : enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Threshold (USD)</div>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                <span className="text-zinc-500">$</span>
                <input
                  value={thresholdUsd}
                  onChange={(e) => setThresholdUsd(e.target.value)}
                  inputMode="decimal"
                  placeholder="20"
                  className="w-full bg-transparent outline-none"
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">Example: if balance falls below {usd(exampleThresholdCents)}.</div>
            </label>

            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Reload amount (USD)</div>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                <span className="text-zinc-500">$</span>
                <input
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  inputMode="decimal"
                  placeholder="50"
                  className="w-full bg-transparent outline-none"
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">Example: we add {usd(exampleReloadCents)} when reloading.</div>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void save({ enabled, thresholdUsd, amountUsd })}
              disabled={busy}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 sm:w-auto"
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
            <Link
              href="/ads/app/billing"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:w-auto"
            >
              Add funds
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current</div>
          <div className="mt-2 text-sm text-zinc-700">
            {stats ? (
              <>
                <div className="font-semibold text-zinc-900">Balance</div>
                <div className="mt-1">{usd(stats.account.balanceCents)}</div>
                <div className="mt-4 font-semibold text-zinc-900">Auto-reload</div>
                <div className="mt-1">{stats.account.autoTopUpEnabled ? "Enabled" : "Disabled"}</div>
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <div className="mt-4 text-xs text-zinc-500">
            If your database migration hasn’t run yet, saving may return a friendly error.
          </div>
        </div>
      </div>
    </div>
  );
}
