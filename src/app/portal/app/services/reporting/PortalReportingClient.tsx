"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

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
    blogGenerations: number;
    blogCreditsUsed: number;
    creditsUsed: number;
    bookingsCreated: number;
    reviewsCollected: number;
    avgReviewRating: number | null;
    leadsCreated: number;
    contactsCreated: number;

    aiOutboundQueuedNow: number;
    aiOutboundCompleted: number;
    aiOutboundFailed: number;

    nurtureEnrollmentsCreated: number;
    nurtureEnrollmentsActiveNow: number;
    nurtureEnrollmentsCompleted: number;

    newsletterSendEvents: number;
    newsletterSentCount: number;
    newsletterFailedCount: number;

    tasksOpenNow: number;
    tasksCompleted: number;

    inboxMessagesIn: number;
    inboxMessagesOut: number;
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

type DashboardData = {
  version: 1;
  widgets: Array<{ id: string }>;
  layout: Array<any>;
};

type TwilioMasked = {
  configured: boolean;
  accountSidMasked: string | null;
  fromNumberE164: string | null;
  hasAuthToken: boolean;
  updatedAtIso: string | null;
};

type MediaStatsPayload =
  | { ok: true; itemsCount: number; foldersCount: number }
  | { ok: false; error?: string };

type ServiceKey =
  | "all"
  | "reporting"
  | "billing"
  | "mediaLibrary"
  | "aiReceptionist"
  | "aiOutboundCalls"
  | "missedCallTextBack"
  | "booking"
  | "blogs"
  | "reviews"
  | "leadScraping"
  | "newsletter"
  | "nurtureCampaigns"
  | "tasks"
  | "inbox";

type ServiceInfo = { key: ServiceKey; name: string; href: string | null };

const SERVICE_INFOS: ServiceInfo[] = [
  { key: "all", name: "All services", href: null },
  { key: "reporting", name: "Reporting", href: "/portal/app/services/reporting" },
  { key: "billing", name: "Billing", href: "/portal/app/billing" },
  { key: "mediaLibrary", name: "Media Library", href: "/portal/app/services/media-library" },
  { key: "aiReceptionist", name: "AI Receptionist", href: "/portal/app/services/ai-receptionist" },
  { key: "aiOutboundCalls", name: "AI Outbound Calls", href: "/portal/app/services/ai-outbound-calls" },
  { key: "missedCallTextBack", name: "Missed-Call Text Back", href: "/portal/app/services/missed-call-textback" },
  { key: "booking", name: "Booking Automation", href: "/portal/app/services/booking" },
  { key: "blogs", name: "Automated Blogs", href: "/portal/app/services/blogs" },
  { key: "newsletter", name: "Newsletter", href: "/portal/app/services/newsletter" },
  { key: "nurtureCampaigns", name: "Nurture Campaigns", href: "/portal/app/services/nurture-campaigns" },
  { key: "tasks", name: "Tasks", href: "/portal/app/services/tasks" },
  { key: "inbox", name: "Inbox / Outbox", href: "/portal/app/services/inbox" },
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
    case "mediaLibrary":
      return SERVICE_INFOS.find((s) => s.key === "mediaLibrary")!;
    case "creditsRemaining":
    case "creditsUsed":
      return SERVICE_INFOS.find((s) => s.key === "billing")!;
    case "blogGenerations":
    case "blogCreditsUsed":
      return SERVICE_INFOS.find((s) => s.key === "blogs")!;
    case "aiCalls":
      return SERVICE_INFOS.find((s) => s.key === "aiReceptionist")!;
    case "aiOutboundCalls":
      return SERVICE_INFOS.find((s) => s.key === "aiOutboundCalls")!;
    case "missedCalls":
      return SERVICE_INFOS.find((s) => s.key === "missedCallTextBack")!;
    case "bookingsCreated":
      return SERVICE_INFOS.find((s) => s.key === "booking")!;
    case "reviewsCollected":
    case "avgReviewRating":
      return SERVICE_INFOS.find((s) => s.key === "reviews")!;
    case "newsletterSends":
      return SERVICE_INFOS.find((s) => s.key === "newsletter")!;
    case "nurtureEnrollments":
      return SERVICE_INFOS.find((s) => s.key === "nurtureCampaigns")!;
    case "tasks":
      return SERVICE_INFOS.find((s) => s.key === "tasks")!;
    case "inboxMessagesIn":
    case "inboxMessagesOut":
      return SERVICE_INFOS.find((s) => s.key === "inbox")!;
    case "leadScrapeRuns":
    case "leadsCreated":
    case "contactsCreated":
      return SERVICE_INFOS.find((s) => s.key === "leadScraping")!;
    case "dailyActivity":
    case "automationsRun":
    case "successRate":
    case "failures":
    case "creditsRunway":
    case "leadsCaptured":
    case "reliabilitySummary":
    default:
      // We are already on Reporting; don’t show a redundant “Go to reporting” menu item.
      return { key: "reporting", name: "Reporting", href: null };

    case "perfAiReceptionist":
      return SERVICE_INFOS.find((s) => s.key === "aiReceptionist")!;
    case "perfMissedCallTextBack":
      return SERVICE_INFOS.find((s) => s.key === "missedCallTextBack")!;
    case "perfLeadScraping":
      return SERVICE_INFOS.find((s) => s.key === "leadScraping")!;
    case "perfReviews":
      return SERVICE_INFOS.find((s) => s.key === "reviews")!;
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
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return value.toFixed(1);
}

