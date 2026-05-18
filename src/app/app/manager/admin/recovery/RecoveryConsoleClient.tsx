"use client";

import { useEffect, useState } from "react";

type EntityType = "portal_contact" | "portal_task" | "client_blog_post";

type RecoveryRecord = {
  ownerId: string;
  ownerLabel: string;
  ownerEmail: string | null;
  entityType: EntityType;
  entityTypeLabel: string;
  entityId: string;
  displayLabel: string;
  secondaryLabel: string | null;
  archivedAtIso: string;
  archivedByUserId: string | null;
  archivedByLabel: string;
  metadata: {
    name: string | null;
    title: string | null;
    email: string | null;
    slug: string | null;
    status: string | null;
  };
};

type RecoveryResponse = {
  ok: true;
  records: RecoveryRecord[];
};

type Filters = {
  ownerQuery: string;
  entityType: "" | EntityType;
  archivedBy: string;
  query: string;
  archivedFrom: string;
  archivedTo: string;
};

const EMPTY_FILTERS: Filters = {
  ownerQuery: "",
  entityType: "",
  archivedBy: "",
  query: "",
  archivedFrom: "",
  archivedTo: "",
};

const ENTITY_BADGE_STYLES: Record<EntityType, string> = {
  portal_contact: "bg-sky-100 text-sky-800",
  portal_task: "bg-amber-100 text-amber-900",
  client_blog_post: "bg-emerald-100 text-emerald-800",
};

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

