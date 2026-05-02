"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { IconFunnel, IconSearch } from "@/app/portal/PortalIcons";
import { useToast } from "@/components/ToastProvider";
import { portalGlassButtonClass } from "@/components/portalGlass";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";
import { portalWidgetUsesFilledSurface, toneForPortalWidget, type PortalWidgetTone } from "@/lib/portalWidgetTones";

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

type ReportingPayload = {
  ok: boolean;
  range: RangeKey;
  startIso: string;
  endIso: string;
  creditsRemaining: number;
  warnings?: string[];
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

type SalesIntegrationStatusPayload =
  | {
      ok: true;
      encryptionConfigured: boolean;
      activeProvider: string | null;
      providers: Record<string, { configured: boolean; displayHint?: string | null; connectedAtIso?: string | null }>;
      stripe: { configured: boolean; prefix: string | null; accountId: string | null; connectedAtIso: string | null };
      note?: string;
    }
  | { ok: false; error?: string };

type SalesReportPayload =
  | {
      ok: true;
      provider: string;
      providerLabel: string;
      range: "7d" | "30d";
      startIso: string;
      endIso: string;
      currency: string;
      totals: { chargeCount: number; grossCents: number; refundedCents: number; netCents: number };
      note?: string;
    }
  | { ok: false; error?: string };

type MediaStatsPayload =
  | { ok: true; itemsCount: number; foldersCount: number }
  | { ok: false; error?: string };

async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal }).catch(() => null as any);
    if (!res?.ok) return null;
    return ((await res.json().catch(() => null)) as T | null) ?? null;
  } finally {
    window.clearTimeout(timeout);
  }
}

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

function currentPortalBase(pathname: string | null | undefined): "/portal" | "/credit" {
  return String(pathname || "").startsWith("/credit") ? "/credit" : "/portal";
}

function toCurrentPortalHref(href: string | null, pathname: string | null | undefined) {
  if (!href) return href;
  const portalBase = currentPortalBase(pathname);
  return href.startsWith("/portal") ? `${portalBase}${href.slice("/portal".length)}` : href;
}

