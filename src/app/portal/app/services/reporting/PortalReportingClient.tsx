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

type ServiceKey =
  | "all"
  | "reporting"
  | "billing"
  | "aiReceptionist"
  | "missedCallTextBack"
  | "booking"
  | "reviews"
  | "leadScraping";

type ServiceInfo = { key: ServiceKey; name: string; href: string | null };

const SERVICE_INFOS: ServiceInfo[] = [
  { key: "all", name: "All services", href: null },
  { key: "reporting", name: "Reporting", href: "/portal/app/services/reporting" },
  { key: "billing", name: "Billing", href: "/portal/app/billing" },
  { key: "aiReceptionist", name: "AI Receptionist", href: "/portal/app/services/ai-receptionist" },
  { key: "missedCallTextBack", name: "Missed-Call Text Back", href: "/portal/app/services/missed-call-textback" },
  { key: "booking", name: "Booking Automation", href: "/portal/app/services/booking" },
  { key: "reviews", name: "Review Requests", href: "/portal/app/services/reviews" },
  { key: "leadScraping", name: "Lead Scraping", href: "/portal/app/services/lead-scraping" },
];

function matchTokens(query: string, terms: string[]) {
  const q = (query ?? "").toLowerCase().trim();
  if (!q) return true;
  const haystack = terms
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

function isPlainNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function serviceForWidget(widgetId: string): ServiceInfo {
  switch (widgetId) {
    case "creditsRemaining":
    case "creditsUsed":
      return SERVICE_INFOS.find((s) => s.key === "billing")!;
    case "aiCalls":
      return SERVICE_INFOS.find((s) => s.key === "aiReceptionist")!;
    case "missedCalls":
      return SERVICE_INFOS.find((s) => s.key === "missedCallTextBack")!;
    case "bookingsCreated":
      return SERVICE_INFOS.find((s) => s.key === "booking")!;
    case "reviewsCollected":
    case "avgReviewRating":
      return SERVICE_INFOS.find((s) => s.key === "reviews")!;
    case "leadScrapeRuns":
    case "leadsCreated":
    case "contactsCreated":
      return SERVICE_INFOS.find((s) => s.key === "leadScraping")!;
    case "dailyActivity":
    case "automationsRun":
    default:
      return SERVICE_INFOS.find((s) => s.key === "reporting")!;
  }
}

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

function MenuButton({
  id,
  openId,
  setOpenId,
  onAdd,
  goToHref,
  goToLabel,
}: {
  id: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onAdd: () => void;
  goToHref?: string | null;
  goToLabel?: string | null;
}) {
  const open = openId === id;
  return (
    <div
      className="relative"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        onClick={() => setOpenId(open ? null : id)}
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
              setOpenId(null);
              onAdd();
            }}
          >
            Add to dashboard
          </button>
          {isPlainNonEmptyString(goToHref) && isPlainNonEmptyString(goToLabel) ? (
            <button
              type="button"
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                setOpenId(null);
                window.location.href = goToHref;
              }}
            >
              Go to {goToLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => setOpenId(null)}
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

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceKey>("all");

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

  useEffect(() => {
    if (!openMenuId) return;
    const onDown = () => setOpenMenuId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

  function visible(widgetId: string, serviceKey: ServiceKey, terms: string[]) {
    const service = SERVICE_INFOS.find((s) => s.key === serviceKey);
    const serviceName = service?.name ?? "";
    const serviceOk = serviceFilter === "all" || serviceFilter === serviceKey;
    return serviceOk && matchTokens(search, [...terms, serviceName]);
  }

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

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search metrics or services…"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-[color:var(--color-brand-blue)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-zinc-500">Service</div>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value as ServiceKey)}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink outline-none focus:border-[color:var(--color-brand-blue)]"
          >
            {SERVICE_INFOS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

      {loading ? (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : !data ? null : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible("creditsRemaining", "billing", ["Credits remaining", "Top up", "Billing", "Credits"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  <MenuButton
                    id="creditsRemaining"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("creditsRemaining")}
                    goToHref={serviceForWidget("creditsRemaining").href}
                    goToLabel={serviceForWidget("creditsRemaining").name}
                  />
                </div>
                <StatCard label="Credits remaining" value={data.creditsRemaining.toLocaleString()} sub="Top up in Billing" tone="blue" />
              </div>
            ) : null}

            {visible("creditsUsed", "billing", ["Credits used", "AI calls", "Lead scraping", "Billing", "Credits"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  <MenuButton
                    id="creditsUsed"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("creditsUsed")}
                    goToHref={serviceForWidget("creditsUsed").href}
                    goToLabel={serviceForWidget("creditsUsed").name}
                  />
                </div>
                <StatCard label="Credits used" value={data.kpis.creditsUsed.toLocaleString()} sub="AI calls + lead scraping" tone="pink" />
              </div>
            ) : null}

            {visible("automationsRun", "reporting", ["Automations run", "Calls", "Texts", "Runs"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  <MenuButton
                    id="automationsRun"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("automationsRun")}
                    goToHref={serviceForWidget("automationsRun").href}
                    goToLabel={serviceForWidget("automationsRun").name}
                  />
                </div>
                <StatCard label="Automations run" value={data.kpis.automationsRun.toLocaleString()} sub="Calls + texts + runs" tone="ink" />
              </div>
            ) : null}

            {visible("aiCalls", "aiReceptionist", ["AI calls", "Completed", "Failed", "Receptionist"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  <MenuButton
                    id="aiCalls"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("aiCalls")}
                    goToHref={serviceForWidget("aiCalls").href}
                    goToLabel={serviceForWidget("aiCalls").name}
                  />
                </div>
                <StatCard
                  label="AI calls"
                  value={data.kpis.aiCalls.toLocaleString()}
                  sub={`${data.kpis.aiCompleted} completed · ${data.kpis.aiFailed} failed`}
                  tone="blue"
                />
              </div>
            ) : null}

            {visible("missedCalls", "missedCallTextBack", ["Missed calls", "Texts sent", "Text back"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  <MenuButton
                    id="missedCalls"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("missedCalls")}
                    goToHref={serviceForWidget("missedCalls").href}
                    goToLabel={serviceForWidget("missedCalls").name}
                  />
                </div>
                <StatCard
                  label="Missed calls"
                  value={data.kpis.missedCalls.toLocaleString()}
                  sub={`${data.kpis.textsSent} texts sent · ${data.kpis.textsFailed} failed`}
                  tone="pink"
                />
              </div>
            ) : null}

            {visible("bookingsCreated", "booking", ["Bookings created", "Appointments"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  <MenuButton
                    id="bookingsCreated"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("bookingsCreated")}
                    goToHref={serviceForWidget("bookingsCreated").href}
                    goToLabel={serviceForWidget("bookingsCreated").name}
                  />
                </div>
                <StatCard label="Bookings created" value={data.kpis.bookingsCreated.toLocaleString()} sub="New appointments" tone="emerald" />
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {visible("dailyActivity", "reporting", ["Recent activity", "UTC", "Day", "AI calls", "Missed calls", "Credits used"]) ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
              <div className="mb-4 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Recent activity (UTC days)</div>
                  <div className="mt-1 text-xs text-zinc-500">Showing the last 14 days of breakdown.</div>
                </div>
                <MenuButton
                  id="dailyActivity"
                  openId={openMenuId}
                  setOpenId={setOpenMenuId}
                  onAdd={() => void addWidget("dailyActivity")}
                  goToHref={serviceForWidget("dailyActivity").href}
                  goToLabel={serviceForWidget("dailyActivity").name}
                />
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
            ) : null}

            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Quality & inputs</div>

              {visible("reviewsCollected", "reviews", ["Reviews collected", "Average rating", "Review" ]) ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Reviews collected</div>
                <div className="mt-1 text-lg font-bold text-brand-ink">{data.kpis.reviewsCollected.toLocaleString()}</div>
                <div className="mt-1 text-xs text-zinc-500">Avg rating: {formatRating(data.kpis.avgReviewRating)}</div>
                <div className="mt-3 flex justify-end">
                  <MenuButton
                    id="reviewsCollected"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("reviewsCollected")}
                    goToHref={serviceForWidget("reviewsCollected").href}
                    goToLabel={serviceForWidget("reviewsCollected").name}
                  />
                </div>
              </div>
              ) : null}

              {visible("leadsCreated", "leadScraping", ["Leads created", "Contacts created", "Lead", "Contact"]) ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Leads created</div>
                <div className="mt-1 text-lg font-bold text-brand-ink">{data.kpis.leadsCreated.toLocaleString()}</div>
                <div className="mt-1 text-xs text-zinc-500">Contacts created: {data.kpis.contactsCreated.toLocaleString()}</div>
                <div className="mt-3 flex justify-end">
                  <MenuButton
                    id="leadsCreated"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("leadsCreated")}
                    goToHref={serviceForWidget("leadsCreated").href}
                    goToLabel={serviceForWidget("leadsCreated").name}
                  />
                </div>
              </div>
              ) : null}

              {visible("leadScrapeRuns", "leadScraping", ["Lead scraping", "Runs", "Charged", "Refunded"]) ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Lead scraping</div>
                <div className="mt-1 text-sm text-zinc-700">Runs: {data.kpis.leadScrapeRuns.toLocaleString()}</div>
                <div className="mt-1 text-sm text-zinc-700">Charged: {data.kpis.leadScrapeChargedCredits.toLocaleString()} credits</div>
                <div className="mt-1 text-sm text-zinc-700">Refunded: {data.kpis.leadScrapeRefundedCredits.toLocaleString()} credits</div>
                <div className="mt-3 flex justify-end">
                  <MenuButton
                    id="leadScrapeRuns"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("leadScrapeRuns")}
                    goToHref={serviceForWidget("leadScrapeRuns").href}
                    goToLabel={serviceForWidget("leadScrapeRuns").name}
                  />
                </div>
              </div>
              ) : null}

              {visible("integrationStatus", "billing", ["Integration status", "Twilio", "SMS", "connected", "not connected"]) ? (
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
              ) : null}

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
