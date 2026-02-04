"use client";

import { useEffect, useMemo, useState } from "react";

type Lead = {
  id: string;
  businessName: string;
  phone: string;
  website?: string | null;
  location?: string | null;
  niche?: string | null;
};

type ScriptTemplate = {
  id: string;
  title: string;
  content: string;
};

type SuggestedSlot = { startAt: string; endAt: string; closerCount: number };

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DialerLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(() => new Set());

  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [pullCount, setPullCount] = useState(25);

  const [leadSearch, setLeadSearch] = useState("");

  const [tone, setTone] = useState("confident, concise, friendly");
  const [tweak, setTweak] = useState("");

  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const activeLead = useMemo(
    () => leads.find((l) => l.id === activeLeadId) ?? null,
    [leads, activeLeadId],
  );

  const displayLeads = useMemo(() => {
    if (newLeadIds.size === 0) return leads;
    const pinned: Lead[] = [];
    const rest: Lead[] = [];
    for (const lead of leads) {
      if (newLeadIds.has(lead.id)) pinned.push(lead);
      else rest.push(lead);
    }
    return [...pinned, ...rest];
  }, [leads, newLeadIds]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return displayLeads;
    return displayLeads.filter((l) => {
      const hay = [l.businessName, l.phone, l.niche ?? "", l.location ?? "", l.website ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [displayLeads, leadSearch]);

  const [doc, setDoc] = useState<{ id: string; title: string; content: string } | null>(
    null,
  );
  const [prepDoc, setPrepDoc] = useState<{ id: string; title: string; content: string } | null>(
    null,
  );
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateTitle, setTemplateTitle] = useState<string>("");

  const [meetingStart, setMeetingStart] = useState("");
  const [meetingDuration, setMeetingDuration] = useState(30);
  const [bookResult, setBookResult] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/leads/my?mode=assigned&take=250");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLeads([]);
      setLoading(false);
      setPullError(body?.error ?? "Failed to load leads");
      return;
    }
    setLeads(body.leads ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function refreshTemplates() {
    const res = await fetch("/api/script-templates");
    const body = await res.json().catch(() => ({}));
    setTemplates(body.templates ?? []);
  }

  useEffect(() => {
    refreshTemplates().catch(() => null);
  }, []);

  useEffect(() => {
    setError(null);
    setStatus(null);
    setDoc(null);
    setPrepDoc(null);
    setTemplateTitle("");
    setSelectedTemplateId("");
    setBookResult(null);

    if (!activeLeadId) return;

    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/leads/script?leadId=${encodeURIComponent(activeLeadId)}`);
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok) {
        setError(body?.error ?? "Failed to load script");
        return;
      }

      setDoc(body.doc);
      setTemplateTitle(body.doc?.title ?? "");
    })().catch(() => {
      if (!cancelled) setError("Failed to load script");
    });

    (async () => {
      const res = await fetch(`/api/leads/prep-pack?leadId=${encodeURIComponent(activeLeadId)}`);
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok) {
        // Non-fatal; prep packs are optional.
        return;
      }

      setPrepDoc(body.doc);
    })().catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [activeLeadId]);

  async function ensureLeadScriptDoc(): Promise<{ id: string; title: string; content: string } | null> {
    if (!activeLead) return null;
    if (doc) return doc;

    const existingRes = await fetch(`/api/leads/script?leadId=${encodeURIComponent(activeLead.id)}`);
    const existingBody = await existingRes.json().catch(() => ({}));
    if (existingRes.ok && existingBody.doc) {
      setDoc(existingBody.doc);
      setTemplateTitle(existingBody.doc?.title ?? "");
      return existingBody.doc;
    }

    const res = await fetch("/api/docs/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `Script – ${activeLead.businessName}`,
        kind: "DIALER_SCRIPT",
        content: "",
        leadId: activeLead.id,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to create script doc");
      return null;
    }
    setDoc(body.doc);
    setTemplateTitle(body.doc?.title ?? "");
    return body.doc;
  }

  async function pullLeads() {
    setPullError(null);
    setPullStatus(null);
    if (pulling) return;
    setPulling(true);
    const beforeIds = new Set(leads.map((l) => l.id));
    const total = Math.max(1, pullCount);
    setPullProgress({ current: 1, total });

    const startedAt = Date.now();
    const tickMs = 450;
    const interval = setInterval(() => {
      setPullProgress((prev) => {
        if (!prev) return prev;
        const next = Math.min(prev.total, prev.current + 1);
        // Stop at total-1 until the server responds, so we don't show a fake "done".
        const cap = Math.max(1, prev.total - 1);
        return { ...prev, current: Math.min(next, cap) };
      });
    }, tickMs);

    const res = await fetch("/api/leads/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ niche, location, count: pullCount }),
    });
    const body = await res.json().catch(() => ({}));
    clearInterval(interval);
    if (!res.ok) {
      setPulling(false);
      setPullProgress(null);
      setPullError(body?.error ?? "Failed to pull leads");
      return;
    }

    const assigned = typeof body?.assigned === "number" ? body.assigned : 0;
    setPullProgress({ current: assigned, total });

    // Keep the progress visible briefly so users can see the result.
    const minVisibleMs = 1200;
    const elapsed = Date.now() - startedAt;
    if (elapsed < minVisibleMs) {
      await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
    }

    await refresh();

    const pulledIds: string[] = Array.isArray(body?.leads)
      ? body.leads.map((l: { id?: string }) => l?.id).filter(Boolean)
      : [];
    const newlyAdded = pulledIds.filter((id) => !beforeIds.has(id));
    if (newlyAdded.length) {
      setNewLeadIds(new Set(newlyAdded));
      // Auto-select the newest pulled lead.
      setActiveLeadId(newlyAdded[0] ?? null);
    } else {
      setNewLeadIds(new Set());
    }

    setPullStatus(
      assigned > 0
        ? `Pulled ${assigned} lead${assigned === 1 ? "" : "s"}`
        : "No new leads matched those filters",
    );
    setPulling(false);
    setTimeout(() => setPullProgress(null), 1500);
  }

  async function generateScript() {
    if (!activeLead) return;
    setError(null);
    setStatus(null);
    const res = await fetch("/api/ai/script", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: activeLead.id, tone, tweak }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to generate script");
      return;
    }
    setDoc(body.doc);
    setTemplateTitle(body.doc?.title ?? "");
    setStatus("Generated script");
  }

  async function saveScript() {
    if (!doc) return;
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: doc.content }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save script");
      return;
    }
    setStatus("Saved script");
  }

  async function saveAsTemplate() {
    if (!doc) return;
    setError(null);
    setStatus(null);

    const title = templateTitle.trim() || doc.title;
    const res = await fetch("/api/script-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content: doc.content }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save template");
      return;
    }
    setStatus("Saved as template");
    await refreshTemplates();
  }

  async function generatePrepPack() {
    if (!activeLead) return;
    setError(null);
    setStatus(null);

    const res = await fetch("/api/ai/prep-pack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: activeLead.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to generate prep pack");
      return;
    }
    setPrepDoc(body.doc);
    setStatus("Generated prep pack");
  }

  async function savePrepPack() {
    if (!prepDoc) return;
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/docs/${prepDoc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: prepDoc.content }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save prep pack");
      return;
    }
    setStatus("Saved prep pack");
  }

  async function loadTemplate() {
    if (!activeLead) return;
    const t = templates.find((x) => x.id === selectedTemplateId);
    if (!t) return;

    setError(null);
    setStatus(null);

    const ensured = await ensureLeadScriptDoc();
    if (!ensured) return;

    setDoc({ ...ensured, content: t.content });
    setStatus("Loaded template into editor");
  }

  async function bookMeeting() {
    if (!activeLead) return;
    setError(null);
    setStatus(null);
    setBookResult(null);
    if (!meetingStart) {
      setError("Choose a meeting time first");
      return;
    }
    const res = await fetch("/api/appointments/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: activeLead.id,
        startAt: new Date(meetingStart).toISOString(),
        durationMinutes: meetingDuration,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to book meeting");
      if (res.status === 409) {
        await refreshSuggestions(new Date(meetingStart).toISOString()).catch(() => null);
      }
      return;
    }
    const appt = body.appointment;
    setBookResult(
      `Booked with ${appt.closer?.name ?? "closer"} at ${new Date(appt.startAt).toLocaleString()}`,
    );
    setStatus("Booked meeting");
  }

  async function refreshSuggestions(fromIso?: string) {
    if (!activeLead) {
      setSuggestedSlots([]);
      return;
    }

    setSuggestionsError(null);
    const qs = new URLSearchParams({
      durationMinutes: String(meetingDuration),
      limit: "10",
    });
    if (fromIso) qs.set("startAt", fromIso);

    const res = await fetch(`/api/appointments/suggestions?${qs.toString()}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSuggestionsError(body?.error ?? "Failed to load available times");
      setSuggestedSlots([]);
      return;
    }

    setSuggestedSlots(body.slots ?? []);
  }

  useEffect(() => {
    refreshSuggestions().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeadId, meetingDuration]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left column: pull + list */}
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Pull leads</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Filter by niche/location and grab unassigned leads.
            </p>

            <datalist id="nicheOptions">
              <option value="Any" />
              <option value="Roofing" />
              <option value="Dental" />
              <option value="Chiropractic" />
              <option value="Med Spa" />
              <option value="HVAC" />
              <option value="Plumbing" />
              <option value="Landscaping" />
              <option value="Pest Control" />
            </datalist>

            <datalist id="locationOptions">
              <option value="Any" />
              <option value="Austin, TX" />
              <option value="Phoenix, AZ" />
              <option value="Miami, FL" />
              <option value="Tampa, FL" />
              <option value="Nashville, TN" />
              <option value="Dallas, TX" />
              <option value="Denver, CO" />
              <option value="Atlanta, GA" />
            </datalist>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Niche</label>
                  <button
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                    type="button"
                    onClick={() => setNiche("")}
                  >
                    Any
                  </button>
                </div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  list="nicheOptions"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value === "Any" ? "" : e.target.value)}
                  placeholder="Any (type or pick)"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Location</label>
                  <button
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                    type="button"
                    onClick={() => setLocation("")}
                  >
                    Any
                  </button>
                </div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  list="locationOptions"
                  value={location}
                  onChange={(e) =>
                    setLocation(e.target.value === "Any" ? "" : e.target.value)
                  }
                  placeholder="Any (type or pick)"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Count</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  type="number"
                  min={1}
                  max={50}
                  value={pullCount}
                  onChange={(e) => setPullCount(Number(e.target.value))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  onClick={pullLeads}
                  type="button"
                  disabled={pulling}
                >
                  {pulling ? "Pulling…" : "Pull"}
                </button>
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  onClick={refresh}
                  type="button"
                  disabled={pulling}
                >
                  Refresh
                </button>
              </div>

              {pullProgress ? (
                <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                  Pulling {Math.min(pullProgress.current, pullProgress.total)} out of {pullProgress.total}
                  …
                </div>
              ) : null}

              {pullStatus ? (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {pullStatus}
                </div>
              ) : null}

              {pullError ? (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {pullError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">My leads</h2>
                <div className="mt-1 text-sm text-zinc-600">
                  {loading ? "Loading…" : `${filteredLeads.length} / ${leads.length}`}
                </div>
              </div>
              <input
                className="w-56 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Search leads…"
              />
            </div>

            <div className="mt-4 max-h-[70vh] space-y-2 overflow-auto pr-1">
              {filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    activeLeadId === lead.id
                      ? newLeadIds.has(lead.id)
                        ? "border-rose-400 bg-rose-50"
                        : "border-zinc-400 bg-zinc-50"
                      : newLeadIds.has(lead.id)
                        ? "border-rose-300 bg-rose-50 hover:bg-rose-50"
                        : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                  onClick={() => {
                    setActiveLeadId(lead.id);
                    if (newLeadIds.has(lead.id)) {
                      setNewLeadIds((prev) => {
                        const next = new Set(prev);
                        next.delete(lead.id);
                        return next;
                      });
                    }
                  }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{lead.businessName}</div>
                    {newLeadIds.has(lead.id) ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        New
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">{lead.phone}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {[lead.niche, lead.location].filter(Boolean).join(" • ")}
                  </div>
                </button>
              ))}

              {!loading && leads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                  No assigned leads yet. Use “Pull”.
                </div>
              ) : null}
              {!loading && leads.length > 0 && filteredLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                  No matches for “{leadSearch}”.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right column: script + booking */}
        <div className="lg:col-span-3">
          <div className="sticky top-24 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Script + meeting</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  {activeLead
                    ? `Working lead: ${activeLead.businessName}`
                    : "Select a lead on the left."}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  disabled={!activeLead}
                  onClick={generateScript}
                  type="button"
                >
                  Generate
                </button>
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                  disabled={!doc}
                  onClick={saveScript}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Tone</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Tweak</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={tweak}
                  onChange={(e) => setTweak(e.target.value)}
                  placeholder="e.g. more direct, shorter opener"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium">Script editor</label>
              <textarea
                className="mt-1 h-72 w-full rounded-2xl border border-zinc-200 bg-white p-3 font-mono text-sm leading-6 outline-none focus:border-zinc-400"
                value={doc?.content ?? ""}
                onChange={(e) =>
                  setDoc((d) => (d ? { ...d, content: e.target.value } : d))
                }
                placeholder={activeLead ? "Generate or paste a script" : "Select a lead first"}
              />
              {doc ? (
                <div className="mt-2 text-xs text-zinc-600">Saved as doc: {doc.title}</div>
              ) : null}
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Prep pack</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Generate a closer-ready prep pack for this lead.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    disabled={!activeLead}
                    onClick={generatePrepPack}
                    type="button"
                  >
                    Generate
                  </button>
                  <button
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                    disabled={!prepDoc}
                    onClick={savePrepPack}
                    type="button"
                  >
                    Save
                  </button>
                </div>
              </div>

              <textarea
                className="mt-3 h-56 w-full rounded-2xl border border-zinc-200 bg-white p-3 font-mono text-sm leading-6 outline-none focus:border-zinc-400"
                value={prepDoc?.content ?? ""}
                onChange={(e) =>
                  setPrepDoc((d) => (d ? { ...d, content: e.target.value } : d))
                }
                placeholder={activeLead ? "Generate a prep pack" : "Select a lead first"}
              />
              {prepDoc ? (
                <div className="mt-2 text-xs text-zinc-600">Saved as doc: {prepDoc.title}</div>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium">Templates</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                  type="button"
                  disabled={!activeLead || !selectedTemplateId}
                  onClick={loadTemplate}
                >
                  Load template
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium">Template title</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={templateTitle}
                    onChange={(e) => setTemplateTitle(e.target.value)}
                    placeholder="e.g. Roofing opener v1"
                  />
                </div>
                <button
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  type="button"
                  disabled={!doc}
                  onClick={saveAsTemplate}
                >
                  Save as template
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {status ? (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {status}
              </div>
            ) : null}

            <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Book meeting</h3>
                  <p className="mt-1 text-xs text-zinc-600">
                    Auto-assigns an available closer.
                  </p>
                </div>
                <button
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  disabled={!activeLead}
                  onClick={bookMeeting}
                  type="button"
                >
                  Book
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Start</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    type="datetime-local"
                    value={meetingStart}
                    onChange={(e) => setMeetingStart(e.target.value)}
                    disabled={!activeLead}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Duration (minutes)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    type="number"
                    min={10}
                    max={180}
                    value={meetingDuration}
                    onChange={(e) => setMeetingDuration(Number(e.target.value))}
                    disabled={!activeLead}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-zinc-700">Suggested available times</div>
                  <button
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-60"
                    type="button"
                    disabled={!activeLead}
                    onClick={() => refreshSuggestions().catch(() => null)}
                  >
                    Refresh
                  </button>
                </div>

                {suggestionsError ? (
                  <div className="mt-2 text-xs text-[color:var(--color-brand-pink)]">{suggestionsError}</div>
                ) : null}

                {activeLead && suggestedSlots.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedSlots.map((s) => (
                      <button
                        key={s.startAt}
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs hover:bg-zinc-50"
                        onClick={() => setMeetingStart(toDatetimeLocalValue(s.startAt))}
                      >
                        {new Date(s.startAt).toLocaleString()} ({s.closerCount} closer{s.closerCount === 1 ? "" : "s"})
                      </button>
                    ))}
                  </div>
                ) : activeLead ? (
                  <div className="mt-2 text-xs text-zinc-600">No availability found in the next few days.</div>
                ) : (
                  <div className="mt-2 text-xs text-zinc-600">Select a lead to see available times.</div>
                )}
              </div>

              {bookResult ? (
                <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {bookResult}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
