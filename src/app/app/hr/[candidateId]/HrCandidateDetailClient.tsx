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
  targetRole?: string | null;
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

function safeText(s: string) {
  return String(s || "").trim();
}

type AvailabilityBlock = { id: string; startAt: string; endAt: string };

function roundUpToNextMinutes(d: Date, minutes: number) {
  const x = new Date(d);
  const ms = minutes * 60_000;
  x.setSeconds(0, 0);
  const t = x.getTime();
  const rounded = Math.ceil(t / ms) * ms;
  return new Date(rounded);
}

function fmtSlotLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [selectedInterviewIso, setSelectedInterviewIso] = useState<string>("");

  const [screenDecision, setScreenDecision] = useState<"PASS" | "FAIL" | "MAYBE">("PASS");
  const [screenNotes, setScreenNotes] = useState("");
  const [screenTimezone, setScreenTimezone] = useState("");
  const [screenAvailability, setScreenAvailability] = useState("");
  const [screenExperience, setScreenExperience] = useState("");
  const [screenCommunication, setScreenCommunication] = useState<number>(4);
  const [screenObjections, setScreenObjections] = useState<number>(4);
  const [screenCoachability, setScreenCoachability] = useState<number>(4);

  const [dialerColdCalling, setDialerColdCalling] = useState("");
  const [dialerVolumeComfort, setDialerVolumeComfort] = useState("");
  const [dialerTools, setDialerTools] = useState("");

  const [closerClosingExperience, setCloserClosingExperience] = useState("");
  const [closerTypicalTicket, setCloserTypicalTicket] = useState("");
  const [closerPriceObjection, setCloserPriceObjection] = useState("");
  const [savingScreening, setSavingScreening] = useState(false);

  const [evalDecision, setEvalDecision] = useState<"HIRE" | "NO_HIRE" | "HOLD">("HOLD");
  const [evalRating, setEvalRating] = useState<number>(4);
  const [evalNotes, setEvalNotes] = useState("");
  const [savingEval, setSavingEval] = useState(false);

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
      targetRole: c.targetRole ? String(c.targetRole) : null,
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

  async function loadAvailability() {
    const res = await fetch("/api/availability", { cache: "no-store" }).catch(() => null as any);
    const body = res ? await res.json().catch(() => ({})) : null;
    if (!res || !res.ok) {
      setAvailabilityBlocks([]);
      return;
    }
    const blocks: AvailabilityBlock[] = (body?.blocks ?? []).map((b: any) => ({
      id: String(b.id),
      startAt: String(b.startAt),
      endAt: String(b.endAt),
    }));
    setAvailabilityBlocks(blocks);
  }

  useEffect(() => {
    void load();
    void loadAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const followDefaults = useMemo(() => {
    const email = safeOneLine(candidate?.email || "");
    const phone = safeOneLine(candidate?.phone || "");
    return { email, phone };
  }, [candidate?.email, candidate?.phone]);

  const normalizedTargetRole = String(candidate?.targetRole || "").toUpperCase();
  const isDialerTarget = normalizedTargetRole === "DIALER";
  const isCloserTarget = normalizedTargetRole === "CLOSER";

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

    const iso = selectedInterviewIso
      ? new Date(selectedInterviewIso).toISOString()
      : new Date(interviewAt).toISOString();

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

  const availableInterviewSlots = useMemo(() => {
    const now = new Date();
    const maxDaysOut = 21;
    const until = new Date(now.getTime() + maxDaysOut * 24 * 60 * 60_000);
    const slotMinutes = 30;
    const slots: string[] = [];

    for (const b of availabilityBlocks) {
      const start = new Date(b.startAt);
      const end = new Date(b.endAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end <= now) continue;

      let cur = roundUpToNextMinutes(start < now ? now : start, slotMinutes);
      const stop = end;

      while (cur.getTime() + slotMinutes * 60_000 <= stop.getTime()) {
        if (cur <= until) slots.push(cur.toISOString());
        if (slots.length >= 240) break;
        cur = new Date(cur.getTime() + slotMinutes * 60_000);
      }
      if (slots.length >= 240) break;
    }

    slots.sort();
    return slots;
  }, [availabilityBlocks]);

  useEffect(() => {
    if (!availableInterviewSlots.length) return;
    if (selectedInterviewIso) return;
    setSelectedInterviewIso(availableInterviewSlots[0]);
  }, [availableInterviewSlots, selectedInterviewIso]);

  if (loading) return <div className="text-sm text-zinc-600">Loading...</div>;
  if (error)
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">{error}</div>
        <a className="text-sm font-medium text-brand-ink hover:underline" href="/app/hr">
          Back to candidates
        </a>
      </div>
    );
  if (!candidate) return <div className="text-sm text-zinc-600">Not found.</div>;

  async function saveScreening() {
    setSavingScreening(true);
    setError(null);

    const capabilities: any = {
      targetRole: candidate?.targetRole ?? null,
      timezone: safeOneLine(screenTimezone),
      availability: safeOneLine(screenAvailability),
      experience: safeOneLine(screenExperience),
      communicationRating: Number(screenCommunication),
      objectionHandlingRating: Number(screenObjections),
      coachabilityRating: Number(screenCoachability),
    };

    if (isDialerTarget) {
      capabilities.dialer = {
        coldCalling: safeText(dialerColdCalling),
        volumeComfort: safeOneLine(dialerVolumeComfort),
        tools: safeOneLine(dialerTools),
      };
    }

    if (isCloserTarget) {
      capabilities.closer = {
        closingExperience: safeText(closerClosingExperience),
        typicalTicket: safeOneLine(closerTypicalTicket),
        priceObjection: safeText(closerPriceObjection),
      };
    }

    const res = await fetch(`/api/hr/candidates/${candidateId}/screenings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: screenDecision, notes: screenNotes, capabilities }),
    }).catch(() => null as any);

    const body = res ? await res.json().catch(() => ({})) : null;
    setSavingScreening(false);

    if (!res || !res.ok || !body?.ok) {
      setError([body?.error ?? "Failed to save screening", body?.code].filter(Boolean).join(" • "));
      return;
    }

    setScreenNotes("");
    setScreenTimezone("");
    setScreenAvailability("");
    setScreenExperience("");
    setDialerColdCalling("");
    setDialerVolumeComfort("");
    setDialerTools("");
    setCloserClosingExperience("");
    setCloserTypicalTicket("");
    setCloserPriceObjection("");
    await load();
  }

  async function saveEvaluation() {
    setSavingEval(true);
    setError(null);

    const res = await fetch(`/api/hr/candidates/${candidateId}/evaluations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: evalDecision, ratingOverall: evalRating, notes: evalNotes }),
    }).catch(() => null as any);

    const body = res ? await res.json().catch(() => ({})) : null;
    setSavingEval(false);

    if (!res || !res.ok || !body?.ok) {
      setError([body?.error ?? "Failed to save evaluation", body?.code].filter(Boolean).join(" • "));
      return;
    }

    setEvalNotes("");
    await load();
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-lg font-semibold text-zinc-900">{candidate.fullName}</div>
        <div className="mt-1 text-sm text-zinc-600">
          {[candidate.targetRole, candidate.email, candidate.phone, candidate.source, candidate.status].filter(Boolean).join(" • ")}
        </div>
        {candidate.notes ? <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{candidate.notes}</div> : null}
        <div className="mt-3 text-xs text-zinc-500">Created {fmtDate(candidate.createdAt)} • Updated {fmtDate(candidate.updatedAt)}</div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-brand-mist p-6">
        <div className="text-base font-semibold text-brand-ink">Screening call</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Decision</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenDecision}
              onChange={(e) => setScreenDecision(e.target.value as any)}
            >
              <option value="PASS">Pass</option>
              <option value="MAYBE">Maybe</option>
              <option value="FAIL">Fail</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Timezone</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenTimezone}
              onChange={(e) => setScreenTimezone(e.target.value)}
              placeholder="EST, CST, etc"
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Availability</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenAvailability}
              onChange={(e) => setScreenAvailability(e.target.value)}
              placeholder="Weekdays 9-5, evenings, etc"
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Experience (short)</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenExperience}
              onChange={(e) => setScreenExperience(e.target.value)}
              placeholder="2y SDR, 1y closer, etc"
            />
          </label>

          {isDialerTarget ? (
            <>
              <label className="text-sm sm:col-span-2">
                <div className="text-xs font-medium text-zinc-600">Dialer: cold calling experience</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={dialerColdCalling}
                  onChange={(e) => setDialerColdCalling(e.target.value)}
                  rows={3}
                  placeholder="Describe previous cold calling, industries, outcomes"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Dialer: volume comfort</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={dialerVolumeComfort}
                  onChange={(e) => setDialerVolumeComfort(e.target.value)}
                  placeholder="Calls/day, talk time, etc"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Dialer: tools</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={dialerTools}
                  onChange={(e) => setDialerTools(e.target.value)}
                  placeholder="CRM, dialers, scripts, etc"
                />
              </label>
            </>
          ) : null}

          {isCloserTarget ? (
            <>
              <label className="text-sm sm:col-span-2">
                <div className="text-xs font-medium text-zinc-600">Closer: closing experience</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={closerClosingExperience}
                  onChange={(e) => setCloserClosingExperience(e.target.value)}
                  rows={3}
                  placeholder="What have you sold, to who, and what results?"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Closer: typical ticket</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={closerTypicalTicket}
                  onChange={(e) => setCloserTypicalTicket(e.target.value)}
                  placeholder="$3k, $10k, etc"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Closer: price objection</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={closerPriceObjection}
                  onChange={(e) => setCloserPriceObjection(e.target.value)}
                  rows={3}
                  placeholder="How do you handle ‘too expensive’?"
                />
              </label>
            </>
          ) : null}

          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Communication</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenCommunication}
              onChange={(e) => setScreenCommunication(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Objection handling</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenObjections}
              onChange={(e) => setScreenObjections(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Coachability</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenCoachability}
              onChange={(e) => setScreenCoachability(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <div className="text-xs font-medium text-zinc-600">Notes</div>
            <textarea
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={screenNotes}
              onChange={(e) => setScreenNotes(e.target.value)}
              rows={4}
              placeholder="Capabilities, experience, dialer/closer fit, etc"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={savingScreening}
            onClick={() => void saveScreening()}
          >
            {savingScreening ? "Saving..." : "Save screening"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-brand-mist p-6">
        <div className="text-base font-semibold text-brand-ink">Schedule interview</div>
        <div className="mt-1 text-sm text-zinc-600">
          Use the <a className="font-semibold text-brand-ink hover:underline" href="/app/hr/availability">availability calendar</a> to set interviewer blocks.
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm sm:min-w-[340px]">
            <div className="text-xs font-medium text-zinc-600">Pick a slot</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={selectedInterviewIso}
              onChange={(e) => setSelectedInterviewIso(e.target.value)}
              disabled={!availableInterviewSlots.length}
            >
              {!availableInterviewSlots.length ? (
                <option value="">No availability slots found</option>
              ) : null}
              {availableInterviewSlots.map((iso) => (
                <option key={iso} value={iso}>
                  {fmtSlotLabel(iso)}
                </option>
              ))}
            </select>
            {!availableInterviewSlots.length ? (
              <div className="mt-1 text-xs text-zinc-600">
                Add blocks on <a className="font-semibold text-brand-ink hover:underline" href="/app/hr/availability">Interviewer availability</a>.
              </div>
            ) : null}
          </label>

          <div className="hidden">
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={interviewAt}
              onChange={(e) => setInterviewAt(e.target.value)}
            />
          </div>

          <button
            className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={creatingInterview || !selectedInterviewIso}
            onClick={() => void scheduleInterview()}
          >
            {creatingInterview ? "Scheduling..." : "Create interview + link"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Interview question guide</div>
          <div className="mt-2 space-y-1 text-sm text-zinc-700">
            {isDialerTarget ? (
              <>
                <div>• Walk me through your cold call opener. Why it works?</div>
                <div>• How do you handle rapid rejection for 2 hours straight?</div>
                <div>• What’s your process for qualifying vs booking?</div>
                <div>• What volume can you sustain daily and how?</div>
                <div>• Roleplay: you call a lead who says “not interested.”</div>
              </>
            ) : isCloserTarget ? (
              <>
                <div>• What’s your discovery framework? What do you listen for?</div>
                <div>• How do you handle price/“need to think” without pressure?</div>
                <div>• Walk me through your close (timeline, authority, next step).</div>
                <div>• How do you increase show rate / reduce no-shows?</div>
                <div>• Roleplay: prospect says “I need to talk to my spouse.”</div>
              </>
            ) : (
              <>
                <div>• What are you best at in sales? What are you improving?</div>
                <div>• How do you handle objections? Give an example.</div>
                <div>• Why this role and why now?</div>
              </>
            )}
          </div>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-brand-ink">Post-interview evaluation</div>
            <div className="mt-1 text-sm text-zinc-600">If hiring, use Employee invites to onboard.</div>
          </div>
          <a className="text-sm font-semibold text-brand-ink hover:underline" href="/app/hr/invites">
            Employee invites
          </a>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Decision</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={evalDecision}
              onChange={(e) => setEvalDecision(e.target.value as any)}
            >
              <option value="HOLD">Hold</option>
              <option value="HIRE">Hire</option>
              <option value="NO_HIRE">No hire</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Rating (1-5)</div>
            <input
              type="number"
              min={1}
              max={5}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={evalRating}
              onChange={(e) => setEvalRating(Number(e.target.value || "0"))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <div className="text-xs font-medium text-zinc-600">Notes</div>
            <textarea
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              rows={5}
              placeholder="Strengths, concerns, recommendation, next steps"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={savingEval}
            onClick={() => void saveEvaluation()}
          >
            {savingEval ? "Saving..." : "Save evaluation"}
          </button>
        </div>
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