export function RecoveryConsoleClient() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RecoveryRecord | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<RecoveryRecord | null>(null);
  const [purgeReason, setPurgeReason] = useState("");
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  async function loadRecords(activeFilters: Filters) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (activeFilters.ownerQuery.trim()) params.set("ownerQuery", activeFilters.ownerQuery.trim());
      if (activeFilters.entityType) params.set("entityType", activeFilters.entityType);
      if (activeFilters.archivedBy.trim()) params.set("archivedBy", activeFilters.archivedBy.trim());
      if (activeFilters.query.trim()) params.set("query", activeFilters.query.trim());
      if (activeFilters.archivedFrom) params.set("archivedFrom", activeFilters.archivedFrom);
      if (activeFilters.archivedTo) params.set("archivedTo", activeFilters.archivedTo);
      params.set("take", "100");

      const response = await fetch(`/api/manager/recoverability/archived?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as RecoveryResponse | { ok?: false; error?: string } | null;

      if (!response.ok || !json || !("ok" in json) || json.ok !== true) {
        const message = json && "error" in json && typeof json.error === "string"
          ? json.error
          : response.status === 401
            ? "Unauthorized"
            : response.status === 403
              ? "Platform admin access required."
              : "Failed to load archived records.";
        throw new Error(message);
      }

      setRecords(json.records);
    } catch (fetchError) {
      setRecords([]);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load archived records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords(EMPTY_FILTERS);
  }, []);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionSuccess(null);
    await loadRecords(filters);
  }

  async function handleRestoreConfirm() {
    if (!restoreTarget) return;
    const reason = restoreReason.trim();
    if (!reason) {
      setRestoreError("Restore reason is required.");
      return;
    }

    setRestoring(true);
    setRestoreError(null);

    try {
      const response = await fetch("/api/manager/recoverability/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerId: restoreTarget.ownerId,
          entityType: restoreTarget.entityType,
          entityId: restoreTarget.entityId,
          reason,
        }),
      });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; restored?: boolean; error?: string } | null;
      if (!response.ok || !json?.ok || !json.restored) {
        throw new Error(json?.error || "Restore failed.");
      }

      setActionSuccess(`${restoreTarget.entityTypeLabel} restored successfully.`);
      setRestoreTarget(null);
      setRestoreReason("");
      await loadRecords(filters);
    } catch (restoreFailure) {
      setRestoreError(restoreFailure instanceof Error ? restoreFailure.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  async function handlePurgeConfirm() {
    if (!purgeTarget) return;

    const reason = purgeReason.trim();
    if (!reason) {
      setPurgeError("Purge reason is required.");
      return;
    }
    if (purgeConfirmation.trim().toUpperCase() !== "PURGE") {
      setPurgeError("Type PURGE to confirm permanent deletion.");
      return;
    }

    setPurging(true);
    setPurgeError(null);

    try {
      const response = await fetch("/api/manager/recoverability/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerId: purgeTarget.ownerId,
          entityType: purgeTarget.entityType,
          entityId: purgeTarget.entityId,
          reason,
          confirmation: "PURGE",
        }),
      });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; purged?: boolean; error?: string } | null;
      if (!response.ok || !json?.ok || !json.purged) {
        throw new Error(json?.error || "Permanent purge failed.");
      }

      setActionSuccess(`${purgeTarget.entityTypeLabel} permanently purged.`);
      setPurgeTarget(null);
      setPurgeReason("");
      setPurgeConfirmation("");
      await loadRecords(filters);
    } catch (purgeFailure) {
      setPurgeError(purgeFailure instanceof Error ? purgeFailure.message : "Permanent purge failed.");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-base font-semibold text-brand-ink">Search archived records</div>
            <div className="mt-1 text-sm text-zinc-600">
              Results only include safe metadata: name, title, email, slug, owner label, archived date, and archived-by actor.
              Normal delete archives. Permanent purge stays manual, admin-only, and irreversible.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setActionSuccess(null);
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
              Search archived records
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Owner / account</span>
            <input
              value={filters.ownerQuery}
              onChange={(event) => setFilters((current) => ({ ...current, ownerQuery: event.target.value }))}
              placeholder="Name, email, or owner id"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Entity type</span>
            <select
              value={filters.entityType}
              onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value as Filters["entityType"] }))}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            >
              <option value="">All archived entity types</option>
              <option value="portal_contact">Contacts</option>
              <option value="portal_task">Tasks</option>
              <option value="client_blog_post">Blog posts</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Archived by</span>
            <input
              value={filters.archivedBy}
              onChange={(event) => setFilters((current) => ({ ...current, archivedBy: event.target.value }))}
              placeholder="Actor name, email, or user id"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Name / title / email / slug</span>
            <input
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Search safe record metadata"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Archived from</span>
            <input
              type="date"
              value={filters.archivedFrom}
              onChange={(event) => setFilters((current) => ({ ...current, archivedFrom: event.target.value }))}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>

          <label className="grid gap-1.5 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Archived to</span>
            <input
              type="date"
              value={filters.archivedTo}
              onChange={(event) => setFilters((current) => ({ ...current, archivedTo: event.target.value }))}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
            />
          </label>
        </div>
      </form>

      {actionSuccess ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionSuccess}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <div className="text-base font-semibold text-red-900">Recovery console unavailable</div>
          <div className="mt-2">{error}</div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-brand-ink">Archived records</div>
            <div className="mt-1 text-sm text-zinc-600">Restore is reversible. Permanent purge removes the archived record from recovery and keeps audit history only.</div>
          </div>
          <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {loading ? "Loading" : `${records.length} result${records.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                <div className="h-4 w-40 rounded bg-zinc-200" />
                <div className="mt-3 h-3 w-64 rounded bg-zinc-200" />
                <div className="mt-2 h-3 w-52 rounded bg-zinc-200" />
              </div>
            ))}
          </div>
        ) : records.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Record</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Owner / account</th>
                  <th className="px-5 py-3 font-semibold">Archived</th>
                  <th className="px-5 py-3 font-semibold">Archived by</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {records.map((record) => (
                  <tr key={`${record.entityType}:${record.entityId}`}>
                    <td className="px-5 py-4 align-top">
                      <div className="font-semibold text-brand-ink">{record.displayLabel}</div>
                      <div className="mt-1 text-xs text-zinc-500">{record.secondaryLabel || record.entityId}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ENTITY_BADGE_STYLES[record.entityType]}`}>
                        {record.entityTypeLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="font-medium text-zinc-900">{record.ownerLabel}</div>
                      <div className="mt-1 text-xs text-zinc-500">{record.ownerEmail || record.ownerId}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-zinc-700">{formatDate(record.archivedAtIso)}</td>
                    <td className="px-5 py-4 align-top">
                      <div className="font-medium text-zinc-900">{record.archivedByLabel}</div>
                      <div className="mt-1 text-xs text-zinc-500">{record.archivedByUserId || "No actor id"}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRestoreTarget(record);
                            setRestoreError(null);
                            setRestoreReason("");
                          }}
                          className="inline-flex items-center rounded-full border border-brand-blue/20 bg-brand-blue/5 px-4 py-2 text-sm font-medium text-brand-blue transition hover:border-brand-blue/40 hover:bg-brand-blue/10"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPurgeTarget(record);
                            setPurgeError(null);
                            setPurgeReason("");
                            setPurgeConfirmation("");
                          }}
                          className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                        >
                          Purge
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="text-lg font-semibold text-brand-ink">No archived records found</div>
            <div className="mt-2 text-sm text-zinc-600">
              Adjust the filters above or archive a test record in the portal to verify recoverability.
            </div>
          </div>
        )}
      </div>

      {restoreTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold text-brand-ink">Confirm restore</div>
            <div className="mt-2 text-sm text-zinc-600">
              You are restoring {restoreTarget.entityTypeLabel.toLowerCase()} <span className="font-medium text-zinc-900">{restoreTarget.displayLabel}</span> for <span className="font-medium text-zinc-900">{restoreTarget.ownerLabel}</span>.
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Restore requires a reason and will write a new audit event.
            </div>

            <label className="mt-5 grid gap-1.5 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Restore reason</span>
              <textarea
                rows={4}
                value={restoreReason}
                onChange={(event) => setRestoreReason(event.target.value)}
                placeholder="Describe why this record is being restored"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-brand-blue"
              />
            </label>

            {restoreError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {restoreError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (restoring) return;
                  setRestoreTarget(null);
                  setRestoreReason("");
                  setRestoreError(null);
                }}
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoring || !restoreReason.trim()}
                onClick={() => void handleRestoreConfirm()}
                className="inline-flex items-center rounded-full border border-brand-blue/20 bg-brand-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {restoring ? "Restoring..." : "Confirm restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {purgeTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold text-brand-ink">Confirm permanent purge</div>
            <div className="mt-2 text-sm text-zinc-600">
              You are permanently deleting archived {purgeTarget.entityTypeLabel.toLowerCase()} <span className="font-medium text-zinc-900">{purgeTarget.displayLabel}</span> for <span className="font-medium text-zinc-900">{purgeTarget.ownerLabel}</span>.
            </div>

            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              This cannot be undone. Restore will no longer be available after purge. Audit history is preserved, but the archived record leaves the recovery queue.
            </div>

            <label className="mt-5 grid gap-1.5 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Purge reason</span>
              <textarea
                rows={4}
                value={purgeReason}
                onChange={(event) => setPurgeReason(event.target.value)}
                placeholder="Describe why permanent deletion is required"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-red-400"
              />
            </label>

            <label className="mt-4 grid gap-1.5 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Type PURGE to confirm</span>
              <input
                value={purgeConfirmation}
                onChange={(event) => setPurgeConfirmation(event.target.value)}
                placeholder="PURGE"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-red-400"
              />
            </label>

            {purgeError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {purgeError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (purging) return;
                  setPurgeTarget(null);
                  setPurgeReason("");
                  setPurgeConfirmation("");
                  setPurgeError(null);
                }}
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purging || !purgeReason.trim() || purgeConfirmation.trim().toUpperCase() !== "PURGE"}
                onClick={() => void handlePurgeConfirm()}
                className="inline-flex items-center rounded-full border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {purging ? "Purging..." : "Confirm permanent purge"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}