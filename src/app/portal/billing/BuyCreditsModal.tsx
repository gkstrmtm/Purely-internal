"use client";

import { useEffect, useMemo, useState } from "react";

import { AppModal } from "@/components/AppModal";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clampInt(n: unknown, min: number, max: number) {
  const v = Math.floor(Number(n) || 0);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function formatUsd(amount: number) {
  const v = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function normalizePresets(input: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of input || []) {
    const v = clampInt(raw, 1, 1_000_000);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.slice(0, 6);
}

export function BuyCreditsModal({
  open,
  onClose,
  purchaseAvailable,
  creditUsdValue,
  estimatedMonthlyCredits,
  onStartCheckout,
}: {
  open: boolean;
  onClose: () => void;
  purchaseAvailable: boolean;
  creditUsdValue: number | null;
  estimatedMonthlyCredits: number | null;
  onStartCheckout: (credits: number) => Promise<void>;
}) {
  const [creditsToBuy, setCreditsToBuy] = useState(500);
  const [busy, setBusy] = useState(false);
  const creditsRequested = clampInt(creditsToBuy, 1, 1_000_000);
  const creditsTotalUsd = creditsRequested * (typeof creditUsdValue === "number" ? creditUsdValue : 0);

  const presets = useMemo(() => {
    const base = [500, 1000, 2500, 5000];
    const est = typeof estimatedMonthlyCredits === "number" && Number.isFinite(estimatedMonthlyCredits)
      ? Math.max(1, Math.floor(estimatedMonthlyCredits))
      : null;

    if (!est) return base;

    const months = [1, 2, 6, 12];
    const computed = months.map((m) => {
      const raw = est * m;
      // Round to something clean.
      if (raw >= 10_000) return Math.round(raw / 500) * 500;
      if (raw >= 1_000) return Math.round(raw / 100) * 100;
      return Math.round(raw / 50) * 50;
    });

    return normalizePresets(computed);
  }, [estimatedMonthlyCredits]);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    // Prefer the first preset when opening.
    const first = presets[0] ?? 500;
    setCreditsToBuy(first);
  }, [open, presets]);

  return (
    <AppModal
      open={open}
      title="Buy credits"
      description="Choose a credit amount or enter a custom total."
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      widthClassName="w-[min(560px,calc(100vw-32px))]"
      closeVariant="x"
      hideHeaderDivider
      hideFooterDivider
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60",
              purchaseAvailable ? "bg-(--color-brand-blue) hover:opacity-95" : "bg-zinc-400",
            )}
            disabled={busy || !purchaseAvailable}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await onStartCheckout(creditsRequested);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Opening checkout…" : "Buy credits"}
          </button>
        </div>
      }
    >
      {!purchaseAvailable ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          Credit purchasing is unavailable right now.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {presets.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCreditsToBuy(c)}
                disabled={busy}
                className={classNames(
                  "rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
                  creditsRequested === c
                    ? "border-(--color-brand-blue) bg-(--color-brand-blue) text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                {c.toLocaleString()}
              </button>
            ))}

            <div className="flex items-center gap-2">
              <input
                className="w-40 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={String(creditsToBuy)}
                type="number"
                min={1}
                step={1}
                onChange={(e) => setCreditsToBuy(clampInt(e.target.value, 1, 1_000_000))}
                disabled={busy}
                aria-label="Credits to buy"
              />
              <span className="text-sm font-semibold text-zinc-700">credits</span>
            </div>
          </div>

          <div className="mt-3 text-xs text-zinc-500">
            Total: <span className="font-semibold text-zinc-700">{creditsRequested.toLocaleString()}</span> credits
            {typeof creditUsdValue === "number" ? (
              <>
                {" "}• <span className="font-semibold text-zinc-700">{formatUsd(creditsTotalUsd)}</span>
              </>
            ) : null}
          </div>
        </>
      )}
    </AppModal>
  );
}
