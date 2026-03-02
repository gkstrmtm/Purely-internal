"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AdsStats = {
  account: {
    balanceCents: number;
    currency: string;
    autoTopUpEnabled: boolean;
    autoTopUpThresholdCents: number;
    autoTopUpAmountCents: number;
  };
  topups?: { last30dCents: number };
};

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdsSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stats, setStats] = useState<AdsStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topupUsd, setTopupUsd] = useState("50");
  const presets = useMemo(() => [25, 50, 100, 250], []);

  const [enabled, setEnabled] = useState(true);
  const [thresholdUsd, setThresholdUsd] = useState("20");
  const [amountUsd, setAmountUsd] = useState("50");
  const [saving, setSaving] = useState(false);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupConfirming, setTopupConfirming] = useState(false);
  const [topupMessage, setTopupMessage] = useState<string | null>(null);

  const [baseline, setBaseline] = useState<null | { enabled: boolean; thresholdUsd: string; amountUsd: string }>(null);

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

    const nextEnabled = Boolean(a.autoTopUpEnabled);
    const nextThresholdUsd = String(Math.round(Number(a.autoTopUpThresholdCents || 0) / 100));
    const nextAmountUsd = String(Math.round(Number(a.autoTopUpAmountCents || 0) / 100));

    setEnabled(nextEnabled);
    setThresholdUsd(nextThresholdUsd);
    setAmountUsd(nextAmountUsd);
    setBaseline({ enabled: nextEnabled, thresholdUsd: nextThresholdUsd, amountUsd: nextAmountUsd });
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

    setSaving(true);
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
      setSaving(false);
    }
  }

  async function doTopup() {
    const amountUsdNum = Number(topupUsd);
    if (!Number.isFinite(amountUsdNum) || amountUsdNum <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }

    setTopupBusy(true);
    setError(null);
    try {
      const amountCents = Math.round(amountUsdNum * 100);
      const res = await fetch("/ads/api/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Top up failed"));

      if (json?.mode === "stripe" && typeof json?.url === "string" && json.url) {
        window.location.href = String(json.url);
        return;
      }

      setTopupMessage("Funds added (test mode).");
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Top up failed"));
    } finally {
      setTopupBusy(false);
    }
  }

  useEffect(() => {
    const topup = (searchParams?.get("topup") || "").trim();
    const sessionId = (searchParams?.get("session_id") || "").trim();
    if (!topup) return;

    if (topup === "cancel") {
      setTopupMessage("Top-up cancelled.");
      router.replace("/ads/app/settings");
      return;
    }

    if (topup === "success" && sessionId) {
      let mounted = true;
      (async () => {
        setTopupConfirming(true);
        setError(null);
        try {
          const res = await fetch("/ads/api/topup/confirm-checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Unable to confirm top-up"));
          if (!mounted) return;
          setTopupMessage("Funds added successfully.");
          await load();
          router.replace("/ads/app/settings");
        } catch (err: any) {
          if (!mounted) return;
          setError(String(err?.message || "Unable to confirm top-up"));
        } finally {
          if (!mounted) return;
          setTopupConfirming(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }
  }, [router, searchParams]);

  const exampleReloadCents = Math.round(Number(amountUsd || "0") * 100);
  const exampleThresholdCents = Math.round(Number(thresholdUsd || "0") * 100);

  const isDirty =
    baseline == null
      ? true
      : enabled !== baseline.enabled || thresholdUsd !== baseline.thresholdUsd || amountUsd !== baseline.amountUsd;
  const showSaved = baseline != null && !isDirty && !saving;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-lg font-bold text-zinc-900">Settings</div>
          <div className="mt-1 text-sm text-zinc-600">Billing and auto-reload.</div>
        </div>
        <Link
          href="/ads/app"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Back to overview
        </Link>
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}
      {topupMessage ? <div className="text-sm font-semibold text-emerald-700">{topupMessage}</div> : null}
      {topupConfirming ? <div className="text-sm text-zinc-600">Confirming Stripe payment…</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:col-span-2">
          <div className="divide-y divide-zinc-100">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Billing</div>
                  <div className="mt-1 text-sm text-zinc-600">Add funds to keep your campaigns running.</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Balance</div>
                  <div className="mt-1 text-2xl font-bold text-zinc-900">
                    {stats ? usd(stats.account.balanceCents) : "…"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {stats?.topups?.last30dCents ? `${usd(stats.topups.last30dCents)} added (30d)` : "USD"}
                  </div>
                </div>
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
                    disabled={topupBusy}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 sm:w-auto"
                  >
                    {topupBusy ? "Adding…" : "Add funds"}
                  </button>
                </div>

                <div className="mt-2 text-xs text-zinc-500">Funds are used to pay for charged clicks.</div>
              </div>
            </div>

            <div className="p-6">
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
                  disabled={saving}
                  className={
                    "rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 " +
                    (enabled
                      ? "bg-[color:var(--color-brand-blue)] text-white"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                  }
                >
                  {saving ? "Saving…" : enabled ? "Enabled" : "Disabled"}
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
                  disabled={saving || !isDirty}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 sm:w-auto"
                >
                  {saving ? "Saving…" : showSaved ? "Saved" : "Save settings"}
                </button>
              </div>
            </div>
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
          <div className="mt-4 text-xs text-zinc-500">Need help with billing? Email support@purelyautomation.com.</div>
        </div>
      </div>
    </div>
  );
}
