"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InterviewRow = {
  id: string;
  scheduledAt: string;
  status: string;
  meetingJoinUrl: string | null;
  candidate: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    targetRole: string | null;
    status: string;
  };
};

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function HrInterviewsClient() {
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/hr/interviews", { cache: "no-store" }).catch(() => null as any);
    const body = res ? await res.json().catch(() => ({})) : null;

    if (!res || !res.ok || !body?.ok) {
      setLoading(false);
      setError([body?.error ?? "Failed to load interviews", body?.code].filter(Boolean).join(" • "));
      setRows([]);
      return;
    }

    const normalized: InterviewRow[] = (body.interviews ?? []).map((i: any) => ({
      id: String(i.id),
      scheduledAt: typeof i.scheduledAt === "string" ? i.scheduledAt : new Date(i.scheduledAt).toISOString(),
      status: String(i.status || ""),
      meetingJoinUrl: i.meetingJoinUrl ? String(i.meetingJoinUrl) : null,
      candidate: {
        id: String(i.candidate?.id || ""),
        fullName: String(i.candidate?.fullName || ""),
        email: i.candidate?.email ? String(i.candidate.email) : null,
        phone: i.candidate?.phone ? String(i.candidate.phone) : null,
        targetRole: i.candidate?.targetRole ? String(i.candidate.targetRole) : null,
        status: String(i.candidate?.status || ""),
      },
    }));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="text-sm text-zinc-600">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!rows.length) return <div className="text-sm text-zinc-600">No upcoming interviews.</div>;

  return (
    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
      {rows.map((i) => (
        <div key={i.id} className="px-4 py-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium text-zinc-900">{i.candidate.fullName || "Candidate"}</div>
              <div className="text-sm text-zinc-600">
                {fmtDate(i.scheduledAt)} • {i.status}
                {i.candidate.targetRole ? ` • ${i.candidate.targetRole}` : ""}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50" href={`/app/hr/${i.candidate.id}`}>
                Open
              </Link>
              {i.meetingJoinUrl ? (
                <Link
                  className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                  href={i.meetingJoinUrl}
                  target="_blank"
                >
                  Join
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
