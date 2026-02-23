"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
        <div className="text-base font-semibold text-brand-ink">Add candidate</div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <div className="text-xs font-medium text-zinc-600">Candidate for</div>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as any)}
            >
              <option value="DIALER">Dialer</option>
              <option value="CLOSER">Closer</option>
            </select>
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
