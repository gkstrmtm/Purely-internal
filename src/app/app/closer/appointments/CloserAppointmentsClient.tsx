"use client";

import { useEffect, useMemo, useState } from "react";

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type DocDTO = { id: string; title?: string | null; content?: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getApiError(body: unknown): string | undefined {
  const obj = asRecord(body);
  return typeof obj.error === "string" ? obj.error : undefined;
}

function parseDoc(value: unknown): DocDTO | null {
  const obj = asRecord(value);
  const id = obj.id;
  if (typeof id !== "string") return null;

  const contentValue = obj.content;
  const titleValue = obj.title;

  const content =
    typeof contentValue === "string" || contentValue === null ? contentValue : undefined;
  const title = typeof titleValue === "string" || titleValue === null ? titleValue : undefined;

  return { id, content, title };
}

function getDocFromBody(body: unknown): DocDTO | null {
  const obj = asRecord(body);
  return parseDoc(obj.doc);
}

export type CloserAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  loomUrl?: string | null;
  lead: {
    id: string;
    businessName: string;
    phone: string;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    interestedService?: string | null;
    source?: string | null;
    niche?: string | null;
    location?: string | null;
    website?: string | null;
  };
  setter: { name: string; email: string };
  prepDoc?: { id: string; title: string; content: string; kind: string } | null;
  outcome?: { outcome: string; notes?: string | null } | null;
  video?: { filePath: string; mimeType: string; fileSize: number; createdAt: string } | null;
};

