"use client";

import { useEffect, useState } from "react";

type ProviderJobAdminState = "queued" | "pending" | "blocked" | "failed" | "published" | "manual_only";

type ProviderJobAdminRecord = {
  ownerId: string;
  ownerLabel: string;
  ownerEmail: string | null;
  ownerVariant: "portal" | "credit";
  mediaItemId: string;
  assetLabel: string;
  assetTag: string | null;
  providerKey: string;
  providerLabel: string;
  destinationLabel: string | null;
  destinationId: string | null;
  scheduledForIso: string | null;
  state: ProviderJobAdminState;
  stateLabel: string;
  stateReason: string;
  lastAttemptAtIso: string | null;
  providerError: string | null;
  providerPostId: string | null;
  retryEligible: boolean;
  providerPublishedAtIso: string | null;
};

type ProviderPublishingResponse = {
  ok: true;
  records: ProviderJobAdminRecord[];
  counts: Record<ProviderJobAdminState, number>;
};

type Filters = {
  state: "all" | ProviderJobAdminState;
  ownerQuery: string;
  query: string;
};

const EMPTY_FILTERS: Filters = {
  state: "all",
  ownerQuery: "",
  query: "",
};

const STATE_OPTIONS: Array<{ value: Filters["state"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "pending", label: "Pending" },
  { value: "blocked", label: "Blocked" },
  { value: "failed", label: "Failed" },
  { value: "published", label: "Published" },
  { value: "manual_only", label: "Manual-only" },
];

function formatDate(value: string | null) {
  if (!value) return "Not stored";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function stateBadgeClass(state: ProviderJobAdminState) {
  switch (state) {
    case "queued":
      return "bg-sky-100 text-sky-800";
    case "pending":
      return "bg-indigo-100 text-indigo-800";
    case "blocked":
      return "bg-amber-100 text-amber-900";
    case "failed":
      return "bg-rose-100 text-rose-900";
    case "published":
      return "bg-emerald-100 text-emerald-900";
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

function variantBadgeClass(variant: "portal" | "credit") {
  return variant === "credit" ? "bg-violet-100 text-violet-900" : "bg-slate-100 text-slate-800";
}

export function ProviderPublishingAdminClient() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [records, setRecords] = useState<ProviderJobAdminRecord[]>([]);
  const [counts, setCounts] = useState<Record<ProviderJobAdminState, number>>({
    queued: 0,
    pending: 0,
    blocked: 0,
    failed: 0,
    published: 0,
    manual_only: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRecords(nextFilters: Filters) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextFilters.state !== "all") params.set("state", nextFilters.state);
      if (nextFilters.ownerQuery.trim()) params.set("ownerQuery", nextFilters.ownerQuery.trim());
      if (nextFilters.query.trim()) params.set("query", nextFilters.query.trim());
      params.set("take", "250");

      const response = await fetch(`/api/manager/provider-publishing/jobs?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as ProviderPublishingResponse | { ok?: false; error?: string } | null;

      if (!response.ok || !json || !("ok" in json) || json.ok !== true) {
        const message = json && "error" in json && typeof json.error === "string"
          ? json.error
          : response.status === 401
            ? "Unauthorized"
            : response.status === 403
              ? "Platform admin access required."
              : "Failed to load provider publishing jobs.";
        throw new Error(message);
      }

      setRecords(json.records);
      setCounts(json.counts);
    } catch (fetchError) {
      setRecords([]);
      setCounts({ queued: 0, pending: 0, blocked: 0, failed: 0, published: 0, manual_only: 0 });
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load provider publishing jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords(EMPTY_FILTERS);
  }, []);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRecords(filters);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-base font-semibold text-brand-ink">Provider publishing queue</div>
            <div className="mt-1 text-sm text-zinc-600">
              Read-only operator visibility into queued, blocked, failed, published, and manual-only provider jobs. No live publish action exists here.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                void loadRecords(EMPTY_FILTERS);
              }}
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Clear filters
            </button>
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-brand-blue/20 bg-brand-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue/90"
            >
              Refresh queue view
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Provider state</span>
            <select
              value={filters.state}
              onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value as Filters["state"] }))}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            >
              {STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Owner / account</span>
            <input
              value={filters.ownerQuery}
              onChange={(event) => setFilters((current) => ({ ...current, ownerQuery: event.target.value }))}
              placeholder="Name, email, owner id, portal or credit"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Asset / destination / error</span>
            <input
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Asset label, destination, provider id, error"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {STATE_OPTIONS.filter((option) => option.value !== "all").map((option) => (
          <div key={option.value} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{option.label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink">
              {counts[option.value as ProviderJobAdminState] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          <div className="font-semibold">Provider queue view unavailable</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="text-base font-semibold text-brand-ink">Provider jobs</div>
          <div className="mt-1 text-sm text-zinc-600">
            {loading ? "Loading provider jobs..." : `${records.length} record${records.length === 1 ? "" : "s"} shown for the current filters.`}
          </div>
        </div>

        <div className="divide-y divide-zinc-200">
          {!loading && !records.length ? (
            <div className="px-6 py-8 text-sm text-zinc-600">No provider jobs matched the current filters.</div>
          ) : null}

          {records.map((record) => (
            <div key={`${record.ownerId}:${record.mediaItemId}`} className="px-6 py-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateBadgeClass(record.state)}`}>
                      {record.stateLabel}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${variantBadgeClass(record.ownerVariant)}`}>
                      {record.ownerVariant === "credit" ? "Credit owner" : "Portal owner"}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800">
                      {record.providerLabel}
                    </span>
                  </div>

                  <div className="mt-3 text-lg font-semibold text-brand-ink">{record.assetLabel}</div>
                  <div className="mt-1 text-sm text-zinc-600">{record.stateReason}</div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Owner</div>
                      <div className="mt-1 text-sm font-medium text-zinc-900">{record.ownerLabel}</div>
                      <div className="text-xs text-zinc-500">{record.ownerEmail || record.ownerId}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Destination</div>
                      <div className="mt-1 text-sm font-medium text-zinc-900">{record.destinationLabel || "Not selected"}</div>
                      <div className="text-xs text-zinc-500">{record.destinationId || "No provider destination id"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Scheduled publish time</div>
                      <div className="mt-1 text-sm font-medium text-zinc-900">{formatDate(record.scheduledForIso)}</div>
                      <div className="text-xs text-zinc-500">Last attempt: {formatDate(record.lastAttemptAtIso)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Provider post</div>
                      <div className="mt-1 text-sm font-medium text-zinc-900">{record.providerPostId || "Not stored"}</div>
                      <div className="text-xs text-zinc-500">Retry eligible: {record.retryEligible ? "Yes" : "No"}</div>
                    </div>
                  </div>
                </div>

                <div className="xl:w-[22rem]">
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Provider error</div>
                    <div className="mt-2 text-sm text-zinc-700">
                      {record.providerError || "No provider error stored."}
                    </div>
                    {record.assetTag ? (
                      <div className="mt-3 text-xs text-zinc-500">Asset tag: {record.assetTag}</div>
                    ) : null}
                    {record.providerPublishedAtIso ? (
                      <div className="mt-2 text-xs text-zinc-500">Published at: {formatDate(record.providerPublishedAtIso)}</div>
                    ) : null}
                    <div className="mt-3 text-xs text-zinc-500">
                      This operator view is read-only. It does not trigger OAuth, provider publish, booking, messaging, payment, or any external action.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
