"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

type ReportingPayload = {
  ok: boolean;
  range: RangeKey;
  startIso: string;
  endIso: string;
  creditsRemaining: number;
  kpis: {
    automationsRun: number;
    aiCalls: number;
    aiCompleted: number;
    aiFailed: number;
    missedCallAttempts: number;
    missedCalls: number;
    textsSent: number;
    textsFailed: number;
    leadScrapeRuns: number;
    leadScrapeChargedCredits: number;
    leadScrapeRefundedCredits: number;
    creditsUsed: number;
    bookingsCreated: number;
    reviewsCollected: number;
    avgReviewRating: number | null;
    leadsCreated: number;
    contactsCreated: number;
  };
  daily: Array<{
    day: string;
    aiCalls: number;
    missedCalls: number;
    leadScrapeRuns: number;
    bookings: number;
    reviews: number;
    creditsUsed: number;
  }>;
  error?: string;
};

type TwilioMasked = {
  configured: boolean;
  accountSidMasked: string | null;
  fromNumberE164: string | null;
  hasAuthToken: boolean;
  updatedAtIso: string | null;
};

function formatIsoDay(isoDay: string) {
  try {
    const d = new Date(`${isoDay}T00:00:00.000Z`);
    return d.toLocaleDateString();
  } catch {
    return isoDay;
  }
}