export default function CloserAppointmentsClient({
  initialAppointments,
}: {
  initialAppointments: CloserAppointment[];
}) {
  const [appointments, setAppointments] = useState<CloserAppointment[]>(initialAppointments ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState<boolean>(false);
  const [rescheduleStartLocal, setRescheduleStartLocal] = useState<string>("");
  const [rescheduleDurationMinutes, setRescheduleDurationMinutes] = useState<number>(30);
  const [rescheduleConfirmAddAvailability, setRescheduleConfirmAddAvailability] =
    useState<boolean>(false);
  const [rescheduleBusy, setRescheduleBusy] = useState<boolean>(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const [leadSearch, setLeadSearch] = useState<string>("");

  const [statusFilter, setStatusFilter] = useState<"ANY" | "SCHEDULED" | "COMPLETED">("ANY");
  const [outcomeFilter, setOutcomeFilter] = useState<
    "ANY" | "NONE" | "CLOSED" | "FOLLOW_UP" | "LOST"
  >("ANY");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [outcome, setOutcome] = useState<"CLOSED" | "FOLLOW_UP" | "LOST">("CLOSED");
  const [notes, setNotes] = useState("");
  const [loomUrl, setLoomUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState<boolean>(false);

  const [setupFeeDollars, setSetupFeeDollars] = useState<number>(0);
  const [monthlyFeeDollars, setMonthlyFeeDollars] = useState<number>(0);
  const [termMonths, setTermMonths] = useState<number>(3);
  const [clientEmail, setClientEmail] = useState<string>("");
  const [servicesOther, setServicesOther] = useState<string>("");
  const [terms, setTerms] = useState<string>("Net 7. Cancel anytime with 30 days notice.");
  const [servicesSelected, setServicesSelected] = useState<Record<string, boolean>>({
    "Outbound appointment setting": true,
    "Inbound call handling": false,
    "Follow-up SMS": false,
    "Email nurturing": false,
    "CRM setup": false,
    "Reporting dashboard": true,
  });

  const [prepDraft, setPrepDraft] = useState<string>("");
  const [prepBusy, setPrepBusy] = useState<boolean>(false);

  const [closerScriptDoc, setCloserScriptDoc] = useState<DocDTO | null>(null);
  const [closerScriptDraft, setCloserScriptDraft] = useState<string>("");
  const [closerScriptTone, setCloserScriptTone] = useState<string>(
    "consultative, calm, confident",
  );
  const [closerScriptTweak, setCloserScriptTweak] = useState<string>("");
  const [scriptBusy, setScriptBusy] = useState<boolean>(false);

  const selected = appointments.find((a) => a.id === selectedId) ?? null;
  const selectedPrepContent = selected?.prepDoc?.content ?? "";

  function beginReschedule() {
    if (!selected) return;
    setRescheduleError(null);
    setRescheduleOpen(true);
    setRescheduleStartLocal(toDatetimeLocalValue(selected.startAt));
    const dur = Math.max(
      10,
      Math.round(
        (new Date(selected.endAt).getTime() - new Date(selected.startAt).getTime()) / 60000,
      ),
    );
    setRescheduleDurationMinutes(dur);
    setRescheduleConfirmAddAvailability(false);
  }

  async function saveReschedule() {
    if (!selected) return;
    setRescheduleBusy(true);
    setRescheduleError(null);
    setError(null);
    setStatus(null);

    try {
      const startAt = new Date(rescheduleStartLocal);
      if (Number.isNaN(startAt.getTime())) {
        setRescheduleError("Invalid date/time");
        return;
      }

      const payload: Record<string, unknown> = {
        appointmentId: selected.id,
        startAt: startAt.toISOString(),
        durationMinutes: rescheduleDurationMinutes,
      };
      if (rescheduleConfirmAddAvailability) payload.confirmAddAvailability = true;

      const res = await fetch("/api/appointments/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) {
        setRescheduleError(getApiError(body) ?? "Failed to reschedule");
        return;
      }

      setRescheduleOpen(false);
      await refresh();
    } finally {
      setRescheduleBusy(false);
    }
  }

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
          a.setter.name,
          a.setter.email,
          a.status,
          a.outcome?.outcome ?? "",
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

  function outcomeAccent(a: CloserAppointment) {
    const o = a.outcome?.outcome;
    if (o === "CLOSED") return "border-l-4 border-l-emerald-500";
    if (o === "FOLLOW_UP") return "border-l-4 border-l-amber-400";
    if (o === "LOST") return "border-l-4 border-l-[color:var(--color-brand-pink)]";
    if (a.status === "SCHEDULED") return "border-l-4 border-l-[color:var(--color-brand-blue)]";
    return "border-l-4 border-l-zinc-200";
  }

  async function refresh() {
    try {
      const res = await fetch("/api/appointments/my");
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        setError("Appointments request did not return JSON (likely redirected to login). Please refresh the page and sign in again.");
        return;
      }
      type AppointmentsResponse = { appointments?: CloserAppointment[]; error?: string };
      const body = (await res.json().catch(() => ({}))) as AppointmentsResponse;
      if (!res.ok) {
        setError(body?.error ?? `Failed to load appointments (${res.status})`);
        return;
      }
      setAppointments(body?.appointments ?? []);
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

  useEffect(() => {
    setStatus(null);
    setError(null);
    setRescheduleOpen(false);
    setRescheduleError(null);
    setPrepDraft(selectedPrepContent);

    setCloserScriptDoc(null);
    setCloserScriptDraft("");
    setCloserScriptTweak("");

    const current = appointments.find((a) => a.id === selectedId) ?? null;
    const existingOutcome = current?.outcome?.outcome;

    if (
      existingOutcome === "CLOSED" ||
      existingOutcome === "FOLLOW_UP" ||
      existingOutcome === "LOST"
    ) {
      setOutcome(existingOutcome);
    } else {
      setOutcome("CLOSED");
    }

    setNotes(current?.outcome?.notes ?? "");
    setLoomUrl(current?.loomUrl ?? "");

    setSetupFeeDollars(0);
    setMonthlyFeeDollars(0);
    setTermMonths(3);
    setClientEmail("");
    setServicesOther("");
    setTerms("Net 7. Cancel anytime with 30 days notice.");
    setServicesSelected({
      "Outbound appointment setting": true,
      "Inbound call handling": false,
      "Follow-up SMS": false,
      "Email nurturing": false,
      "CRM setup": false,
      "Reporting dashboard": true,
    });
  }, [appointments, selectedId, selectedPrepContent]);

  useEffect(() => {
    async function load() {
      if (!selected?.lead?.id) return;

      const res = await fetch(`/api/leads/closer-script?leadId=${selected.lead.id}`);
      const body = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) return;
      const doc = getDocFromBody(body);
      if (!doc) return;
      setCloserScriptDoc(doc);
      setCloserScriptDraft(doc.content ?? "");
    }

    load().catch(() => null);
  }, [selected?.id, selected?.lead?.id]);

  async function uploadAppointmentVideo(file: File) {
    if (!selected) return;
    setError(null);
    setStatus(null);
    setVideoBusy(true);

    try {
      const fd = new FormData();
      fd.set("file", file);

      const up = await fetch("/api/uploads", { method: "POST", body: fd });
      const upBody = (await up.json().catch(() => ({}))) as unknown;
      if (!up.ok) {
        setError(getApiError(upBody) ?? "Upload failed");
        return;
      }

      const upObj = asRecord(upBody);
      const url = typeof upObj.url === "string" ? upObj.url : null;
      if (!url) {
        setError("Upload succeeded but returned no URL");
        return;
      }

      const attach = await fetch("/api/appointments/attach-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appointmentId: selected.id,
          url,
          mimeType: typeof upObj.mimeType === "string" ? upObj.mimeType : undefined,
          fileSize: typeof upObj.fileSize === "number" ? upObj.fileSize : undefined,
        }),
      });
      const attachBody = (await attach.json().catch(() => ({}))) as unknown;
      if (!attach.ok) {
        setError(getApiError(attachBody) ?? "Failed to attach video");
        return;
      }

      setStatus("Uploaded video");
      await refresh();
    } finally {
      setVideoBusy(false);
    }
  }

  async function saveCloserScript() {
    if (!selected?.lead?.id) return;
    setError(null);
    setStatus(null);
    setScriptBusy(true);

    try {
      if (closerScriptDoc?.id) {
        const res = await fetch(`/api/docs/${closerScriptDoc.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: closerScriptDraft }),
        });
        const body = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok) {
          setError(getApiError(body) ?? "Failed to save script");
          return;
        }

        const doc = getDocFromBody(body);
        if (doc) setCloserScriptDoc(doc);
      } else {
        const res = await fetch("/api/docs/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: `Closer Script – ${selected.lead.businessName}`,
            content: closerScriptDraft,
            kind: "CLOSER_SCRIPT",
            leadId: selected.lead.id,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok) {
          setError(getApiError(body) ?? "Failed to create script doc");
          return;
        }

        const doc = getDocFromBody(body);
        if (doc) setCloserScriptDoc(doc);
      }

      setStatus("Saved closer script");
    } finally {
      setScriptBusy(false);
    }
  }

  async function generateCloserScript() {
    if (!selected) return;
    setError(null);
    setStatus(null);
    setScriptBusy(true);

    try {
      const res = await fetch("/api/ai/closer-script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appointmentId: selected.id,
          tone: closerScriptTone,
          tweak: closerScriptTweak || undefined,
          prepContent: prepDraft || undefined,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) {
        setError(getApiError(body) ?? "Failed to generate script");
        return;
      }

      const doc = getDocFromBody(body);
      if (doc) {
        setCloserScriptDoc(doc);
        setCloserScriptDraft(doc.content ?? "");
      }

      setStatus("Generated closer script");
    } finally {
      setScriptBusy(false);
    }
  }

  async function savePrepPack() {
    if (!selected?.prepDoc?.id) return;
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/docs/${selected.prepDoc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: prepDraft }),
    });

    const body = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save prep pack");
      return;
    }

    setStatus("Saved prep pack");
    await refresh();
  }

  async function generatePrepPack() {
    if (!selected) return;
    setError(null);
    setStatus(null);
    setPrepBusy(true);

    try {
      const res = await fetch("/api/ai/appointment-prep-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appointmentId: selected.id,
          existingContent: prepDraft || undefined,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) {
        setError(getApiError(body) ?? "Failed to generate prep pack");
        return;
      }

      const doc = getDocFromBody(body);
      if (doc?.content) setPrepDraft(doc.content);
      setStatus(selected.prepDoc ? "Regenerated prep pack" : "Generated prep pack");
      await refresh();
    } finally {
      setPrepBusy(false);
    }
  }

  async function submitDisposition() {
    if (!selected) return;
    setError(null);
    setStatus(null);

    const selectedServices = Object.entries(servicesSelected)
      .filter(([, on]) => on)
      .map(([name]) => name);

    const res = await fetch("/api/appointments/disposition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appointmentId: selected.id,
        outcome,
        notes,
        loomUrl: loomUrl || undefined,

        setupFeeDollars: outcome === "CLOSED" ? setupFeeDollars : undefined,
        monthlyFeeDollars: outcome === "CLOSED" ? monthlyFeeDollars : undefined,
        termMonths: outcome === "CLOSED" ? termMonths : undefined,
        servicesSelected: outcome === "CLOSED" ? selectedServices : undefined,
        servicesOther: outcome === "CLOSED" ? servicesOther || undefined : undefined,
        terms: outcome === "CLOSED" ? terms || undefined : undefined,
        clientEmail: outcome === "CLOSED" ? clientEmail || undefined : undefined,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to submit outcome");
      return;
    }

    setSelectedId(null);
    setNotes("");
    setLoomUrl("");

    setSetupFeeDollars(0);
    setMonthlyFeeDollars(0);
    setTermMonths(3);
    setClientEmail("");
    setServicesOther("");
    setTerms("Net 7. Cancel anytime with 30 days notice.");
    setPrepDraft("");
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-base font-semibold">My meetings</h1>
              <p className="mt-1 text-sm text-zinc-600">Upcoming + past, with outcomes.</p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                onClick={() => refresh()}
                type="button"
              >
                Refresh
              </button>
              <a
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                href="/app/closer/availability"
              >
                Availability
              </a>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-zinc-200 p-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-700">Search</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Business name, phone, niche, location, setter…"
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

              <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-xs text-zinc-600">
              Showing {filtered.length} of {appointments.length}
            </div>

            {filtered.map((a) => (
              <button
                key={a.id}
                className={`w-full rounded-2xl border border-zinc-200 p-4 text-left ${outcomeAccent(a)} ${
                  selectedId === a.id ? "bg-zinc-50" : "hover:bg-zinc-50"
                }`}
                onClick={() => setSelectedId(a.id)}
                type="button"
              >
                <div className="text-sm font-semibold">{a.lead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {new Date(a.startAt).toLocaleString()} ({
                    Math.round(
                      (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000,
                    )
                  }
                  m)
                </div>
                <div className="mt-1 text-xs text-zinc-600">Setter: {a.setter.name}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {a.status}
                  {a.outcome?.outcome ? ` • Outcome: ${a.outcome.outcome}` : ""}
                </div>
              </button>
            ))}

            {appointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                No meetings assigned yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold">Disposition</h2>
          <p className="mt-1 text-sm text-zinc-600">Mark outcome so setter + management can see status.</p>

          {selected ? (
            <div className="mt-4">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold">{selected.lead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-600">{selected.lead.phone}</div>
                {[selected.lead.contactName, selected.lead.contactEmail, selected.lead.contactPhone].some(Boolean) ? (
                  <div className="mt-1 text-xs text-zinc-600">
                    Contact: {[selected.lead.contactName, selected.lead.contactEmail, selected.lead.contactPhone]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                ) : null}
                {selected.lead.interestedService ? (
                  <div className="mt-1 text-xs text-zinc-600">Interested in: {selected.lead.interestedService}</div>
                ) : null}
                {selected.lead.source ? (
                  <div className="mt-1 text-xs text-zinc-600">Source: {selected.lead.source}</div>
                ) : null}
                <div className="mt-1 text-xs text-zinc-600">
                  {[selected.lead.niche, selected.lead.location].filter(Boolean).join(" • ")}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                    type="button"
                    onClick={beginReschedule}
                  >
                    Reschedule
                  </button>
                </div>

                {rescheduleOpen ? (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-zinc-700">New start time</label>
                        <input
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          type="datetime-local"
                          value={rescheduleStartLocal}
                          onChange={(e) => setRescheduleStartLocal(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-700">Duration (min)</label>
                        <input
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          type="number"
                          min={10}
                          max={180}
                          value={rescheduleDurationMinutes}
                          onChange={(e) => setRescheduleDurationMinutes(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-2">
                      <input
                        id={`confirmAddAvailability-${selected.id}`}
                        type="checkbox"
                        className="mt-1"
                        checked={rescheduleConfirmAddAvailability}
                        onChange={(e) => setRescheduleConfirmAddAvailability(e.target.checked)}
                      />
                      <label
                        htmlFor={`confirmAddAvailability-${selected.id}`}
                        className="text-xs text-zinc-700"
                      >
                        If your availability doesn’t cover the new time, confirm to add availability for this exact slot
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                        type="button"
                        disabled={rescheduleBusy}
                        onClick={saveReschedule}
                      >
                        {rescheduleBusy ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50 disabled:opacity-60"
                        type="button"
                        disabled={rescheduleBusy}
                        onClick={() => setRescheduleOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>

                    {rescheduleError ? (
                      <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                        {rescheduleError}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Prep pack</div>
                    <div className="mt-1 text-xs text-zinc-600">Context + prompts for this meeting.</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                      type="button"
                      disabled={!selected || prepBusy}
                      onClick={generatePrepPack}
                    >
                      {prepBusy
                        ? "Working…"
                        : selected.prepDoc
                          ? "Regenerate"
                          : "Generate prep pack"}
                    </button>
                  </div>
                </div>

                {selected.prepDoc ? (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-zinc-700">{selected.prepDoc.title}</div>
                    <textarea
                      className="mt-2 h-44 w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400"
                      value={prepDraft}
                      onChange={(e) => setPrepDraft(e.target.value)}
                    />
                    <div className="mt-2 flex gap-3">
                      <button
                        className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                        onClick={savePrepPack}
                        type="button"
                      >
                        Save prep pack
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-zinc-500">
                    No prep pack yet. Click “Generate prep pack” to create one.
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold">Discovery script</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Generate and edit a closer script based on the prep pack.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                      type="button"
                      disabled={!selected || scriptBusy}
                      onClick={generateCloserScript}
                    >
                      {scriptBusy ? "Working…" : "Generate"}
                    </button>
                    <button
                      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                      type="button"
                      disabled={!selected || scriptBusy}
                      onClick={saveCloserScript}
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-zinc-700">Tone</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                      value={closerScriptTone}
                      onChange={(e) => setCloserScriptTone(e.target.value)}
                      placeholder="consultative, calm, confident"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-700">Extra instruction (optional)</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                      value={closerScriptTweak}
                      onChange={(e) => setCloserScriptTweak(e.target.value)}
                      placeholder="e.g. focus on objections about pricing"
                    />
                  </div>
                </div>

                <textarea
                  className="mt-3 h-56 w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400"
                  value={closerScriptDraft}
                  onChange={(e) => setCloserScriptDraft(e.target.value)}
                  placeholder={selected ? "Generate a discovery script, or paste your own…" : "Select a meeting first"}
                />

                <div className="mt-2 text-xs text-zinc-500">
                  Saved per lead for you (so it follows this business across meetings).
                </div>
              </div>

              {selected.outcome ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
                  <div className="font-medium">Existing outcome: {selected.outcome.outcome}</div>
                  {selected.outcome.notes ? (
                    <div className="mt-2 whitespace-pre-wrap text-zinc-600">{selected.outcome.notes}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Outcome</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value as "CLOSED" | "FOLLOW_UP" | "LOST")}
                  >
                    <option value="CLOSED">Closed</option>
                    <option value="FOLLOW_UP">Follow up</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Startup fee (if closed)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    type="number"
                    min={0}
                    value={setupFeeDollars}
                    onChange={(e) => setSetupFeeDollars(Number(e.target.value))}
                    disabled={outcome !== "CLOSED"}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Monthly fee (if closed)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    type="number"
                    min={0}
                    value={monthlyFeeDollars}
                    onChange={(e) => setMonthlyFeeDollars(Number(e.target.value))}
                    disabled={outcome !== "CLOSED"}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Term (months)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    type="number"
                    min={0}
                    max={120}
                    value={termMonths}
                    onChange={(e) => setTermMonths(Number(e.target.value))}
                    disabled={outcome !== "CLOSED"}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Client email (optional)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@company.com"
                    disabled={outcome !== "CLOSED"}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Services (if closed)</label>
                  <div className={`mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 ${outcome !== "CLOSED" ? "opacity-60" : ""}`}>
                    {Object.keys(servicesSelected).map((name) => (
                      <label key={name} className="flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={servicesSelected[name]}
                          disabled={outcome !== "CLOSED"}
                          onChange={(e) =>
                            setServicesSelected((prev) => ({ ...prev, [name]: e.target.checked }))
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={servicesOther}
                    onChange={(e) => setServicesOther(e.target.value)}
                    placeholder="Other services (optional)"
                    disabled={outcome !== "CLOSED"}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Terms (if closed)</label>
                  <textarea
                    className="mt-1 h-28 w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    disabled={outcome !== "CLOSED"}
                    placeholder="Payment terms, cancellation, renewal, etc."
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Loom URL (optional)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={loomUrl}
                    onChange={(e) => setLoomUrl(e.target.value)}
                    placeholder="https://www.loom.com/share/..."
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Upload video (optional)</label>
                  <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    {selected?.video?.filePath ? (
                      <div>
                        <video className="w-full max-h-72 rounded-xl" controls src={selected.video.filePath} />
                        <div className="mt-1 text-xs text-zinc-600">
                          {selected.video.mimeType} • {(selected.video.fileSize / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600">No video uploaded yet.</div>
                    )}

                    <div className="mt-3">
                      <input
                        type="file"
                        accept="video/*"
                        disabled={!selected || videoBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadAppointmentVideo(f).catch(() => null);
                        }}
                      />
                      <div className="mt-1 text-xs text-zinc-500">
                        Stored in local dev storage (public/uploads). You can use this and Loom together.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    className="mt-1 h-36 w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What happened on the call? Next steps?"
                  />
                </div>
              </div>

              {status ? (
                <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {status}
                </div>
              ) : null}

              <div className="mt-4 flex gap-3">
                <button
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  onClick={submitDisposition}
                  type="button"
                >
                  Submit
                </button>
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                  onClick={() => setSelectedId(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              Select a meeting on the left.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