const SERVICE_INFOS: ServiceInfo[] = [
  { key: "all", name: "All services", href: null },
  { key: "reporting", name: "Reporting", href: "/portal/app/services/reporting" },
  { key: "billing", name: "Billing", href: "/portal/app/billing" },
  { key: "mediaLibrary", name: "Media Library", href: "/portal/app/services/media-library" },
  { key: "aiReceptionist", name: "AI Receptionist", href: "/portal/app/services/ai-receptionist" },
  { key: "aiOutboundCalls", name: "AI outbound", href: "/portal/app/services/ai-outbound-calls/calls" },
  { key: "missedCallTextBack", name: "Missed-Call Text Back", href: "/portal/app/services/missed-call-textback" },
  { key: "booking", name: "Booking Automation", href: "/portal/app/services/booking" },
  { key: "blogs", name: "Automated Blogs", href: "/portal/app/services/blogs" },
  { key: "newsletter", name: "Newsletter", href: "/portal/app/services/newsletter/external" },
  { key: "nurtureCampaigns", name: "Nurture Campaigns", href: "/portal/app/services/nurture-campaigns" },
  { key: "tasks", name: "Tasks", href: "/portal/app/services/tasks" },
  { key: "inbox", name: "Inbox / Outbox", href: "/portal/app/services/inbox/email" },
  { key: "reviews", name: "Reviews", href: "/portal/app/services/reviews" },
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
    case "stripeSales":
      return { key: "reporting", name: "Sales", href: "/portal/app/services/reporting/sales" };
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

type ReportingPendingLink = {
  label: string;
  href: string;
};

function ReportingPendingState({
  title,
  body,
  links,
}: {
  title: string;
  body: string;
  links: ReportingPendingLink[];
}) {
  return (
    <div className="mt-4 rounded-[28px] border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold text-brand-ink">{title}</div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors duration-100 hover:bg-zinc-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid min-w-55 gap-3 rounded-3xl bg-zinc-50 p-4 text-xs text-zinc-500">
          <div>
            <div className="font-semibold uppercase tracking-[0.18em] text-zinc-400">What you should expect</div>
            <div className="mt-2 text-sm text-zinc-600">Credits, activity, and sales widgets appear here once reporting data finishes loading.</div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.18em] text-zinc-400">Best next step</div>
            <div className="mt-2 text-sm text-zinc-600">If you are brand new, start with billing or the sales dashboard, then come back here for the full summary.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMoneyFromCents(cents: number, currency: string) {
  const amount = (typeof cents === "number" && Number.isFinite(cents) ? cents : 0) / 100;
  try {
    const c = (currency || "usd").toUpperCase();
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

type StatTone = PortalWidgetTone;

function toneClasses(tone: StatTone) {
  const filled = portalWidgetUsesFilledSurface(tone);
  switch (tone) {
    case "blue":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(29,78,216,0.92),rgba(29,78,216,0.22))]",
        ring: "ring-1 ring-[color:rgba(29,78,216,0.16)]",
        surface: filled ? "bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(219,234,254,0.94))]" : "bg-white",
        pill: "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]",
        icon: "bg-[color:rgba(29,78,216,0.10)] text-[color:rgba(29,78,216,0.95)]",
        softPanel: "bg-[rgba(219,234,254,0.72)]",
        label: filled ? "text-[rgba(29,78,216,0.9)]" : "text-zinc-500",
        sub: filled ? "text-[rgba(30,64,175,0.8)]" : "text-zinc-500",
        filled,
      };
    case "pink":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(251,113,133,0.92),rgba(251,113,133,0.18))]",
        ring: "ring-1 ring-[color:rgba(251,113,133,0.16)]",
        surface: "bg-white",
        pill: "bg-[color:rgba(251,113,133,0.14)] text-[color:var(--color-brand-pink)]",
        icon: "bg-[color:rgba(251,113,133,0.14)] text-[color:rgba(251,113,133,0.95)]",
        softPanel: "bg-[rgba(255,228,230,0.66)]",
        label: "text-zinc-500",
        sub: "text-zinc-500",
        filled,
      };
    case "emerald":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(16,185,129,0.88),rgba(16,185,129,0.18))]",
        ring: "ring-1 ring-[color:rgba(16,185,129,0.14)]",
        surface: filled ? "bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(220,252,231,0.94))]" : "bg-white",
        pill: "bg-emerald-50 text-emerald-700",
        icon: "bg-emerald-50 text-emerald-700",
        softPanel: "bg-[rgba(220,252,231,0.78)]",
        label: filled ? "text-[rgba(5,150,105,0.94)]" : "text-zinc-500",
        sub: filled ? "text-[rgba(6,95,70,0.78)]" : "text-zinc-500",
        filled,
      };
    case "violet":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(124,58,237,0.92),rgba(124,58,237,0.18))]",
        ring: "ring-1 ring-[color:rgba(124,58,237,0.16)]",
        surface: filled ? "bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(243,232,255,0.94))]" : "bg-white",
        pill: "bg-[color:rgba(124,58,237,0.10)] text-[color:rgba(124,58,237,0.95)]",
        icon: "bg-[color:rgba(124,58,237,0.10)] text-[color:rgba(124,58,237,0.95)]",
        softPanel: "bg-[rgba(243,232,255,0.8)]",
        label: filled ? "text-[rgba(109,40,217,0.92)]" : "text-zinc-500",
        sub: filled ? "text-[rgba(91,33,182,0.8)]" : "text-zinc-500",
        filled,
      };
    case "amber":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(245,158,11,0.92),rgba(245,158,11,0.18))]",
        ring: "ring-1 ring-[color:rgba(245,158,11,0.18)]",
        surface: filled ? "bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.94))]" : "bg-white",
        pill: "bg-[color:rgba(245,158,11,0.12)] text-[color:rgba(180,83,9,0.95)]",
        icon: "bg-[color:rgba(245,158,11,0.12)] text-[color:rgba(180,83,9,0.95)]",
        softPanel: "bg-[rgba(254,243,199,0.82)]",
        label: filled ? "text-[rgba(180,83,9,0.94)]" : "text-zinc-500",
        sub: filled ? "text-[rgba(146,64,14,0.78)]" : "text-zinc-500",
        filled,
      };
    case "slate":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(100,116,139,0.92),rgba(100,116,139,0.22))]",
        ring: "ring-1 ring-[color:rgba(100,116,139,0.14)]",
        surface: "bg-white",
        pill: "bg-slate-50 text-slate-700",
        icon: "bg-slate-50 text-slate-700",
        softPanel: "bg-[rgba(241,245,249,0.94)]",
        label: "text-zinc-500",
        sub: "text-zinc-500",
        filled,
      };
    case "ink":
    default:
      return {
        bar: "bg-[linear-gradient(90deg,rgba(51,65,85,0.92),rgba(51,65,85,0.22))]",
        ring: "ring-1 ring-[color:rgba(51,65,85,0.14)]",
        surface: "bg-white",
        pill: "bg-[color:rgba(51,65,85,0.10)] text-brand-ink",
        icon: "bg-[color:rgba(51,65,85,0.10)] text-brand-ink",
        softPanel: "bg-[rgba(248,250,252,0.96)]",
        label: "text-zinc-500",
        sub: "text-zinc-500",
        filled,
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
    <div className={classNames("rounded-3xl border border-zinc-200 p-6", t.surface, t.ring)}>
      {!t.filled ? <div className={classNames("mb-4 h-1.5 w-14 rounded-full", t.bar)} /> : null}
      <div className="flex items-center justify-between gap-3">
        <div className={classNames("text-xs font-semibold", t.label)}>{label}</div>
        {icon ? (
          <div className={classNames("inline-flex items-center justify-center rounded-xl p-2", t.icon)} aria-hidden="true">
            {icon}
          </div>
        ) : (
          <div className={classNames("h-2.5 w-2.5 rounded-full", t.pill)} aria-hidden="true" />
        )}
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-ink">{value}</div>
      {sub ? <div className={classNames("mt-1 text-xs", t.sub)}>{sub}</div> : null}
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
  tone,
  filled,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  filled?: boolean;
}) {
  const t = tone ? toneClasses(tone) : null;
  const surfaceClass = filled && t ? t.softPanel : t?.surface ?? "bg-white";
  return (
    <div className={classNames("rounded-3xl border border-zinc-200 p-5", surfaceClass, t?.ring)}>
      <div className={classNames("text-xs font-semibold", t?.label ?? "text-zinc-500")}>{label}</div>
      <div className="mt-2 text-2xl font-bold text-brand-ink">{value}</div>
      {sub ? <div className={classNames("mt-1 text-xs", t?.sub ?? "text-zinc-500")}>{sub}</div> : null}
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
          <div key={s.label} className={classNames("rounded-2xl p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]", t.softPanel)}>
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

function computeReportingMenuStyle(
  anchor: HTMLButtonElement,
  options?: { width?: number; estHeight?: number; minHeight?: number; alignX?: "left" | "right" },
): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const padding = 12;
  const gap = 4;
  const width = Math.min(options?.width ?? 224, vw - padding * 2);
  const alignX = options?.alignX ?? "left";
  const rawLeft = alignX === "right" ? rect.right - width : rect.left;
  const left = Math.min(Math.max(rawLeft, padding), vw - padding - width);

  const spaceBelow = vh - rect.bottom - padding - gap;
  const spaceAbove = rect.top - padding - gap;
  const estHeight = options?.estHeight ?? 220;
  const minHeight = options?.minHeight ?? 160;
  const preferDown = spaceBelow >= estHeight || spaceBelow >= spaceAbove;

  return preferDown
    ? { left, top: rect.bottom + gap, width, maxHeight: Math.max(minHeight, spaceBelow) }
    : { left, bottom: vh - rect.top + gap, width, maxHeight: Math.max(minHeight, spaceAbove) };
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
  const pathname = usePathname() || "";
  const resolvedGoToHref = toCurrentPortalHref(goToHref ?? null, pathname);

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    const recompute = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setMenuStyle(computeReportingMenuStyle(anchor));
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };

    recompute();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open]);

  return (
    <div
      className="relative"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        ref={anchorRef}
        type="button"
        className={classNames("rounded-xl px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-white/80", portalGlassButtonClass)}
        onClick={() => {
          if (open) {
            setOpenId(null);
            return;
          }
          const anchor = anchorRef.current;
          if (anchor) setMenuStyle(computeReportingMenuStyle(anchor));
          setOpenId(id);
        }}
        aria-label="More"
      >
        ⋯
      </button>

      {open && menuStyle ? (
        <LiquidGlassPopupSurface
          className="fixed z-40 w-56 overflow-hidden border border-[rgba(96,165,250,0.2)] p-1.5 shadow-[0_18px_44px_rgba(37,99,235,0.16),0_10px_28px_rgba(15,23,42,0.14)]"
          contentClassName="rounded-[22px] bg-[linear-gradient(180deg,rgba(239,246,255,0.34),rgba(255,255,255,0.14))]"
          style={menuStyle}
        >
          <button
            type="button"
            className={classNames(
              "w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
              addDisabled ? "cursor-not-allowed text-zinc-400" : "text-brand-ink hover:bg-[rgba(219,234,254,0.5)]",
            )}
            disabled={Boolean(addDisabled)}
            onClick={() => {
              setOpenId(null);
              onAdd();
            }}
          >
            {addLabel ?? "Add to dashboard"}
          </button>
          {isPlainNonEmptyString(resolvedGoToHref) && isPlainNonEmptyString(goToLabel) ? (
            <button
              type="button"
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-[rgba(219,234,254,0.42)]"
              onClick={() => {
                setOpenId(null);
                window.location.href = resolvedGoToHref;
              }}
            >
              Go to {goToLabel}
            </button>
          ) : null}
        </LiquidGlassPopupSurface>
      ) : null}
    </div>
  );
}