function formatRating(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type StatTone = "blue" | "pink" | "ink" | "emerald";

function toneClasses(tone: StatTone) {
  switch (tone) {
    case "blue":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(29,78,216,0.92),rgba(29,78,216,0.22))]",
        ring: "ring-1 ring-[color:rgba(29,78,216,0.16)]",
        pill: "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]",
      };
    case "pink":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(251,113,133,0.92),rgba(251,113,133,0.18))]",
        ring: "ring-1 ring-[color:rgba(251,113,133,0.16)]",
        pill: "bg-[color:rgba(251,113,133,0.14)] text-[color:var(--color-brand-pink)]",
      };
    case "emerald":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(16,185,129,0.88),rgba(16,185,129,0.18))]",
        ring: "ring-1 ring-[color:rgba(16,185,129,0.14)]",
        pill: "bg-emerald-50 text-emerald-700",
      };
    case "ink":
    default:
      return {
        bar: "bg-[linear-gradient(90deg,rgba(51,65,85,0.92),rgba(51,65,85,0.22))]",
        ring: "ring-1 ring-[color:rgba(51,65,85,0.14)]",
        pill: "bg-[color:rgba(51,65,85,0.10)] text-brand-ink",
      };
  }
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: StatTone }) {
  const t = toneClasses(tone);
  return (
    <div className={classNames("rounded-3xl border border-zinc-200 bg-white p-6", t.ring)}>
      <div className={classNames("mb-4 h-1.5 w-14 rounded-full", t.bar)} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-500">{label}</div>
        <div className={classNames("h-2.5 w-2.5 rounded-full", t.pill)} aria-hidden="true" />
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function MenuButton({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
      >
        ⋯
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-10 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
          <button
            type="button"
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            onClick={() => {
              setOpen(false);
              onAdd();
            }}
          >
            Add to dashboard
          </button>
          <button
            type="button"
            className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PortalReportingClient() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [data, setData] = useState<ReportingPayload | null>(null);
  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function addWidget(widgetId: string) {
    setNote(null);
    const res = await fetch("/api/portal/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", widgetId }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body?.ok) {
      setNote(body?.error ?? "Unable to add to dashboard");
      window.setTimeout(() => setNote(null), 2500);
      return;
    }
    setNote("Added to dashboard.");
    window.setTimeout(() => setNote(null), 1800);
  }

  async function load(nextRange: RangeKey) {
    setLoading(true);
    setError(null);

    const [repRes, twilioRes] = await Promise.all([
      fetch(`/api/portal/reporting?range=${encodeURIComponent(nextRange)}`, { cache: "no-store" }),
      fetch("/api/portal/integrations/twilio", { cache: "no-store" }).catch(() => null as any),
    ]);

    if (!repRes.ok) {
      const body = (await repRes.json().catch(() => ({}))) as { error?: string };
      setError(body?.error ?? "Unable to load reporting");
      setData(null);
      setLoading(false);
      return;
    }

    const rep = (await repRes.json().catch(() => null)) as ReportingPayload | null;
    if (!rep?.ok) {
      setError(rep?.error ?? "Unable to load reporting");
      setData(null);
      setLoading(false);
      return;
    }

    setData(rep);

    if (twilioRes?.ok) {
      const body = (await twilioRes.json().catch(() => ({}))) as { ok?: boolean; twilio?: TwilioMasked };
      setTwilio(body?.twilio ?? null);
    } else {
      setTwilio(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dailyRows = useMemo(() => {
    const rows = Array.isArray(data?.daily) ? data!.daily : [];
    return rows.slice().reverse().slice(0, 14);
  }, [data]);

  const rangeLabel =
    range === "today" ? "Today" : range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : "All time";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Reporting</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            A dashboard view of activity, outcomes, and credit usage across your services.
          </p>
        </div>
        <Link
          href="/portal/app/services"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{rangeLabel}</div>
        <div className="flex flex-wrap gap-2">
          {([
            ["today", "Today"],
            ["7d", "7d"],
            ["30d", "30d"],
            ["90d", "90d"],
            ["all", "All"],
          ] as Array<[RangeKey, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setRange(key);
                void load(key);
              }}
              className={
                range === key
                  ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

      {loading ? (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : !data ? null : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <div className="absolute right-4 top-4">
                <MenuButton onAdd={() => void addWidget("creditsRemaining")} />
              </div>
              <StatCard label="Credits remaining" value={data.creditsRemaining.toLocaleString()} sub="Top up in Billing" tone="blue" />
            </div>
            <div className="relative">
              <div className="absolute right-4 top-4">
                <MenuButton onAdd={() => void addWidget("creditsUsed")} />
              </div>
              <StatCard label="Credits used" value={data.kpis.creditsUsed.toLocaleString()} sub="AI calls + lead scraping" tone="pink" />
            </div>
            <div className="relative">
              <div className="absolute right-4 top-4">
                <MenuButton onAdd={() => void addWidget("automationsRun")} />
              </div>
              <StatCard label="Automations run" value={data.kpis.automationsRun.toLocaleString()} sub="Calls + texts + runs" tone="ink" />
            </div>
            <div className="relative">
              <div className="absolute right-4 top-4">
                <MenuButton onAdd={() => void addWidget("aiCalls")} />
              </div>
              <StatCard label="AI calls" value={data.kpis.aiCalls.toLocaleString()} sub={`${data.kpis.aiCompleted} completed · ${data.kpis.aiFailed} failed`} tone="blue" />
            </div>
            <div className="relative">
              <div className="absolute right-4 top-4">
                <MenuButton onAdd={() => void addWidget("missedCalls")} />
              </div>
              <StatCard label="Missed calls" value={data.kpis.missedCalls.toLocaleString()} sub={`${data.kpis.textsSent} texts sent · ${data.kpis.textsFailed} failed`} tone="pink" />
            </div>
            <div className="relative">
              <div className="absolute right-4 top-4">
                <MenuButton onAdd={() => void addWidget("bookingsCreated")} />
              </div>
              <StatCard label="Bookings created" value={data.kpis.bookingsCreated.toLocaleString()} sub="New appointments" tone="emerald" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
              <div className="mb-4 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Recent activity (UTC days)</div>
                  <div className="mt-1 text-xs text-zinc-500">Showing the last 14 days of breakdown.</div>
                </div>
                <MenuButton onAdd={() => void addWidget("dailyActivity")} />
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-[color:rgba(29,78,216,0.04)] text-xs text-zinc-600">
                      <th className="py-2 pr-3">Day</th>
                      <th className="py-2 pr-3">AI calls</th>
                      <th className="py-2 pr-3">Missed calls</th>
                      <th className="py-2 pr-3">Lead runs</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Reviews</th>
                      <th className="py-2 pr-0">Credits used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((r) => (
                      <tr key={r.day} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-700">{formatIsoDay(r.day)}</td>
                        <td className="py-2 pr-3 text-zinc-700">
                          <span className="inline-flex rounded-full bg-[color:rgba(29,78,216,0.08)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-blue)]">
                            {r.aiCalls}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">
                          <span className="inline-flex rounded-full bg-[color:rgba(251,113,133,0.10)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-pink)]">
                            {r.missedCalls}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">{r.leadScrapeRuns}</td>
                        <td className="py-2 pr-3 text-zinc-700">{r.bookings}</td>
                        <td className="py-2 pr-3 text-zinc-700">{r.reviews}</td>
                        <td className="py-2 pr-0 text-zinc-700">{r.creditsUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Quality & inputs</div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Reviews collected</div>
                <div className="mt-1 text-lg font-bold text-brand-ink">{data.kpis.reviewsCollected.toLocaleString()}</div>
                <div className="mt-1 text-xs text-zinc-500">Avg rating: {formatRating(data.kpis.avgReviewRating)}</div>
                <div className="mt-3 flex justify-end">
                  <MenuButton onAdd={() => void addWidget("reviewsCollected")} />
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Leads created</div>
                <div className="mt-1 text-lg font-bold text-brand-ink">{data.kpis.leadsCreated.toLocaleString()}</div>
                <div className="mt-1 text-xs text-zinc-500">Contacts created: {data.kpis.contactsCreated.toLocaleString()}</div>
                <div className="mt-3 flex justify-end">
                  <MenuButton onAdd={() => void addWidget("leadsCreated")} />
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Lead scraping</div>
                <div className="mt-1 text-sm text-zinc-700">Runs: {data.kpis.leadScrapeRuns.toLocaleString()}</div>
                <div className="mt-1 text-sm text-zinc-700">Charged: {data.kpis.leadScrapeChargedCredits.toLocaleString()} credits</div>
                <div className="mt-1 text-sm text-zinc-700">Refunded: {data.kpis.leadScrapeRefundedCredits.toLocaleString()} credits</div>
                <div className="mt-3 flex justify-end">
                  <MenuButton onAdd={() => void addWidget("leadScrapeRuns")} />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-600">Integration status</div>
                <div className="mt-2 text-sm text-zinc-700">
                  {twilio?.configured ? (
                    <>
                      Twilio SMS: <span className="font-semibold text-emerald-700">connected</span>
                      <div className="mt-1 text-xs text-zinc-500">
                        From: {twilio.fromNumberE164 ?? "—"}
                      </div>
                    </>
                  ) : (
                    <>
                      Twilio SMS: <span className="font-semibold text-zinc-700">not connected</span>
                      <div className="mt-1 text-xs text-zinc-500">Connect in Billing or Integrations as needed.</div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                More KPIs (ROI, deliverability, attribution, exports) can be added as those data sources are wired in.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
