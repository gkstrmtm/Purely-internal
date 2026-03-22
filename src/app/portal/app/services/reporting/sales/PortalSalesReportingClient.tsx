"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { InlineSpinner } from "@/components/InlineSpinner";
import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";

type RangeKey = "7d" | "30d";

type SalesStatusPayload =
  | {
      ok: true;
      encryptionConfigured: boolean;
      activeProvider: string | null;
      providers: Record<string, { configured: boolean; displayHint?: string | null; connectedAtIso?: string | null }>;
      stripe: { configured: boolean; prefix: string | null; accountId: string | null; connectedAtIso: string | null };
      note?: string;
    }
  | { ok: false; error?: string };

type SalesReportPayload =
  | {
      ok: true;
      provider: string;
      providerLabel: string;
      range: RangeKey;
      startIso: string;
      endIso: string;
      currency: string;
      totals: { chargeCount: number; grossCents: number; refundedCents: number; netCents: number };
      daily: Array<{ day: string; count: number; grossCents: number; refundedCents: number; netCents: number }>;
      recent: Array<{
        id: string;
        createdIso: string;
        amountCents: number;
        refundedCents: number;
        currency: string;
        email: string | null;
        name: string | null;
        receiptUrl: string | null;
      }>;
      note?: string;
    }
  | { ok: false; error?: string };

function formatMoney(cents: number, currency: string) {
  const cur = String(currency || "usd").toUpperCase();
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const value = n / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(value);
  } catch {
    return `${cur} ${value.toFixed(2)}`;
  }
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalSalesReportingClient() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const from = String(searchParams?.get("from") || "").toLowerCase();
  const backHref = from === "dashboard" ? "/portal/app" : "/portal/app/services/reporting";
  const backLabel = from === "dashboard" ? "Back to Dashboard" : "Back to Reporting";

  const [status, setStatus] = useState<SalesStatusPayload | null>(null);
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SalesReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  async function load(nextRange: RangeKey) {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);

    try {
      const [statusRes, salesRes] = await Promise.all([
        fetch("/api/portal/integrations/sales-reporting", { cache: "no-store" }).catch(() => null as any),
        fetch(`/api/portal/reporting/sales?range=${encodeURIComponent(nextRange)}`, { cache: "no-store" }).catch(() => null as any),
      ]);

      if (statusRes?.ok) {
        const json = ((await statusRes.json().catch(() => null)) as SalesStatusPayload | null) ?? null;
        setStatus(json);
      }

      if (!salesRes?.ok) {
        const body = (await salesRes?.json().catch(() => ({}))) as { error?: string };
        if (isFirstLoad) setData(null);
        setError(body?.error ?? "Unable to load sales");
        return;
      }

      const payload = ((await salesRes.json().catch(() => null)) as SalesReportPayload | null) ?? null;
      if (!payload || (payload as any).ok !== true) {
        if (isFirstLoad) setData(null);
        setError((payload as any)?.error ?? "Unable to load sales");
        return;
      }

      setData(payload);
      hasLoadedOnceRef.current = true;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeOptions = useMemo(
    () =>
      [
        { value: "7d" as const, label: "Last 7 days" },
        { value: "30d" as const, label: "Last 30 days" },
      ] satisfies Array<{ value: RangeKey; label: string }>,
    [],
  );

  const canShowData = (data as any)?.ok === true;
  const currency = canShowData ? (data as any).currency : "usd";

  const providerLabel = canShowData ? (data as any).providerLabel : "Sales";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{providerLabel} Sales</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">Gross, refunds, and net sales pulled directly from your connected payment processor.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={backHref}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            {backLabel}
          </Link>
          <Link
            href="/portal/app/profile"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Sales settings
          </Link>
        </div>
      </div>

      {status && (status as any).ok === true && !(status as any).encryptionConfigured ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Sales reporting setup unavailable</div>
          <div className="mt-2 text-sm text-zinc-600">Please contact support to enable sales reporting for this deployment.</div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">
          {canShowData ? (
            <span className="text-zinc-600">
              Provider: <span className="font-semibold text-zinc-900">{(data as any).providerLabel}</span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {refreshing ? (
            <div className="mr-2 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
              Refreshing…
            </div>
          ) : null}
          <div className="text-xs font-semibold text-zinc-500">Range</div>
          <PortalListboxDropdown
            value={range}
            onChange={(v) => {
              const next = (v as RangeKey) ?? "30d";
              setRange(next);
              void load(next);
            }}
            options={rangeOptions.map((o) => ({ value: o.value as any, label: o.label }))}
          />
        </div>
      </div>

      {loading && !hasLoadedOnceRef.current ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : null}

      {canShowData ? (
        <>
          {(data as any)?.note ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">{(data as any).note}</div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([
              ["Gross", (data as any).totals.grossCents, "blue"],
              ["Refunds", (data as any).totals.refundedCents, "amber"],
              ["Net", (data as any).totals.netCents, "emerald"],
            ] as Array<[string, number, "blue" | "amber" | "emerald"]>).map(([label, cents, tone]) => (
              <div key={label} className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-xs font-semibold text-zinc-500">{label}</div>
                <div
                  className={classNames(
                    "mt-2 text-2xl font-bold",
                    tone === "blue" && "text-(--color-brand-blue)",
                    tone === "amber" && "text-amber-700",
                    tone === "emerald" && "text-emerald-700",
                  )}
                >
                  {formatMoney(cents, currency)}
                </div>
                <div className="mt-2 text-xs text-zinc-500">Transactions: {(data as any).totals.chargeCount}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Daily net</div>
              <div className="mt-3 space-y-2">
                {(data as any).daily.length === 0 ? (
                  <div className="text-sm text-zinc-600">No transactions in this range.</div>
                ) : (
                  (data as any).daily.slice(-14).map((row: any) => (
                    <div key={row.day} className="flex items-center justify-between gap-4">
                      <div className="text-xs font-semibold text-zinc-600">{row.day}</div>
                      <div className="text-xs font-semibold text-zinc-900">{formatMoney(row.netCents, currency)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Recent transactions</div>
              <div className="mt-3 space-y-3">
                {(data as any).recent.length === 0 ? (
                  <div className="text-sm text-zinc-600">No recent transactions.</div>
                ) : (
                  (data as any).recent.map((t: any) => (
                    <div key={t.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-zinc-900">
                            {formatMoney((t.amountCents ?? 0) - (t.refundedCents ?? 0), t.currency || currency)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-600">{new Date(t.createdIso).toLocaleString()}</div>
                          {t.email ? <div className="mt-2 text-xs text-zinc-600">{t.email}</div> : null}
                          {t.name ? <div className="mt-1 text-xs text-zinc-600">{t.name}</div> : null}
                        </div>
                        {t.receiptUrl ? (
                          <a
                            href={t.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
                          >
                            Receipt
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">No provider connected</div>
          <div className="mt-2 text-sm text-zinc-600">Connect a payment processor in Profile to enable sales reporting.</div>
          <div className="mt-4">
            <Link
              href="/portal/app/profile"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Connect a provider
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
