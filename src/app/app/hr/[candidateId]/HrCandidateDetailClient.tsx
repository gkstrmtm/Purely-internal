"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Candidate = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  interviews: Array<{ id: string; scheduledAt: string; status: string; meetingJoinUrl: string | null; connectRoomId: string | null }>;
  followUps: Array<{ id: string; channel: string; toAddress: string; subject: string | null; bodyText: string; sendAt: string; status: string; sentAt: string | null; lastError: string | null }>;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function HrCandidateDetailClient({ candidateId }: { candidateId: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [followChannel, setFollowChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [followTo, setFollowTo] = useState("");
  const [followSubject, setFollowSubject] = useState("Following up");
  const [followBody, setFollowBody] = useState("Hi {firstName},\n\nJust following up.\n");
  const [followSendAt, setFollowSendAt] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  const [interviewAt, setInterviewAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [creatingInterview, setCreatingInterview] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/hr/candidates/${candidateId}`, { cache: "no-store" }).catch(() => null as any);
    const body = res ? await res.json().catch(() => ({})) : null;

    if (!res || !res.ok || !body?.ok) {
      setLoading(false);
      setCandidate(null);
      setError([body?.error ?? "Failed to load candidate", body?.code].filter(Boolean).join(" • "));
      return;
    }

    const c = body.candidate;
    setCandidate({
      id: String(c.id),
      fullName: String(c.fullName || ""),
      email: c.email ? String(c.email) : null,
      phone: c.phone ? String(c.phone) : null,
      source: c.source ? String(c.source) : null,
      notes: c.notes ? String(c.notes) : null,
      status: String(c.status || ""),
      createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date(c.createdAt).toISOString(),
      updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : new Date(c.updatedAt).toISOString(),
      interviews: (c.interviews ?? []).map((i: any) => ({
        id: String(i.id),
        scheduledAt: typeof i.scheduledAt === "string" ? i.scheduledAt : new Date(i.scheduledAt).toISOString(),
        status: String(i.status || ""),
        meetingJoinUrl: i.meetingJoinUrl ? String(i.meetingJoinUrl) : null,
        connectRoomId: i.connectRoomId ? String(i.connectRoomId) : null,
      })),
      followUps: (c.followUps ?? []).map((f: any) => ({
        id: String(f.id),
        channel: String(f.channel || ""),
        toAddress: String(f.toAddress || ""),
        subject: f.subject ? String(f.subject) : null,
        bodyText: String(f.bodyText || ""),
        sendAt: typeof f.sendAt === "string" ? f.sendAt : new Date(f.sendAt).toISOString(),
        status: String(f.status || ""),
        sentAt: f.sentAt ? (typeof f.sentAt === "string" ? f.sentAt : new Date(f.sentAt).toISOString()) : null,
        lastError: f.lastError ? String(f.lastError) : null,
      })),
    });

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const followDefaults = useMemo(() => {
    const email = safeOneLine(candidate?.email || "");
    const phone = safeOneLine(candidate?.phone || "");
    return { email, phone };
  }, [candidate?.email, candidate?.phone]);

  useEffect(() => {
    if (!candidate) return;
    if (followChannel === "EMAIL" && followDefaults.email && !safeOneLine(followTo)) setFollowTo(followDefaults.email);
    if (followChannel === "SMS" && followDefaults.phone && !safeOneLine(followTo)) setFollowTo(followDefaults.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, followChannel]);

  async function createFollowUp() {
    setCreatingFollowUp(true);
    setError(null);

    const iso = new Date(followSendAt).toISOString();

    const res = await fetch(`/api/hr/candidates/${candidateId}/follow-ups`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: followChannel,
        toAddress: followTo,
        subject: followChannel === "EMAIL" ? followSubject : null,
        bodyText: followBody,
        sendAt: iso,
      }),
    }).catch(() => null as any);

    const body = res ? await res.json().catch(() => ({})) : null;
    setCreatingFollowUp(false);

    if (!res || !res.ok || !body?.ok) {
      setError([body?.error ?? "Failed to queue follow-up", body?.code].filter(Boolean).join(" • "));
      return;
    }

    await load();
  }

  async function scheduleInterview() {
    setCreatingInterview(true);
    setError(null);

    const iso = new Date(interviewAt).toISOString();

    const res = await fetch(`/api/hr/candidates/${candidateId}/interviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledAt: iso }),
    }).catch(() => null as any);

    const body = res ? await res.json().catch(() => ({})) : null;
    setCreatingInterview(false);

    if (!res || !res.ok || !body?.ok) {
      setError([body?.error ?? "Failed to schedule interview", body?.code].filter(Boolean).join(" • "));
      return;
    }

    await load();
  }

  if (loading) return <div className="text-sm text-zinc-600">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!candidate) return <div className="text-sm text-zinc-600">Not found.</div>;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-lg font-semibold text-zinc-900">{candidate.fullName}</div>
        <div className="mt-1 text-sm text-zinc-600">
          {[candidate.email, candidate.phone, candidate.source, candidate.status].filter(Boolean).join(" • ")}
        </div>
        {candidate.notes ? <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{candidate.notes}</div> : null}
        <div className="mt-3 text-xs text-zinc-500">Created {fmtDate(candidate.createdAt)} • Updated {fmtDate(candidate.updatedAt)}</div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-brand-mist p-6">
        <div className="text-base font-semibold text-brand-ink">Schedule interview</div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">When</div>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={interviewAt}
              onChange={(e) => setInterviewAt(e.target.value)}
            />
          </label>
          <button
            className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={creatingInterview}
            onClick={() => void scheduleInterview()}
          >
            {creatingInterview ? "Scheduling..." : "Create interview + link"}
          </button>
        </div>

        {candidate.interviews.length ? (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-zinc-800">Interviews</div>
            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {candidate.interviews.map((i) => (
                <div key={i.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-zinc-900">{fmtDate(i.scheduledAt)} • {i.status}</div>
                    {i.meetingJoinUrl ? (
                      <Link className="font-medium text-brand-ink hover:underline" href={i.meetingJoinUrl} target="_blank">
                        Join link
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-brand-mist p-6">
        <div className="text-base font-semibold text-brand-ink">Queue follow-up</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Channel</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={followChannel}
              onChange={(e) => setFollowChannel(e.target.value as any)}
            >
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">To</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={followTo}
              onChange={(e) => setFollowTo(e.target.value)}
              placeholder={followChannel === "EMAIL" ? "name@domain.com" : "+1..."}
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Send at</div>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={followSendAt}
              onChange={(e) => setFollowSendAt(e.target.value)}
            />
          </label>
          {followChannel === "EMAIL" ? (
            <label className="text-sm">
              <div className="text-xs font-medium text-zinc-600">Subject</div>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                value={followSubject}
                onChange={(e) => setFollowSubject(e.target.value)}
              />
            </label>
          ) : (
            <div />
          )}
          <label className="text-sm sm:col-span-2">
            <div className="text-xs font-medium text-zinc-600">Body</div>
            <textarea
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={followBody}
              onChange={(e) => setFollowBody(e.target.value)}
              rows={5}
            />
            <div className="mt-1 text-xs text-zinc-500">
              Placeholders: {"{firstName}"}, {"{fullName}"}, {"{email}"}, {"{phone}"}
            </div>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={creatingFollowUp || !safeOneLine(followTo) || !safeOneLine(followBody)}
            onClick={() => void createFollowUp()}
          >
            {creatingFollowUp ? "Queuing..." : "Queue follow-up"}
          </button>
        </div>

        {candidate.followUps.length ? (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-zinc-800">Follow-ups</div>
            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {candidate.followUps.map((f) => (
                <div key={f.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-zinc-900">
                      {f.channel} to {f.toAddress} • {fmtDate(f.sendAt)} • {f.status}
                    </div>
                    {f.sentAt ? <div className="text-xs text-zinc-500">Sent {fmtDate(f.sentAt)}</div> : null}
                  </div>
                  {f.lastError ? <div className="mt-1 text-xs text-red-600">{f.lastError}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
