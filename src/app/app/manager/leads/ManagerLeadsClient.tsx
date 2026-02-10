"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type LeadRow = {
  id: string;
  businessName: string;
  phone: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  interestedService?: string | null;
  niche?: string | null;
  location?: string | null;
  source?: string | null;
  status?: string | null;
  createdAt?: string;
  notes?: string | null;
  assignments?: Array<{
    claimedAt?: string | null;
    user?: { name?: string | null; email?: string | null } | null;
  }>;

  appointments?: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    closer?: { id: string; name?: string | null; email?: string | null } | null;
  }>;
};

type DialerRow = { id: string; name: string | null; email: string; role: string };

type LeadsResponse = { leads?: LeadRow[]; error?: string };

type BulkResponse = {
  ok?: boolean;
  error?: string;
  action?: "delete" | "unassign" | "reassign";
  updated?: number;
  deleted?: number;
};

type CloserOption = {
  id: string;
  name: string | null;
  email: string;
  isAvailable?: boolean;
  hasCoverage?: boolean;
  hasConflict?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getApiError(body: unknown): string | undefined {
  const obj = asRecord(body);
  return typeof obj.error === "string" ? obj.error : undefined;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });

  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err = data as unknown as { error?: string };
    throw new Error(err?.error || `Request failed (${res.status})`);
  }

  return data;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-4 w-4 animate-spin"}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export default function ManagerLeadsClient({
  initialLeads,
  dialers,
}: {
  initialLeads: LeadRow[];
  dialers: DialerRow[];
}) {
  const toast = useToast();
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads ?? []);
  const [q, setQ] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [selectedLeadIds, setSelectedLeadIds] = useState<Record<string, boolean>>({});
  const [bulkWorking, setBulkWorking] = useState<"delete" | "unassign" | "reassign" | null>(null);
  const [reassignUserId, setReassignUserId] = useState<string>("");

  const [closerOptionsByLeadId, setCloserOptionsByLeadId] = useState<Record<string, CloserOption[]>>(
    {},
  );
  const [showUnavailableClosersByLeadId, setShowUnavailableClosersByLeadId] = useState<Record<string, boolean>>(
    {},
  );
  const [overrideAvailabilityByLeadId, setOverrideAvailabilityByLeadId] = useState<Record<string, boolean>>(
    {},
  );
  const [closerSelectionByLeadId, setCloserSelectionByLeadId] = useState<Record<string, string>>(
    {},
  );
  const [closerWorkingLeadId, setCloserWorkingLeadId] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.keys(selectedLeadIds).filter((id) => selectedLeadIds[id]),
    [selectedLeadIds],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return leads;
    return leads.filter((l) => {
      const assignment = l.assignments?.[0] ?? null;
      const assignedUser = assignment?.user ?? null;
      const hay = [
        l.businessName,
        l.phone,
        l.contactName ?? "",
        l.contactEmail ?? "",
        l.contactPhone ?? "",
        l.interestedService ?? "",
        l.source ?? "",
        l.niche ?? "",
        l.location ?? "",
        l.status ?? "",
        assignedUser?.name ?? "",
        assignedUser?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [leads, q]);

  const refresh = useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      const res = await jsonFetch<LeadsResponse>(`/api/manager/leads?take=200&ts=${Date.now()}`);
      setLeads(res.leads ?? []);
      setSelectedLeadIds({});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to refresh leads";
      setError(msg);
    }
  }, []);

  const toggleAll = useCallback(() => {
    if (filtered.length === 0) return;
    const anyUnselected = filtered.some((l) => !selectedLeadIds[l.id]);
    if (anyUnselected) {
      const next: Record<string, boolean> = { ...selectedLeadIds };
      for (const l of filtered) next[l.id] = true;
      setSelectedLeadIds(next);
    } else {
      const next: Record<string, boolean> = { ...selectedLeadIds };
      for (const l of filtered) delete next[l.id];
      setSelectedLeadIds(next);
    }
  }, [filtered, selectedLeadIds]);

  const runBulk = useCallback(
    async (action: "delete" | "unassign" | "reassign") => {
      const ids = selectedIds;
      if (ids.length === 0) return;

      if (action === "delete") {
        const ok = window.confirm(
          `Delete ${ids.length} lead(s)? This permanently removes leads and related records (appointments, call logs, docs).`,
        );
        if (!ok) return;
      }

      if (action === "reassign" && !reassignUserId) {
        setError("Select a dialer to reassign to first.");
        return;
      }

      setError(null);
      setStatus(null);
      setBulkWorking(action);

      try {
        const res = await fetch("/api/manager/leads/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            leadIds: ids,
            assigneeId: action === "reassign" ? reassignUserId : undefined,
            confirm: action === "delete" ? true : undefined,
          }),
        });

        const body = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok) {
          setError(getApiError(body) ?? "Bulk action failed");
          return;
        }

        const parsed = body as BulkResponse;
        if (action === "delete") {
          setStatus(`Deleted ${parsed.deleted ?? ids.length} lead(s).`);
        } else {
          setStatus(`Updated ${parsed.updated ?? ids.length} lead(s).`);
        }

        await refresh();
      } finally {
        setBulkWorking(null);
      }
    },
    [refresh, reassignUserId, selectedIds],
  );

  const loadAvailableClosersForLead = useCallback(async (lead: LeadRow) => {
    const appt = lead.appointments?.[0] ?? null;
    if (!appt) {
      setError("This lead has no scheduled call to assign.");
      return;
    }

    const startAt = new Date(appt.startAt);
    const endAt = new Date(appt.endAt);
    const durationMinutes = Math.max(10, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));

    setCloserWorkingLeadId(lead.id);
    setError(null);
    setStatus(null);

    try {
      const includeUnavailable = Boolean(showUnavailableClosersByLeadId[lead.id]);
      const qs = new URLSearchParams({
        startAt: appt.startAt,
        durationMinutes: String(durationMinutes),
        excludeAppointmentId: appt.id,
        includeUnavailable: includeUnavailable ? "true" : "false",
      });

      const res = await jsonFetch<{ closers?: CloserOption[] }>(
        `/api/appointments/available-closers?${qs.toString()}`,
      );
      const options = res.closers ?? [];
      setCloserOptionsByLeadId((prev) => ({ ...prev, [lead.id]: options }));

      if (!closerSelectionByLeadId[lead.id] && options.length) {
        setCloserSelectionByLeadId((prev) => ({ ...prev, [lead.id]: options[0]!.id }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load available closers";
      setError(msg);
    } finally {
      setCloserWorkingLeadId(null);
    }
  }, [closerSelectionByLeadId, showUnavailableClosersByLeadId]);

  const assignCloserForLead = useCallback(
    async (lead: LeadRow) => {
      const appt = lead.appointments?.[0] ?? null;
      if (!appt) {
        setError("This lead has no scheduled call to assign.");
        return;
      }

      const closerId = closerSelectionByLeadId[lead.id];
      if (!closerId) {
        setError("Pick a closer first.");
        return;
      }

      const options = closerOptionsByLeadId[lead.id] ?? [];
      const selected = options.find((o) => o.id === closerId) ?? null;
      const override = Boolean(overrideAvailabilityByLeadId[lead.id]);
      const isAvailable = selected?.isAvailable;
      if (isAvailable === false && !override) {
        setError("That closer is unavailable at the selected time. Enable override or pick another closer/time.");
        return;
      }

      const startAt = new Date(appt.startAt);
      const endAt = new Date(appt.endAt);
      const durationMinutes = Math.max(10, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));

      setCloserWorkingLeadId(lead.id);
      setError(null);
      setStatus(null);

      try {
        const res = await fetch("/api/appointments/reschedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            appointmentId: appt.id,
            startAt: appt.startAt,
            durationMinutes,
            closerId,
            confirmAddAvailability: override ? true : undefined,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok) {
          setError(getApiError(body) ?? "Failed to assign closer");
          return;
        }

        setStatus("Assigned closer.");
        await refresh();
      } finally {
        setCloserWorkingLeadId(null);
      }
    },
    [closerOptionsByLeadId, closerSelectionByLeadId, overrideAvailabilityByLeadId, refresh],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">All leads</h1>
            <p className="mt-2 text-sm text-zinc-600">Select leads to delete, unassign, or reassign.</p>
          </div>
          <button
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
            type="button"
            onClick={() => refresh()}
          >
            Refresh
          </button>
        </div>

        {status ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-zinc-700">Search</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Business, phone, source, assigned user…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">Reassign to dialer</label>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              value={reassignUserId}
              onChange={(e) => setReassignUserId(e.target.value)}
            >
              <option value="">Select a dialer…</option>
              {dialers.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.name ?? "(no name)") + " — " + u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            type="button"
            onClick={toggleAll}
            disabled={filtered.length === 0}
          >
            Select all / none
          </button>

          <button
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
            type="button"
            onClick={() => runBulk("unassign")}
            disabled={bulkWorking !== null || selectedIds.length === 0}
          >
            {bulkWorking === "unassign" ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Unassigning…
              </span>
            ) : (
              `Unassign (${selectedIds.length})`
            )}
          </button>

          <button
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
            type="button"
            onClick={() => runBulk("reassign")}
            disabled={bulkWorking !== null || selectedIds.length === 0 || !reassignUserId}
          >
            {bulkWorking === "reassign" ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Reassigning…
              </span>
            ) : (
              `Reassign (${selectedIds.length})`
            )}
          </button>

          <button
            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
            type="button"
            onClick={() => runBulk("delete")}
            disabled={bulkWorking !== null || selectedIds.length === 0}
          >
            {bulkWorking === "delete" ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Deleting…
              </span>
            ) : (
              `Delete (${selectedIds.length})`
            )}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {filtered.map((l) => {
            const assignment = l.assignments?.[0] ?? null;
            const assignedUser = assignment?.user ?? null;
            const appt = l.appointments?.[0] ?? null;
            const closerOptions = closerOptionsByLeadId[l.id] ?? null;
            const selectedCloserId = closerSelectionByLeadId[l.id] ?? "";
            const showUnavailable = Boolean(showUnavailableClosersByLeadId[l.id]);
            const overrideAvailability = Boolean(overrideAvailabilityByLeadId[l.id]);

            return (
              <div key={l.id} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                    checked={Boolean(selectedLeadIds[l.id])}
                    onChange={(e) =>
                      setSelectedLeadIds((prev) => ({ ...prev, [l.id]: e.target.checked }))
                    }
                    aria-label={`Select ${l.businessName}`}
                  />

                  <div className="flex flex-1 flex-col justify-between gap-2 sm:flex-row">
                    <div>
                      <div className="text-sm font-semibold text-brand-ink">{l.businessName}</div>
                      <div className="mt-1 text-xs text-zinc-600">{l.phone}</div>
                      {[l.contactName, l.contactEmail, l.contactPhone].some(Boolean) ? (
                        <div className="mt-1 text-xs text-zinc-600">
                          Contact: {[l.contactName, l.contactEmail, l.contactPhone].filter(Boolean).join(" • ")}
                        </div>
                      ) : null}
                      {l.interestedService ? (
                        <div className="mt-1 text-xs text-zinc-600">Interested in: {l.interestedService}</div>
                      ) : null}
                      {l.source ? <div className="mt-1 text-xs text-zinc-600">Source: {l.source}</div> : null}
                      <div className="mt-1 text-xs text-zinc-600">
                        {(l.niche ?? "") + (l.niche && l.location ? " • " : "") + (l.location ?? "")}
                      </div>

                      {appt ? (
                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-medium text-zinc-900">Booked call</div>
                          <div className="mt-1 text-xs text-zinc-700">
                            {new Date(appt.startAt).toLocaleString()} ({appt.status})
                          </div>
                          <div className="mt-1 text-xs text-zinc-700">
                            Current closer: {appt.closer?.name ?? "(unknown)"}
                            {appt.closer?.email ? ` (${appt.closer.email})` : ""}
                          </div>

                          <div className="mt-3 flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-xs text-zinc-700">
                              <input
                                type="checkbox"
                                checked={showUnavailable}
                                onChange={(e) =>
                                  setShowUnavailableClosersByLeadId((prev) => ({
                                    ...prev,
                                    [l.id]: e.target.checked,
                                  }))
                                }
                              />
                              Show unavailable closers too
                            </label>

                            <button
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50 disabled:opacity-60"
                              type="button"
                              onClick={() => loadAvailableClosersForLead(l)}
                              disabled={closerWorkingLeadId === l.id}
                            >
                              {closerWorkingLeadId === l.id ? "Loading…" : "Load available closers"}
                            </button>

                            {closerOptions ? (
                              closerOptions.length ? (
                                <div className="flex flex-col gap-2">
                                  <select
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-400"
                                    value={selectedCloserId}
                                    onChange={(e) =>
                                      setCloserSelectionByLeadId((prev) => ({
                                        ...prev,
                                        [l.id]: e.target.value,
                                      }))
                                    }
                                  >
                                    {closerOptions.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {(c.name ?? "(no name)") + " — " + c.email + (c.isAvailable === false ? " (unavailable)" : "")}
                                      </option>
                                    ))}
                                  </select>

                                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                                    <input
                                      type="checkbox"
                                      checked={overrideAvailability}
                                      onChange={(e) =>
                                        setOverrideAvailabilityByLeadId((prev) => ({
                                          ...prev,
                                          [l.id]: e.target.checked,
                                        }))
                                      }
                                    />
                                    Override availability (adds a closer availability block)
                                  </label>

                                  <button
                                    className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                                    type="button"
                                    onClick={() => assignCloserForLead(l)}
                                    disabled={closerWorkingLeadId === l.id || !selectedCloserId}
                                  >
                                    {closerWorkingLeadId === l.id ? "Assigning…" : "Assign closer"}
                                  </button>
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-500">
                                  No closers available at that time.
                                </div>
                              )
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="text-xs text-zinc-600">
                      <div>Status: {l.status ?? ""}</div>
                      <div className="mt-1">
                        {assignedUser
                          ? `Dialer assigned: ${assignedUser.name ?? "(no name)"} (${assignedUser.email ?? ""})`
                          : "Dialer assigned: (unassigned)"}
                      </div>
                      {assignment?.claimedAt ? (
                        <div className="mt-1">Claimed: {new Date(assignment.claimedAt).toLocaleString()}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              No leads found.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