export function PortalReportingClient() {
  const pathname = usePathname() || "";
  const toast = useToast();
  const portalVariant = useMemo(() => (pathname.startsWith("/credit") ? "credit" : "portal"), [pathname]);
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
  const [range, setRange] = useState<RangeKey>("30d");
  const [data, setData] = useState<ReportingPayload | null>(null);
  const [mediaStats, setMediaStats] = useState<MediaStatsPayload | null>(null);
  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [salesStatus, setSalesStatus] = useState<SalesIntegrationStatusPayload | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const initialLoadStartedRef = useRef(false);
  const latestLoadRequestRef = useRef(0);
  const [, setRefreshing] = useState(false);
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
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersMenuStyle, setFiltersMenuStyle] = useState<CSSProperties | null>(null);
  const reportingPendingLinks = useMemo(
    () => [
      { label: "Open Sales dashboard", href: toCurrentPortalHref("/portal/app/services/reporting/sales", pathname) ?? "/portal/app/services/reporting/sales" },
      { label: "Review billing", href: toCurrentPortalHref("/portal/app/billing", pathname) ?? "/portal/app/billing" },
      { label: "Check inbox", href: toCurrentPortalHref("/portal/app/services/inbox", pathname) ?? "/portal/app/services/inbox" },
      { label: "Open booking", href: toCurrentPortalHref("/portal/app/services/booking", pathname) ?? "/portal/app/services/booking" },
    ],
    [pathname],
  );

  const dashboardScope = (() => {
    if (typeof window === "undefined") return "default" as const;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("embed") === "1" || sp.get("pa_embed") === "1") return "embedded" as const;
    } catch {
      // ignore
    }
    try {
      if (window.sessionStorage.getItem("pa.portal.embed") === "1") return "embedded" as const;
    } catch {
      // ignore
    }
    return "default" as const;
  })();

  async function addWidget(widgetId: string) {
    setNote(null);
    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
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
    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
    if (!res?.ok) return;
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: DashboardData };
    const ids = new Set<string>(Array.isArray(body?.data?.widgets) ? body!.data!.widgets.map((w) => w.id).filter(Boolean) : []);
    if (ids.size) setDashboardWidgetIds(ids);
  }

  async function load(nextRange: RangeKey) {
    const requestId = latestLoadRequestRef.current + 1;
    latestLoadRequestRef.current = requestId;
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);

    try {
      const requiredController = new AbortController();
      const requiredTimeout = window.setTimeout(() => requiredController.abort(), 75000);
      const repRes = await fetch(`/api/portal/reporting?range=${encodeURIComponent(nextRange)}`, {
        cache: "no-store",
        headers: variantHeaders,
        signal: requiredController.signal,
      }).catch(() => null as any);
      window.clearTimeout(requiredTimeout);

      if (requestId !== latestLoadRequestRef.current) {
        return;
      }

      if (!repRes?.ok) {
        const body = (await repRes?.json?.().catch(() => ({}))) as { error?: string };
        setError(body?.error ?? "Unable to load reporting");
        if (isFirstLoad) setData(null);
        return;
      }

      const rep = (await repRes.json().catch(() => null)) as ReportingPayload | null;
      if (!rep?.ok) {
        setError(rep?.error ?? "Unable to load reporting");
        if (isFirstLoad) setData(null);
        return;
      }

      setData(rep);
      hasLoadedOnceRef.current = true;

      void (async () => {
        const [stats, twilioBody, salesStatusBody] = await Promise.all([
          fetchJsonWithTimeout<MediaStatsPayload>("/api/portal/media/stats", { cache: "no-store", headers: variantHeaders }, 15000),
          fetchJsonWithTimeout<{ ok?: boolean; twilio?: TwilioMasked }>("/api/portal/integrations/twilio", { cache: "no-store", headers: variantHeaders }, 15000),
          fetchJsonWithTimeout<SalesIntegrationStatusPayload>("/api/portal/integrations/sales-reporting", { cache: "no-store", headers: variantHeaders }, 15000),
        ]);

        if (stats) {
          setMediaStats(stats);
        } else if (isFirstLoad) {
          setMediaStats(null);
        }

        if (twilioBody) {
          setTwilio(twilioBody.twilio ?? null);
        } else if (isFirstLoad) {
          setTwilio(null);
        }

        if (salesStatusBody?.ok) {
          setSalesStatus(salesStatusBody);
          const anyConnected = Boolean(salesStatusBody.providers && Object.values(salesStatusBody.providers).some((provider) => Boolean(provider?.configured)));
          if (anyConnected) {
            const sales = await fetchJsonWithTimeout<SalesReportPayload>("/api/portal/reporting/sales?range=30d", { cache: "no-store", headers: variantHeaders }, 15000);
            setSalesReport(sales);
          } else {
            setSalesReport(null);
          }
        } else if (isFirstLoad) {
          setSalesStatus(null);
          setSalesReport(null);
        }
      })();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
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

  useLayoutEffect(() => {
    if (!filtersOpen) {
      setFiltersMenuStyle(null);
      return;
    }

    const recompute = () => {
      const anchor = filterButtonRef.current;
      if (!anchor) return;
      setFiltersMenuStyle(computeReportingMenuStyle(anchor, { width: 320, estHeight: 460, minHeight: 320, alignX: "right" }));
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };

    recompute();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

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

  const activeFilterCount = (serviceFilter !== "all" ? 1 : 0) + (activeOnly ? 1 : 0) + (range !== "30d" ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Reporting</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            A dashboard view of activity, outcomes, and credit usage across your services.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={toCurrentPortalHref("/portal/app/services/reporting/sales", pathname) || "/portal/app/services/reporting/sales"}
            className="inline-flex items-center justify-center rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-[0_10px_28px_rgba(16,185,129,0.12)] transition-colors duration-150 hover:bg-emerald-100"
          >
            Sales dashboard
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
              <IconSearch size={18} />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search metrics or services…"
              className="w-full rounded-full border border-zinc-200 bg-white py-2.5 pl-11 pr-4 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue)"
            />
          </div>
          <div className="relative shrink-0">
            {filtersOpen && filtersMenuStyle ? (
              <>
                <div className="fixed inset-0 z-30" onMouseDown={() => setFiltersOpen(false)} onTouchStart={() => setFiltersOpen(false)} aria-hidden />
                <LiquidGlassPopupSurface
                  className="fixed z-140000 w-80 overflow-hidden border border-[rgba(96,165,250,0.24)] p-1.5 shadow-[0_22px_54px_rgba(37,99,235,0.16),0_14px_36px_rgba(15,23,42,0.16)]"
                  contentClassName="rounded-[26px] bg-[linear-gradient(180deg,rgba(239,246,255,0.28),rgba(255,255,255,0.14))]"
                  style={filtersMenuStyle}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col" style={{ maxHeight: filtersMenuStyle.maxHeight }}>
                    <div className="space-y-5 overflow-y-auto px-4 pb-3 pt-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Range</div>
                        <div className="mt-2 space-y-1">
                        {([
                          ["today", "Today"],
                          ["7d", "Last 7 days"],
                          ["30d", "Last 30 days"],
                          ["90d", "Last 90 days"],
                          ["all", "All time"],
                        ] as Array<[RangeKey, string]>).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            className={classNames(
                              "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors",
                              range === key
                                ? "bg-[rgba(96,165,250,0.16)] font-semibold text-[rgb(29,78,216)]"
                                : "text-zinc-700 hover:bg-[rgba(255,255,255,0.42)]",
                            )}
                            onClick={() => {
                              setRange(key);
                              void load(key);
                            }}
                          >
                            <span>{label}</span>
                            {range === key ? <span className="text-xs text-[rgba(29,78,216,0.78)]">Selected</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(148,163,184,0.22)] bg-[rgba(255,255,255,0.20)] px-3 py-2.5 backdrop-blur-[6px]">
                      <div className="pr-2">
                        <div className="text-xs font-semibold text-zinc-900">Active only</div>
                        <div className="text-[11px] text-zinc-500">Keep the list focused on services already showing activity.</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={activeOnly}
                        aria-label="Active only"
                        className={classNames(
                          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
                          activeOnly
                            ? "border-[rgba(96,165,250,0.42)] bg-[rgba(96,165,250,0.38)]"
                            : "border-[rgba(148,163,184,0.35)] bg-[rgba(148,163,184,0.22)]",
                        )}
                        onClick={() => setActiveOnly((value) => !value)}
                      >
                        <span
                          className={classNames(
                            "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.16)] transition",
                            activeOnly ? "left-[calc(100%-1.375rem)] bg-[rgba(239,246,255,0.98)]" : "left-0.5",
                          )}
                        />
                      </button>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Service</div>
                      <div className="mt-2 space-y-1">
                        {SERVICE_INFOS.map((service) => (
                          <button
                            key={service.key}
                            type="button"
                            className={classNames(
                              "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors",
                              serviceFilter === service.key
                                ? "bg-[rgba(96,165,250,0.16)] font-semibold text-[rgb(29,78,216)]"
                                : "text-zinc-700 hover:bg-[rgba(255,255,255,0.42)]",
                            )}
                            onClick={() => setServiceFilter(service.key)}
                          >
                            <span>{service.name}</span>
                            {serviceFilter === service.key ? <span className="text-xs text-[rgba(29,78,216,0.78)]">Selected</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>

                    </div>

                    <div className="border-t border-white/35 px-4 pb-4 pt-3">
                    <button
                      type="button"
                      className="w-full rounded-xl border border-[rgba(148,163,184,0.26)] bg-[rgba(255,255,255,0.26)] px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-[rgba(255,255,255,0.42)]"
                      onClick={() => {
                        setRange("30d");
                        void load("30d");
                        setActiveOnly(true);
                        setServiceFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                  </div>
                </LiquidGlassPopupSurface>
              </>
            ) : null}

            <button
              ref={filterButtonRef}
              type="button"
              className={classNames(
                "inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition-colors duration-100 hover:bg-zinc-50",
                activeFilterCount > 0 && "text-brand-blue",
              )}
              onClick={(e) => {
                e.stopPropagation();
                const anchor = e.currentTarget;
                if (filtersOpen) {
                  setFiltersOpen(false);
                  return;
                }
                setFiltersMenuStyle(computeReportingMenuStyle(anchor, { width: 320, estHeight: 460, minHeight: 320, alignX: "right" }));
                setFiltersOpen(true);
              }}
              aria-label="Reporting filters"
              title="Reporting filters"
            >
              <IconFunnel size={18} />
            </button>
          </div>
        </div>
      </div>

      {note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

      {loading && !hasLoadedOnceRef.current ? (
        <ReportingPendingState
          title="Loading your reporting workspace"
          body="We are collecting credits, activity, and sales data for this account. You can still jump into the most useful follow-up areas right now instead of waiting on a blank panel."
          links={reportingPendingLinks}
        />
      ) : !data ? (
        <ReportingPendingState
          title={error ? "Reporting is not ready yet" : "Loading your reporting workspace"}
          body={
            error
              ? `${error} You can still use the sales dashboard, billing, inbox, or booking while reporting catches up.`
              : "We are still collecting reporting data for this account. If you are setting things up for the first time, the shortcuts below are the best next places to work."
          }
          links={reportingPendingLinks}
        />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible("stripeSales", "reporting", ["Sales", "Revenue", "Payments", "Stripe", "Paystack", "Razorpay", "Mollie", "Braintree", "Authorize.Net", "Mercado Pago", "Flutterwave"]) ? (
              <div className="relative">
                <div className="absolute right-4 top-4">
                  {(() => {
                    const added = dashboardWidgetIds.has("stripeSales");
                    return (
                      <MenuButton
                        id="stripeSales"
                        openId={openMenuId}
                        setOpenId={setOpenMenuId}
                        onAdd={() => void addWidget("stripeSales")}
                        addDisabled={added}
                        addLabel={added ? "Already on dashboard" : "Add to dashboard"}
                        goToHref={serviceForWidget("stripeSales").href}
                        goToLabel={serviceForWidget("stripeSales").name}
                      />
                    );
                  })()}
                </div>

                <StatCard
                  label="Sales"
                  value={
                    salesReport?.ok === true
                      ? formatMoneyFromCents(salesReport.totals?.netCents ?? 0, salesReport.currency ?? "usd")
                      : salesStatus?.ok === true &&
                          salesStatus.providers &&
                          Object.values(salesStatus.providers).some((p) => Boolean(p?.configured))
                        ? "-"
                        : "Connect"
                  }
                  sub={
                    salesReport?.ok === true
                      ? `${salesReport.providerLabel ?? "Sales"} • Net • last 30 days • ${Number(salesReport.totals?.chargeCount ?? 0).toLocaleString()} transactions`
                      : salesStatus?.ok === true &&
                          salesStatus.providers &&
                          Object.values(salesStatus.providers).some((p) => Boolean(p?.configured))
                        ? "Loading 30-day totals…"
                        : "Connect a processor in Profile"
                  }
                  tone="emerald"
                />
              </div>
            ) : null}

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
                  <MiniCard label="Success rate" value={formatPct(derived.overallSuccessRate)} sub="AI + text-back" tone={toneForPortalWidget("successRate")} />
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
                  <MiniCard label="Failures" value={derived.totalFailures.toLocaleString()} sub="AI failed + texts failed" tone="pink" filled />
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
                    tone={toneForPortalWidget("creditsRunway")}
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
                    <tr className="border-b border-zinc-200 bg-[rgba(29,78,216,0.04)] text-xs text-zinc-600">
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
                          <span className="inline-flex rounded-full bg-[rgba(29,78,216,0.08)] px-2 py-0.5 text-xs font-semibold text-(--color-brand-blue)">
                            {r.aiCalls}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">
                          <span className="inline-flex rounded-full bg-[rgba(251,113,133,0.10)] px-2 py-0.5 text-xs font-semibold text-(--color-brand-pink)">
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
                <div className="mt-4 rounded-2xl bg-[rgba(248,250,252,0.82)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
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
                    <div className="rounded-2xl bg-[rgba(248,250,252,0.84)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
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
                        <div className="rounded-2xl bg-[rgba(219,234,254,0.86)] p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">AI success rate</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.aiSuccessRate)}</div>
                        </div>
                        <div className="rounded-2xl bg-[rgba(243,232,255,0.88)] p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">Text success rate</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.textSuccessRate)}</div>
                        </div>
                        <div className="rounded-2xl bg-[rgba(254,240,138,0.48)] p-3">
                          <div className="text-[11px] font-semibold text-zinc-600">Missed call capture</div>
                          <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.missedCaptureRate)}</div>
                        </div>
                        <div className="rounded-2xl bg-[rgba(220,252,231,0.9)] p-3">
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
                    href={toCurrentPortalHref("/portal/app/services/ai-receptionist", pathname) || "/portal/app/services/ai-receptionist"}
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
                    href={toCurrentPortalHref("/portal/app/services/missed-call-textback", pathname) || "/portal/app/services/missed-call-textback"}
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
                    href={toCurrentPortalHref("/portal/app/services/lead-scraping", pathname) || "/portal/app/services/lead-scraping"}
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
                    title="Reviews"
                    tone="violet"
                    href={toCurrentPortalHref("/portal/app/services/reviews", pathname) || "/portal/app/services/reviews"}
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
