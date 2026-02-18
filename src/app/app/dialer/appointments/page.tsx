"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type CloserOption = { id: string; name: string | null; email: string };

type SuggestionSlot = { startAt: string; endAt: string; closerCount: number };

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  lead: { businessName: string; phone: string; niche?: string | null; location?: string | null };
  closer: { name: string; email: string };
  outcome?: { outcome: string; revenueCents?: number | null; notes?: string | null } | null;
};

export default function DialerAppointmentsPage() {
  const toast = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartLocal, setEditStartLocal] = useState<string>("");
  const [editDuration, setEditDuration] = useState<number>(30);
  const [editClosers, setEditClosers] = useState<CloserOption[] | null>(null);
  const [editCloserId, setEditCloserId] = useState<string>("");
  const [editBusy, setEditBusy] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (editError) toast.error(editError);
  }, [editError, toast]);

  const [suggestBusy, setSuggestBusy] = useState<boolean>(false);
  const [suggestIncludeUnavailable, setSuggestIncludeUnavailable] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SuggestionSlot[] | null>(null);

  const [leadSearch, setLeadSearch] = useState<string>("");

  const [statusFilter, setStatusFilter] = useState<"ANY" | "SCHEDULED" | "COMPLETED">(
    "ANY",
  );
  const [outcomeFilter, setOutcomeFilter] = useState<
    "ANY" | "NONE" | "CLOSED" | "FOLLOW_UP" | "LOST"
  >("ANY");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  async function refresh() {
    const res = await fetch("/api/appointments/my");
    const body = await res.json();
    setAppointments(body.appointments ?? []);
  }

  async function loadAvailableClosers(appt: Appointment, startIso: string, durationMinutes: number) {
    const qs = new URLSearchParams({
      startAt: startIso,
      durationMinutes: String(durationMinutes),
      excludeAppointmentId: appt.id,
    });
    const res = await fetch(`/api/appointments/available-closers?${qs.toString()}`);
    const body = (await res.json().catch(() => ({}))) as { closers?: CloserOption[]; error?: string };
    if (!res.ok) throw new Error(body?.error ?? "Failed to load available closers");
    return body.closers ?? [];
  }

  function beginEdit(a: Appointment) {
    setEditError(null);
    setEditingId(a.id);
    setEditStartLocal(toDatetimeLocalValue(a.startAt));
    const dur = Math.max(10, Math.round((new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60_000));
    setEditDuration(dur);
    setEditClosers(null);
    setEditCloserId("");
    setSuggestions(null);
  }

  async function loadSuggestions() {
    setEditError(null);
    const startAt = new Date(editStartLocal);
    if (Number.isNaN(startAt.getTime())) {
      setEditError("Invalid date/time");
      return;
    }

    setSuggestBusy(true);
    try {
      const qs = new URLSearchParams({
        startAt: startAt.toISOString(),
        days: "7",
        durationMinutes: String(editDuration),
        limit: "18",
        includeUnavailable: suggestIncludeUnavailable ? "true" : "false",
      });
      const res = await fetch(`/api/appointments/suggestions?${qs.toString()}`);
      const body = (await res.json().catch(() => ({}))) as { slots?: SuggestionSlot[]; error?: string };
      if (!res.ok) {
        setEditError(body?.error ?? "Failed to load suggestions");
        return;
      }
      setSuggestions(body.slots ?? []);
    } finally {
      setSuggestBusy(false);
    }
  }

  async function checkClosers(a: Appointment) {
    setEditError(null);
    const startAt = new Date(editStartLocal);
    if (Number.isNaN(startAt.getTime())) {
      setEditError("Invalid date/time");
      return;
    }
    try {
      const closers = await loadAvailableClosers(a, startAt.toISOString(), editDuration);
      setEditClosers(closers);
      if (closers.length && !editCloserId) setEditCloserId(closers[0]!.id);
      if (closers.length === 0) setEditError("No closers are available at that time. Pick another time.");
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to load available closers");
    }
  }

  async function saveEdit(a: Appointment) {
    setEditBusy(true);
    setEditError(null);
    try {
      const startAt = new Date(editStartLocal);
      if (Number.isNaN(startAt.getTime())) {
        setEditError("Invalid date/time");
        return;
      }

      const payload: Record<string, unknown> = {
        appointmentId: a.id,
        startAt: startAt.toISOString(),
        durationMinutes: editDuration,
      };
      if (editCloserId) payload.closerId = editCloserId;

      const res = await fetch("/api/appointments/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEditError(body?.error ?? "Failed to reschedule");
        return;
      }

      setEditingId(null);
      await refresh();
    } finally {
      setEditBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to = toDate ? new Date(toDate + "T23:59:59") : null;
    const q = leadSearch.trim().toLowerCase();

    return appointments.filter((a) => {
      if (q) {
        const hay = [
          a.lead.businessName,
          a.lead.phone,
          a.lead.niche ?? "",
          a.lead.location ?? "",
          a.closer.name,
          a.closer.email,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const when = new Date(a.startAt);
      if (from && when < from) return false;
      if (to && when > to) return false;

      if (statusFilter !== "ANY" && a.status !== statusFilter) return false;

      const o = a.outcome?.outcome ?? null;
      if (outcomeFilter === "NONE") return !o;
      if (outcomeFilter !== "ANY" && o !== outcomeFilter) return false;

      return true;
    });
  }, [appointments, fromDate, leadSearch, outcomeFilter, statusFilter, toDate]);

  function outcomeAccent(a: Appointment) {
    const o = a.outcome?.outcome;
    if (o === "CLOSED") return "border-l-4 border-l-emerald-500";
    if (o === "FOLLOW_UP") return "border-l-4 border-l-amber-400";
    if (o === "LOST") return "border-l-4 border-l-[color:var(--color-brand-pink)]";
    if (a.status === "SCHEDULED") return "border-l-4 border-l-[color:var(--color-brand-blue)]";
    return "border-l-4 border-l-zinc-200";
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My appointments</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Everything you booked + closer outcomes.
            </p>
          </div>
          <button
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => refresh()}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 p-4 lg:col-span-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-4">
                <label className="text-xs font-medium text-zinc-700">Search</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Business name, phone, niche, location, closer…"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Status</label>
                <select
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "ANY" | "SCHEDULED" | "COMPLETED")
                  }
                >
                  <option value="ANY">Any</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Outcome</label>
                <select
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={outcomeFilter}
                  onChange={(e) =>
                    setOutcomeFilter(
                      e.target.value as "ANY" | "NONE" | "CLOSED" | "FOLLOW_UP" | "LOST",
                    )
                  }
                >
                  <option value="ANY">Any</option>
                  <option value="NONE">No outcome yet</option>
                  <option value="CLOSED">Closed</option>
                  <option value="FOLLOW_UP">Follow up</option>
                  <option value="LOST">Lost</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">From</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">To</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="mb-2 text-xs text-zinc-600">
              Showing {filtered.length} of {appointments.length}
            </div>
            <div className="space-y-3">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-2xl border border-zinc-200 p-4 ${outcomeAccent(a)}`}
                >
              <div className="flex flex-col justify-between gap-2 sm:flex-row">
                <div>
                  <div className="text-sm font-semibold">{a.lead.businessName}</div>
                  <div className="mt-1 text-xs text-zinc-600">{a.lead.phone}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {[a.lead.niche, a.lead.location].filter(Boolean).join(" • ")}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {new Date(a.startAt).toLocaleString()} ({a.status})
                  </div>
                </div>
                <div className="text-xs text-zinc-600">
                  <div>Closer: {a.closer.name}</div>
                  <div>{a.closer.email}</div>
                </div>
              </div>

              {a.outcome ? (
                <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm">
                  <div className="font-medium">Outcome: {a.outcome.outcome}</div>
                  {typeof a.outcome.revenueCents === "number" ? (
                    <div className="text-zinc-600">
                      Revenue: ${(a.outcome.revenueCents / 100).toFixed(2)}
                    </div>
                  ) : null}
                  {a.outcome.notes ? (
                    <div className="mt-1 whitespace-pre-wrap text-zinc-600">{a.outcome.notes}</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-zinc-500">No outcome yet.</div>
              )}

              <div className="mt-3">
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50"
                  type="button"
                  onClick={() => beginEdit(a)}
                >
                  Reschedule
                </button>

                {editingId === a.id ? (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-xs font-medium text-zinc-900">Suggested times</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {suggestIncludeUnavailable
                              ? "Showing all times (including unavailable)."
                              : "Showing only times with at least one available closer."}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="flex items-center gap-2 text-xs text-zinc-700">
                            <input
                              type="checkbox"
                              checked={suggestIncludeUnavailable}
                              onChange={(e) => setSuggestIncludeUnavailable(e.target.checked)}
                            />
                            Show unavailable times
                          </label>
                          <button
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50 disabled:opacity-60"
                            type="button"
                            disabled={suggestBusy || editBusy}
                            onClick={() => loadSuggestions()}
                          >
                            {suggestBusy ? "Loading…" : "Suggest times"}
                          </button>
                        </div>
                      </div>

                      {suggestions ? (
                        suggestions.length ? (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {suggestions.map((s) => {
                              const label = `${new Date(s.startAt).toLocaleString()} (${s.closerCount} closer${s.closerCount === 1 ? "" : "s"} free)`;
                              return (
                                <button
                                  key={s.startAt}
                                  type="button"
                                  className={`rounded-xl border px-3 py-2 text-left text-xs hover:bg-zinc-50 ${
                                    s.closerCount > 0
                                      ? "border-zinc-200 bg-white"
                                      : "border-amber-200 bg-amber-50"
                                  }`}
                                  onClick={() => setEditStartLocal(toDatetimeLocalValue(s.startAt))}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-zinc-500">No suggestions found.</div>
                        )
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-zinc-700">New start time</label>
                        <input
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          type="datetime-local"
                          value={editStartLocal}
                          onChange={(e) => setEditStartLocal(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-700">Duration (min)</label>
                        <input
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          type="number"
                          min={10}
                          max={180}
                          value={editDuration}
                          onChange={(e) => setEditDuration(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs font-medium text-zinc-700">Optional: pick a closer</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={editCloserId}
                        onChange={(e) => setEditCloserId(e.target.value)}
                      >
                        <option value="">Keep current closer</option>
                        {(editClosers ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {(c.name ?? "(no name)") + " - " + c.email}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-xs text-zinc-500">
                        Click “Check closers” to load only closers who are free for the selected time.
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50 disabled:opacity-60"
                        type="button"
                        disabled={editBusy}
                        onClick={() => checkClosers(a)}
                      >
                        Check closers
                      </button>
                      <button
                        className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                        type="button"
                        disabled={editBusy}
                        onClick={() => saveEdit(a)}
                      >
                        {editBusy ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50 disabled:opacity-60"
                        type="button"
                        disabled={editBusy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>

                  </div>
                ) : null}
              </div>
                </div>
              ))}

            {appointments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              No appointments yet.
            </div>
          ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
