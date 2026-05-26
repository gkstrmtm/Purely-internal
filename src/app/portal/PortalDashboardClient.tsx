"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";

import { useToast } from "@/components/ToastProvider";
import { IconEdit } from "@/app/portal/PortalIcons";
import { formatSavedTime } from "@/lib/formatSavedTime";
import { buildDashboardLayout, type DashboardLayoutItem as SharedDashboardLayoutItem, type DashboardWidgetId } from "@/lib/portalDashboardLayout";
import { reportPortalActionFailure } from "@/lib/portalDiagnostics.client";
import type { GrowthReadinessPayload } from "@/lib/portalGrowthReadiness";
import { buildGuidanceItems, guidanceStatusColors, guidanceStatusLabel, type GuidanceItem } from "@/lib/portalGuidance";
import { moduleByKey } from "@/lib/portalModulesCatalog";
import { usePortalUiPreview } from "@/lib/portalUiPreview.client";

import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayoutAny = ResponsiveGridLayout as unknown as ComponentType<any>;

const DASHBOARD_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
type DashboardBreakpointKey = keyof typeof DASHBOARD_BREAKPOINTS;

function activeDashboardBreakpoint(width: number): DashboardBreakpointKey {
  if (width >= DASHBOARD_BREAKPOINTS.lg) return "lg";
  if (width >= DASHBOARD_BREAKPOINTS.md) return "md";
  if (width >= DASHBOARD_BREAKPOINTS.sm) return "sm";
  if (width >= DASHBOARD_BREAKPOINTS.xs) return "xs";
  return "xxs";
}

const dashboardPrimaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-xs font-semibold text-white transition-opacity duration-100 hover:opacity-95";

const dashboardSecondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink transition-colors duration-100 hover:border-zinc-300 hover:bg-zinc-50";

const dashboardEditPrimaryButtonClass =
  "rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-600 disabled:opacity-60";

const dashboardEditSecondaryButtonClass =
  "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 disabled:opacity-60";

const dashboardEditResetButtonClass =
  "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors duration-150 hover:bg-rose-100 disabled:opacity-60";

const dashboardSuggestionButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-slate-600 disabled:opacity-60";

const dashboardInfoCardClass =
  "flex h-full min-h-[190px] flex-col rounded-3xl border border-zinc-200 bg-zinc-50 p-4";

const dashboardServiceCardBaseClass =
  "flex h-full min-h-[220px] flex-col rounded-3xl border p-4 shadow-sm transition-transform duration-150 hover:-translate-y-0.5";

type ModuleKey = "blog" | "booking" | "crm" | "leadOutbound";

type MeResponse = {
  user: { email: string; name: string; role: string };
  entitlements: Record<ModuleKey, boolean>;
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
  billing: { configured: boolean };
};

type DashboardPayload = {
  ok: boolean;
  isPersisted?: boolean;
  data: {
    version: 1;
    widgets: Array<{ id: DashboardWidgetId }>;
    layout: SharedDashboardLayoutItem[];
  };
  error?: string;
};

type ReportingPayload = {
  ok: boolean;
  startIso: string;
  endIso: string;
  creditsRemaining: number;
  externalBookingHandoff?: {
    enabled: boolean;
    providerConfirmationAvailable: boolean;
    providerConfirmationConnected: boolean;
    totalHandoffs: number;
    directHandoffs: number;
    leadFirstCaptures: number;
    confirmedViaRedirect: number;
    providerConfirmedBookings: number;
    providerCanceledBookings: number;
    providerRescheduledBookings: number;
    guidance: {
      state: "disabled" | "provider_not_connected" | "no_handoffs" | "handoffs_only" | "captured_leads" | "redirect_confirmed" | "provider_confirmed";
      title: string;
      detail: string;
    };
  };
  diagnostics: {
    actionFailures: number;
    runtimeErrors: number;
    unhandledRejections: number;
    resourceErrors: number;
    manualBugReports: number;
    topPaths: Array<{ path: string; count: number }>;
    topMessages: Array<{ kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure"; message: string; count: number }>;
  };
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
};

type MediaStatsPayload =
  | {
      ok: true;
      itemsCount: number;
      foldersCount: number;
      distributionContinuity?: {
        plannedPosts: number;
        approvedPosts: number;
        readyToUseAssets: number;
        unscheduledReadyAssets: number;
        needsCaptionAssets: number;
        notesNeededAssets: number;
        needsApprovalAssets: number;
        missingCtaAssets: number;
        manuallyPostedAssets: number;
        providerQueuedAssets: number;
        providerPendingAssets: number;
        providerPublishedAssets: number;
        providerBlockedAssets: number;
        providerFailedAssets: number;
        youtubePreparedAssets: number;
      };
    }
  | { ok: false; error?: string };

type MediaDistributionContinuity = NonNullable<Extract<MediaStatsPayload, { ok: true }>['distributionContinuity']>;

type DashboardServicesStatus =
  | {
      ok: true;
      statuses: Record<
        string,
        {
          state: "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled";
          label: string;
          access: {
            state: string;
            label: string;
          };
          readiness: {
            state: "ready" | "needs_setup" | "needs_connection" | "empty" | "blocked";
            label: string;
            helper: string;
            ctaLabel: string;
            href: string | null;
          };
        }
      >;
    }
  | {
      ok: false;
      error?: string;
    };

type ServiceCoverageState = "ready" | "needs_setup" | "provider_blocked" | "not_enabled" | "checking";

type ServiceCoverageModule = {
  key: ModuleKey;
  name: string;
  serviceSlug: string;
  defaultHref: string;
  enabled: boolean;
  coverageState: ServiceCoverageState;
  stateLabel: string;
  badgeLabel: string;
  helper: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

function formatNaturalList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

type GrowthReadinessResponse =
  | ({ ok: true } & GrowthReadinessPayload)
  | { ok: false; error?: string };

type SalesIntegrationStatusPayload =
  | {
      ok: true;
      encryptionConfigured: boolean;
      activeProvider: string | null;
      providers: Record<string, { configured: boolean; displayHint?: string | null; connectedAtIso?: string | null }>;
      stripe: {
        configured: boolean;
        prefix: string | null;
        accountId: string | null;
        connectedAtIso: string | null;
      };
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

function formatMoneyFromCents(cents: number, currency: string) {
  const amount = (typeof cents === "number" && Number.isFinite(cents) ? cents : 0) / 100;
  try {
    const c = (currency || "usd").toUpperCase();
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function accentForWidget(id: string) {
  switch (id) {
    case "puraAttention":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(51,65,85,0.95),rgba(29,78,216,0.32))]",
        ring: "ring-1 ring-[color:rgba(51,65,85,0.16)]",
      };
    case "activityPulse":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.3))]",
        ring: "ring-1 ring-[color:rgba(29,78,216,0.16)]",
      };
    case "creditsRemaining":
    case "aiCalls":
    case "bookingsCreated":
    case "stripeSales":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(29,78,216,0.25))]",
        ring: "ring-1 ring-[color:rgba(29,78,216,0.18)]",
      };
    case "creditsUsed":
    case "blogCreditsUsed":
    case "missedCalls":
    case "reviewsCollected":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(251,113,133,0.9),rgba(251,113,133,0.22))]",
        ring: "ring-1 ring-[color:rgba(251,113,133,0.18)]",
      };
    case "blogGenerations":
    case "automationsRun":
    case "leadScrapeRuns":
    case "leadsCreated":
    case "contactsCreated":
      return {
        bar: "bg-[linear-gradient(90deg,rgba(51,65,85,0.95),rgba(51,65,85,0.25))]",
        ring: "ring-1 ring-[color:rgba(51,65,85,0.16)]",
      };
    default:
      return {
        bar: "bg-[linear-gradient(90deg,rgba(29,78,216,0.55),rgba(251,113,133,0.18))]",
        ring: "ring-1 ring-[color:rgba(148,163,184,0.22)]",
      };
  }
}

