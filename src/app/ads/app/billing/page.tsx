"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AdsStats = {
  account: {
    balanceCents: number;
    currency: string;
    autoTopUpEnabled: boolean;
    autoTopUpThresholdCents: number;
    autoTopUpAmountCents: number;
  };
  topups: { last30dCents: number };
};

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdsBillingPage() {
  const [me, setMe] = useState<any>(null);
  const [stats, setStats] = useState<AdsStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topupUsd, setTopupUsd] = useState("50");
  const [busy, setBusy] = useState(false);

  const balanceCents = Number(me?.account?.balanceCents || 0);
  const presets = useMemo(() => [25, 50, 100, 250], []);

  async function load() {
    setError(null);
    const [meRes, statsRes] = await Promise.all([
      fetch("/ads/api/me").then((r) => r.json()).catch(() => null),
      fetch("/ads/api/stats", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);

    if (!meRes?.ok) {
      setError("Failed to load account");
      return;
    }

    setMe(meRes);
    setStats(statsRes?.ok ? (statsRes as AdsStats) : null);
  }

  useEffect(() => {
    load();
  }, []);

  async function doTopup() {
    const amountUsd = Number(topupUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }

    setBusy(true);
    setError(null);
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
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-lg font-bold text-zinc-900">Billing</div>
          <div className="mt-1 text-sm text-zinc-600">Add funds and keep campaigns running.</div>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Balance</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900">{usd(balanceCents)}</div>
          <div className="mt-2 text-sm text-zinc-600">
            {stats ? (
              <>
                {stats.account.autoTopUpEnabled ? "Auto-reload is enabled" : "Auto-reload is disabled"}
                {stats.topups.last30dCents ? ` · ${usd(stats.topups.last30dCents)} added (30d)` : ""}
              </>
            ) : (
              "Loading…"
            )}
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-900">Add funds</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTopupUsd(String(p))}
                  className={
                    "rounded-2xl border px-4 py-2 text-sm font-semibold " +
                    (Number(topupUsd) === p
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                  }
                >
                  ${p}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex w-full items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                <span className="text-zinc-500">$</span>
                <input
                  value={topupUsd}
                  onChange={(e) => setTopupUsd(e.target.value)}
                  inputMode="decimal"
                  placeholder="50"
                  className="w-full bg-transparent outline-none"
                  aria-label="Top up amount"
                />
              </label>
              <button
                onClick={doTopup}
                disabled={busy}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 sm:w-auto"
              >
                {busy ? "Adding…" : "Add funds"}
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">Funds are used to pay for charged clicks.</div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Tip</div>
          <div className="mt-2 text-sm text-zinc-600">
            Turn on auto-reload to avoid pausing campaigns when your balance is low.
          </div>
          <Link
            href="/ads/app/settings"
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Open auto-reload settings
          </Link>
        </div>
      </div>
    </div>
  );
}
