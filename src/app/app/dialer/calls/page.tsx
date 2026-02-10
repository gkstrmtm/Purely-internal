"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type Lead = {
  id: string;
  businessName: string;
  phone: string;
  niche?: string | null;
  location?: string | null;
};

type Doc = { id: string; title: string; content: string; kind: string };

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

type CallLog = {
  id: string;
  createdAt: string;
  disposition: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  companyName?: string | null;
  method?: string | null;
  methodOther?: string | null;
  notes?: string | null;
  followUpAt?: string | null;
  lead: Lead;
  transcriptDoc?: Doc | null;
  recording?: { id: string; filePath: string; mimeType: string; fileSize: number } | null;
};

const DISPOSITIONS = [
  "NO_ANSWER",
  "LEFT_VOICEMAIL",
  "FOLLOW_UP",
  "BOOKED",
  "NOT_INTERESTED",
  "BAD_NUMBER",
] as const;

const METHODS = ["PHONE", "ZOOM", "GOOGLE_MEET", "IN_PERSON", "OTHER"] as const;

export default function DialerCallsPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [leadSearch, setLeadSearch] = useState<string>("");
  const [logSearch, setLogSearch] = useState<string>("");

  const [leadId, setLeadId] = useState<string>("");
  const [disposition, setDisposition] = useState<(typeof DISPOSITIONS)[number]>("NO_ANSWER");
  const [contactName, setContactName] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("PHONE");
  const [methodOther, setMethodOther] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [followUpAt, setFollowUpAt] = useState<string>("");
  const [createTranscript, setCreateTranscript] = useState<boolean>(true);

  const [scriptTone, setScriptTone] = useState<string>("confident, concise, friendly");
  const [scriptTweak, setScriptTweak] = useState<string>("");
  const [scriptDoc, setScriptDoc] = useState<{ id: string; title: string; content: string } | null>(null);

  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateTitle, setTemplateTitle] = useState<string>("");
  const autoAppliedTemplateByLeadRef = useRef<Record<string, boolean>>({});

  const [meetingStart, setMeetingStart] = useState<string>("");
  const [meetingDuration, setMeetingDuration] = useState<number>(30);
  const [bookResult, setBookResult] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [transcriptDraft, setTranscriptDraft] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (suggestionsError) toast.error(suggestionsError);
  }, [suggestionsError, toast]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const selected = useMemo(
    () => logs.find((l) => l.id === selectedId) ?? null,
    [logs, selectedId],
  );

  const selectedLeadForCreate = useMemo(
    () => leads.find((l) => l.id === leadId) ?? null,
    [leads, leadId],
  );

  const filteredLeadsForSelect = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      const hay = [l.businessName, l.phone, l.niche ?? "", l.location ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [leadSearch, leads]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => {
      const hay = [
        l.lead.businessName,
        l.lead.phone,
        l.lead.niche ?? "",
        l.lead.location ?? "",
        l.companyName ?? "",
        l.contactName ?? "",
        l.disposition,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logSearch, logs]);

  const selectedTranscriptContent = selected?.transcriptDoc?.content ?? "";

  async function refresh() {
    const [leadRes, logRes] = await Promise.all([
      fetch("/api/leads/my"),
      fetch("/api/call-logs/my"),
    ]);

    const leadBody = await leadRes.json().catch(() => ({}));
    const logBody = await logRes.json().catch(() => ({}));

    setLeads(leadBody.leads ?? []);
    setLogs(logBody.callLogs ?? []);
  }

  useEffect(() => {
    refresh().catch(() => null);
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
    setTranscriptDraft(selectedTranscriptContent);
  }, [selectedId, selectedTranscriptContent]);

  useEffect(() => {
    setBookResult(null);
    setStatus(null);
    setError(null);
    setScriptDoc(null);
    setSelectedTemplateId("");
    setTemplateTitle("");
    setMeetingStart("");
    setSuggestedSlots([]);
    setSuggestionsError(null);

    if (!leadId) return;

    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/leads/script?leadId=${encodeURIComponent(leadId)}`);
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok) {
        setError(body?.error ?? "Failed to load script");
        return;
      }

      setScriptDoc(body.doc);
      setTemplateTitle(body.doc?.title ?? "");
    })().catch(() => {
      if (!cancelled) setError("Failed to load script");
    });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function refreshSuggestions(fromIso?: string) {
    if (!leadId) {
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
  }, [leadId, meetingDuration]);

  function pickDefaultTemplateForLead(lead: Lead): ScriptTemplate | null {
    const niche = lead.niche?.trim();
    const location = lead.location?.trim();
    if (niche) {
      const byNiche = templates.find((t) => t.title.toLowerCase().includes(niche.toLowerCase()));
      if (byNiche) return byNiche;
    }
    if (location) {
      const byLocation = templates.find((t) =>
        t.title.toLowerCase().includes(location.toLowerCase()),
      );
      if (byLocation) return byLocation;
    }
    if (templates.length === 1) return templates[0];
    return null;
  }

  useEffect(() => {
    if (!leadId) return;
    if (!selectedLeadForCreate) return;
    if (templates.length === 0) return;

    if (autoAppliedTemplateByLeadRef.current[leadId]) return;

    const existingContent = scriptDoc?.content?.trim() ?? "";
    if (existingContent.length > 0) return;

    const chosen = pickDefaultTemplateForLead(selectedLeadForCreate);
    if (!chosen) return;

    autoAppliedTemplateByLeadRef.current[leadId] = true;
    setSelectedTemplateId(chosen.id);
    setTemplateTitle(chosen.title);
    loadTemplateIntoScript(chosen.id).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, scriptDoc?.id, scriptDoc?.content, selectedLeadForCreate, templates]);

  async function generateScriptForSelectedLead() {
    if (!leadId) {
      setError("Choose a lead first");
      return;
    }

    setError(null);
    setStatus(null);

    const res = await fetch("/api/ai/script", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId, tone: scriptTone, tweak: scriptTweak }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to generate script");
      return;
    }

    setScriptDoc(body.doc);
    setStatus("Generated script");
  }

  async function saveScriptDoc() {
    if (!scriptDoc?.id) return;
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/docs/${scriptDoc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: scriptDoc.content }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save script");
      return;
    }

    setStatus("Saved script");
  }

  async function loadTemplateIntoScript(templateId?: string) {
    if (!leadId) {
      setError("Choose a lead first");
      return;
    }
    const id = templateId ?? selectedTemplateId;
    const t = templates.find((x) => x.id === id);
    if (!t) return;

    setError(null);
    setStatus(null);

    if (scriptDoc) {
      const next = { ...scriptDoc, content: t.content };
      setScriptDoc(next);
      setTemplateTitle(t.title);

      const res = await fetch(`/api/docs/${scriptDoc.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: t.content }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Failed to save script");
        return;
      }

      setStatus("Loaded template into script");
      return;
    }

    const res = await fetch("/api/docs/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: selectedLeadForCreate ? `Script – ${selectedLeadForCreate.businessName}` : "Script",
        kind: "DIALER_SCRIPT",
        content: t.content,
        leadId,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to create script doc");
      return;
    }

    setScriptDoc(body.doc);
    setTemplateTitle(body.doc?.title ?? "");
    setStatus("Loaded template into script");
  }

  async function saveScriptAsTemplate() {
    if (!scriptDoc) return;
    setError(null);
    setStatus(null);

    const title = templateTitle.trim() || scriptDoc.title;
    const res = await fetch("/api/script-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content: scriptDoc.content }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save template");
      return;
    }

    setStatus("Saved as template");
    await refreshTemplates();
  }

  async function bookMeetingForSelectedLead() {
    if (!leadId) {
      setError("Choose a lead first");
      return;
    }
    if (!meetingStart) {
      setError("Choose a meeting time first");
      return;
    }

    setError(null);
    setStatus(null);
    setBookResult(null);

    const res = await fetch("/api/appointments/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId,
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
    setDisposition("BOOKED");
    setStatus("Booked meeting");
  }

  async function createCallLog() {
    setError(null);
    setStatus(null);

    if (!leadId) {
      setError("Choose a lead");
      return;
    }

    const res = await fetch("/api/call-logs/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId,
        disposition,
        contactName: contactName || undefined,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        companyName: companyName || undefined,
        method,
        methodOther: method === "OTHER" ? methodOther : undefined,
        notes,
        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
        createTranscript,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to create call log");
      return;
    }

    const created = body.callLog;
    if (created?.id) {
      setLogs((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setSelectedId(created.id);
    }

    setStatus("Created call log");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setCompanyName("");
    setMethod("PHONE");
    setMethodOther("");
    setNotes("");
    setFollowUpAt("");
    await refresh();
  }

  async function saveTranscript() {
    if (!selected?.transcriptDoc?.id) return;
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/docs/${selected.transcriptDoc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: transcriptDraft }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Failed to save transcript");
      return;
    }

    setStatus("Saved transcript");
    await refresh();
  }


  async function uploadRecording(file: File) {
    if (!selected) return;
    setError(null);
    setStatus(null);

    const fd = new FormData();
    fd.set("file", file);

    const up = await fetch("/api/uploads", { method: "POST", body: fd });
    const upBody = await up.json().catch(() => ({}));
    if (!up.ok) {
      setError(upBody?.error ?? "Upload failed");
      return;
    }

    const attach = await fetch("/api/call-logs/attach-recording", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callLogId: selected.id,
        url: upBody.url,
        mimeType: upBody.mimeType,
        fileSize: upBody.fileSize,
      }),
    });
    const attachBody = await attach.json().catch(() => ({}));
    if (!attach.ok) {
      setError(attachBody?.error ?? "Failed to attach recording");
      return;
    }

    setStatus("Uploaded recording");
    await refresh();
  }

  async function startMicRecording() {
    if (!selected) return;
    setError(null);
    setStatus(null);

    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) chunksRef.current.push(evt.data);
      };

      mr.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `call-${selected.id}.${ext}`, { type: blob.type });
          await uploadRecording(file);
        } catch {
          // ignore
        } finally {
          chunksRef.current = [];
        }
      };

      mr.start();
      setIsRecording(true);
      setStatus("Recording…");
    } catch {
      setError("Could not access microphone. Check browser permissions.");
    }
  }

  async function stopMicRecording() {
    if (!isRecording) return;
    setError(null);
    setStatus(null);

    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }

    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }

    recorderRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
    setStatus("Processing recording…");
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold">Call logs</h1>
          <p className="mt-1 text-sm text-zinc-600">Create logs, upload audio, edit transcripts.</p>

          <input
            className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder="Search logs by lead/name/phone…"
          />

          <div className="mt-4 space-y-2">
            {filteredLogs.map((l) => (
              <button
                key={l.id}
                className={`w-full rounded-2xl border p-4 text-left ${
                  selectedId === l.id
                    ? "border-zinc-400 bg-zinc-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
                onClick={() => setSelectedId(l.id)}
                type="button"
              >
                <div className="text-sm font-semibold">{l.lead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {new Date(l.createdAt).toLocaleString()} • {l.disposition}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {(l.transcriptDoc ? "Transcript" : "No transcript") + " • " + (l.recording ? "Audio" : "No audio")}
                </div>
              </button>
            ))}

            {filteredLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                No call logs found.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold">Create call log</h2>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Lead</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Search leads…"
              />
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                <option value="">Select…</option>
                {filteredLeadsForSelect.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.businessName} ({[l.niche, l.location].filter(Boolean).join(" • ")})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Script</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {selectedLeadForCreate
                      ? `Lead: ${selectedLeadForCreate.businessName}`
                      : "Choose a lead to generate a script"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    type="button"
                    disabled={!leadId}
                    onClick={() => generateScriptForSelectedLead()}
                  >
                    Generate
                  </button>
                  <button
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                    type="button"
                    disabled={!scriptDoc}
                    onClick={() => saveScriptDoc()}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Tone</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={scriptTone}
                    onChange={(e) => setScriptTone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Tweak</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={scriptTweak}
                    onChange={(e) => setScriptTweak(e.target.value)}
                    placeholder="e.g. shorter opener"
                  />
                </div>
              </div>

              <textarea
                className="mt-3 h-56 w-full rounded-2xl border border-zinc-200 bg-white p-3 font-mono text-sm leading-6 outline-none focus:border-zinc-400"
                value={scriptDoc?.content ?? ""}
                onChange={(e) =>
                  setScriptDoc((d) => (d ? { ...d, content: e.target.value } : d))
                }
                placeholder={leadId ? "Generate or paste a script" : "Select a lead first"}
              />

              <div className="mt-3 rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="text-sm font-medium">Templates</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      disabled={!leadId}
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
                    disabled={!leadId || !selectedTemplateId}
                    onClick={() => loadTemplateIntoScript()}
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
                      disabled={!scriptDoc}
                    />
                  </div>
                  <button
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    type="button"
                    disabled={!scriptDoc}
                    onClick={() => saveScriptAsTemplate()}
                  >
                    Save as template
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Recording</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {selected
                        ? `Attaches to log: ${selected.lead.businessName} • ${new Date(selected.createdAt).toLocaleString()}`
                        : "Create a call log (or select one) to attach recording"}
                    </div>
                  </div>
                </div>

                {selected?.recording ? (
                  <div className="mt-2">
                    <audio className="w-full" controls src={selected.recording.filePath} />
                    <div className="mt-1 text-xs text-zinc-600">
                      {selected.recording.mimeType} • {(selected.recording.fileSize / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-zinc-500">No recording attached yet.</div>
                )}

                <div className="mt-3">
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={!selected || isRecording}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadRecording(f).catch(() => null);
                    }}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={
                        "rounded-xl px-3 py-2 text-sm font-medium text-white disabled:opacity-60 " +
                        (isRecording
                          ? "bg-[color:var(--color-brand-pink)] hover:opacity-90"
                          : "bg-zinc-900 hover:bg-zinc-800")
                      }
                      type="button"
                      disabled={!selected || isRecording}
                      onClick={() => startMicRecording()}
                    >
                      {isRecording ? "Recording…" : "Record from mic"}
                    </button>
                    <button
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                      type="button"
                      disabled={!isRecording}
                      onClick={() => stopMicRecording()}
                    >
                      Stop
                    </button>
                  </div>

                  {isRecording ? (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[color:rgba(251,113,133,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--color-brand-pink)]">
                      Recording in progress
                    </div>
                  ) : null}

                  <div className="mt-1 text-xs text-zinc-500">
                    Uses local dev storage (public/uploads). No external storage yet.
                  </div>
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Book meeting</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Book directly while you’re on the call.
                  </div>
                </div>
                <button
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  type="button"
                  disabled={!leadId || !meetingStart}
                  onClick={() => bookMeetingForSelectedLead()}
                >
                  Book
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Start</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    type="datetime-local"
                    value={meetingStart}
                    onChange={(e) => setMeetingStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Duration</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    value={meetingDuration}
                    onChange={(e) => setMeetingDuration(Number(e.target.value))}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-zinc-700">Suggested available times</div>
                  <button
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-60"
                    type="button"
                    disabled={!leadId}
                    onClick={() => refreshSuggestions().catch(() => null)}
                  >
                    Refresh
                  </button>
                </div>

                {leadId && suggestedSlots.length > 0 ? (
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
                ) : leadId ? (
                  <div className="mt-2 text-xs text-zinc-600">No availability found in the next few days.</div>
                ) : (
                  <div className="mt-2 text-xs text-zinc-600">Select a lead to see available times.</div>
                )}
              </div>

              {bookResult ? (
                <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {bookResult}
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium">Disposition</label>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as (typeof DISPOSITIONS)[number])}
              >
                {DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Method of appointment</label>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Method (if other)</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={methodOther}
                onChange={(e) => setMethodOther(e.target.value)}
                placeholder="e.g. Calendly, SMS, Instagram"
                disabled={method !== "OTHER"}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Contact name</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. John"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Contact email</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Contact phone</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="If different than lead"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Company name (override)</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="If different than lead"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Follow up at (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                className="mt-1 h-28 w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What happened?"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="createTranscript"
                type="checkbox"
                checked={createTranscript}
                onChange={(e) => setCreateTranscript(e.target.checked)}
              />
              <label htmlFor="createTranscript" className="text-sm text-zinc-700">
                Create a transcript doc for this call
              </label>
            </div>

            <div className="sm:col-span-2 flex gap-3">
              <button
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                onClick={createCallLog}
                type="button"
              >
                Create
              </button>
              <button
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                onClick={() => refresh()}
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>

          {selected ? (
            <div className="mt-8">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold">
                  {selected.lead.businessName}
                  {selected.companyName ? ` (${selected.companyName})` : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-600">{selected.lead.phone}</div>
                <div className="mt-1 text-xs text-zinc-600">{selected.disposition}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {[selected.contactName, selected.contactEmail, selected.contactPhone]
                    .filter(Boolean)
                    .join(" • ")}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <div className="text-sm font-semibold">Transcript</div>
                  {selected.transcriptDoc ? (
                    <div className="mt-2">
                      <textarea
                        className="h-56 w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400"
                        value={transcriptDraft}
                        onChange={(e) => setTranscriptDraft(e.target.value)}
                      />
                      <div className="mt-2 flex flex-wrap gap-3">
                        <button
                          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                          onClick={() => saveTranscript()}
                          type="button"
                        >
                          Save transcript
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-zinc-500">
                      No transcript doc on this call log.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              Select a call log on the left to view details.
            </div>
          )}

          {status ? (
            <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