function AccentCard({
  title,
  widgetId,
  children,
  showHandle,
}: {
  title: string;
  widgetId: string;
  children: React.ReactNode;
  showHandle: boolean;
}) {
  const a = accentForWidget(widgetId);
  return (
    <div
      className={classNames(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm",
        a.ring,
      )}
    >
      <div className={classNames("mb-4 h-1.5 w-14 rounded-full", a.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {showHandle ? <div className="drag-handle cursor-grab select-none text-zinc-400">⋮⋮</div> : null}
      </div>
      <div className="pa-portal-scroll mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 text-sm text-zinc-700">{children}</div>
    </div>
  );
}

function widgetEditDescription(id: DashboardWidgetId): string {
  switch (id) {
    case "services":
      return "Service coverage summary, quick links, and live-plan status for the workspace.";
    case "puraAttention":
      return "Priority issues and the fastest path into Pura or the right service.";
    case "activityPulse":
      return "Recent activity signal so the dashboard feels active instead of static.";
    case "dailyActivity":
      return "Day-by-day reporting detail for recent workspace activity.";
    case "billing":
      return "Billing posture, credits, and payment-state context for this workspace.";
    default:
      return "Resize and place this widget where it best supports the resting dashboard.";
  }
}

function DashboardEditPreviewCard({ id, title, active }: { id: DashboardWidgetId; title: string; active: boolean }) {
  const shellClass = classNames(
    "flex h-full flex-col justify-between rounded-3xl border border-dashed border-zinc-200 bg-zinc-50/80 p-4",
    active && "border-brand-ink/25 bg-white shadow-sm",
  );

  const previewBody = (() => {
    switch (id) {
      case "services":
        return (
          <div className={shellClass}>
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Layout preview</div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Services</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="h-3 w-20 rounded-full bg-zinc-200/90" />
                    <div className="mt-2 h-2.5 w-16 rounded-full bg-zinc-100" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-600">Summary footer and quick links stay anchored at the bottom.</div>
          </div>
        );
      case "activityPulse":
      case "dailyActivity":
        return (
          <div className={shellClass}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">Layout preview</div>
              <div className="mt-2 text-sm leading-relaxed text-zinc-600">Resize this chart block without redrawing the full live reporting surface on every frame.</div>
            </div>
            <div className="mt-4 flex h-24 items-end gap-2">
              {[28, 54, 38, 70, 46, 62, 34].map((height, index) => (
                <div key={index} className="flex-1 rounded-t-2xl bg-zinc-300/80" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
        );
      case "puraAttention":
        return (
          <div className={shellClass}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">Layout preview</div>
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3">
                  <div className="h-3 w-28 rounded-full bg-rose-200" />
                  <div className="mt-2 h-2.5 w-full rounded-full bg-white/80" />
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="h-3 w-24 rounded-full bg-zinc-200" />
                  <div className="mt-2 h-2.5 w-4/5 rounded-full bg-zinc-100" />
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-zinc-600">Attention items and routing actions keep their hierarchy once you drop the widget.</div>
          </div>
        );
      case "billing":
        return (
          <div className={shellClass}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="h-3 w-16 rounded-full bg-zinc-200" />
                <div className="mt-3 h-6 w-20 rounded-full bg-zinc-100" />
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="h-3 w-14 rounded-full bg-zinc-200" />
                <div className="mt-3 h-6 w-16 rounded-full bg-zinc-100" />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-600">Billing actions and credit context return after resize ends.</div>
          </div>
        );
      default:
        return (
          <div className={shellClass}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">Layout preview</div>
              <div className="mt-2 text-sm leading-relaxed text-zinc-600">{widgetEditDescription(id)}</div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">Drag by handle</span>
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">Resize from corner</span>
            </div>
          </div>
        );
    }
  })();

  return (
    <AccentCard title={title} widgetId={id} showHandle={true}>
      {previewBody}
    </AccentCard>
  );
}

function compactNum(n: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString();
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

function clampLayoutToCols(items: LayoutItem[], cols: number): LayoutItem[] {
  return items.map((it) => {
    const w = clampInt(it.w ?? 1, 1, cols);
    const x = clampInt(it.x ?? 0, 0, Math.max(0, cols - w));
    const minW = typeof it.minW === "number" ? clampInt(it.minW, 1, cols) : undefined;
    const minH = typeof it.minH === "number" ? clampInt(it.minH, 1, 40) : undefined;
    return {
      ...it,
      x,
      w,
      ...(typeof minW === "number" ? { minW } : {}),
      ...(typeof minH === "number" ? { minH } : {}),
    };
  });
}

function stackLayoutToCols(items: LayoutItem[], cols: number): LayoutItem[] {
  const sorted = items
    .slice()
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

  let y = 0;
  return sorted.map((it) => {
    const h = clampInt(it.h ?? 6, 2, 40);
    const minW = typeof it.minW === "number" ? clampInt(it.minW, 1, cols) : undefined;
    const minH = typeof it.minH === "number" ? clampInt(it.minH, 1, 40) : undefined;
    const next: LayoutItem = {
      ...it,
      x: 0,
      y,
      w: cols,
      h,
      ...(typeof minW === "number" ? { minW } : {}),
      ...(typeof minH === "number" ? { minH } : {}),
    };
    y += h;
    return next;
  });
}

function makeResponsiveLayouts(base12Col: LayoutItem[]): ResponsiveLayouts {
  const lg = clampLayoutToCols(base12Col, 12);
  return {
    lg,
    md: lg,
    sm: stackLayoutToCols(lg, 6),
    xs: stackLayoutToCols(lg, 4),
    xxs: stackLayoutToCols(lg, 2),
  } as ResponsiveLayouts;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-zinc-600">{label}</div>
      <div className="font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

const PREVIEW_WIDGET_IDS: DashboardWidgetId[] = ["hoursSaved", "puraAttention", "activityPulse", "billing", "dailyActivity", "services"];

const PREVIEW_DASHBOARD_DATA: DashboardPayload["data"] = {
  version: 1,
  widgets: PREVIEW_WIDGET_IDS.map((id) => ({ id })),
  layout: buildDashboardLayout(PREVIEW_WIDGET_IDS),
};

const PREVIEW_ME_RESPONSE: MeResponse = {
  user: { email: "preview@purelyautomation.dev", name: "Local Preview", role: "CLIENT" },
  entitlements: { blog: true, booking: true, crm: true, leadOutbound: true },
  metrics: { hoursSavedThisWeek: 18.5, hoursSavedAllTime: 143.25 },
  billing: { configured: true },
};

const PREVIEW_REPORTING: ReportingPayload = {
  ok: true,
  startIso: "2026-03-14T00:00:00.000Z",
  endIso: "2026-04-13T00:00:00.000Z",
  creditsRemaining: 1240,
  diagnostics: {
    actionFailures: 4,
    runtimeErrors: 2,
    unhandledRejections: 1,
    resourceErrors: 3,
    manualBugReports: 2,
    topPaths: [{ path: "/portal/app/services/funnel-builder", count: 5 }],
    topMessages: [{ kind: "action_failure", message: "Unable to save dashboard", count: 2 }],
  },
  kpis: {
    automationsRun: 412,
    aiCalls: 87,
    aiCompleted: 79,
    aiFailed: 8,
    missedCallAttempts: 31,
    missedCalls: 19,
    textsSent: 64,
    textsFailed: 3,
    leadScrapeRuns: 14,
    leadScrapeChargedCredits: 220,
    leadScrapeRefundedCredits: 18,
    blogGenerations: 9,
    blogCreditsUsed: 135,
    creditsUsed: 386,
    bookingsCreated: 22,
    reviewsCollected: 17,
    avgReviewRating: 4.8,
    leadsCreated: 146,
    contactsCreated: 91,
    aiOutboundQueuedNow: 4,
    aiOutboundCompleted: 38,
    aiOutboundFailed: 2,
    nurtureEnrollmentsCreated: 41,
    nurtureEnrollmentsActiveNow: 28,
    nurtureEnrollmentsCompleted: 11,
    newsletterSendEvents: 6,
    newsletterSentCount: 1920,
    newsletterFailedCount: 12,
    tasksOpenNow: 7,
    tasksCompleted: 53,
    inboxMessagesIn: 284,
    inboxMessagesOut: 247,
  },
  daily: [
    { day: "Mar 31", aiCalls: 4, missedCalls: 1, leadScrapeRuns: 1, bookings: 1, reviews: 0, creditsUsed: 16 },
    { day: "Apr 03", aiCalls: 7, missedCalls: 2, leadScrapeRuns: 2, bookings: 2, reviews: 1, creditsUsed: 29 },
    { day: "Apr 07", aiCalls: 6, missedCalls: 3, leadScrapeRuns: 1, bookings: 3, reviews: 2, creditsUsed: 25 },
    { day: "Apr 10", aiCalls: 9, missedCalls: 2, leadScrapeRuns: 3, bookings: 4, reviews: 2, creditsUsed: 38 },
    { day: "Apr 13", aiCalls: 5, missedCalls: 1, leadScrapeRuns: 1, bookings: 2, reviews: 1, creditsUsed: 19 },
  ],
};

const PREVIEW_MEDIA_STATS: MediaStatsPayload = {
  ok: true,
  itemsCount: 44,
  foldersCount: 3,
  distributionContinuity: {
    plannedPosts: 3,
    approvedPosts: 2,
    readyToUseAssets: 4,
    unscheduledReadyAssets: 3,
    needsCaptionAssets: 2,
    notesNeededAssets: 1,
    needsApprovalAssets: 1,
    missingCtaAssets: 3,
    manuallyPostedAssets: 5,
    providerQueuedAssets: 1,
    providerPendingAssets: 0,
    providerPublishedAssets: 1,
    providerBlockedAssets: 2,
    providerFailedAssets: 0,
    youtubePreparedAssets: 1,
  },
};

function contentAssetsNeedingCopyOrNotes(continuity: MediaDistributionContinuity) {
  return (continuity.needsCaptionAssets ?? 0) + (continuity.notesNeededAssets ?? 0);
}

function buildContentGuidanceItem(args: {
  continuity: MediaDistributionContinuity;
  isCreditWorkspace: boolean;
  href: string;
}): GuidanceItem | null {
  const { continuity, isCreditWorkspace, href } = args;
  const needsCopyOrNotes = contentAssetsNeedingCopyOrNotes(continuity);
  const queued = (continuity.providerQueuedAssets ?? 0) + (continuity.providerPendingAssets ?? 0);
  const publishedByProvider = continuity.providerPublishedAssets ?? 0;
  const usableAssets = (continuity.unscheduledReadyAssets ?? 0) + (continuity.plannedPosts ?? 0) + (continuity.manuallyPostedAssets ?? 0) + publishedByProvider;
  const youtubePreparedAssets = continuity.youtubePreparedAssets ?? 0;

  if ((continuity.providerFailedAssets ?? 0) > 0) {
    return {
      id: 'content-provider-failed',
      priority: 0,
      category: 'follow-up',
      status: 'needs-attention',
      title: isCreditWorkspace ? 'A provider publish attempt failed for consultation support content' : 'A provider publish attempt failed for content in the queue',
      reason: `${continuity.providerFailedAssets.toLocaleString()} asset${continuity.providerFailedAssets === 1 ? '' : 's'} need a blocker review before Purely should retry or move them back to manual posting.`,
      nextActionLabel: 'Open content workflow',
      href,
    };
  }

  if ((continuity.unscheduledReadyAssets ?? 0) > 0) {
    return {
      id: 'content-ready-not-scheduled',
      priority: 0,
      category: 'growth',
      status: 'opportunity',
      title: isCreditWorkspace ? 'You have consultation support content ready but not scheduled' : 'You have content ready but not scheduled',
      reason: isCreditWorkspace
        ? `${continuity.unscheduledReadyAssets.toLocaleString()} asset${continuity.unscheduledReadyAssets === 1 ? '' : 's'} can support consultation demand, but ${continuity.unscheduledReadyAssets === 1 ? 'it is' : 'they are'} not on the calendar yet.`
        : `${continuity.unscheduledReadyAssets.toLocaleString()} asset${continuity.unscheduledReadyAssets === 1 ? '' : 's'} can support business growth, but ${continuity.unscheduledReadyAssets === 1 ? 'it is' : 'they are'} not on the calendar yet.`,
      nextActionLabel: 'Open content workflow',
      href,
    };
  }

  if (queued > 0) {
    return {
      id: 'content-provider-queued',
      priority: 0,
      category: 'follow-up',
      status: 'opportunity',
      title: isCreditWorkspace ? 'Consultation support content is queued for provider publishing' : 'Content is queued for provider publishing',
      reason: `${queued.toLocaleString()} asset${queued === 1 ? '' : 's'} ${queued === 1 ? 'is' : 'are'} in Purely's provider queue. They should only publish if the provider path stays truly ready at dispatch time.`,
      nextActionLabel: 'Review queued assets',
      href,
    };
  }

  if ((continuity.plannedPosts ?? 0) > 0 && (continuity.manuallyPostedAssets ?? 0) === 0 && publishedByProvider === 0) {
    return {
      id: 'content-planned-not-posted',
      priority: 0,
      category: 'follow-up',
      status: 'needs-attention',
      title: isCreditWorkspace ? 'You planned consultation support content in Purely but have not marked anything posted' : 'You planned content in Purely but have not marked anything posted',
      reason: `${continuity.plannedPosts.toLocaleString()} locally planned item${continuity.plannedPosts === 1 ? '' : 's'} ${continuity.plannedPosts === 1 ? 'is' : 'are'} stored here, but there is no manual or provider-published history yet.`,
      nextActionLabel: 'Review schedule',
      href,
    };
  }

  if ((continuity.providerBlockedAssets ?? 0) > 0 && ((continuity.plannedPosts ?? 0) > 0 || usableAssets > 0 || youtubePreparedAssets > 0)) {
    return {
      id: 'content-provider-manual',
      priority: 0,
      category: 'setup',
      status: 'blocked',
      title: isCreditWorkspace ? 'Consultation support content is blocked from live provider publishing' : 'Content is blocked from live provider publishing',
      reason: youtubePreparedAssets > 0
        ? `${continuity.providerBlockedAssets.toLocaleString()} asset${continuity.providerBlockedAssets === 1 ? '' : 's'} are blocked or unavailable for live provider publishing, including ${youtubePreparedAssets.toLocaleString()} future YouTube video ${youtubePreparedAssets === 1 ? 'plan' : 'plans'}.`
        : `${continuity.providerBlockedAssets.toLocaleString()} asset${continuity.providerBlockedAssets === 1 ? '' : 's'} are blocked or unavailable, so the next live step still stays inside Media Library planning or manual posting.`,
      nextActionLabel: 'Open content workflow',
      href,
    };
  }

  if (usableAssets === 0) {
    return {
      id: 'content-build-more-usable',
      priority: 0,
      category: 'growth',
      status: 'opportunity',
      title: isCreditWorkspace ? 'Add more usable consultation support content before expecting demand lift' : 'Add more usable content before expecting traffic lift',
      reason: needsCopyOrNotes > 0
        ? `${needsCopyOrNotes.toLocaleString()} asset${needsCopyOrNotes === 1 ? '' : 's'} still need caption or planning notes before they can move into a usable queue.`
        : 'Media Library does not yet show enough ready, planned, or manually posted content to expect a meaningful lift from consistency.',
      nextActionLabel: 'Open content workflow',
      href,
    };
  }

  return null;
}

async function fetchWithRetry(input: string, init?: RequestInit, attempts = 2) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(input, init).catch(() => null as any);
    if (res && (res.ok || res.status < 500)) return res;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  }

  return null as any;
}

export function PortalDashboardClient() {
  const pathname = usePathname() || "";
  const toast = useToast();
  const uiPreview = usePortalUiPreview();
  const portalBase = useMemo(() => (pathname.startsWith("/credit") ? "/credit" : "/portal"), [pathname]);
  const [data, setData] = useState<MeResponse | null>(null);
  const [reporting, setReporting] = useState<ReportingPayload | null>(null);
  const [mediaStats, setMediaStats] = useState<MediaStatsPayload | null>(null);
  const [contentWorkflowStats, setContentWorkflowStats] = useState<MediaDistributionContinuity | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload["data"] | null>(null);
  const [salesStatus, setSalesStatus] = useState<SalesIntegrationStatusPayload | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReportPayload | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [servicesStatus, setServicesStatus] = useState<DashboardServicesStatus | null>(null);
  const [growthReadiness, setGrowthReadiness] = useState<GrowthReadinessResponse | null>(null);
  const [dashboardGrowthLoading, setDashboardGrowthLoading] = useState(true);
  const [dashboardGrowthError, setDashboardGrowthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (uiPreview) {
        setContentWorkflowStats(PREVIEW_MEDIA_STATS.ok ? (PREVIEW_MEDIA_STATS.distributionContinuity ?? null) : null);
        return;
      }

      const requestPortalVariant = pathname.startsWith("/credit") ? "credit" : "portal";
      const response = await fetchWithRetry("/api/portal/media/stats", {
        cache: "no-store",
        headers: { "x-portal-variant": requestPortalVariant },
      });

      if (!mounted) return;

      if (!response?.ok) {
        setContentWorkflowStats(null);
        return;
      }

      const stats = (await response.json().catch(() => null)) as MediaStatsPayload | null;
      setContentWorkflowStats(stats?.ok ? (stats.distributionContinuity ?? null) : null);
    })();

    return () => {
      mounted = false;
    };
  }, [pathname, uiPreview]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (uiPreview) {
        setDashboardGrowthLoading(false);
        setDashboardGrowthError(null);
        setGrowthReadiness(null);
        return;
      }

      const requestPortalVariant = pathname.startsWith("/credit") ? "credit" : "portal";
      setDashboardGrowthLoading(true);
      setDashboardGrowthError(null);

      const growthRes = await fetchWithRetry("/api/portal/growth/readiness", {
        cache: "no-store",
        headers: { "x-portal-variant": requestPortalVariant },
      });

      if (!mounted) return;

      if (growthRes?.ok) {
        const growth = (await growthRes.json().catch(() => null)) as GrowthReadinessResponse | null;
        if (growth) setGrowthReadiness(growth);
        setDashboardGrowthError(null);
      } else {
        const growthBody = growthRes
          ? ((await growthRes.json().catch(() => null)) as { error?: string } | null)
          : null;
        setDashboardGrowthError(growthBody?.error ?? "Unable to load growth readiness");
      }

      setDashboardGrowthLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [pathname, uiPreview]);

  const [editMode, setEditMode] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const [editSnapshot, setEditSnapshot] = useState<ResponsiveLayouts | null>(null);
  const [activeEditWidgetId, setActiveEditWidgetId] = useState<DashboardWidgetId | null>(null);

  const [layouts, setLayouts] = useState<ResponsiveLayouts>({} as ResponsiveLayouts);

  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (editMode) root.setAttribute("data-pa-hide-floating-tools", "1");
    else root.removeAttribute("data-pa-hide-floating-tools");
    return () => {
      root.removeAttribute("data-pa-hide-floating-tools");
    };
  }, [editMode]);

  useEffect(() => {
    const el = containerEl;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width;
      const fallback = typeof window !== "undefined" ? Math.max(320, window.innerWidth - 32) : 1200;
      setWidth(w > 0 ? Math.round(w) : fallback);
    };

    measure();

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    } catch {
      // ignore
    }

    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [containerEl]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      if (uiPreview) {
        setData(PREVIEW_ME_RESPONSE);
        setReporting(PREVIEW_REPORTING);
        setMediaStats(PREVIEW_MEDIA_STATS);
        setDashboard(PREVIEW_DASHBOARD_DATA);
        setGrowthReadiness(null);
        const base: LayoutItem[] = PREVIEW_DASHBOARD_DATA.layout.map((l) => ({
          i: l.i,
          x: l.x,
          y: l.y,
          w: l.w,
          h: l.h,
          ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
          ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
        }));
        setLayouts(makeResponsiveLayouts(base));
        setLoading(false);
        return;
      }

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

      const requiredController = new AbortController();
      const requiredTimeout = window.setTimeout(() => requiredController.abort(), 60000);
      const requestPortalVariant = pathname.startsWith("/credit") ? "credit" : "portal";

      const loadOptionalData = async () => {
        const optionalController = new AbortController();
        const optionalTimeout = window.setTimeout(() => optionalController.abort(), 15000);

        try {
          const [repRes, statsRes, svcRes, growthRes] = await Promise.all([
            fetchWithRetry("/api/portal/reporting?range=30d", {
              cache: "no-store",
              signal: optionalController.signal,
              headers: { "x-portal-variant": requestPortalVariant },
            }),
            fetchWithRetry("/api/portal/media/stats", {
              cache: "no-store",
              signal: optionalController.signal,
              headers: { "x-portal-variant": requestPortalVariant },
            }),
            fetchWithRetry("/api/portal/services/status", {
              cache: "no-store",
              signal: optionalController.signal,
              headers: { "x-portal-variant": requestPortalVariant },
            }),
            fetchWithRetry("/api/portal/growth/readiness", {
              cache: "no-store",
              signal: optionalController.signal,
              headers: { "x-portal-variant": requestPortalVariant },
            }),
          ]);

          if (!mounted) return;

          if (repRes?.ok) {
            const rep = (await repRes.json().catch(() => null)) as ReportingPayload | null;
            if (rep?.ok) {
              setReporting(rep);
            }
          } else if (repRes) {
            reportPortalActionFailure({
              area: "dashboard",
              action: "load_reporting",
              status: repRes.status,
              message: "Unable to load reporting",
              source: "portal_dashboard",
            });
          }

          if (statsRes?.ok) {
            const stats = (await statsRes.json().catch(() => null)) as MediaStatsPayload | null;
            if (stats) setMediaStats(stats);
          }

          if (svcRes?.ok) {
            const svc = (await svcRes.json().catch(() => null)) as DashboardServicesStatus | null;
            if (svc) setServicesStatus(svc);
          }

          if (growthRes?.ok) {
            const growth = (await growthRes.json().catch(() => null)) as GrowthReadinessResponse | null;
            if (growth) setGrowthReadiness(growth);
          }
        } finally {
          window.clearTimeout(optionalTimeout);
        }
      };

      try {
        const [meRes, dashRes] = await Promise.all([
          fetchWithRetry("/api/portal/me", {
            cache: "no-store",
            signal: requiredController.signal,
            headers: { "x-pa-app": "portal", "x-portal-variant": requestPortalVariant },
          }),
          fetchWithRetry(`/api/portal/dashboard?scope=${dashboardScope}` , {
            cache: "no-store",
            signal: requiredController.signal,
            headers: { "x-portal-variant": requestPortalVariant },
          }),
        ]);

        if (!mounted) return;

        if (!meRes || !dashRes) {
          setError("Unable to load dashboard");
          return;
        }

        if (!meRes.ok) {
          const body = await meRes.json().catch(() => ({}));
          const message = body?.error ?? "Unable to load dashboard";
          reportPortalActionFailure({ area: "dashboard", action: "load_me", status: meRes.status, message, source: "portal_dashboard" });
          setError(message);
          return;
        }

        setData((await meRes.json()) as MeResponse);

        if (!dashRes.ok) {
          const body = await dashRes.json().catch(() => ({}));
          const message = body?.error ?? "Unable to load dashboard layout";
          reportPortalActionFailure({ area: "dashboard", action: "load_layout", status: dashRes.status, message, source: "portal_dashboard" });
          setError(message);
          return;
        }

        const body = (await dashRes.json().catch(() => null)) as DashboardPayload | null;
        if (body?.ok && body.data) {
          setDashboard(body.data);

          const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({
            i: l.i,
            x: l.x,
            y: l.y,
            w: l.w,
            h: l.h,
            ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
            ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
          }));

          setLayouts(makeResponsiveLayouts(base));
        }

        void loadOptionalData();
      } catch (err) {
        if (!mounted) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          reportPortalActionFailure({ area: "dashboard", action: "load", message: "Dashboard data is taking too long to load. Please wait a moment and try again.", source: "portal_dashboard", meta: { timedOut: true } });
          setError("Dashboard data is taking too long to load. Please wait a moment and try again.");
        } else {
          reportPortalActionFailure({ area: "dashboard", action: "load", message: "Unable to load dashboard", source: "portal_dashboard" });
          setError("Unable to load dashboard");
        }
      } finally {
        window.clearTimeout(requiredTimeout);
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pathname, uiPreview]);

  const modules = useMemo((): ServiceCoverageModule[] => {
    const billingReady = Boolean(data?.billing?.configured);
    const statuses = servicesStatus && servicesStatus.ok ? servicesStatus.statuses : null;

    return [
      {
        key: "blog" as const,
        name: moduleByKey("blog").title,
        serviceSlug: "blogs",
        defaultHref: `${portalBase}/app/services/blogs`,
        disabledHelper: billingReady
          ? "Automated Blogs is optional. Turn it on in Billing when you want publishing active in this workspace."
          : "Billing is not connected, so Automated Blogs is not enabled in this workspace yet.",
      },
      {
        key: "booking" as const,
        name: moduleByKey("booking").title,
        serviceSlug: "booking",
        defaultHref: `${portalBase}/app/services/booking`,
        disabledHelper: billingReady
          ? "Booking Automation is optional. It includes confirmations, reminders, and post-booking follow-up when you turn it on in Billing."
          : "Billing is not connected, so Booking Automation and its follow-up workflow are not enabled in this workspace yet.",
      },
      {
        key: "leadOutbound" as const,
        name: moduleByKey("leadOutbound").title,
        serviceSlug: "ai-outbound-calls",
        defaultHref: `${portalBase}/app/services/ai-outbound-calls`,
        disabledHelper: billingReady
          ? "AI Outbound is optional. Turn it on in Billing when you want outbound calling and follow-up campaigns active here."
          : "Billing is not connected, so AI Outbound is not enabled in this workspace yet.",
      },
    ].map((module) => {
      const enabled = Boolean(data?.entitlements?.[module.key]);
      const status = statuses?.[module.serviceSlug];

      if (!enabled || status?.state === "locked" || status?.state === "paused" || status?.state === "canceled") {
        return {
          ...module,
          enabled,
          coverageState: "not_enabled",
          stateLabel: billingReady ? "Not enabled in this workspace" : "Billing not connected",
          badgeLabel: billingReady ? "Optional" : "Billing",
          helper: module.disabledHelper,
          ctaLabel: billingReady ? "Manage in Billing" : "Open Billing",
          ctaHref: `${portalBase}/app/billing`,
        };
      }

      if (!status) {
        return {
          ...module,
          enabled,
          coverageState: "checking",
          stateLabel: "Checking setup",
          badgeLabel: "Checking",
          helper: "This service is unlocked. The dashboard is still checking whether it needs setup or is ready to use.",
          ctaLabel: "Open service",
          ctaHref: module.defaultHref,
        };
      }

      if (status.readiness.state === "ready") {
        return {
          ...module,
          enabled,
          coverageState: "ready",
          stateLabel: "Ready to use",
          badgeLabel: "Ready",
          helper: status.readiness.helper,
          ctaLabel: status.readiness.ctaLabel,
          ctaHref: status.readiness.href ?? module.defaultHref,
        };
      }

      const providerBlocked = status.readiness.state === "needs_connection" || status.readiness.state === "blocked";
      return {
        ...module,
        enabled,
        coverageState: providerBlocked ? "provider_blocked" : "needs_setup",
        stateLabel: providerBlocked ? "Provider blocker" : "Needs setup",
        badgeLabel: providerBlocked ? "Blocked" : "Setup",
        helper: status.readiness.helper,
        ctaLabel: status.readiness.ctaLabel,
        ctaHref: status.readiness.href ?? module.defaultHref,
      };
    });
  }, [data, portalBase, servicesStatus]);

  const dashboardSuggestionIds = useMemo(() => {
    const current = new Set((dashboard?.widgets ?? []).map((widget) => widget.id));
    return (["puraAttention", "activityPulse", "successRate", "dailyActivity"] as DashboardWidgetId[]).filter((id) => !current.has(id));
  }, [dashboard]);

  const contentGuidanceItem = useMemo((): GuidanceItem | null => {
    const continuity = contentWorkflowStats || (mediaStats && mediaStats.ok ? mediaStats.distributionContinuity : null);
    if (!continuity) return null;

    return buildContentGuidanceItem({
      continuity,
      isCreditWorkspace: portalBase === "/credit",
      href: `${portalBase}/app/services/media-library`,
    });
  }, [contentWorkflowStats, mediaStats, portalBase]);

  const guidanceItems = useMemo((): GuidanceItem[] => {
    if (!data) return [];
    const isCredit = portalBase === "/credit";
    const svcStatuses =
      servicesStatus && servicesStatus.ok ? servicesStatus.statuses : {};
    const built = buildGuidanceItems({
      isCreditWorkspace: isCredit,
      portalBase,
      billingConfigured: Boolean(data.billing?.configured),
      statuses: svcStatuses,
      kpis: reporting?.kpis
        ? {
            leadsCreated: reporting.kpis.leadsCreated ?? 0,
            contactsCreated: reporting.kpis.contactsCreated ?? 0,
            bookingsCreated: reporting.kpis.bookingsCreated ?? 0,
            aiCalls: reporting.kpis.aiCalls ?? 0,
            textsSent: reporting.kpis.textsSent ?? 0,
            missedCalls: reporting.kpis.missedCalls ?? 0,
            nurtureEnrollmentsCreated: reporting.kpis.nurtureEnrollmentsCreated ?? 0,
            newsletterSentCount: reporting.kpis.newsletterSentCount ?? 0,
            reviewsCollected: reporting.kpis.reviewsCollected ?? 0,
            blogGenerations: reporting.kpis.blogGenerations ?? 0,
            tasksOpenNow: reporting.kpis.tasksOpenNow ?? 0,
            inboxMessagesIn: reporting.kpis.inboxMessagesIn ?? 0,
            inboxMessagesOut: reporting.kpis.inboxMessagesOut ?? 0,
            externalBookingHandoff: reporting.externalBookingHandoff
              ? {
                  enabled: reporting.externalBookingHandoff.enabled,
                  providerConfirmationAvailable: reporting.externalBookingHandoff.providerConfirmationAvailable ?? false,
                  providerConfirmationConnected: reporting.externalBookingHandoff.providerConfirmationConnected ?? false,
                  totalHandoffs: reporting.externalBookingHandoff.totalHandoffs ?? 0,
                  directHandoffs: reporting.externalBookingHandoff.directHandoffs ?? 0,
                  leadFirstCaptures: reporting.externalBookingHandoff.leadFirstCaptures ?? 0,
                  confirmedViaRedirect: reporting.externalBookingHandoff.confirmedViaRedirect ?? 0,
                  providerConfirmedBookings: reporting.externalBookingHandoff.providerConfirmedBookings ?? 0,
                  providerCanceledBookings: reporting.externalBookingHandoff.providerCanceledBookings ?? 0,
                  providerRescheduledBookings: reporting.externalBookingHandoff.providerRescheduledBookings ?? 0,
                  guidance: reporting.externalBookingHandoff.guidance,
                }
              : null,
          }
        : null,
    });

    return built;
  }, [data, portalBase, reporting, servicesStatus]);

  const hasStripeSalesWidget = useMemo(
    () => Boolean(dashboard?.widgets?.some((w) => w.id === "stripeSales")),
    [dashboard],
  );

  const growthPayload = growthReadiness && growthReadiness.ok ? growthReadiness : null;

  useEffect(() => {
    if (uiPreview) {
      setSalesStatus({
        ok: true,
        encryptionConfigured: true,
        activeProvider: null,
        providers: {},
        stripe: { configured: false, prefix: null, accountId: null, connectedAtIso: null },
        note: "Preview mode: sales reporting is mocked locally.",
      });
      setSalesReport(null);
      setSalesError(null);
      return;
    }

    if (!hasStripeSalesWidget) return;

    let mounted = true;
    (async () => {
      setSalesError(null);

      const statusRes = await fetch("/api/portal/integrations/sales-reporting", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;

      if (!statusRes?.ok) {
        reportPortalActionFailure({ area: "dashboard", action: "load_sales_status", message: "Unable to load sales status", status: statusRes?.status, source: "portal_dashboard" });
        setSalesError("Unable to load sales status");
        return;
      }

      const statusBody = (await statusRes.json().catch(() => null)) as SalesIntegrationStatusPayload | null;
      if (!mounted) return;

      if (!statusBody?.ok) {
        setSalesStatus(null);
        setSalesReport(null);
        reportPortalActionFailure({ area: "dashboard", action: "load_sales_status", message: statusBody?.error ?? "Unable to load sales status", source: "portal_dashboard" });
        setSalesError(statusBody?.error ?? "Unable to load sales status");
        return;
      }

      setSalesStatus(statusBody);
      const anyConnected = Boolean(
        statusBody?.providers &&
          Object.values(statusBody.providers).some((p) => Boolean(p?.configured)),
      );
      if (!anyConnected) {
        setSalesReport(null);
        return;
      }

      const salesRes = await fetch("/api/portal/reporting/sales?range=30d", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;

      if (!salesRes?.ok) {
        const errBody = (await salesRes?.json().catch(() => ({}))) as { error?: string };
        setSalesReport(null);
        reportPortalActionFailure({ area: "dashboard", action: "load_sales", message: errBody?.error ?? "Unable to load sales", status: salesRes?.status, source: "portal_dashboard" });
        setSalesError(errBody?.error ?? "Unable to load sales");
        return;
      }

      const salesBody = (await salesRes.json().catch(() => null)) as SalesReportPayload | null;
      if (!mounted) return;

      if (!salesBody?.ok) {
        setSalesReport(null);
        reportPortalActionFailure({ area: "dashboard", action: "load_sales", message: salesBody?.error ?? "Unable to load sales", source: "portal_dashboard" });
        setSalesError(salesBody?.error ?? "Unable to load sales");
        return;
      }

      setSalesReport(salesBody);
    })();

    return () => {
      mounted = false;
    };
  }, [hasStripeSalesWidget, pathname, uiPreview]);

  async function manageBilling() {
    if (!data?.billing?.configured) {
      window.location.href = `${portalBase}/app/billing`;
      return;
    }
    setError(null);
    const res = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: `${portalBase}/app` }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body?.error ?? "Unable to open billing portal";
      reportPortalActionFailure({ area: "dashboard", action: "open_billing_portal", status: res.status, message, source: "portal_dashboard" });
      setError(message);
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
  }

  const loadingGrowthPayload = growthReadiness && growthReadiness.ok ? growthReadiness : null;

  if (loading) {
    const isCreditLoading = portalBase === "/credit";
    const loadingTopActions = loadingGrowthPayload?.topActions?.slice(0, 2) ?? [];
    const loadingTopAction = loadingTopActions[0] ?? null;
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">{isCreditLoading ? "Credit workspace" : "Your workspace"}</div>
          <div className="mt-1 text-sm text-zinc-600">
            {isCreditLoading
              ? "Loading your credit dashboard — services, workflow status, and billing will appear here."
              : "Loading your dashboard — services, activity, and billing will appear here."}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={`${portalBase}/app/services`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
            >
              View services
            </a>
            <a
              href={`${portalBase}/app/billing`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
            >
              View billing
            </a>
            {!isCreditLoading ? (
              <a
                href={`${portalBase}/app/services/reporting`}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
              >
                View reporting
              </a>
            ) : null}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {loadingGrowthPayload
                  ? loadingGrowthPayload.isLowActivityWorkspace
                    ? isCreditLoading
                      ? "Credit starter path"
                      : "Starter path"
                    : isCreditLoading
                      ? "Credit workspace next actions"
                      : "Do this next"
                  : dashboardGrowthLoading
                    ? "Checking next actions"
                    : "Safe next routes"}
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                {loadingTopAction
                  ? "These actions are already available from the stored workspace state while the rest of the dashboard finishes loading."
                  : dashboardGrowthLoading
                    ? "Loading growth guidance from the current workspace state."
                    : "Growth guidance is temporarily unavailable, so this dashboard falls back to stable next routes instead of guessing at outcomes."}
              </div>
            </div>
            <a
              href={`${portalBase}/app/services`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
            >
              All services
            </a>
          </div>

          {loadingTopAction ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {loadingTopActions.map((action, index) => (
                <a
                  key={action.id}
                  href={action.href}
                  className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5 hover:bg-zinc-50"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {index === 0 ? "Top action" : "Next step"}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{action.title}</div>
                  <div className="mt-2 text-sm text-zinc-600">{action.detail}</div>
                  {action.blocker ? <div className="mt-3 text-xs font-semibold text-amber-700">{action.blocker}</div> : null}
                  <div className="mt-4 text-sm font-semibold text-brand-ink">{action.ctaLabel} →</div>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`${portalBase}/app/services`}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
              >
                View services
              </a>
              <a
                href={`${portalBase}/app/services/reporting`}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
              >
                View reporting
              </a>
              {dashboardGrowthError ? (
                <div className="inline-flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
                  {dashboardGrowthError}
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-500">
          Dashboard data is loading. If this takes more than a few seconds, try refreshing the page.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const me = data;
  const isCreditWorkspace = portalBase === "/credit";
  const meMetrics = me.metrics ?? { hoursSavedThisWeek: 0, hoursSavedAllTime: 0 };
  const billingConfigured = Boolean(me.billing?.configured);
  const blogEntitled = Boolean(me.entitlements?.blog);
  const k = reporting?.kpis;
  const derived = (() => {
    if (!reporting?.kpis || !reporting) {
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

    const successes = (reporting.kpis.aiCompleted ?? 0) + (reporting.kpis.textsSent ?? 0);
    const failures = (reporting.kpis.aiFailed ?? 0) + (reporting.kpis.textsFailed ?? 0);
    const appFailures =
      (reporting.diagnostics?.actionFailures ?? 0) +
      (reporting.diagnostics?.runtimeErrors ?? 0) +
      (reporting.diagnostics?.unhandledRejections ?? 0) +
      (reporting.diagnostics?.resourceErrors ?? 0) +
      (reporting.diagnostics?.manualBugReports ?? 0);
    const overall = successes + failures > 0 ? successes / (successes + failures) : null;

    const aiDen = (reporting.kpis.aiCompleted ?? 0) + (reporting.kpis.aiFailed ?? 0);
    const aiRate = aiDen > 0 ? (reporting.kpis.aiCompleted ?? 0) / aiDen : null;

    const txtDen = (reporting.kpis.textsSent ?? 0) + (reporting.kpis.textsFailed ?? 0);
    const txtRate = txtDen > 0 ? (reporting.kpis.textsSent ?? 0) / txtDen : null;

    const attempts = (reporting.kpis.missedCallAttempts ?? 0) as number;
    const missed = (reporting.kpis.missedCalls ?? 0) as number;
    const missedRate = attempts > 0 ? missed / attempts : null;

    const days = daysBetweenIso(reporting.startIso, reporting.endIso);
    const creditsPerDay = days > 0 ? (reporting.kpis.creditsUsed ?? 0) / days : null;
    const runwayDays = creditsPerDay && creditsPerDay > 0 ? (reporting.creditsRemaining ?? 0) / creditsPerDay : null;

    return {
      overallSuccessRate: overall,
      totalFailures: failures + appFailures,
      automationFailures: failures,
      appFailures,
      aiSuccessRate: aiRate,
      textSuccessRate: txtRate,
      missedCaptureRate: missedRate,
      creditsPerDay,
      creditRunwayDays: runwayDays,
    };
  })();

  const widgetIds: DashboardWidgetId[] = (dashboard?.widgets ?? []).map((w) => w.id);
  const readyModuleCount = modules.filter((module) => module.coverageState === "ready").length;
  const needsSetupModuleCount = modules.filter((module) => module.coverageState === "needs_setup").length;
  const providerBlockedModuleCount = modules.filter((module) => module.coverageState === "provider_blocked").length;
  const notEnabledModuleCount = modules.filter((module) => module.coverageState === "not_enabled").length;
  const checkingModuleCount = modules.filter((module) => module.coverageState === "checking").length;
  const firstReadyModule = modules.find((module) => module.coverageState === "ready") ?? null;
  const readyModuleNames = modules.filter((module) => module.coverageState === "ready").map((module) => module.name);
  const needsSetupModuleNames = modules.filter((module) => module.coverageState === "needs_setup").map((module) => module.name);
  const providerBlockedModuleNames = modules.filter((module) => module.coverageState === "provider_blocked").map((module) => module.name);
  const notEnabledModuleNames = modules.filter((module) => module.coverageState === "not_enabled").map((module) => module.name);
  const checkingModuleNames = modules.filter((module) => module.coverageState === "checking").map((module) => module.name);
  const includedToolsSummary = isCreditWorkspace
    ? "Included tools already available: Pura, Inbox, Media library, Tasks, and the core credit workspace tools. Booking follow-up lives under Booking Automation rather than as a separate paid add-on."
    : "Included tools already available: Pura, Inbox, Media library, Tasks, and Funnel Builder. Booking follow-up lives under Booking Automation rather than as a separate paid add-on.";
  const servicesWidgetBanner = (() => {
    if (!billingConfigured) {
      return {
        eyebrow: "Optional workflows",
        headline: "Billing is not connected yet, so optional workflows stay off.",
        body: `${includedToolsSummary} Right now ${formatNaturalList(notEnabledModuleNames)} stay off until billing is connected.`,
        badgeLabel: "Billing not connected",
        badgeClass: "border-zinc-200 bg-zinc-50 text-zinc-700",
      };
    }

    if (notEnabledModuleCount === modules.length) {
      return {
        eyebrow: "Optional workflows",
        headline: "Nothing optional is turned on right now.",
        body: `${includedToolsSummary} Turn on only the workflows you actually want in Billing.`,
        badgeLabel: "Optional workflows off",
        badgeClass: "border-zinc-200 bg-zinc-50 text-zinc-700",
      };
    }

    if (providerBlockedModuleCount > 0) {
      return {
        eyebrow: "Optional workflows",
        headline: "Some workflows are enabled, but provider setup is still blocking them.",
        body: `${includedToolsSummary} ${formatNaturalList(providerBlockedModuleNames)} still need provider setup before they can be treated as live.`,
        badgeLabel: "Provider setup needed",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      };
    }

    if (needsSetupModuleCount > 0 || checkingModuleCount > 0) {
      const setupNames = [...needsSetupModuleNames, ...checkingModuleNames];
      return {
        eyebrow: "Optional workflows",
        headline: "Some workflows are enabled, but they still need setup.",
        body: `${includedToolsSummary} ${formatNaturalList(setupNames)} still need a little more setup before they are ready to use.`,
        badgeLabel: "Setup still needed",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      };
    }

    return {
      eyebrow: "Optional workflows",
      headline:
        readyModuleCount === 1 && firstReadyModule
          ? `${firstReadyModule.name} is turned on and ready to use.`
          : "Your enabled optional workflows are ready to use.",
      body: `${includedToolsSummary} ${formatNaturalList(readyModuleNames)} ${readyModuleNames.length === 1 ? "is" : "are"} already enabled in this workspace.`,
      badgeLabel: "Ready to use",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  })();
  const servicesWidgetSummary = (() => {
    if (!billingConfigured) {
      return {
        headline: "Included tools are ready. Billing only matters when you want optional workflows on.",
        body: `${includedToolsSummary} If you want ${formatNaturalList(notEnabledModuleNames)} active here, connect billing first.`,
        primaryHref: `${portalBase}/app/billing`,
        primaryLabel: "Open Billing",
      };
    }

    if (notEnabledModuleCount === modules.length) {
      return {
        headline: "Optional workflows are off right now.",
        body: `${includedToolsSummary} Turn on ${formatNaturalList(notEnabledModuleNames)} in Billing only when you actually want them running in this workspace.`,
        primaryHref: `${portalBase}/app/billing`,
        primaryLabel: "Manage in Billing",
      };
    }

    const attentionNames = [...needsSetupModuleNames, ...providerBlockedModuleNames, ...checkingModuleNames];

    if (attentionNames.length === 0 && readyModuleCount > 0) {
      return {
        headline:
          readyModuleCount === 1 && firstReadyModule
            ? `${firstReadyModule.name} is ready to use`
            : "Your enabled optional workflows are ready to use.",
        body: `${includedToolsSummary} ${formatNaturalList(readyModuleNames)} ${readyModuleNames.length === 1 ? "is" : "are"} already enabled and can be treated as live here.`,
        primaryHref: `${portalBase}/app/services`,
        primaryLabel: "Review services",
      };
    }

    return {
      headline: readyModuleCount > 0 ? "Some workflows are ready, and some still need attention." : "A few enabled workflows still need attention.",
      body: `${includedToolsSummary} ${formatNaturalList(attentionNames)} ${attentionNames.length === 1 ? "still needs" : "still need"} setup before everything here feels fully ready.`,
      primaryHref: `${portalBase}/app/services`,
      primaryLabel: "Review services",
    };
  })();

  const serviceQuickLinks = [
    { href: `${portalBase}/app/onboarding`, label: "Setup checklist" },
    blogEntitled ? { href: `${portalBase}/app/services/blogs`, label: "Blogs" } : null,
    { href: `${portalBase}/app/billing`, label: "Billing" },
    { href: `${portalBase}/app/services/reporting`, label: "Reporting" },
    { href: `${portalBase}/app/ai-chat`, label: "Pura" },
    { href: `${portalBase}/app/services/inbox/email`, label: "Inbox" },
    { href: `${portalBase}/app/services/media-library`, label: "Media library" },
  ].filter((item): item is { href: string; label: string } => Boolean(item));

  const dashboardAttentionItems = (() => {
    const items: Array<{ label: string; value: string; href: string; tone: "danger" | "warning" | "neutral" }> = [];

    if (derived.totalFailures > 0) {
      items.push({
        label: "Failures to review",
        value: `${derived.totalFailures.toLocaleString()} flagged`,
        href: `${portalBase}/app/services/reporting`,
        tone: "danger",
      });
    }

    if ((reporting?.diagnostics?.actionFailures ?? 0) > 0) {
      items.unshift({
        label: "Portal action failures",
        value: `${compactNum(reporting?.diagnostics?.actionFailures ?? 0)} recorded`,
        href: `${portalBase}/app/services/reporting`,
        tone: "danger",
      });
    }

    if ((k?.tasksOpenNow ?? 0) > 0) {
      items.push({
        label: "Open tasks",
        value: `${compactNum(k?.tasksOpenNow ?? 0)} waiting`,
        href: `${portalBase}/app/services/tasks`,
        tone: "warning",
      });
    }

    if ((k?.aiOutboundQueuedNow ?? 0) > 0) {
      items.push({
        label: "Outbound queue",
        value: `${compactNum(k?.aiOutboundQueuedNow ?? 0)} queued now`,
        href: `${portalBase}/app/services/ai-outbound-calls/calls`,
        tone: "neutral",
      });
    }

    if (typeof derived.creditRunwayDays === "number" && Number.isFinite(derived.creditRunwayDays) && derived.creditRunwayDays < 14) {
      items.push({
        label: "Credits runway",
        value: `~${Math.max(0, Math.round(derived.creditRunwayDays))} days left`,
        href: `${portalBase}/app/billing`,
        tone: "warning",
      });
    }

    if (items.length === 0) {
      items.push({
        label: "Everything looks stable",
        value: "Open Pura for a deeper review",
        href: `${portalBase}/app/ai-chat`,
        tone: "neutral",
      });
    }

    return items.slice(0, 3);
  })();

  const activityPulseRows = (() => {
    const rows = (reporting?.daily ?? []).slice(-10);
    const totals = rows.map((row) => row.aiCalls + row.missedCalls + row.leadScrapeRuns + row.bookings + row.reviews);
    const maxTotal = totals.reduce((max, value) => Math.max(max, value), 0);
    return rows.map((row, index) => ({
      day: row.day,
      label: row.day.slice(5),
      total: totals[index] ?? 0,
      heightPct: maxTotal > 0 ? Math.max(16, Math.round(((totals[index] ?? 0) / maxTotal) * 100)) : 16,
      aiCalls: row.aiCalls,
      bookings: row.bookings,
      reviews: row.reviews,
    }));
  })();

  function widgetTitle(id: DashboardWidgetId): string {
    switch (id) {
      case "hoursSaved":
        return "Hours saved";
      case "billing":
        return "Billing";
      case "puraAttention":
        return "Pura attention";
      case "activityPulse":
        return "Activity pulse";
      case "stripeSales":
        return "Sales";
      case "services":
        return "Your services";
      case "mediaLibrary":
        return "Media library";
      case "creditsRemaining":
        return "Credits remaining";
      case "creditsUsed":
        return "Credits used";
      case "blogGenerations":
        return "Blogs generated";
      case "blogCreditsUsed":
        return "Blog credits used";
      case "automationsRun":
        return "Automations run";
      case "successRate":
        return "Success rate";
      case "failures":
        return "Failures";
      case "creditsRunway":
        return "Credits runway";
      case "leadsCaptured":
        return "Leads captured";
      case "reliabilitySummary":
        return "Reliability";
      case "aiCalls":
        return "AI calls";
      case "aiOutboundCalls":
        return "AI outbound";
      case "missedCalls":
        return "Missed calls";
      case "bookingsCreated":
        return "Bookings created";
      case "reviewsCollected":
        return "Reviews collected";
      case "avgReviewRating":
        return "Average rating";
      case "newsletterSends":
        return "Newsletter sends";
      case "nurtureEnrollments":
        return "Nurture enrollments";
      case "tasks":
        return "Tasks";
      case "inboxMessagesIn":
        return "Inbox messages";
      case "inboxMessagesOut":
        return "Outbox messages";
      case "leadsCreated":
        return "Leads created";
      case "contactsCreated":
        return "Contacts created";
      case "leadScrapeRuns":
        return "Lead scraping runs";
      case "dailyActivity":
        return "Daily activity";
      case "perfAiReceptionist":
        return "AI Receptionist performance";
      case "perfMissedCallTextBack":
        return "Missed-call Text Back performance";
      case "perfLeadScraping":
        return "Lead Scraping performance";
      case "perfReviews":
        return "Reviews performance";
      default:
        return "Widget";
    }
  }

  async function saveDashboard(nextLayouts: ResponsiveLayouts) {
    if (!dashboard) return;
    setSavingLayout(true);

    if (uiPreview) {
      const bp = activeDashboardBreakpoint(width);
      const chosen: Layout = Array.isArray((nextLayouts as any)?.[bp])
        ? (((nextLayouts as any)[bp]) as Layout)
        : Array.isArray((nextLayouts as any)?.lg)
          ? (((nextLayouts as any).lg) as Layout)
          : [];
      const nextData = {
        ...dashboard,
        layout: chosen.map((l: LayoutItem) => ({
          i: l.i as DashboardWidgetId,
          x: l.x,
          y: l.y,
          w: l.w,
          h: l.h,
          ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
          ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
        })),
      };
      setDashboard(nextData);
      setLayouts(nextLayouts);
      setSavingLayout(false);
      return true;
    }

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

    const bp = activeDashboardBreakpoint(width);
    const chosen: Layout = Array.isArray((nextLayouts as any)?.[bp])
      ? (((nextLayouts as any)[bp]) as Layout)
      : Array.isArray((nextLayouts as any)?.lg)
        ? (((nextLayouts as any).lg) as Layout)
        : [];
    const next = {
      version: 1 as const,
      widgets: dashboard.widgets,
      layout: chosen.map((l: LayoutItem) => ({
        i: l.i as DashboardWidgetId,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
        ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
      })),
    };

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", data: next }),
    });
    const body = (await res.json().catch(() => ({}))) as DashboardPayload;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
      const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
        ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
      }));
      setLayouts(makeResponsiveLayouts(base));
      setSavingLayout(false);
      return true;
    }
    setSavingLayout(false);
    return false;
  }

  function beginEdit() {
    setEditSnapshot(layouts);
    setActiveEditWidgetId(null);
    setEditMode(true);
    try {
      window.dispatchEvent(new CustomEvent("pa.portal.dashboard.edit", { detail: { editing: true } }));
    } catch {
      // ignore
    }
  }

  function cancelEdit() {
    if (editSnapshot) setLayouts(editSnapshot);
    setEditSnapshot(null);
    setActiveEditWidgetId(null);
    setEditMode(false);
    try {
      window.dispatchEvent(new CustomEvent("pa.portal.dashboard.edit", { detail: { editing: false } }));
    } catch {
      // ignore
    }
  }

  async function doneEdit() {
    const ok = await saveDashboard(layouts);
    if (ok) {
      setEditSnapshot(null);
      setActiveEditWidgetId(null);
      setEditMode(false);

      try {
        window.dispatchEvent(new CustomEvent("pa.portal.dashboard.edit", { detail: { editing: false } }));
        window.dispatchEvent(new CustomEvent("pa.portal.dashboard.saved"));
      } catch {
        // ignore
      }

      // Kick the weekly analysis refresh immediately after dashboard edits.
      void fetch("/api/portal/dashboard/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "dashboard_saved" }),
      }).catch(() => null);
    } else {
      setError("Unable to save dashboard");
      window.setTimeout(() => setError(null), 2500);
    }
  }

  async function removeWidget(id: DashboardWidgetId) {
    if (uiPreview) {
      if (!dashboard) return;
      const nextData = {
        ...dashboard,
        widgets: dashboard.widgets.filter((widget) => widget.id !== id),
        layout: dashboard.layout.filter((item) => item.i !== id),
      };
      setDashboard(nextData);
      const base: LayoutItem[] = nextData.layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
      setLayouts(makeResponsiveLayouts(base));
      return;
    }

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

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", widgetId: id }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
      const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof (l as any).minW === "number" ? { minW: (l as any).minW } : {}),
        ...(typeof (l as any).minH === "number" ? { minH: (l as any).minH } : {}),
      }));
      setLayouts(makeResponsiveLayouts(base));
    }
  }

  async function addWidget(id: DashboardWidgetId) {
    if (uiPreview) {
      if (!dashboard || dashboard.widgets.some((widget) => widget.id === id)) return;
      const nextData = {
        ...dashboard,
        widgets: [...dashboard.widgets, { id }],
        layout: buildDashboardLayout([...dashboard.widgets.map((widget) => widget.id), id]),
      };
      setDashboard(nextData);
      const base: LayoutItem[] = nextData.layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h, ...(typeof l.minW === "number" ? { minW: l.minW } : {}), ...(typeof l.minH === "number" ? { minH: l.minH } : {}) }));
      setLayouts(makeResponsiveLayouts(base));
      return;
    }

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

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", widgetId: id }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
      const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
        ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
      }));
      setLayouts(makeResponsiveLayouts(base));
    }
  }

  async function resetDashboard() {
    if (uiPreview) {
      setDashboard(PREVIEW_DASHBOARD_DATA);
      const base: LayoutItem[] = PREVIEW_DASHBOARD_DATA.layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
      setLayouts(makeResponsiveLayouts(base));
      return;
    }

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

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
      const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof (l as any).minW === "number" ? { minW: (l as any).minW } : {}),
        ...(typeof (l as any).minH === "number" ? { minH: (l as any).minH } : {}),
      }));
      setLayouts(makeResponsiveLayouts(base));
    }
  }

  function handleEditInteractionStart(item: LayoutItem | null | undefined) {
    const nextId = typeof item?.i === "string" ? (item.i as DashboardWidgetId) : null;
    setActiveEditWidgetId(nextId);
  }

  function handleEditInteractionStop() {
    setActiveEditWidgetId(null);
  }

  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case "hoursSaved":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-2xl font-bold text-brand-ink">{formatSavedTime(meMetrics.hoursSavedThisWeek)}</div>
            <div className="mt-1 text-xs text-zinc-500">This week</div>
            <div className="mt-3 text-sm text-zinc-700">
              All-time: <span className="font-semibold">{formatSavedTime(meMetrics.hoursSavedAllTime)}</span>
            </div>
          </AccentCard>
        );

      case "billing":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-700">
                {billingConfigured ? "Manage your plan and payment method." : "View billing, credits, and top-ups."}
              </div>
              <button
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition-opacity duration-100 hover:opacity-95 disabled:opacity-60"
                onClick={manageBilling}
              >
                {billingConfigured ? "Manage" : "Billing"}
              </button>
            </div>
          </AccentCard>
        );

      case "puraAttention":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Pura can help you work the next move</div>
                <div className="mt-1 text-sm text-zinc-600">Use Pura when you want the system to explain what changed, what needs attention, or where to focus next.</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`${portalBase}/app/ai-chat`} className={dashboardPrimaryButtonClass}>Open Pura</Link>
                  <Link href={`${portalBase}/app/services/reporting`} className={dashboardSecondaryButtonClass}>Open reporting</Link>
                </div>
              </div>
              <div className="space-y-2">
                {dashboardAttentionItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={classNames(
                      "block rounded-2xl border p-3 transition-colors duration-150 hover:bg-zinc-50",
                      item.tone === "danger"
                        ? "border-rose-200 bg-rose-50/70"
                        : item.tone === "warning"
                          ? "border-amber-200 bg-amber-50/70"
                          : "border-zinc-200 bg-white",
                    )}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{item.value}</div>
                  </Link>
                ))}
              </div>
            </div>
          </AccentCard>
        );

      case "activityPulse":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Last 10 days</div>
                  <div className="mt-1 text-xs text-zinc-500">AI calls, missed calls, lead runs, bookings, and reviews combined.</div>
                </div>
                <Link href={`${portalBase}/app/services/reporting`} className="text-xs font-semibold text-brand-ink hover:underline">
                  Open reporting
                </Link>
              </div>

              <div className="mt-5 flex h-32 items-end gap-2">
                {activityPulseRows.length ? (
                  activityPulseRows.map((row) => (
                    <div key={row.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-24 w-full items-end rounded-2xl bg-white px-1.5 pb-1.5 pt-2 ring-1 ring-black/5">
                        <div
                          className="w-full rounded-xl bg-[linear-gradient(180deg,rgba(29,78,216,0.92),rgba(251,113,133,0.55))]"
                          style={{ height: `${row.heightPct}%` }}
                          title={`${row.day}: ${row.total} actions`}
                        />
                      </div>
                      <div className="text-[11px] font-semibold text-zinc-500">{row.label}</div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center text-sm text-zinc-600">No reporting activity yet.</div>
                )}
              </div>

              {activityPulseRows.length ? (
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-zinc-600">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="font-semibold text-zinc-900">AI calls</div>
                    <div className="mt-1">{compactNum(activityPulseRows.reduce((sum, row) => sum + row.aiCalls, 0))}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="font-semibold text-zinc-900">Bookings</div>
                    <div className="mt-1">{compactNum(activityPulseRows.reduce((sum, row) => sum + row.bookings, 0))}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="font-semibold text-zinc-900">Reviews</div>
                    <div className="mt-1">{compactNum(activityPulseRows.reduce((sum, row) => sum + row.reviews, 0))}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </AccentCard>
        );

      case "stripeSales": {
        const connected = Boolean(
          salesStatus &&
            salesStatus.ok &&
            salesStatus.providers &&
            Object.values(salesStatus.providers).some((p) => Boolean(p?.configured)),
        );
        const net = salesReport && salesReport.ok ? salesReport.totals.netCents : 0;
        const gross = salesReport && salesReport.ok ? salesReport.totals.grossCents : 0;
        const refunded = salesReport && salesReport.ok ? salesReport.totals.refundedCents : 0;
        const currency = salesReport && salesReport.ok ? salesReport.currency : "usd";
        const count = salesReport && salesReport.ok ? salesReport.totals.chargeCount : 0;
        const providerLabel = salesReport && salesReport.ok ? salesReport.providerLabel : null;

        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            {!connected ? (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-zinc-700">Connect a payment processor to see sales right on your dashboard.</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`${portalBase}/app/profile`}
                    className={dashboardPrimaryButtonClass}
                  >
                    Connect
                  </Link>
                  <Link
                    href={`${portalBase}/app/services/reporting/sales?from=dashboard`}
                    className={dashboardSecondaryButtonClass}
                  >
                    Open sales dashboard
                  </Link>
                </div>
              </div>
            ) : salesReport && salesReport.ok ? (
              <div>
                <div className="text-2xl font-bold text-brand-ink">{formatMoneyFromCents(net, currency)}</div>
                <div className="mt-1 text-xs text-zinc-500">{providerLabel ? `${providerLabel} • ` : ""}Net sales • last 30 days</div>

                <div className="mt-4 space-y-2">
                  <StatLine label="Charges" value={compactNum(count)} />
                  <StatLine label="Gross" value={formatMoneyFromCents(gross, currency)} />
                  <StatLine label="Refunded" value={formatMoneyFromCents(refunded, currency)} />
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`${portalBase}/app/services/reporting/sales?from=dashboard`}
                    className={dashboardPrimaryButtonClass}
                  >
                    View details
                  </Link>
                </div>

                {salesReport.note ? <div className="mt-3 text-xs text-zinc-500">{salesReport.note}</div> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-zinc-700">Loading sales…</div>
                {salesError ? <div className="text-xs text-zinc-500">{salesError}</div> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`${portalBase}/app/services/reporting/sales?from=dashboard`}
                    className={dashboardSecondaryButtonClass}
                  >
                    Open sales dashboard
                  </Link>
                </div>
              </div>
            )}
          </AccentCard>
        );
      }

      case "services":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{servicesWidgetBanner.eyebrow}</div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{servicesWidgetBanner.headline}</div>
                  <div className="mt-1 text-xs leading-relaxed text-zinc-600">{servicesWidgetBanner.body}</div>
                </div>
                <div className="flex shrink-0 items-start">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${servicesWidgetBanner.badgeClass}`}>
                    {servicesWidgetBanner.badgeLabel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {modules.map((m) => (
                  <div
                    key={m.key}
                    className={
                      `${dashboardServiceCardBaseClass} ` +
                      (m.coverageState === "ready"
                        ? "border-emerald-200 bg-white"
                        : m.coverageState === "needs_setup"
                          ? "border-amber-200 bg-amber-50/60"
                          : m.coverageState === "provider_blocked"
                            ? "border-rose-200 bg-rose-50/60"
                            : m.coverageState === "checking"
                              ? "border-sky-200 bg-sky-50/60"
                              : "border-zinc-200 bg-zinc-50")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                        <div className="mt-1 text-xs text-zinc-600">{m.stateLabel}</div>
                      </div>
                      <span
                        className={m.coverageState === "ready"
                          ? "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700"
                          : m.coverageState === "needs_setup"
                            ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700"
                            : m.coverageState === "provider_blocked"
                              ? "rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700"
                              : m.coverageState === "checking"
                                ? "rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700"
                                : "rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500"}
                      >
                        {m.badgeLabel}
                      </span>
                    </div>

                    <div className="mt-3 flex-1 text-xs leading-relaxed text-zinc-600">{m.helper}</div>

                    {m.ctaLabel && m.ctaHref ? (
                      <div className="mt-auto pt-4">
                        <Link href={m.ctaHref} className={dashboardPrimaryButtonClass}>
                          {m.ctaLabel}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-zinc-900">{servicesWidgetSummary.headline}</div>
                    <div className="mt-1 text-sm leading-relaxed text-zinc-600">{servicesWidgetSummary.body}</div>
                  </div>
                  <div className="flex shrink-0 items-start">
                    <Link
                      href={servicesWidgetSummary.primaryHref}
                      className={dashboardPrimaryButtonClass}
                    >
                      {servicesWidgetSummary.primaryLabel}
                    </Link>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200/80 pt-4">
                  {serviceQuickLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors duration-100 hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </AccentCard>
        );

      case "mediaLibrary": {
        const ok = mediaStats && (mediaStats as any).ok === true;
        const items = ok ? (mediaStats as any).itemsCount : 0;
        const folders = ok ? (mediaStats as any).foldersCount : 0;
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(items)}</div>
            <div className="mt-1 text-xs text-zinc-500">Items · {compactNum(folders)} folders</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/media-library`} className="text-sm font-semibold text-brand-ink hover:underline">
                Open media library
              </Link>
            </div>
          </AccentCard>
        );
      }

      case "creditsRemaining":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(reporting?.creditsRemaining ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Usage-based services pull from credits.</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/billing`} className="text-sm font-semibold text-brand-ink hover:underline">
                Top up in Billing
              </Link>
            </div>
          </AccentCard>
        );

      case "blogGenerations":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(k?.blogGenerations ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Generated blog posts (last 30 days)</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/blogs`} className="text-sm font-semibold text-brand-ink hover:underline">
                Open blogs
              </Link>
            </div>
          </AccentCard>
        );

      case "blogCreditsUsed":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(k?.blogCreditsUsed ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Credits used by blog generation (last 30 days)</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/reporting`} className="text-sm font-semibold text-brand-ink hover:underline">
                View reporting
              </Link>
            </div>
          </AccentCard>
        );

      case "successRate":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{formatPct(derived.overallSuccessRate)}</div>
            <div className="mt-2 text-xs text-zinc-500">AI completed + texts sent vs failures (last 30 days)</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">AI success</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.aiSuccessRate)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Text success</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.textSuccessRate)}</div>
              </div>
            </div>
          </AccentCard>
        );

      case "failures":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{derived.totalFailures.toLocaleString()}</div>
            <div className="mt-2 text-xs text-zinc-500">AI failed + texts failed (last 30 days)</div>
            <div className="mt-3 space-y-2">
              <StatLine label="AI failed" value={compactNum(k?.aiFailed ?? 0)} />
              <StatLine label="Text failures" value={compactNum(k?.textsFailed ?? 0)} />
            </div>
          </AccentCard>
        );

      case "creditsRunway":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">
              {typeof derived.creditRunwayDays === "number" && Number.isFinite(derived.creditRunwayDays)
                ? `~${Math.max(0, Math.round(derived.creditRunwayDays))} days`
                : "N/A"}
            </div>
            <div className="mt-2 text-xs text-zinc-500">Estimated based on your current spend rate</div>
            <div className="mt-3 space-y-2">
              <StatLine label="Credits remaining" value={compactNum(reporting?.creditsRemaining ?? 0)} />
              <StatLine
                label="Spend rate"
                value={
                  typeof derived.creditsPerDay === "number" && Number.isFinite(derived.creditsPerDay)
                    ? `~${Math.max(0, derived.creditsPerDay).toFixed(1)} / day`
                    : "N/A"
                }
              />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/billing`} className="text-sm font-semibold text-brand-ink hover:underline">
                Top up in Billing
              </Link>
            </div>
          </AccentCard>
        );

      case "leadsCaptured":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(k?.leadsCreated ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Leads created (last 30 days)</div>
            <div className="mt-3 space-y-2">
              <StatLine label="Contacts created" value={compactNum(k?.contactsCreated ?? 0)} />
              <StatLine label="Appointments booked" value={compactNum(k?.bookingsCreated ?? 0)} />
            </div>
          </AccentCard>
        );

      case "reliabilitySummary":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Action failures</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{compactNum(reporting?.diagnostics?.actionFailures ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Runtime errors</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{compactNum(reporting?.diagnostics?.runtimeErrors ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Promise failures</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{compactNum(reporting?.diagnostics?.unhandledRejections ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Resource failures</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{compactNum(reporting?.diagnostics?.resourceErrors ?? 0)}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Manual bug reports</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{compactNum(reporting?.diagnostics?.manualBugReports ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold text-zinc-600">Automation failures</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{compactNum(derived.automationFailures ?? 0)}</div>
              </div>
            </div>
            {reporting?.diagnostics?.topPaths?.[0] ? (
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
                <div className="font-semibold text-zinc-800">Top failing path</div>
                <div className="mt-1 font-mono text-[11px] text-zinc-500">{reporting.diagnostics.topPaths[0].path}</div>
                <div className="mt-1">{compactNum(reporting.diagnostics.topPaths[0].count)} recorded failures in this range.</div>
              </div>
            ) : null}
          </AccentCard>
        );

      case "creditsUsed":
      case "automationsRun":
      case "aiCalls":
      case "aiOutboundCalls":
      case "missedCalls":
      case "bookingsCreated":
      case "reviewsCollected":
      case "avgReviewRating":
      case "newsletterSends":
      case "nurtureEnrollments":
      case "tasks":
      case "inboxMessagesIn":
      case "inboxMessagesOut":
      case "leadsCreated":
      case "contactsCreated":
      case "leadScrapeRuns": {
        const value = (() => {
          if (!k) return "0";
          switch (id) {
            case "creditsUsed":
              return compactNum(k.creditsUsed);
            case "automationsRun":
              return compactNum(k.automationsRun);
            case "aiCalls":
              return compactNum(k.aiCalls);
            case "aiOutboundCalls":
              return compactNum(k.aiOutboundCompleted);
            case "missedCalls":
              return compactNum(k.missedCalls);
            case "bookingsCreated":
              return compactNum(k.bookingsCreated);
            case "reviewsCollected":
              return compactNum(k.reviewsCollected);
            case "avgReviewRating":
              return typeof k.avgReviewRating === "number" ? k.avgReviewRating.toFixed(1) : "N/A";
            case "newsletterSends":
              return compactNum(k.newsletterSentCount);
            case "nurtureEnrollments":
              return compactNum(k.nurtureEnrollmentsCreated);
            case "tasks":
              return compactNum(k.tasksOpenNow);
            case "inboxMessagesIn":
              return compactNum(k.inboxMessagesIn);
            case "inboxMessagesOut":
              return compactNum(k.inboxMessagesOut);
            case "leadsCreated":
              return compactNum(k.leadsCreated);
            case "contactsCreated":
              return compactNum(k.contactsCreated);
            case "leadScrapeRuns":
              return compactNum(k.leadScrapeRuns);
            default:
              return "0";
          }
        })();

        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{value}</div>
            {id === "aiCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Completed" value={compactNum(k.aiCompleted)} />
                <StatLine label="Failed" value={compactNum(k.aiFailed)} />
              </div>
            ) : null}
            {id === "aiOutboundCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Queued now" value={compactNum(k.aiOutboundQueuedNow)} />
                <StatLine label="Failed" value={compactNum(k.aiOutboundFailed)} />
              </div>
            ) : null}
            {id === "missedCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Texts sent" value={compactNum(k.textsSent)} />
                <StatLine label="Texts failed" value={compactNum(k.textsFailed)} />
              </div>
            ) : null}
            {id === "newsletterSends" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Send events" value={compactNum(k.newsletterSendEvents)} />
                <StatLine label="Failed" value={compactNum(k.newsletterFailedCount)} />
              </div>
            ) : null}
            {id === "nurtureEnrollments" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Active now" value={compactNum(k.nurtureEnrollmentsActiveNow)} />
                <StatLine label="Completed" value={compactNum(k.nurtureEnrollmentsCompleted)} />
              </div>
            ) : null}
            {id === "tasks" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Completed" value={compactNum(k.tasksCompleted)} />
              </div>
            ) : null}
            {id === "creditsUsed" ? <div className="mt-2 text-xs text-zinc-500">Last 30 days</div> : null}
            {id === "tasks" ? <div className="mt-2 text-xs text-zinc-500">Open now · completed in range</div> : null}
            {id === "aiOutboundCalls" ? <div className="mt-2 text-xs text-zinc-500">Completed in range</div> : null}
            {id === "newsletterSends" ? <div className="mt-2 text-xs text-zinc-500">Sent in range</div> : null}
            {id === "nurtureEnrollments" ? <div className="mt-2 text-xs text-zinc-500">Created in range</div> : null}
            {id === "inboxMessagesIn" ? <div className="mt-2 text-xs text-zinc-500">Inbound in range</div> : null}
            {id === "inboxMessagesOut" ? <div className="mt-2 text-xs text-zinc-500">Outbound in range</div> : null}
          </AccentCard>
        );
      }

      case "dailyActivity": {
        const rows = (reporting?.daily ?? []).slice().reverse().slice(0, 7);
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="mt-1 text-xs text-zinc-500">Last 7 days (UTC)</div>
            <div className="mt-3 space-y-2">
              {rows.length ? (
                rows.map((r) => (
                  <div key={r.day} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-700">{r.day}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-700">
                      <div>AI: {r.aiCalls}</div>
                      <div>Missed: {r.missedCalls}</div>
                      <div>Credits: {r.creditsUsed}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No recent activity yet.</div>
              )}
            </div>
          </AccentCard>
        );
      }

      case "perfAiReceptionist":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="space-y-2">
              <StatLine label="Calls" value={compactNum(k?.aiCalls ?? 0)} />
              <StatLine label="Completed" value={compactNum(k?.aiCompleted ?? 0)} />
              <StatLine label="Failed" value={compactNum(k?.aiFailed ?? 0)} />
              <StatLine label="Success rate" value={formatPct(derived.aiSuccessRate)} />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/ai-receptionist`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to AI Receptionist
              </Link>
            </div>
          </AccentCard>
        );

      case "perfMissedCallTextBack":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="space-y-2">
              <StatLine label="Missed calls" value={compactNum(k?.missedCalls ?? 0)} />
              <StatLine label="Texts sent" value={compactNum(k?.textsSent ?? 0)} />
              <StatLine label="Text failures" value={compactNum(k?.textsFailed ?? 0)} />
              <StatLine label="Text success" value={formatPct(derived.textSuccessRate)} />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/ai-receptionist?tab=missed-call-textback`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to Missed-Call Text Back
              </Link>
            </div>
          </AccentCard>
        );

      case "perfLeadScraping":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="space-y-2">
              <StatLine label="Runs" value={compactNum(k?.leadScrapeRuns ?? 0)} />
              <StatLine label="Leads created" value={compactNum(k?.leadsCreated ?? 0)} />
              <StatLine label="Contacts" value={compactNum(k?.contactsCreated ?? 0)} />
              <StatLine label="Credits used" value={compactNum(k?.leadScrapeChargedCredits ?? 0)} />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/lead-scraping`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to Lead Scraping
              </Link>
            </div>
          </AccentCard>
        );

      case "perfReviews":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="space-y-2">
              <StatLine label="Reviews collected" value={compactNum(k?.reviewsCollected ?? 0)} />
              <StatLine
                label="Avg rating"
                value={typeof k?.avgReviewRating === "number" ? k.avgReviewRating.toFixed(1) : "N/A"}
              />
              <StatLine label="Bookings" value={compactNum(k?.bookingsCreated ?? 0)} />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/reviews`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to Reviews
              </Link>
            </div>
          </AccentCard>
        );


      default:
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            Widget
          </AccentCard>
        );
    }
  }

  const showEditControls = Boolean(dashboard);

  // Compact inline guidance panel — shown above the widget grid when items exist.
  function renderGuidancePanel() {
    if (growthPayload?.topActions?.length) {
      const visible = growthPayload.topActions.slice(0, 3);
      const topAction = visible[0];
      const secondaryItems = visible.slice(1);
      if (!topAction) return null;

      return (
        <div className="mb-5 rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50/40 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {growthPayload.isLowActivityWorkspace
                  ? isCreditWorkspace
                    ? "Credit starter path"
                    : "Starter path"
                  : isCreditWorkspace
                    ? "Credit workspace next actions"
                    : "Do this next"}
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                {growthPayload.isLowActivityWorkspace
                  ? "Start from the stored gaps that will create the next real signal inside Purely."
                  : "These actions come from the current workspace state, not generic motivational copy."}
              </div>
            </div>
            <Link
              href={`${portalBase}/app/services`}
              className="shrink-0 text-xs font-semibold text-brand-ink hover:underline"
            >
              All services
            </Link>
          </div>

          {contentGuidanceItem ? (
            <Link
              href={contentGuidanceItem.href}
              className="mb-3 block rounded-[26px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,247,237,0.92))] p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      {isCreditWorkspace ? "Content demand" : "Content workflow"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{contentGuidanceItem.title}</div>
                  <div className="mt-1 text-sm text-zinc-600">{contentGuidanceItem.reason}</div>
                </div>
                <div className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-amber-700">
                  {contentGuidanceItem.nextActionLabel}
                </div>
              </div>
            </Link>
          ) : null}

          <div className="rounded-[26px] border border-brand-ink/10 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="rounded-full bg-brand-ink/5 px-2.5 py-0.5 text-[11px] font-semibold text-brand-ink inline-flex">
                  {growthPayload.isLowActivityWorkspace ? "Start here" : "Top action"}
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{topAction.title}</div>
                <div className="mt-1 text-sm text-zinc-600">{topAction.detail}</div>
                {topAction.blocker ? <div className="mt-2 text-xs font-semibold text-amber-700">{topAction.blocker}</div> : null}
              </div>
              <Link
                href={topAction.href}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
              >
                {topAction.ctaLabel}
              </Link>
            </div>
          </div>

          {secondaryItems.length > 0 ? (
            <div className={`mt-3 grid grid-cols-1 gap-3 ${secondaryItems.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
              {secondaryItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex h-full min-h-33 flex-col justify-between rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                      Next step
                    </span>
                    <div className="mt-2 text-sm font-semibold leading-snug text-zinc-900">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-600">{item.detail}</div>
                    {item.blocker ? <div className="mt-2 text-[11px] font-semibold text-amber-700">{item.blocker}</div> : null}
                  </div>
                  <div className="mt-3 text-xs font-semibold text-brand-ink">{item.ctaLabel} →</div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (guidanceItems.length === 0 && !contentGuidanceItem) return null;
    // Show top 4 items.
    const visible = guidanceItems.slice(0, contentGuidanceItem ? 3 : 4);
    const topItem = visible[0];
    if (!topItem && !contentGuidanceItem) return null;
    const topColors = topItem ? guidanceStatusColors(topItem.status) : null;
    const secondaryItems = visible.slice(1);
    const secondaryGridClass = secondaryItems.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

    return (
      <div className="mb-5 rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50/40 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {isCreditWorkspace ? "Credit workspace guidance" : "Business next steps"}
            </div>
            <div className="mt-1 text-sm text-zinc-600">
              Based on what this workspace has and hasn't set up yet.
            </div>
          </div>
          <Link
            href={`${portalBase}/app/services`}
            className="shrink-0 text-xs font-semibold text-brand-ink hover:underline"
          >
            All services
          </Link>
        </div>

        {contentGuidanceItem ? (
          <Link
            href={contentGuidanceItem.href}
            className="mb-3 block rounded-[26px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,247,237,0.92))] p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {isCreditWorkspace ? "Content demand" : "Content workflow"}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{contentGuidanceItem.title}</div>
                <div className="mt-1 text-sm text-zinc-600">{contentGuidanceItem.reason}</div>
                <div className="mt-2 text-xs leading-5 text-zinc-500">Media Library planning and manual posting work now. Automatic provider posting still depends on connected provider setup, permissions, and approval.</div>
                <div className="mt-2 text-xs leading-5 text-zinc-500">Media Library planning and manual posting work now. Automatic provider posting still depends on connected provider setup, permissions, and approval.</div>
              </div>
              <div className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-amber-700">
                {contentGuidanceItem.nextActionLabel}
              </div>
            </div>
          </Link>
        ) : null}

        {/* Top item — featured */}
        {topItem && topColors ? (
          <div className={`rounded-[26px] border p-5 shadow-sm ${topColors.border} ${topColors.bg}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${topColors.badge}`}>
                    {guidanceStatusLabel(topItem.status)}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{topItem.title}</div>
                <div className="mt-1 text-sm text-zinc-600">{topItem.reason}</div>
              </div>
              <Link
                href={topItem.href}
                className="shrink-0 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
              >
                {topItem.nextActionLabel}
              </Link>
            </div>
          </div>
        ) : null}

        {/* Secondary items — compact row */}
        {secondaryItems.length > 0 ? (
          <div className={`mt-3 grid grid-cols-1 gap-3 ${secondaryGridClass}`}>
            {secondaryItems.map((item) => {
              const colors = guidanceStatusColors(item.status);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex h-full min-h-33 flex-col justify-between rounded-3xl border p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${colors.border} ${colors.bg}`}
                >
                  <div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
                      {guidanceStatusLabel(item.status)}
                    </span>
                    <div className="mt-2 text-sm font-semibold leading-snug text-zinc-900">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-600">{item.reason}</div>
                  </div>
                  <div className="mt-3 text-xs font-semibold text-brand-ink">{item.nextActionLabel} →</div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 text-xs text-zinc-500">{editMode ? "Edit mode: drag cards and resize from the corner." : null}</div>
        {showEditControls ? (
          <div className="ml-auto flex items-center justify-end gap-2">
            {editMode ? (
              <>
                <button
                  type="button"
                  className={dashboardEditResetButtonClass}
                  onClick={() => void resetDashboard()}
                  disabled={savingLayout}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className={dashboardEditSecondaryButtonClass}
                  onClick={cancelEdit}
                  disabled={savingLayout}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={dashboardEditPrimaryButtonClass}
                  onClick={() => void doneEdit()}
                  disabled={savingLayout}
                >
                  {savingLayout ? "Saving…" : "Done"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={dashboardEditSecondaryButtonClass}
                onClick={beginEdit}
                aria-label="Edit"
                title="Edit"
              >
                <IconEdit size={18} />
              </button>
            )}
          </div>
        ) : null}
      </div>

      {renderGuidancePanel()}

      <div ref={setContainerEl}>
        {width > 0 ? (
          <>
            <ResponsiveGridLayoutAny
              width={width}
              className="layout"
              layouts={layouts as any}
              breakpoints={DASHBOARD_BREAKPOINTS as any}
              cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={12}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              compactType={null}
              preventCollision={true}
              dragConfig={{ enabled: editMode, handle: ".drag-handle" }}
              resizeConfig={{ enabled: editMode, handles: ["se"] }}
              onDragStart={(_layout: Layout, _oldItem: LayoutItem, newItem: LayoutItem) => handleEditInteractionStart(newItem)}
              onDragStop={() => handleEditInteractionStop()}
              onResizeStart={(_layout: Layout, _oldItem: LayoutItem, newItem: LayoutItem) => handleEditInteractionStart(newItem)}
              onResizeStop={() => handleEditInteractionStop()}
              onLayoutChange={(_current: Layout, all: ResponsiveLayouts) => setLayouts(all)}
            >
              {widgetIds.map((id) => (
                <div key={id} className="relative min-h-0 min-w-0">
                  {editMode && id !== "hoursSaved" && id !== "billing" && id !== "services" ? (
                    <button
                      type="button"
                      className="absolute right-3 top-3 z-10 rounded-full border border-zinc-200 bg-white/95 px-2 py-1 text-xs font-semibold text-zinc-700 shadow-sm transition-colors duration-150 hover:bg-zinc-50"
                      onClick={() => void removeWidget(id)}
                    >
                      Remove
                    </button>
                  ) : null}
                  {editMode && activeEditWidgetId
                    ? <DashboardEditPreviewCard id={id} title={widgetTitle(id)} active={id === activeEditWidgetId} />
                    : renderWidget(id)}
                </div>
              ))}
            </ResponsiveGridLayoutAny>

            {!editMode && widgetIds.length <= 3 && dashboardSuggestionIds.length ? (
              <div className="mt-8 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-black/4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">Keep building this dashboard</div>
                    <div className="mt-1 text-sm text-zinc-600">This layout is still sparse. Add a few higher-signal reporting and Pura widgets so the stage feels complete.</div>
                  </div>
                  <Link href={`${portalBase}/app/services/reporting`} className="text-sm font-semibold text-brand-ink hover:underline">
                    Browse reporting
                  </Link>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  {dashboardSuggestionIds.map((id) => (
                    <div key={id} className={dashboardInfoCardClass}>
                      <div className="text-sm font-semibold text-zinc-900">{widgetTitle(id)}</div>
                      <div className="mt-2 flex-1 text-sm text-zinc-600">
                        {id === "puraAttention"
                          ? "Shows what needs attention now and gives you a direct path into Pura or the right service."
                          : id === "activityPulse"
                            ? "Adds a visual read on recent system activity so the dashboard feels alive instead of purely numeric."
                            : id === "dailyActivity"
                              ? "Brings the richer reporting table onto the dashboard for recent day-by-day breakdowns."
                              : "Adds a strong reporting summary so the top of the dashboard carries more signal."}
                      </div>
                      <div className="mt-auto pt-4">
                        <button type="button" className={dashboardSuggestionButtonClass} onClick={() => void addWidget(id)}>
                          Add widget
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading dashboard…</div>
        )}
      </div>
    </div>
  );
}
