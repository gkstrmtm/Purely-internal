"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";

type CandidateRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  targetRole: string | null;
  createdAt: string;
};

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function HrCandidatesClient() {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [targetRole, setTargetRole] = useState<"DIALER" | "CLOSER">("DIALER");
  const [notes, setNotes] = useState("");

  const [timezone, setTimezone] = useState("");
  const [availability, setAvailability] = useState("");
  const [experience, setExperience] = useState("");

  const [dialerColdCalling, setDialerColdCalling] = useState("");
  const [dialerVolumeComfort, setDialerVolumeComfort] = useState("");
  const [dialerTools, setDialerTools] = useState("");

  const [closerClosingExperience, setCloserClosingExperience] = useState("");
  const [closerTypicalTicket, setCloserTypicalTicket] = useState("");
  const [closerPriceObjection, setCloserPriceObjection] = useState("");

  const query = useMemo(() => safeOneLine(q), [q]);

  async function load() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query) params.set("q", query);

    const res = await fetch(`/api/hr/candidates?${params.toString()}`, { cache: "no-store" }).catch(() => null as any);
    const body = res ? await res.json().catch(() => ({})) : null;

    if (!res || !res.ok || !body?.ok) {
      setLoading(false);
      const msg = [body?.error ?? "Failed to load candidates", body?.code].filter(Boolean).join(" • ");
      setError(msg);
      setRows([]);
      return;
    }

    const normalized: CandidateRow[] = (body.candidates ?? []).map((c: any) => ({
      id: String(c.id),
      fullName: String(c.fullName || ""),
      email: c.email ? String(c.email) : null,
      phone: c.phone ? String(c.phone) : null,
      status: String(c.status || ""),
      source: c.source ? String(c.source) : null,
      targetRole: c.targetRole ? String(c.targetRole) : null,
      createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date(c.createdAt).toISOString(),
    }));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate() {
    setCreating(true);
    setError(null);

    const intake: any = {
      targetRole,
      timezone: safeOneLine(timezone),
      availability: safeOneLine(availability),
      experience: safeOneLine(experience),
    };

    if (targetRole === "DIALER") {
      intake.dialer = {
        coldCalling: String(dialerColdCalling || "").trim(),
        volumeComfort: safeOneLine(dialerVolumeComfort),
        tools: safeOneLine(dialerTools),
      };
    }

    if (targetRole === "CLOSER") {
      intake.closer = {
        closingExperience: String(closerClosingExperience || "").trim(),
        typicalTicket: safeOneLine(closerTypicalTicket),
        priceObjection: String(closerPriceObjection || "").trim(),
      };
    }

    const res = await fetch("/api/hr/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        phone,
        source,
        targetRole,
        notes,
        intake,
      }),
    }).catch(() => null as any);

    const body = res ? await res.json().catch(() => ({})) : null;
    setCreating(false);

    if (!res || !res.ok || !body?.ok) {
      setError([body?.error ?? "Failed to create candidate", body?.code].filter(Boolean).join(" • "));
      return;
    }

    setFullName("");
    setEmail("");
    setPhone("");
    setSource("");
    setTargetRole("DIALER");
    setNotes("");

    setTimezone("");
    setAvailability("");
    setExperience("");
    setDialerColdCalling("");
    setDialerVolumeComfort("");
    setDialerTools("");
    setCloserClosingExperience("");
    setCloserTypicalTicket("");
    setCloserPriceObjection("");

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
        <div className="text-base font-semibold text-brand-ink">Add candidate</div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Candidate for</div>
            <div className="mt-1">
              <PortalListboxDropdown<string>
                value={targetRole}
                onChange={(v) => setTargetRole(v as any)}
                options={[
                  { value: "DIALER", label: "Dialer" },
                  { value: "CLOSER", label: "Closer" },
                ]}
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              />
            </div>
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Full name</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Email</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Phone</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1..."
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Source</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Indeed, referral, etc"
            />
          </label>

          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Timezone</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="EST, CST, etc"
            />
          </label>
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Availability</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              placeholder="Weekdays 9-5, evenings, etc"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <div className="text-xs font-medium text-zinc-600">Experience (short)</div>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="2y SDR, 1y closer, etc"
            />
          </label>

          {targetRole === "DIALER" ? (
            <>
              <div className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Dialer questions</div>
              <label className="text-sm sm:col-span-2">
                <div className="text-xs font-medium text-zinc-600">Cold calling experience</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={dialerColdCalling}
                  onChange={(e) => setDialerColdCalling(e.target.value)}
                  rows={3}
                  placeholder="Industries, volume, results, etc"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Comfort with volume</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={dialerVolumeComfort}
                  onChange={(e) => setDialerVolumeComfort(e.target.value)}
                  placeholder="Calls/day, talk time, etc"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Tools</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={dialerTools}
                  onChange={(e) => setDialerTools(e.target.value)}
                  placeholder="CRM, dialers, scripts"
                />
              </label>
            </>
          ) : null}

          {targetRole === "CLOSER" ? (
            <>
              <div className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Closer questions</div>
              <label className="text-sm sm:col-span-2">
                <div className="text-xs font-medium text-zinc-600">Closing experience</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={closerClosingExperience}
                  onChange={(e) => setCloserClosingExperience(e.target.value)}
                  rows={3}
                  placeholder="What have you sold, to who, and results?"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Typical ticket</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  value={closerTypicalTicket}
                  onChange={(e) => setCloserTypicalTicket(e.target.value)}
                  placeholder="$3k, $10k, etc"
                />
              </label>
              <label className="text-sm">
                <div className="text-xs font-medium text-zinc-600">Handling price objection</div>
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

          <label className="text-sm sm:col-span-2">
            <div className="text-xs font-medium text-zinc-600">Notes</div>
            <textarea
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={creating || !safeOneLine(fullName)}
            onClick={() => void onCreate()}
          >
            {creating ? "Creating..." : "Create"}
          </button>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-zinc-900">Candidates</div>
        <input
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name/email/phone"
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
        <button className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading ? <div className="text-sm text-zinc-600">Loading...</div> : null}

      {!loading && rows.length === 0 ? <div className="text-sm text-zinc-600">No candidates yet.</div> : null}

      <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/app/hr/${c.id}`}
            className="block px-4 py-3 hover:bg-zinc-50"
            prefetch={false}
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-zinc-900">{c.fullName}</div>
                <div className="text-sm text-zinc-600">
                  {[c.targetRole, c.email, c.phone, c.source].filter(Boolean).join(" • ") || "No contact info"}
                </div>
              </div>
              <div className="text-sm text-zinc-600">{c.status} • {fmtDate(c.createdAt)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
