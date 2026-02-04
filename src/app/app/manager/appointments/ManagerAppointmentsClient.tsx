"use client";

import { useEffect, useMemo, useState } from "react";

type CloserOption = { id: string; name: string | null; email: string };

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ManagerAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  loomUrl?: string | null;
  lead: { id: string; businessName: string; phone: string; interestedService?: string | null };
  setter: { name: string; email: string };
  closer?: { name: string; email: string } | null;
  outcome?: { outcome: string; notes?: string | null; revenueCents?: number | null } | null;
  video?: { filePath: string; mimeType: string; fileSize: number; createdAt: string } | null;
};

export default function ManagerAppointmentsClient({
  initialAppointments,
}: {
  initialAppointments: ManagerAppointment[];
}) {
  const [appointments, setAppointments] = useState<ManagerAppointment[]>(initialAppointments ?? []);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartLocal, setEditStartLocal] = useState<string>("");
  const [editDuration, setEditDuration] = useState<number>(30);
  const [editClosers, setEditClosers] = useState<CloserOption[] | null>(null);
  const [editCloserId, setEditCloserId] = useState<string>("");
  const [editBusy, setEditBusy] = useState<boolean>(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  const [q, setQ] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ANY" | "SCHEDULED" | "COMPLETED">("ANY");

  async function refresh() {
    try {
      const res = await fetch("/api/appointments/my");
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        setError("Appointments request did not return JSON (likely redirected to login). Please refresh the page and sign in again.");
        return;
      }
      type AppointmentsResponse = { appointments?: ManagerAppointment[]; error?: string };
      const body = (await res.json().catch(() => ({}))) as AppointmentsResponse;
      if (!res.ok) {
        setError(body?.error ?? `Failed to load appointments (${res.status})`);
        return;
      }
      setAppointments(body?.appointments ?? []);
      setError(null);
    } catch {
      setError("Could not load appointments. Is the dev server running?");
    }
  }

  useEffect(() => {
    if (!initialAppointments?.length) {
      refresh().catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== "ANY" && a.status !== statusFilter) return false;
      if (!query) return true;
      const hay = [
        a.lead.businessName,
        a.lead.phone,
        a.lead.interestedService ?? "",
        a.setter.name,
        a.setter.email,
        a.closer?.name ?? "",
        a.closer?.email ?? "",
        a.outcome?.outcome ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [appointments, q, statusFilter]);

  async function loadAvailableClosers(appt: ManagerAppointment, startIso: string, durationMinutes: number) {
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

  async function beginEdit(appt: ManagerAppointment) {
    setEditMsg(null);
    setError(null);
    setEditingId(appt.id);
    setEditStartLocal(toDatetimeLocalValue(appt.startAt));
    const dur = Math.max(10, Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60_000));
    setEditDuration(dur);
    setEditCloserId("");
    setEditClosers(null);
  }

  async function checkClosersForCurrentEdit(appt: ManagerAppointment) {
    const startIso = new Date(editStartLocal).toISOString();
    const closers = await loadAvailableClosers(appt, startIso, editDuration);
    setEditClosers(closers);
    if (closers.length && !editCloserId) {
      setEditCloserId(closers[0]!.id);
    }
  }

  async function saveEdit(appt: ManagerAppointment) {
    setEditBusy(true);
    setEditMsg(null);
    setError(null);
    try {
      const startAt = new Date(editStartLocal);
      if (Number.isNaN(startAt.getTime())) {
        setError("Invalid date/time");
        return;
      }

      const payload: Record<string, unknown> = {
        appointmentId: appt.id,
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
        setError(body?.error ?? "Failed to reschedule");
        return;
      }

      setEditMsg("Updated appointment.");
      setEditingId(null);
      await refresh();
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-semibold">All appointments</h1>
          <p className="mt-1 text-sm text-zinc-600">System-wide view for managers/admins.</p>
        </div>
        <button
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
          type="button"
          onClick={() => refresh()}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-zinc-700">Search</label>
          <input
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Business, phone, setter, closer, outcome…"
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
      </div>

      <div className="mt-6 space-y-2">
        {filtered.map((a) => (
          <div
            key={a.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold">{a.lead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-600">{a.lead.phone}</div>
                {a.lead.interestedService ? (
                  <div className="mt-1 text-xs text-zinc-600">
                    Interested in: {a.lead.interestedService}
                  </div>
                ) : null}
                <div className="mt-1 text-xs text-zinc-600">
                  {new Date(a.startAt).toLocaleString()} • {a.status}
                  {a.outcome?.outcome ? ` • ${a.outcome.outcome}` : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-600">Setter: {a.setter.name}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Closer: {a.closer?.name ?? "Unassigned"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {a.loomUrl ? (
                  <a
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                    href={a.loomUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Loom
                  </a>
                ) : null}

                {a.video?.filePath ? (
                  <a
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                    href={a.video.filePath}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Video
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <button
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                type="button"
                onClick={() => beginEdit(a)}
              >
                Reschedule / Reassign closer
              </button>

              {editingId === a.id ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
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

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-zinc-700">Optional: pick a closer</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={editCloserId}
                        onChange={(e) => setEditCloserId(e.target.value)}
                      >
                        <option value="">Keep current closer</option>
                        {(editClosers ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {(c.name ?? "(no name)") + " — " + c.email}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-xs text-zinc-500">
                        Click “Check closers” to load only closers who are free for the selected time.
                      </div>
                    </div>
                    <button
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                      type="button"
                      disabled={editBusy}
                      onClick={() => checkClosersForCurrentEdit(a)}
                    >
                      Check closers
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                      type="button"
                      disabled={editBusy}
                      onClick={() => saveEdit(a)}
                    >
                      {editBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                      type="button"
                      disabled={editBusy}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>

                  {editMsg ? (
                    <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {editMsg}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {a.outcome?.notes ? (
              <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{a.outcome.notes}</div>
            ) : null}
          </div>
        ))}

        {appointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
            No appointments found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