function formatPct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function daysBetweenIso(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  const days = Math.round((end - start) / 86_400_000);
  return clampInt(days || 1, 1, 3650);
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type StatTone = "blue" | "pink" | "ink" | "emerald" | "slate" | "violet" | "amber";

function toneClasses(tone: StatTone) {
  switch (tone) {
    case "blue":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(29,78,216,0.92),rgba(29,78,216,0.22))]",
        ring: "ring-1 ring-[color:rgba(29,78,216,0.16)]",
        pill: "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]",
        icon: "border-[color:rgba(29,78,216,0.20)] bg-[color:rgba(29,78,216,0.10)] text-[color:rgba(29,78,216,0.95)]",
        softBg: "bg-[color:rgba(29,78,216,0.04)]",
      };
    case "pink":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(251,113,133,0.92),rgba(251,113,133,0.18))]",
        ring: "ring-1 ring-[color:rgba(251,113,133,0.16)]",
        pill: "bg-[color:rgba(251,113,133,0.14)] text-[color:var(--color-brand-pink)]",
        icon: "border-[color:rgba(251,113,133,0.22)] bg-[color:rgba(251,113,133,0.14)] text-[color:rgba(251,113,133,0.95)]",
        softBg: "bg-[color:rgba(251,113,133,0.05)]",
      };
    case "emerald":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(16,185,129,0.88),rgba(16,185,129,0.18))]",
        ring: "ring-1 ring-[color:rgba(16,185,129,0.14)]",
        pill: "bg-emerald-50 text-emerald-700",
        icon: "border-emerald-200 bg-emerald-50 text-emerald-700",
        softBg: "bg-[color:rgba(16,185,129,0.05)]",
      };
    case "violet":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(124,58,237,0.92),rgba(124,58,237,0.18))]",
        ring: "ring-1 ring-[color:rgba(124,58,237,0.16)]",
        pill: "bg-[color:rgba(124,58,237,0.10)] text-[color:rgba(124,58,237,0.95)]",
        icon: "border-[color:rgba(124,58,237,0.20)] bg-[color:rgba(124,58,237,0.10)] text-[color:rgba(124,58,237,0.95)]",
        softBg: "bg-[color:rgba(124,58,237,0.05)]",
      };
    case "amber":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(245,158,11,0.92),rgba(245,158,11,0.18))]",
        ring: "ring-1 ring-[color:rgba(245,158,11,0.18)]",
        pill: "bg-[color:rgba(245,158,11,0.12)] text-[color:rgba(180,83,9,0.95)]",
        icon: "border-[color:rgba(245,158,11,0.22)] bg-[color:rgba(245,158,11,0.12)] text-[color:rgba(180,83,9,0.95)]",
        softBg: "bg-[color:rgba(245,158,11,0.06)]",
      };
    case "slate":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(100,116,139,0.92),rgba(100,116,139,0.22))]",
        ring: "ring-1 ring-[color:rgba(100,116,139,0.14)]",
        pill: "bg-slate-50 text-slate-700",
        icon: "border-slate-200 bg-slate-50 text-slate-700",
        softBg: "bg-slate-50",
      };
    case "ink":
    default:
      return {
        bar: "bg-[linear-gradient(90deg,rgba(51,65,85,0.92),rgba(51,65,85,0.22))]",
        ring: "ring-1 ring-[color:rgba(51,65,85,0.14)]",
        pill: "bg-[color:rgba(51,65,85,0.10)] text-brand-ink",
        icon: "border-[color:rgba(51,65,85,0.16)] bg-[color:rgba(51,65,85,0.10)] text-brand-ink",
        softBg: "bg-zinc-50",
      };
  }
}

function StatIconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M8 3.75h6.25L19.25 8.75V18.5A2.75 2.75 0 0 1 16.5 21.25h-8A2.75 2.75 0 0 1 5.75 18.5v-12A2.75 2.75 0 0 1 8.5 3.75H8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3.75V9h5.25" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12.25h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 15.75h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StatIconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 2.75l1.3 4.8a2 2 0 0 0 1.42 1.4l4.78 1.3-4.78 1.3a2 2 0 0 0-1.42 1.4L12 17.75l-1.3-4.8a2 2 0 0 0-1.42-1.4L4.5 10.25l4.78-1.3a2 2 0 0 0 1.42-1.4L12 2.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M19.25 14.25l.55 2.05a1.2 1.2 0 0 0 .85.85l2.05.55-2.05.55a1.2 1.2 0 0 0-.85.85l-.55 2.05-.55-2.05a1.2 1.2 0 0 0-.85-.85l-2.05-.55 2.05-.55a1.2 1.2 0 0 0 .85-.85l.55-2.05Z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: StatTone;
  icon?: React.ReactNode;
}) {
  const t = toneClasses(tone);
  return (
    <div className={classNames("rounded-3xl border border-zinc-200 bg-white p-6", t.ring)}>
      <div className={classNames("mb-4 h-1.5 w-14 rounded-full", t.bar)} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-500">{label}</div>
        {icon ? (
          <div className={classNames("inline-flex items-center justify-center rounded-xl border p-2", t.icon)} aria-hidden="true">
            {icon}
          </div>
        ) : (
          <div className={classNames("h-2.5 w-2.5 rounded-full", t.pill)} aria-hidden="true" />
        )}
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-brand-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function ServicePerfCard({
  title,
  href,
  stats,
  menu,
  tone,
}: {
  title: string;
  href: string | null;
  stats: Array<{ label: string; value: string }>;
  menu?: React.ReactNode;
  tone?: StatTone;
}) {
  const t = toneClasses(tone ?? "slate");
  return (
    <div className={classNames("rounded-3xl border border-zinc-200 bg-white p-6", t.ring)}>
      <div className={classNames("mb-4 h-1.5 w-14 rounded-full", t.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <div className="flex items-center gap-2">
          {href ? (
            <Link href={href} className="text-xs font-semibold text-brand-ink hover:underline">
              View
            </Link>
          ) : null}
          {menu}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.slice(0, 6).map((s) => (
          <div key={s.label} className={classNames("rounded-2xl border border-zinc-200 p-3", t.softBg)}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-zinc-600">{s.label}</div>
              <div className={classNames("h-2.5 w-2.5 rounded-full", t.pill)} aria-hidden="true" />
            </div>
            <div className="mt-1 text-sm font-bold text-brand-ink">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuButton({
  id,
  openId,
  setOpenId,
  onAdd,
  addDisabled,
  addLabel,
  goToHref,
  goToLabel,
}: {
  id: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  addLabel?: string;
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
            className={classNames(
              "w-full rounded-xl px-3 py-2 text-left text-sm font-semibold",
              addDisabled ? "cursor-not-allowed bg-zinc-50 text-zinc-400" : "text-brand-ink hover:bg-zinc-50",
            )}
            disabled={Boolean(addDisabled)}
            onClick={() => {
              setOpenId(null);
              onAdd();
            }}
          >
            {addLabel ?? "Add to dashboard"}
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
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>("30d");
  const [data, setData] = useState<ReportingPayload | null>(null);
  const [mediaStats, setMediaStats] = useState<MediaStatsPayload | null>(null);
  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceKey>("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [dashboardWidgetIds, setDashboardWidgetIds] = useState<Set<string>>(() => new Set());

  async function addWidget(widgetId: string) {
    setNote(null);
    const res = await fetch("/api/portal/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", widgetId }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: DashboardData };
    if (!res.ok || !body?.ok) {
      setNote(body?.error ?? "Unable to add to dashboard");
      window.setTimeout(() => setNote(null), 2500);
      return;
    }

    const ids = new Set<string>(Array.isArray(body?.data?.widgets) ? body!.data!.widgets.map((w) => w.id).filter(Boolean) : []);
    if (ids.size) setDashboardWidgetIds(ids);

    setNote("Added to dashboard.");
    window.setTimeout(() => setNote(null), 1800);
  }

  async function loadDashboardWidgetIds() {
    const res = await fetch("/api/portal/dashboard", { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) return;
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: DashboardData };
    const ids = new Set<string>(Array.isArray(body?.data?.widgets) ? body!.data!.widgets.map((w) => w.id).filter(Boolean) : []);
    if (ids.size) setDashboardWidgetIds(ids);
  }

  async function load(nextRange: RangeKey) {
    setLoading(true);
    setError(null);

    const [repRes, twilioRes, statsRes] = await Promise.all([
      fetch(`/api/portal/reporting?range=${encodeURIComponent(nextRange)}`, { cache: "no-store" }),
      fetch("/api/portal/integrations/twilio", { cache: "no-store" }).catch(() => null as any),
      fetch("/api/portal/media/stats", { cache: "no-store" }).catch(() => null as any),
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

    if (statsRes?.ok) {
      const stats = (await statsRes.json().catch(() => null)) as MediaStatsPayload | null;
      if (stats) setMediaStats(stats);
    }

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
    void loadDashboardWidgetIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    // Use click (not mousedown/touchstart) so menu items can fire reliably
    // before we close the menu.
    const onClick = () => setOpenMenuId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

  const activeServiceKeys = useMemo(() => {
    const keys = new Set<ServiceKey>();
    keys.add("all");
    keys.add("reporting");
    keys.add("billing");

    const statsOk = Boolean((mediaStats as any)?.ok === true);
    const itemsCount = statsOk ? Number((mediaStats as any)?.itemsCount ?? 0) : 0;
    const foldersCount = statsOk ? Number((mediaStats as any)?.foldersCount ?? 0) : 0;
    if (itemsCount > 0 || foldersCount > 0) keys.add("mediaLibrary");

    const k = data?.kpis;
    if (k) {
      if ((k.aiCalls ?? 0) > 0) keys.add("aiReceptionist");
      if ((k.aiOutboundQueuedNow ?? 0) + (k.aiOutboundCompleted ?? 0) + (k.aiOutboundFailed ?? 0) > 0) keys.add("aiOutboundCalls");
      if ((k.missedCallAttempts ?? 0) + (k.missedCalls ?? 0) + (k.textsSent ?? 0) + (k.textsFailed ?? 0) > 0) keys.add("missedCallTextBack");
      if ((k.bookingsCreated ?? 0) > 0) keys.add("booking");
      if ((k.reviewsCollected ?? 0) > 0) keys.add("reviews");
      if ((k.leadScrapeRuns ?? 0) > 0) keys.add("leadScraping");
      if ((k.blogGenerations ?? 0) > 0) keys.add("blogs");
      if ((k.newsletterSendEvents ?? 0) + (k.newsletterSentCount ?? 0) + (k.newsletterFailedCount ?? 0) > 0) keys.add("newsletter");
      if ((k.nurtureEnrollmentsCreated ?? 0) + (k.nurtureEnrollmentsActiveNow ?? 0) + (k.nurtureEnrollmentsCompleted ?? 0) > 0) keys.add("nurtureCampaigns");
      if ((k.tasksOpenNow ?? 0) + (k.tasksCompleted ?? 0) > 0) keys.add("tasks");
      if ((k.inboxMessagesIn ?? 0) + (k.inboxMessagesOut ?? 0) > 0) keys.add("inbox");
    }

    // If Twilio is configured, keep call/SMS services visible even if the current range is quiet.
    if (twilio?.configured) {
      keys.add("aiReceptionist");
      keys.add("missedCallTextBack");
    }

    return keys;
  }, [data, mediaStats, twilio]);

  function visible(widgetId: string, serviceKey: ServiceKey, terms: string[]) {
    const service = SERVICE_INFOS.find((s) => s.key === serviceKey);
    const serviceName = service?.name ?? "";
    const serviceOk = serviceFilter === "all" || serviceFilter === serviceKey;
    const activeOk = !activeOnly || serviceFilter !== "all" || activeServiceKeys.has(serviceKey);
    return serviceOk && activeOk && matchTokens(search, [...terms, serviceName]);
  }

  const dailyRows = useMemo(() => {
    const rows = Array.isArray(data?.daily) ? data!.daily : [];
    return rows.slice().reverse().slice(0, 14);
  }, [data]);

  const rangeLabel =
    range === "today" ? "Today" : range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : "All time";

  const derived = useMemo(() => {
    const k = data?.kpis;
    if (!k || !data) {
      return {
        overallSuccessRate: null as number | null,
        totalFailures: 0,
        aiSuccessRate: null as number | null,
        textSuccessRate: null as number | null,
        missedCaptureRate: null as number | null,
        creditsPerDay: null as number | null,
        creditRunwayDays: null as number | null,
      };
    }

    const successes = (k.aiCompleted ?? 0) + (k.textsSent ?? 0);
    const failures = (k.aiFailed ?? 0) + (k.textsFailed ?? 0);
    const overall = successes + failures > 0 ? successes / (successes + failures) : null;

    const aiDen = (k.aiCompleted ?? 0) + (k.aiFailed ?? 0);
    const aiRate = aiDen > 0 ? (k.aiCompleted ?? 0) / aiDen : null;

    const txtDen = (k.textsSent ?? 0) + (k.textsFailed ?? 0);
    const txtRate = txtDen > 0 ? (k.textsSent ?? 0) / txtDen : null;

    const attempts = (k.missedCallAttempts ?? 0) as number;
    const missed = (k.missedCalls ?? 0) as number;
    const missedRate = attempts > 0 ? missed / attempts : null;

    const days = daysBetweenIso(data.startIso, data.endIso);
    const creditsPerDay = days > 0 ? (k.creditsUsed ?? 0) / days : null;
    const runwayDays = creditsPerDay && creditsPerDay > 0 ? (data.creditsRemaining ?? 0) / creditsPerDay : null;

    return {
      overallSuccessRate: overall,
      totalFailures: failures,
      aiSuccessRate: aiRate,
      textSuccessRate: txtRate,
      missedCaptureRate: missedRate,
      creditsPerDay,
      creditRunwayDays: runwayDays,
    };
  }, [data]);

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
          <label className="mr-2 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Active only
          </label>
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

      {note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

      {loading ? (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : !data ? null : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible("mediaLibrary", "mediaLibrary", ["Media library", "Media", "Library", "Files", "Uploads"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("mediaLibrary");
                    return (
                      <MenuButton
                        id="mediaLibrary"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("mediaLibrary")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("mediaLibrary").href}
                        goToLabel={serviceForWidget("mediaLibrary").name}
                      />
                    );
                  })()}
                </div>

                <StatCard
                  label="Media library"
                  value={
                    mediaStats && (mediaStats as any).ok === true
                      ? ((mediaStats as any).itemsCount as number).toLocaleString()
                      : "N/A"
                  }
                  sub={
                    mediaStats && (mediaStats as any).ok === true
                      ? `${((mediaStats as any).foldersCount as number).toLocaleString()} folders`
                      : ""
                  }
                  tone="slate"
                />
              </div>
            ) : null}

            {visible("creditsRemaining", "billing", ["Credits remaining", "Top up", "Billing", "Credits"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("creditsRemaining");
                    return (
                  <MenuButton
                    id="creditsRemaining"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("creditsRemaining")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("creditsRemaining").href}
                    goToLabel={serviceForWidget("creditsRemaining").name}
                  />
                    );
                  })()}
                </div>
                <StatCard label="Credits remaining" value={data.creditsRemaining.toLocaleString()} sub="Top up in Billing" tone="blue" />
              </div>
            ) : null}

            {visible("creditsUsed", "billing", ["Credits used", "AI calls", "Lead scraping", "Billing", "Credits"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("creditsUsed");
                    return (
                  <MenuButton
                    id="creditsUsed"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("creditsUsed")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("creditsUsed").href}
                    goToLabel={serviceForWidget("creditsUsed").name}
                  />
                    );
                  })()}
                </div>
                <StatCard label="Credits used" value={data.kpis.creditsUsed.toLocaleString()} sub="AI calls + lead scraping + blogs" tone="pink" />
              </div>
            ) : null}

            {visible("blogGenerations", "blogs", ["Blogs generated", "Automated blogs", "Blogs", "Generations"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("blogGenerations");
                    return (
                  <MenuButton
                    id="blogGenerations"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("blogGenerations")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("blogGenerations").href}
                    goToLabel={serviceForWidget("blogGenerations").name}
                  />
                    );
                  })()}
                </div>
                <StatCard
                  label="Blogs generated"
                  value={data.kpis.blogGenerations.toLocaleString()}
                  sub="Generated posts"
                  tone="violet"
                  icon={<StatIconDoc />}
                />
              </div>
            ) : null}

            {visible("blogCreditsUsed", "blogs", ["Blog credits used", "Automated blogs", "Blogs", "Credits"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("blogCreditsUsed");
                    return (
                  <MenuButton
                    id="blogCreditsUsed"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("blogCreditsUsed")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("blogCreditsUsed").href}
                    goToLabel={serviceForWidget("blogCreditsUsed").name}
                  />
                    );
                  })()}
                </div>
                <StatCard
                  label="Blog credits used"
                  value={data.kpis.blogCreditsUsed.toLocaleString()}
                  sub="AI generation"
                  tone="amber"
                  icon={<StatIconSpark />}
                />
              </div>
            ) : null}

            {visible("automationsRun", "reporting", ["Automations run", "Calls", "Texts", "Runs"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("automationsRun");
                    return (
                  <MenuButton
                    id="automationsRun"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("automationsRun")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("automationsRun").href}
                    goToLabel={serviceForWidget("automationsRun").name}
                  />
                    );
                  })()}
                </div>
                <StatCard label="Automations run" value={data.kpis.automationsRun.toLocaleString()} sub="Calls + texts + runs" tone="ink" />
              </div>
            ) : null}

            {visible("aiCalls", "aiReceptionist", ["AI calls", "Completed", "Failed", "Receptionist"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("aiCalls");
                    return (
                  <MenuButton
                    id="aiCalls"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("aiCalls")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("aiCalls").href}
                    goToLabel={serviceForWidget("aiCalls").name}
                  />
                    );
                  })()}
                </div>
                <StatCard
                  label="AI calls"
                  value={data.kpis.aiCalls.toLocaleString()}
                  sub={`${data.kpis.aiCompleted} completed · ${data.kpis.aiFailed} failed`}
                  tone="blue"
                />
              </div>
            ) : null}

            {visible("aiOutboundCalls", "aiOutboundCalls", ["AI outbound calls", "Outbound", "Calls", "Queued", "Completed"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("aiOutboundCalls");
                    return (
                      <MenuButton
                        id="aiOutboundCalls"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("aiOutboundCalls")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("aiOutboundCalls").href}
                        goToLabel={serviceForWidget("aiOutboundCalls").name}
                      />
                    );
                  })()}
                </div>
                <StatCard
                  label="AI outbound calls"
                  value={data.kpis.aiOutboundCompleted.toLocaleString()}
                  sub={`${data.kpis.aiOutboundQueuedNow} queued now · ${data.kpis.aiOutboundFailed} failed`}
                  tone="violet"
                />
              </div>
            ) : null}

            {visible("missedCalls", "missedCallTextBack", ["Missed calls", "Texts sent", "Text back"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("missedCalls");
                    return (
                  <MenuButton
                    id="missedCalls"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("missedCalls")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("missedCalls").href}
                    goToLabel={serviceForWidget("missedCalls").name}
                  />
                    );
                  })()}
                </div>
                <StatCard
                  label="Missed calls"
                  value={data.kpis.missedCalls.toLocaleString()}
                  sub={`${data.kpis.textsSent} texts sent · ${data.kpis.textsFailed} failed`}
                  tone="pink"
                />
              </div>
            ) : null}

            {visible("newsletterSends", "newsletter", ["Newsletter", "Sends", "Sent", "Email", "SMS"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("newsletterSends");
                    return (
                      <MenuButton
                        id="newsletterSends"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("newsletterSends")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("newsletterSends").href}
                        goToLabel={serviceForWidget("newsletterSends").name}
                      />
                    );
                  })()}
                </div>
                <StatCard
                  label="Newsletter sends"
                  value={data.kpis.newsletterSentCount.toLocaleString()}
                  sub={`${data.kpis.newsletterSendEvents} send events · ${data.kpis.newsletterFailedCount} failed`}
                  tone="amber"
                />
              </div>
            ) : null}

            {visible("nurtureEnrollments", "nurtureCampaigns", ["Nurture", "Enrollments", "Campaigns", "Follow-up"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("nurtureEnrollments");
                    return (
                      <MenuButton
                        id="nurtureEnrollments"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("nurtureEnrollments")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("nurtureEnrollments").href}
                        goToLabel={serviceForWidget("nurtureEnrollments").name}
                      />
                    );
                  })()}
                </div>
                <StatCard
                  label="Nurture enrollments"
                  value={data.kpis.nurtureEnrollmentsCreated.toLocaleString()}
                  sub={`${data.kpis.nurtureEnrollmentsActiveNow} active now · ${data.kpis.nurtureEnrollmentsCompleted} completed`}
                  tone="emerald"
                />
              </div>
            ) : null}

            {visible("tasks", "tasks", ["Tasks", "To-do", "Done", "Assigned"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("tasks");
                    return (
                      <MenuButton
                        id="tasks"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("tasks")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("tasks").href}
                        goToLabel={serviceForWidget("tasks").name}
                      />
                    );
                  })()}
                </div>
                <StatCard
                  label="Tasks"
                  value={data.kpis.tasksOpenNow.toLocaleString()}
                  sub={`${data.kpis.tasksCompleted} completed (${rangeLabel.toLowerCase()})`}
                  tone="slate"
                />
              </div>
            ) : null}

            {visible("inboxMessagesIn", "inbox", ["Inbox", "Inbound", "Messages", "Email", "SMS"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("inboxMessagesIn");
                    return (
                      <MenuButton
                        id="inboxMessagesIn"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("inboxMessagesIn")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("inboxMessagesIn").href}
                        goToLabel={serviceForWidget("inboxMessagesIn").name}
                      />
                    );
                  })()}
                </div>
                <StatCard
                  label="Inbox messages"
                  value={data.kpis.inboxMessagesIn.toLocaleString()}
                  sub={`${data.kpis.inboxMessagesOut} outbox (${rangeLabel.toLowerCase()})`}
                  tone="ink"
                />
              </div>
            ) : null}

            {visible("inboxMessagesOut", "inbox", ["Outbox", "Outbound", "Messages", "Email", "SMS"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("inboxMessagesOut");
                    return (
                      <MenuButton
                        id="inboxMessagesOut"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("inboxMessagesOut")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("inboxMessagesOut").href}
                        goToLabel={serviceForWidget("inboxMessagesOut").name}
                      />
                    );
                  })()}
                </div>
                <StatCard
                  label="Outbox messages"
                  value={data.kpis.inboxMessagesOut.toLocaleString()}
                  sub={`${data.kpis.inboxMessagesIn} inbox (${rangeLabel.toLowerCase()})`}
                  tone="slate"
                />
              </div>
            ) : null}

            {visible("bookingsCreated", "booking", ["Bookings created", "Appointments"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("bookingsCreated");
                    return (
                  <MenuButton
                    id="bookingsCreated"
                    openId={openMenuId}
                    setOpenId={setOpenMenuId}
                    onAdd={() => void addWidget("bookingsCreated")}
                    addDisabled={added}
                    addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                    goToHref={serviceForWidget("bookingsCreated").href}
                    goToLabel={serviceForWidget("bookingsCreated").name}
                  />
                    );
                  })()}
                </div>
                <StatCard label="Bookings created" value={data.kpis.bookingsCreated.toLocaleString()} sub="New appointments" tone="emerald" />
              </div>
            ) : null}
          </div>

          {(() => {
            const show = matchTokens(search, [
              "Success rate",
              "Failures",
              "Credits runway",
              "Leads captured",
              "Appointments booked",
              "Hours saved",
              "Missed call capture",
              "AI",
              "Text back",
            ]);
            if (!show) return null;
            return (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <div className="absolute right-4 top-4">
                    <MenuButton
                      id="successRate"
                      openId={openMenuId}
                      setOpenId={setOpenMenuId}
                      onAdd={() => void addWidget("successRate")}
                      addDisabled={dashboardWidgetIds.has("successRate")}
                      addLabel={dashboardWidgetIds.has("successRate") ? "Already on dashboard" : "Add to dashboard"}
                      goToHref={serviceForWidget("successRate").href}
                      goToLabel={serviceForWidget("successRate").name}
                    />
                  </div>
                  <MiniCard label="Success rate" value={formatPct(derived.overallSuccessRate)} sub="AI + text-back" />
                </div>

                <div className="relative">
                  <div className="absolute right-4 top-4">
                    <MenuButton
                      id="failures"
                      openId={openMenuId}
                      setOpenId={setOpenMenuId}
                      onAdd={() => void addWidget("failures")}
                      addDisabled={dashboardWidgetIds.has("failures")}
                      addLabel={dashboardWidgetIds.has("failures") ? "Already on dashboard" : "Add to dashboard"}
                      goToHref={serviceForWidget("failures").href}
                      goToLabel={serviceForWidget("failures").name}
                    />
                  </div>
                  <MiniCard label="Failures" value={derived.totalFailures.toLocaleString()} sub="AI failed + texts failed" />
                </div>

                <div className="relative">
                  <div className="absolute right-4 top-4">
                    <MenuButton
                      id="creditsRunway"
                      openId={openMenuId}
                      setOpenId={setOpenMenuId}
                      onAdd={() => void addWidget("creditsRunway")}
                      addDisabled={dashboardWidgetIds.has("creditsRunway")}
                      addLabel={dashboardWidgetIds.has("creditsRunway") ? "Already on dashboard" : "Add to dashboard"}
                      goToHref={serviceForWidget("creditsRunway").href}
                      goToLabel={serviceForWidget("creditsRunway").name}
                    />
                  </div>
                  <MiniCard
                    label="Credits runway"
                    value={
                      typeof derived.creditRunwayDays === "number" && Number.isFinite(derived.creditRunwayDays)
                        ? `~${Math.max(0, Math.round(derived.creditRunwayDays))} days`
                        : "N/A"
                    }
                    sub={
                      typeof derived.creditsPerDay === "number" && Number.isFinite(derived.creditsPerDay)
                        ? `~${Math.max(0, derived.creditsPerDay).toFixed(1)} credits/day (${rangeLabel.toLowerCase()})`
                        : undefined
                    }
                  />
                </div>

                <div className="relative">
                  <div className="absolute right-4 top-4">
                    <MenuButton
                      id="leadsCaptured"
                      openId={openMenuId}
                      setOpenId={setOpenMenuId}
                      onAdd={() => void addWidget("leadsCaptured")}
                      addDisabled={dashboardWidgetIds.has("leadsCaptured")}
                      addLabel={dashboardWidgetIds.has("leadsCaptured") ? "Already on dashboard" : "Add to dashboard"}
                      goToHref={serviceForWidget("leadsCaptured").href}
                      goToLabel={serviceForWidget("leadsCaptured").name}
                    />
                  </div>
                  <MiniCard label="Leads captured" value={data.kpis.leadsCreated.toLocaleString()} sub={`${data.kpis.contactsCreated.toLocaleString()} contacts created`} />
                </div>
              </div>
            );
          })()}

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
                  addDisabled={dashboardWidgetIds.has("dailyActivity")}
                  addLabel={dashboardWidgetIds.has("dailyActivity") ? "Already on dashboard" : "Add to dashboard"}
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
                    addDisabled={dashboardWidgetIds.has("reviewsCollected")}
                    addLabel={dashboardWidgetIds.has("reviewsCollected") ? "Already on dashboard" : "Add to dashboard"}
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
                    addDisabled={dashboardWidgetIds.has("leadsCreated")}
                    addLabel={dashboardWidgetIds.has("leadsCreated") ? "Already on dashboard" : "Add to dashboard"}
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
                    addDisabled={dashboardWidgetIds.has("leadScrapeRuns")}
                    addLabel={dashboardWidgetIds.has("leadScrapeRuns") ? "Already on dashboard" : "Add to dashboard"}
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
                        From: {twilio.fromNumberE164 ?? "N/A"}
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

              {(() => {
                const show = matchTokens(search, ["AI success", "Text success", "Missed call capture", "rate"]);
                if (!show) return null;
                return (
                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-semibold text-zinc-600">Reliability</div>
                        <MenuButton
                          id="reliabilitySummary"
                          openId={openMenuId}
                          setOpenId={setOpenMenuId}
                          onAdd={() => void addWidget("reliabilitySummary")}
                          addDisabled={dashboardWidgetIds.has("reliabilitySummary")}
                          addLabel={dashboardWidgetIds.has("reliabilitySummary") ? "Already on dashboard" : "Add to dashboard"}
                          goToHref={serviceForWidget("reliabilitySummary").href}
                          goToLabel={serviceForWidget("reliabilitySummary").name}
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">AI success rate</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.aiSuccessRate)}</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">Text success rate</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.textSuccessRate)}</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">Missed call capture</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.missedCaptureRate)}</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">Appointments booked</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{data.kpis.bookingsCreated.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {(() => {
            const show = matchTokens(search, ["Automation performance", "per service", "AI receptionist", "Missed call", "Lead scraping", "Reviews", "Booking"]);
            if (!show) return null;
            return (
              <div className="mt-6">
                <div className="text-sm font-semibold text-zinc-900">Automation performance (by service)</div>
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ServicePerfCard
                    title="AI Receptionist"
                    tone="blue"
                    href="/portal/app/services/ai-receptionist"
                    menu={
                      <MenuButton
                        id="perfAiReceptionist"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("perfAiReceptionist")}
                        addDisabled={dashboardWidgetIds.has("perfAiReceptionist")}
                        addLabel={dashboardWidgetIds.has("perfAiReceptionist") ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("perfAiReceptionist").href}
                        goToLabel={serviceForWidget("perfAiReceptionist").name}
                      />
                    }
                    stats={[
                      { label: "Calls", value: data.kpis.aiCalls.toLocaleString() },
                      { label: "Completed", value: data.kpis.aiCompleted.toLocaleString() },
                      { label: "Failed", value: data.kpis.aiFailed.toLocaleString() },
                      { label: "Success rate", value: formatPct(derived.aiSuccessRate) },
                    ]}
                  />

                  <ServicePerfCard
                    title="Missed-Call Text Back"
                    tone="pink"
                    href="/portal/app/services/missed-call-textback"
                    menu={
                      <MenuButton
                        id="perfMissedCallTextBack"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("perfMissedCallTextBack")}
                        addDisabled={dashboardWidgetIds.has("perfMissedCallTextBack")}
                        addLabel={dashboardWidgetIds.has("perfMissedCallTextBack") ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("perfMissedCallTextBack").href}
                        goToLabel={serviceForWidget("perfMissedCallTextBack").name}
                      />
                    }
                    stats={[
                      { label: "Missed calls", value: data.kpis.missedCalls.toLocaleString() },
                      { label: "Texts sent", value: data.kpis.textsSent.toLocaleString() },
                      { label: "Text failures", value: data.kpis.textsFailed.toLocaleString() },
                      { label: "Text success", value: formatPct(derived.textSuccessRate) },
                    ]}
                  />

                  <ServicePerfCard
                    title="Lead Scraping"
                    tone="emerald"
                    href="/portal/app/services/lead-scraping"
                    menu={
                      <MenuButton
                        id="perfLeadScraping"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("perfLeadScraping")}
                        addDisabled={dashboardWidgetIds.has("perfLeadScraping")}
                        addLabel={dashboardWidgetIds.has("perfLeadScraping") ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("perfLeadScraping").href}
                        goToLabel={serviceForWidget("perfLeadScraping").name}
                      />
                    }
                    stats={[
                      { label: "Runs", value: data.kpis.leadScrapeRuns.toLocaleString() },
                      { label: "Leads created", value: data.kpis.leadsCreated.toLocaleString() },
                      { label: "Contacts", value: data.kpis.contactsCreated.toLocaleString() },
                      { label: "Credits used", value: data.kpis.leadScrapeChargedCredits.toLocaleString() },
                    ]}
                  />

                  <ServicePerfCard
                    title="Review Requests"
                    tone="violet"
                    href="/portal/app/services/reviews"
                    menu={
                      <MenuButton
                        id="perfReviews"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("perfReviews")}
                        addDisabled={dashboardWidgetIds.has("perfReviews")}
                        addLabel={dashboardWidgetIds.has("perfReviews") ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("perfReviews").href}
                        goToLabel={serviceForWidget("perfReviews").name}
                      />
                    }
                    stats={[
                      { label: "Reviews collected", value: data.kpis.reviewsCollected.toLocaleString() },
                      { label: "Avg rating", value: formatRating(data.kpis.avgReviewRating) },
                      { label: "Bookings", value: data.kpis.bookingsCreated.toLocaleString() },
                      { label: "Credits used", value: data.kpis.creditsUsed.toLocaleString() },
                    ]}
                  />
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
