"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { growthReadinessLevelLabel, type GrowthReadinessLevel, type GrowthReadinessPayload } from "@/lib/portalGrowthReadiness";

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

type ExternalBookingHandoffSummary = {
  enabled: boolean;
  handoffMode: "direct_book" | "lead_first";
  providerKey: string;
  providerLabel: string;
  destinationHost: string;
  confirmationState: "handoff_only" | "redirect_confirmed" | "provider_confirmed";
  providerConfirmationAvailable: boolean;
  providerConfirmationConnected: boolean;
  totalHandoffs: number;
  directHandoffs: number;
  leadFirstCaptures: number;
  distinctCapturedContacts: number;
  confirmedViaRedirect: number;
  distinctConfirmedContacts: number;
  providerConfirmedBookings: number;
  distinctProviderConfirmedContacts: number;
  providerCanceledBookings: number;
  providerRescheduledBookings: number;
  latestHandoffAt: string | null;
  latestConfirmedAt: string | null;
  latestProviderConfirmedAt: string | null;
  latestActivityAt: string | null;
  providerBreakdown: Array<{ providerKey: string; providerLabel: string; handoffs: number }>;
  guidance: {
    state: "disabled" | "provider_not_connected" | "no_handoffs" | "handoffs_only" | "captured_leads" | "redirect_confirmed" | "provider_confirmed";
    title: string;
    detail: string;
  };
};

type ReportingPayload = {
  ok: boolean;
  range: RangeKey;
  startIso: string;
  endIso: string;
  creditsRemaining: number;
  externalBookingHandoff: ExternalBookingHandoffSummary;
  diagnostics: {
    actionFailures: number;
    runtimeErrors: number;
    unhandledRejections: number;
    resourceErrors: number;
    manualBugReports: number;
    topPaths: Array<{ path: string; count: number }>;
    topMessages: Array<{ kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure"; message: string; count: number }>;
  };
  attention: {
    tasksOverdueNow: number;
    inboxNeedsReplyNow: number;
    creditReportsImported: number;
    creditReportItemsPendingNow: number;
    creditReportItemsNegativeNow: number;
    creditDisputeDraftsNow: number;
    creditDisputePdfsReadyNow: number;
    creditDisputeMarkedMailedNow: number;
    betaFeedbackPortalRecent: number;
    betaFeedbackPortalUnresolvedNow: number;
    betaFeedbackPortalHighSeverityNow: number;
    betaFeedbackCreditRecent: number;
    betaFeedbackCreditUnresolvedNow: number;
    betaFeedbackCreditHighSeverityNow: number;
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

type ContentWorkflowCardSummary = {
  primaryValue: string;
  primaryLabel: string;
  summary: string;
  note: string;
  actionHref: string;
  guidance: string[];
  signals: Array<{ label: string; value: string; sub?: string }>;
};

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

type ReportingWorkspaceVariant = "portal" | "credit";

type ReportingCoverageItem = {
  label: string;
  detail: string;
};

type ReportingCoverage = {
  summary: string;
  includedIntro: string;
  included: ReportingCoverageItem[];
  notIncludedIntro: string;
  notIncluded: ReportingCoverageItem[];
};

type ReportingInsightCard = {
  id: string;
  tone: "danger" | "warning" | "neutral";
  title: string;
  value: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string | null;
};

type GrowthReadinessResponse =
  | ({ ok: true } & GrowthReadinessPayload)
  | { ok: false; error?: string };

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
  { key: "missedCallTextBack", name: "Missed-Call Text Back", href: "/portal/app/services/ai-receptionist?tab=missed-call-textback" },
  { key: "booking", name: "Booking Automation", href: "/portal/app/services/booking" },
  { key: "blogs", name: "Automated Blogs", href: "/portal/app/services/blogs" },
  { key: "newsletter", name: "Newsletter", href: "/portal/app/services/newsletter/external" },
  { key: "nurtureCampaigns", name: "Nurture Campaigns", href: "/portal/app/services/nurture-campaigns" },
  { key: "tasks", name: "Tasks", href: "/portal/app/services/tasks" },
  { key: "inbox", name: "Inbox / Outbox", href: "/portal/app/services/inbox/email" },
  { key: "reviews", name: "Reviews", href: "/portal/app/services/reviews" },
  { key: "leadScraping", name: "Lead Scraping", href: "/portal/app/services/lead-scraping" },
];

function getReportingWorkspaceVariant(pathname: string | null | undefined): ReportingWorkspaceVariant {
  return currentPortalBase(pathname) === "/credit" ? "credit" : "portal";
}

function getReportingCoverage(variant: ReportingWorkspaceVariant): ReportingCoverage {
  if (variant === "credit") {
    return {
      summary:
        "This page shows the activity Purely currently records for this credit account. It does not mean every step of the credit process is tracked yet.",
      includedIntro:
        "Included now: the shared account activity and credit-related counts Purely already records today.",
      included: [
        {
          label: "Bookings and consultations",
          detail: "Bookings created inside Purely are counted here when a consultation or appointment is created through the booking system. If you send someone to an outside booking page, clicks through, returns to your site, and confirmed outside bookings stay separate instead of being mixed into Purely booking totals.",
        },
        {
          label: "Tracked lead and contact records",
          detail: "This dashboard shows tracked lead records and contacts created in Purely, plus lead-scraping run counts where that service is active.",
        },
        {
          label: "Imported credit reports and review queues",
          detail: "When reports and dispute letters exist, reporting can show imported report volume, report items that still need review, dispute drafts, PDFs ready, and letters marked mailed manually.",
        },
        {
          label: "Conversation and follow-up activity",
          detail: "Inbox message volume, AI receptionist calls, missed-call text-back activity, newsletter sends, nurture enrollments, and task counts are included when those services record events.",
        },
        {
          label: "Connected payment totals",
          detail: "Sales and Stripe pages only show payment totals when those connections are set up. They do not represent dispute or bureau work.",
        },
      ],
      notIncludedIntro:
        "Not included yet: parts of the credit process that Purely does not reliably store in this summary yet.",
      notIncluded: [
        {
          label: "Bureau pull or score outcome tracking",
          detail: "This page does not claim bureau pull completion, score-change outcomes, or lender decisions unless those events are explicitly stored elsewhere.",
        },
        {
          label: "External dispute delivery proof",
          detail: "Marked mailed is only a manual state inside Purely. Reporting does not prove delivery, bureau receipt, or external submission progress.",
        },
        {
          label: "All funnel and nurture attribution",
          detail: "Funnel leads, page-by-page conversion attribution, and other source attribution are not guaranteed here unless they become standard tracked lead records elsewhere in Purely.",
        },
      ],
    };
  }

  return {
    summary:
      "This page shows the service activity Purely currently records across your account. Connected sales data appears separately only where those connections exist.",
    includedIntro:
      "Included now: activity across services that Purely already measures today.",
    included: [
      {
        label: "Service activity and outcomes",
        detail: "Automations, AI receptionist calls, missed-call text-back events, bookings, external booking handoffs, reviews, inbox volume, newsletter sends, nurture enrollments, tasks, and blog generation activity are counted here when those services record events.",
      },
      {
        label: "Tracked leads, contacts, and credits",
        detail: "Tracked lead records, contacts created, credits remaining, credits used, and estimated credit runway are included in this dashboard.",
      },
      {
        label: "Lead-scraping and operational volume",
        detail: "Lead-scraping runs, charged or refunded credits, and related activity totals are included when that service is active.",
      },
      {
        label: "Connected sales totals",
        detail: "Sales and Stripe pages show payment totals only. They do not fill in every operating metric from the rest of the portal.",
      },
    ],
    notIncludedIntro:
      "Not included yet: metrics the shared reporting summary does not currently collect or attribute.",
    notIncluded: [
      {
        label: "Full attribution and source analysis",
        detail: "This page does not yet provide end-to-end attribution by funnel, campaign source, or page-level conversion path.",
      },
      {
        label: "Every workflow-specific milestone",
        detail: "Lead follow-up gaps, form submissions without a tracked next step, and booking review states are not inferred unless Purely stores a concrete task, reply-needed thread, or other explicit status for them.",
      },
      {
        label: "Outside booking steps without source tracking",
        detail: "This page can separate clicks to an outside booking page, returns back to your site, and confirmed outside bookings when Purely receives them. It still cannot guess source attribution or unstored steps from those signals alone.",
      },
      {
        label: "Audited labor tracking",
        detail: "Estimated runway and automation summaries are operational estimates, not audited hours-saved accounting or payroll-grade productivity reporting.",
      },
    ],
  };
}

function matchTokens(query: string, terms: Array<string | null | undefined>): boolean {
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

function formatMoneyFromCents(cents: number, currency: string) {
  const amount = (typeof cents === "number" && Number.isFinite(cents) ? cents : 0) / 100;
  try {
    const c = (currency || "usd").toUpperCase();
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function reportingActionHref(
  pathname: string | null | undefined,
  route: "reporting" | "billing" | "tasks" | "inbox" | "creditReports" | "disputeLetters" | "booking",
) {
  const portalBase = currentPortalBase(pathname);
  switch (route) {
    case "billing":
      return `${portalBase}/app/billing`;
    case "booking":
      return `${portalBase}/app/services/booking?tab=settings`;
    case "tasks":
      return `${portalBase}/app/services/tasks`;
    case "inbox":
      return `${portalBase}/app/services/inbox/email`;
    case "creditReports":
      return `${portalBase}/app/services/credit-reports`;
    case "disputeLetters":
      return `${portalBase}/app/services/dispute-letters`;
    case "reporting":
    default:
      return `${portalBase}/app/services/reporting`;
  }
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

function contentAssetsNeedingCopyOrNotes(continuity: MediaDistributionContinuity) {
  return (continuity.needsCaptionAssets ?? 0) + (continuity.notesNeededAssets ?? 0);
}

function buildContentWorkflowGuidanceMessages(args: {
  continuity: MediaDistributionContinuity;
  variant: ReportingWorkspaceVariant;
}) {
  const { continuity, variant } = args;
  const ready = continuity.unscheduledReadyAssets ?? 0;
  const planned = continuity.plannedPosts ?? 0;
  const manual = continuity.manuallyPostedAssets ?? 0;
  const queued = (continuity.providerQueuedAssets ?? 0) + (continuity.providerPendingAssets ?? 0);
  const publishedByProvider = continuity.providerPublishedAssets ?? 0;
  const blocked = continuity.providerBlockedAssets ?? 0;
  const failed = continuity.providerFailedAssets ?? 0;
  const youtubePrepared = continuity.youtubePreparedAssets ?? 0;
  const usable = ready + planned + manual + publishedByProvider;
  const guidance: string[] = [];

  if (ready > 0) {
    guidance.push(
      variant === "credit"
        ? "You have consultation support content ready but not scheduled."
        : "You have content ready but not scheduled.",
    );
  }

  if (queued > 0) {
    guidance.push(
      variant === "credit"
        ? "Some consultation support content is queued for provider publishing."
        : "Some content is queued for provider publishing.",
    );
  }

  if (planned > 0 && manual === 0 && publishedByProvider === 0) {
    guidance.push(
      variant === "credit"
        ? "You planned consultation support content in Purely but have not marked anything posted or provider-published."
        : "You planned content in Purely but have not marked anything posted or provider-published.",
    );
  }

  if (failed > 0) {
    guidance.push(
      variant === "credit"
        ? "A provider publish attempt failed and needs review before retrying."
        : "A provider publish attempt failed and needs review before retrying.",
    );
  }

  if (blocked > 0 && (ready > 0 || planned > 0 || youtubePrepared > 0)) {
    guidance.push(
      variant === "credit"
        ? "Some consultation support content is blocked from live provider publishing."
        : "Some content is blocked from live provider publishing.",
    );
  }

  if (usable === 0) {
    guidance.push(
      variant === "credit"
        ? "Add more usable consultation support content before expecting demand lift."
        : "Add more usable content before expecting traffic lift.",
    );
  }

  return guidance.slice(0, 3);
}

function buildContentWorkflowCardSummary(args: {
  continuity: MediaDistributionContinuity;
  pathname: string | null | undefined;
  variant: ReportingWorkspaceVariant;
  trackedHandoffs: number;
}): ContentWorkflowCardSummary {
  const { continuity, pathname, variant, trackedHandoffs } = args;
  const needsCopyOrNotes = contentAssetsNeedingCopyOrNotes(continuity);
  const ready = continuity.unscheduledReadyAssets ?? 0;
  const planned = continuity.plannedPosts ?? 0;
  const manual = continuity.manuallyPostedAssets ?? 0;
  const queued = continuity.providerQueuedAssets ?? 0;
  const pending = continuity.providerPendingAssets ?? 0;
  const publishedByProvider = continuity.providerPublishedAssets ?? 0;
  const blocked = continuity.providerBlockedAssets ?? 0;
  const failed = continuity.providerFailedAssets ?? 0;
  const youtubePrepared = continuity.youtubePreparedAssets ?? 0;
  const usable = ready + planned + manual + publishedByProvider;

  const summary = usable > 0
    ? variant === "credit"
      ? `${usable.toLocaleString()} usable asset${usable === 1 ? "" : "s"} currently support consultation demand inside the shared Media Library workflow.`
      : `${usable.toLocaleString()} usable asset${usable === 1 ? "" : "s"} currently support the stored business-growth content pipeline.`
    : variant === "credit"
      ? "No consultation-support content is ready, planned, or marked posted yet."
      : "No usable content is ready, planned, or marked posted yet.";

  const note = trackedHandoffs > 0
    ? `${trackedHandoffs.toLocaleString()} booking handoff${trackedHandoffs === 1 ? " is" : "s are"} tracked separately in booking reporting. Asset-level attribution is still not automatic.`
    : variant === "credit"
      ? "Manual post history is stored here. Consultation demand, client outcomes, and provider performance are not inferred from this card."
      : "Manual post history is stored here. Traffic, bookings, leads, and provider performance are not inferred from this card.";

  const signals: ContentWorkflowCardSummary["signals"] = [
    {
      label: "Need caption or notes",
      value: needsCopyOrNotes.toLocaleString(),
      sub: needsCopyOrNotes > 0 ? "Still in preparation" : "No drafting backlog",
    },
    {
      label: variant === "credit" ? "Ready for demand support" : "Ready to schedule",
      value: ready.toLocaleString(),
      sub: ready > 0 ? "Usable but unscheduled" : "Nothing waiting",
    },
    {
      label: "Planned in Purely",
      value: planned.toLocaleString(),
      sub: planned > 0 ? "Scheduled only inside Purely" : "Nothing scheduled locally",
    },
    {
      label: "Manual posts",
      value: manual.toLocaleString(),
      sub: manual > 0 ? "Marked posted here" : "No posted history yet",
    },
    {
      label: "Queued for provider",
      value: (queued + pending).toLocaleString(),
      sub: queued + pending > 0 ? `${queued.toLocaleString()} queued, ${pending.toLocaleString()} pending` : "Nothing in provider queue",
    },
    {
      label: "Published by provider",
      value: publishedByProvider.toLocaleString(),
      sub: publishedByProvider > 0 ? "Stored provider publish proof" : "No provider publish proof yet",
    },
    {
      label: "Provider blocked",
      value: blocked.toLocaleString(),
      sub: blocked > 0 ? "Unavailable or blocked from live publishing" : "No blocked provider lane",
    },
    {
      label: "Provider failed",
      value: failed.toLocaleString(),
      sub: failed > 0 ? "Needs review before retry" : "No provider failures stored",
    },
    ...(youtubePrepared > 0
      ? [{ label: "YouTube prep", value: youtubePrepared.toLocaleString(), sub: "Future manual workflow" }]
      : []),
  ];

  return {
    primaryValue: usable.toLocaleString(),
    primaryLabel: variant === "credit" ? "assets supporting demand" : "usable assets in motion",
    summary,
    note,
    actionHref: toCurrentPortalHref("/portal/app/services/media-library", pathname) || "/portal/app/services/media-library",
    guidance: buildContentWorkflowGuidanceMessages({ continuity, variant }),
    signals,
  };
}

function ContentWorkflowCard({ summary }: { summary: ContentWorkflowCardSummary }) {
  const t = toneClasses("amber");

  return (
    <div className={classNames("rounded-3xl border border-zinc-200 bg-white p-6", t.ring)}>
      <div className={classNames("mb-4 h-1.5 w-14 rounded-full", t.bar)} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold text-zinc-500">Content workflow</div>
          <div className="mt-2 text-3xl font-bold text-brand-ink">{summary.primaryValue}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{summary.primaryLabel}</div>
          <div className="mt-2 max-w-3xl text-sm text-zinc-600">{summary.summary}</div>
        </div>
        <Link href={summary.actionHref} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">
          Open media library
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.signals.map((signal) => (
          <div key={signal.label} className={classNames("rounded-2xl border border-zinc-200 p-3", t.softBg)}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-zinc-600">{signal.label}</div>
              <div className={classNames("h-2.5 w-2.5 rounded-full", t.pill)} aria-hidden="true" />
            </div>
            <div className="mt-1 text-sm font-bold text-brand-ink">{signal.value}</div>
            {signal.sub ? <div className="mt-1 text-[11px] text-zinc-500">{signal.sub}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Next step</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-700">
          {summary.guidance.length > 0 ? summary.guidance.map((line) => (
            <div key={line} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              <span>{line}</span>
            </div>
          )) : <div>The stored workflow does not show a clear content next step yet.</div>}
        </div>
        <div className="mt-3 text-xs text-zinc-500">{summary.note}</div>
      </div>
    </div>
  );
}

function insightToneClasses(tone: ReportingInsightCard["tone"]) {
  if (tone === "danger") {
    return {
      shell: "border-rose-200 bg-rose-50",
      value: "text-rose-700",
      badge: "bg-rose-100 text-rose-700",
      button: "border-rose-200 bg-white text-rose-700 hover:bg-rose-100",
    };
  }
  if (tone === "warning") {
    return {
      shell: "border-amber-200 bg-amber-50",
      value: "text-amber-700",
      badge: "bg-amber-100 text-amber-700",
      button: "border-amber-200 bg-white text-amber-700 hover:bg-amber-100",
    };
  }
  return {
    shell: "border-sky-200 bg-sky-50",
    value: "text-sky-700",
    badge: "bg-sky-100 text-sky-700",
    button: "border-sky-200 bg-white text-sky-700 hover:bg-sky-100",
  };
}

function growthLevelBadgeClasses(level: GrowthReadinessLevel) {
  switch (level) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "ready":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "partially_ready":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "needs_setup":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "missing":
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function ReportingInsightSection({
  cards,
  pathname,
  workspaceVariant,
}: {
  cards: ReportingInsightCard[];
  pathname: string | null | undefined;
  workspaceVariant: ReportingWorkspaceVariant;
}) {
  const emptyActionHref = reportingActionHref(pathname, workspaceVariant === "credit" ? "creditReports" : "tasks");
  const emptyActionLabel = workspaceVariant === "credit" ? "Open credit reports" : "Open tasks";

  return (
    <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Action insights</div>
          <div className="mt-2 max-w-3xl text-sm text-zinc-600">
            {workspaceVariant === "credit"
              ? "These cues only use stored task, inbox, diagnostics, report, and dispute-letter data. They do not imply bureau pulls, submission proof, or score outcomes."
              : "These cues only use stored task, inbox, diagnostics, feedback, and shared reporting data. They do not infer follow-up that Purely is not explicitly tracking yet."}
          </div>
        </div>
      </div>

      {cards.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => {
            const tone = insightToneClasses(card.tone);
            return (
              <div key={card.id} className={classNames("rounded-3xl border p-5", tone.shell)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{card.title}</div>
                  <span className={classNames("rounded-full px-2.5 py-1 text-xs font-semibold", tone.badge)}>{card.value}</span>
                </div>
                <div className={classNames("mt-3 text-sm font-semibold", tone.value)}>{card.detail}</div>
                {card.actionHref && card.actionLabel ? (
                  <div className="mt-4">
                    <Link href={card.actionHref} className={classNames("inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-semibold", tone.button)}>
                      {card.actionLabel}
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="text-sm font-semibold text-zinc-900">No tracked bottlenecks in this view right now</div>
          <div className="mt-2 max-w-3xl text-sm text-zinc-600">
            {workspaceVariant === "credit"
              ? "This empty state only means Purely has no current tasks, reply-needed conversations, report review queue, or dispute-letter queue for this account right now. Imported reports, mailed delivery proof, and score outcomes are still excluded unless they are explicitly stored."
              : "This empty state only means Purely has no current tasks, reply-needed conversations, action failures, or feedback queue flagged here. It does not imply lead follow-up, form next steps, or booking review are fully tracked."}
          </div>
          <div className="mt-4">
            <Link href={emptyActionHref} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-100">
              {emptyActionLabel}
            </Link>
          </div>
        </div>
      )}
    </section>
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

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    const recompute = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const padding = 12;
      const gap = 8;
      const width = Math.min(224, vw - padding * 2);
      const left = Math.min(Math.max(rect.right - width, padding), vw - padding - width);

      const spaceBelow = vh - rect.bottom - padding - gap;
      const spaceAbove = rect.top - padding - gap;
      const preferDown = spaceBelow >= 220 || spaceBelow >= spaceAbove;

      setMenuStyle(
        preferDown
          ? { left, top: rect.bottom + gap, width, maxHeight: Math.max(160, spaceBelow) }
          : { left, bottom: vh - rect.top + gap, width, maxHeight: Math.max(160, spaceAbove) },
      );
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
        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        onClick={() => setOpenId(open ? null : id)}
        aria-label="More"
      >
        ⋯
      </button>

      {open ? (
        <div
          className="fixed z-40 w-56 overflow-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg"
          style={menuStyle ?? undefined}
        >
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
        </div>
      ) : null}
    </div>
  );
}

export function PortalReportingClient() {
  const pathname = usePathname() || "";
  const workspaceVariant = getReportingWorkspaceVariant(pathname);
  const coverage = useMemo(() => getReportingCoverage(workspaceVariant), [workspaceVariant]);
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>("30d");
  const [data, setData] = useState<ReportingPayload | null>(null);
  const [mediaStats, setMediaStats] = useState<MediaStatsPayload | null>(null);
  const [growthReadiness, setGrowthReadiness] = useState<GrowthReadinessResponse | null>(null);
  const [growthLoading, setGrowthLoading] = useState(true);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const [twilio, setTwilio] = useState<TwilioMasked | null>(null);
  const [salesStatus, setSalesStatus] = useState<SalesIntegrationStatusPayload | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
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
    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) return;
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: DashboardData };
    const ids = new Set<string>(Array.isArray(body?.data?.widgets) ? body!.data!.widgets.map((w) => w.id).filter(Boolean) : []);
    if (ids.size) setDashboardWidgetIds(ids);
  }

  async function load(nextRange: RangeKey) {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    setGrowthLoading(true);
    setGrowthError(null);

    try {
      const [repRes, twilioRes, statsRes, salesStatusRes, growthRes] = await Promise.all([
        fetch(`/api/portal/reporting?range=${encodeURIComponent(nextRange)}`, { cache: "no-store" }),
        fetch("/api/portal/integrations/twilio", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/media/stats", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/integrations/sales-reporting", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/growth/readiness", { cache: "no-store" }).catch(() => null as any),
      ]);

      if (!repRes.ok) {
        const body = (await repRes.json().catch(() => ({}))) as { error?: string };
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

      if (statsRes?.ok) {
        const stats = (await statsRes.json().catch(() => null)) as MediaStatsPayload | null;
        if (stats) setMediaStats(stats);
      }

      if (growthRes?.ok) {
        const growth = (await growthRes.json().catch(() => null)) as GrowthReadinessResponse | null;
        if (growth) setGrowthReadiness(growth);
        setGrowthError(null);
      } else {
        setGrowthReadiness(null);
        const growthBody = growthRes
          ? ((await growthRes.json().catch(() => null)) as { error?: string } | null)
          : null;
        setGrowthError(growthBody?.error ?? "Unable to load growth readiness");
      }

      if (twilioRes?.ok) {
        const body = (await twilioRes.json().catch(() => ({}))) as { ok?: boolean; twilio?: TwilioMasked };
        setTwilio(body?.twilio ?? null);
      } else if (isFirstLoad) {
        setTwilio(null);
      }

      if (salesStatusRes?.ok) {
        const body = (await salesStatusRes.json().catch(() => null)) as SalesIntegrationStatusPayload | null;
        if (body?.ok) {
          setSalesStatus(body);
          const anyConnected = Boolean(body?.providers && Object.values(body.providers).some((p) => Boolean(p?.configured)));
          if (anyConnected) {
            const salesRes = await fetch("/api/portal/reporting/sales?range=30d", { cache: "no-store" }).catch(() => null as any);
            if (salesRes?.ok) {
              setSalesReport(((await salesRes.json().catch(() => null)) as SalesReportPayload | null) ?? null);
            } else if (isFirstLoad) {
              setSalesReport(null);
            }
          } else {
            setSalesReport(null);
          }
        } else if (isFirstLoad) {
          setSalesStatus(null);
          setSalesReport(null);
        }
      } else if (isFirstLoad) {
        setSalesStatus(null);
        setSalesReport(null);
      }

      hasLoadedOnceRef.current = true;
    } finally {
      setGrowthLoading(false);
      setLoading(false);
      setRefreshing(false);
    }
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

  const contentWorkflowSummary = useMemo(() => {
    const continuity = mediaStats && mediaStats.ok ? mediaStats.distributionContinuity : null;
    if (!continuity) return null;

    const handoffs = Number(data?.externalBookingHandoff?.totalHandoffs ?? 0);
    return buildContentWorkflowCardSummary({
      continuity,
      pathname,
      variant: workspaceVariant,
      trackedHandoffs: handoffs,
    });
  }, [data?.externalBookingHandoff?.totalHandoffs, mediaStats, pathname, workspaceVariant]);

  const insightCards = useMemo<ReportingInsightCard[]>(() => {
    if (!data) return [];

    const cards: ReportingInsightCard[] = [];
    const actionFailures = data.diagnostics?.actionFailures ?? 0;
    const overdueTasks = data.attention?.tasksOverdueNow ?? 0;
    const openTasks = data.kpis?.tasksOpenNow ?? 0;
    const needsReply = data.attention?.inboxNeedsReplyNow ?? 0;
    const portalFeedbackRecent = data.attention?.betaFeedbackPortalRecent ?? 0;
    const portalFeedbackHigh = data.attention?.betaFeedbackPortalHighSeverityNow ?? 0;
    const creditFeedbackRecent = data.attention?.betaFeedbackCreditRecent ?? 0;
    const creditFeedbackHigh = data.attention?.betaFeedbackCreditHighSeverityNow ?? 0;

    if (actionFailures > 0) {
      cards.push({
        id: "action-failures",
        tone: "danger",
        title: "Portal action failures",
        value: `${actionFailures.toLocaleString()} flagged`,
        detail: "Recent tracked failures need review before operators trust the related workflow.",
        actionLabel: "Open reporting",
        actionHref: reportingActionHref(pathname, "reporting"),
      });
    }

    if (overdueTasks > 0) {
      cards.push({
        id: "overdue-tasks",
        tone: "danger",
        title: "Overdue tasks",
        value: `${overdueTasks.toLocaleString()} overdue`,
        detail: `There are ${openTasks.toLocaleString()} open tasks in the workspace, and overdue work is the clearest stored follow-up gap today.`,
        actionLabel: "Review tasks",
        actionHref: reportingActionHref(pathname, "tasks"),
      });
    } else if (openTasks > 0) {
      cards.push({
        id: "open-tasks",
        tone: "warning",
        title: "Open tasks still waiting",
        value: `${openTasks.toLocaleString()} open`,
        detail: "Purely is tracking follow-up tasks here, so this is a real queue rather than a guessed bottleneck.",
        actionLabel: "Open tasks",
        actionHref: reportingActionHref(pathname, "tasks"),
      });
    }

    if (needsReply > 0) {
      cards.push({
        id: "needs-reply",
        tone: "warning",
        title: "Conversations need a reply",
        value: `${needsReply.toLocaleString()} threads`,
        detail: "This uses the inbox thread state where the latest message is inbound, so it stays grounded in stored conversation data.",
        actionLabel: "Open inbox",
        actionHref: reportingActionHref(pathname, "inbox"),
      });
    }

    if (typeof derived.creditRunwayDays === "number" && Number.isFinite(derived.creditRunwayDays) && derived.creditRunwayDays < 14) {
      cards.push({
        id: "credit-runway",
        tone: "warning",
        title: "Credits runway is getting short",
        value: `~${Math.max(0, Math.round(derived.creditRunwayDays))} days`,
        detail: "This is a safe estimate from stored credits remaining and recent credits used. It is not an audited utilization forecast.",
        actionLabel: "Open billing",
        actionHref: reportingActionHref(pathname, "billing"),
      });
    }

    const handoff = data.externalBookingHandoff;
    const handoffProvider = handoff.providerBreakdown[0]?.providerLabel || handoff.providerLabel || "External booking page";
    const handoffTone: ReportingInsightCard["tone"] =
      handoff.totalHandoffs > 0 && handoff.leadFirstCaptures === 0 && handoff.confirmedViaRedirect === 0 && handoff.providerConfirmedBookings === 0 ? "warning" : "neutral";
    cards.push({
      id: "external-booking-handoff",
      tone: handoffTone,
      title: workspaceVariant === "credit" ? "Consultation page activity" : "Booking page activity",
      value: `${handoff.totalHandoffs.toLocaleString()} click${handoff.totalHandoffs === 1 ? "" : "s"} to book`,
      detail:
        `${handoffProvider}: ${handoff.directHandoffs.toLocaleString()} straight-to-book click${handoff.directHandoffs === 1 ? "" : "s"}, ${handoff.leadFirstCaptures.toLocaleString()} lead capture${handoff.leadFirstCaptures === 1 ? "" : "s"} before booking, ${handoff.confirmedViaRedirect.toLocaleString()} return${handoff.confirmedViaRedirect === 1 ? "" : "s"} to your site after booking, and ${handoff.providerConfirmedBookings.toLocaleString()} confirmed outside booking${handoff.providerConfirmedBookings === 1 ? "" : "s"} in ${rangeLabel.toLowerCase()}. ${handoff.guidance.detail}`,
      actionLabel:
        handoff.guidance.state === "provider_not_connected"
          ? "Set up confirmed booking updates"
          : handoff.guidance.state === "captured_leads" || handoff.guidance.state === "redirect_confirmed" || handoff.guidance.state === "provider_confirmed"
          ? "Open booking automation"
          : "Open booking settings",
      actionHref: reportingActionHref(pathname, "booking"),
    });

    if (workspaceVariant === "credit") {
      const reportsImported = data.attention?.creditReportsImported ?? 0;
      const pendingReview = data.attention?.creditReportItemsPendingNow ?? 0;
      const negativeItems = data.attention?.creditReportItemsNegativeNow ?? 0;
      const draftLetters = data.attention?.creditDisputeDraftsNow ?? 0;
      const pdfReady = data.attention?.creditDisputePdfsReadyNow ?? 0;
      const mailed = data.attention?.creditDisputeMarkedMailedNow ?? 0;

      if (pendingReview > 0 || negativeItems > 0 || reportsImported > 0) {
        cards.push({
          id: "credit-report-review",
          tone: pendingReview > 0 ? "danger" : "neutral",
          title: "Credit report review queue",
          value: `${pendingReview.toLocaleString()} pending`,
          detail:
            pendingReview > 0
              ? `${reportsImported.toLocaleString()} reports imported in ${rangeLabel.toLowerCase()} and ${negativeItems.toLocaleString()} items already marked as dispute priorities.`
              : `${reportsImported.toLocaleString()} reports were imported in ${rangeLabel.toLowerCase()}, and ${negativeItems.toLocaleString()} items are marked as dispute priorities.` ,
          actionLabel: "Review report items",
          actionHref: reportingActionHref(pathname, "creditReports"),
        });
      }

      if (draftLetters > 0 || pdfReady > 0 || mailed > 0) {
        cards.push({
          id: "credit-dispute-workflow",
          tone: draftLetters > 0 ? "warning" : "neutral",
          title: "Dispute letter workflow",
          value: `${draftLetters.toLocaleString()} drafts`,
          detail: `${pdfReady.toLocaleString()} PDFs ready and ${mailed.toLocaleString()} letters marked mailed manually. Reporting does not claim external delivery proof.`,
          actionLabel: draftLetters > 0 ? "Review drafts" : "Open dispute letters",
          actionHref: reportingActionHref(pathname, "disputeLetters"),
        });
      }

      if (creditFeedbackHigh > 0 || creditFeedbackRecent > 0) {
        cards.push({
          id: "credit-feedback",
          tone: creditFeedbackHigh > 0 ? "danger" : "neutral",
          title: "Credit beta feedback",
          value: `${creditFeedbackRecent.toLocaleString()} recent`,
          detail:
            creditFeedbackHigh > 0
              ? `${creditFeedbackHigh.toLocaleString()} high-severity credit feedback items are still unresolved in the stored queue.`
              : "Structured credit beta feedback exists for this workspace, but reporting only shows queue volume and severity that Purely already stores.",
        });
      }
    } else {
      if (portalFeedbackHigh > 0 || portalFeedbackRecent > 0) {
        cards.push({
          id: "portal-feedback",
          tone: portalFeedbackHigh > 0 ? "danger" : "neutral",
          title: "Beta feedback queue",
          value: `${portalFeedbackRecent.toLocaleString()} recent`,
          detail:
            portalFeedbackHigh > 0
              ? `${portalFeedbackHigh.toLocaleString()} high-severity feedback items are still unresolved in the stored queue.`
              : "Structured beta feedback exists for this workspace, but this page only reports saved volume and unresolved severity where Purely stores it.",
        });
      }
    }

    return cards.slice(0, 6);
  }, [data, derived.creditRunwayDays, pathname, rangeLabel, workspaceVariant]);

  const growthPayload = growthReadiness && growthReadiness.ok ? growthReadiness : null;
  const reportingCategory = growthPayload?.categories.find((item) => item.key === "reporting_visibility") ?? null;
  const reportingPrimaryAction = growthPayload?.providerBlockers[0] ?? reportingCategory?.nextAction ?? null;
  const reportingStarterActions = growthPayload?.starterPath.slice(0, 4) ?? [];
  const reportingPlaybooks = growthPayload?.playbooks.slice(0, 4) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Reporting</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            {coverage.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={toCurrentPortalHref("/portal/app/services/reporting/sales", pathname) || "/portal/app/services/reporting/sales"}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Sales
          </Link>
          <Link
            href={toCurrentPortalHref("/portal/app/services", pathname) || "/portal/app/services"}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            All services
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Currently included</div>
          <div className="mt-2 text-sm text-zinc-600">{coverage.includedIntro}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {coverage.included.map((item) => (
              <div key={item.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.label}</div>
                <div className="mt-2 text-sm text-zinc-700">{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <div className="text-sm font-semibold text-zinc-900">Not included yet</div>
          <div className="mt-2 text-sm text-zinc-700">{coverage.notIncludedIntro}</div>
          <ul className="mt-4 space-y-3 text-sm text-zinc-800">
            {coverage.notIncluded.map((item) => (
              <li key={item.label} className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3">
                <div className="font-semibold text-zinc-900">{item.label}</div>
                <div className="mt-1 text-zinc-700">{item.detail}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {growthPayload ? (
        <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">What the numbers say to do next</div>
              <div className="mt-2 max-w-3xl text-sm text-zinc-600">
                {growthPayload.isLowActivityWorkspace
                  ? "Reporting stays honest here: Purely cannot prove much until real activity exists, so the next steps focus on creating the first real signals."
                  : "These next steps are tied to the current reporting gaps, provider blockers, and shared readiness categories already stored in Purely."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold">Ready or active: {growthPayload.summary.readyOrActiveCategories}</span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700">Provider blockers: {growthPayload.summary.providerBlockers}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Reporting visibility</div>
                {reportingCategory ? (
                  <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold", growthLevelBadgeClasses(reportingCategory.level))}>
                    {growthReadinessLevelLabel(reportingCategory.level)}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 text-sm text-zinc-700">{reportingCategory?.summary || "Reporting guidance is loading."}</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-600">
                {(reportingCategory?.evidence || []).slice(0, 3).map((item) => (
                  <div key={item} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">{item}</div>
                ))}
              </div>
              {reportingCategory?.blockers[0] ? <div className="mt-4 text-xs font-semibold text-amber-700">{reportingCategory.blockers[0]}</div> : null}
              {reportingPrimaryAction ? (
                <Link
                  href={reportingPrimaryAction.href}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  {reportingPrimaryAction.ctaLabel}
                </Link>
              ) : null}

              {growthPayload.providerBlockers.length > 0 ? (
                <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Provider blockers</div>
                  <div className="mt-2 space-y-2 text-sm text-amber-900">
                    {growthPayload.providerBlockers.slice(0, 2).map((item) => (
                      <div key={item.id}>{item.detail}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {growthPayload.isLowActivityWorkspace
                ? reportingStarterActions.map((item) => (
                    <Link key={item.id} href={item.href} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5 hover:bg-zinc-50">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Starter step</div>
                      <div className="mt-2 text-sm font-semibold text-zinc-900">{item.title}</div>
                      <div className="mt-2 text-sm text-zinc-600">{item.detail}</div>
                      <div className="mt-4 text-sm font-semibold text-brand-ink">{item.ctaLabel} →</div>
                    </Link>
                  ))
                : reportingPlaybooks.map((playbook) => (
                    <div key={playbook.key} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="text-sm font-semibold text-zinc-900">{playbook.title}</div>
                        <span className={classNames("self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold sm:shrink-0", growthLevelBadgeClasses(playbook.level))}>
                          {growthReadinessLevelLabel(playbook.level)}
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-zinc-700">{playbook.summary}</div>
                      {playbook.blocker ? <div className="mt-3 text-xs font-semibold text-amber-700">{playbook.blocker}</div> : null}
                      <div className="mt-4 text-xs text-zinc-500">{playbook.whyItMatters}</div>
                      <Link
                        href={playbook.nextAction.href}
                        className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                      >
                        {playbook.nextAction.ctaLabel}
                      </Link>
                    </div>
                  ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">What the numbers say to do next</div>
              <div className="mt-2 max-w-3xl text-sm text-zinc-600">
                {growthLoading
                  ? "Checking growth readiness so Reporting can connect the current metrics to the next truthful action."
                  : data?.kpis &&
                      data.kpis.bookingsCreated + data.kpis.reviewsCollected + data.kpis.inboxMessagesIn + data.kpis.newsletterSendEvents > 0
                    ? "Growth guidance is temporarily unavailable. Use the stored metrics below and open the matching service page instead of inferring outcomes that are not recorded."
                    : workspaceVariant === "credit"
                      ? "Reporting stays limited until Purely records real credit workflow activity, conversations, tasks, or connected booking updates in this account."
                      : "Reporting becomes more useful after Purely records real bookings, conversations, reviews, follow-up activity, or connected booking updates in this account."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold">
                {growthLoading ? "Loading readiness" : "Fail-soft guidance"}
              </span>
              {growthError ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">{growthError}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Activity that makes reporting useful",
                detail:
                  workspaceVariant === "credit"
                    ? "Imported reports, dispute-letter progress, tasks, inbox activity, and connected provider data create the first trustworthy reporting signals here."
                    : "Bookings, reviews, inbox activity, newsletter sends, follow-up, and connected provider data create the first trustworthy reporting signals here.",
              },
              {
                title: "Open the operational route next",
                detail:
                  workspaceVariant === "credit"
                    ? "Use Credit reports, Dispute letters, Tasks, and Profile setup for the workflow steps that reporting cannot prove on its own."
                    : "Use Booking, Reviews, Follow-up, and Sales reporting for the workflow steps that reporting cannot prove on its own.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5">
                <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
                <div className="mt-3 text-sm text-zinc-700">{item.detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {workspaceVariant === "credit" ? (
              <>
                <Link href="/credit/app/services/credit-reports" className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">Credit reports</Link>
                <Link href="/credit/app/services/tasks" className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">Tasks</Link>
                <Link href="/credit/app/profile" className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">Profile</Link>
              </>
            ) : (
              <>
                <Link href={toCurrentPortalHref("/portal/app/services/booking/settings", pathname) || "/portal/app/services/booking/settings"} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">Booking settings</Link>
                <Link href={toCurrentPortalHref("/portal/app/services/reviews", pathname) || "/portal/app/services/reviews"} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">Reviews</Link>
                <Link href={toCurrentPortalHref("/portal/app/services/reporting/sales", pathname) || "/portal/app/services/reporting/sales"} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">Sales</Link>
              </>
            )}
          </div>
        </section>
      )}

      {workspaceVariant === "credit" ? (
        <section className="mt-4 rounded-3xl border border-sky-200 bg-sky-50 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold text-zinc-900">Credit workflow handoff</div>
              <div className="mt-2 text-sm text-zinc-700">Use reporting for shared activity counts and connected service metrics only. Use credit reports for item review throughput, dispute letters for draft, PDF, and mailed-manual states, and tasks for the operational follow-up that sits between those steps.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/credit/app/services/credit-reports" className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-sky-100">Credit reports</Link>
              <Link href="/credit/app/services/dispute-letters" className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-sky-100">Dispute letters</Link>
              <Link href="/credit/app/services/tasks" className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-sky-100">Tasks</Link>
            </div>
          </div>
        </section>
      ) : null}

      <ReportingInsightSection cards={insightCards} pathname={pathname} workspaceVariant={workspaceVariant} />

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
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue)"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="mr-2 inline-flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-500">Active only</span>
            <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                aria-label="Active only"
              />
              <span className="h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
            </span>
          </label>
          <div className="text-xs font-semibold text-zinc-500">Service</div>
          <PortalListboxDropdown
            value={serviceFilter}
            onChange={(v) => setServiceFilter(v as ServiceKey)}
            options={SERVICE_INFOS.map((s) => ({ value: s.key as any, label: s.name }))}
            className="min-w-50"
            buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
          />
        </div>
      </div>

      {note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

      {refreshing ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
          <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
          Refreshing…
        </div>
      ) : null}

      {loading && !hasLoadedOnceRef.current ? (
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : !data ? null : (
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

            {visible("contentWorkflow", "mediaLibrary", ["Content workflow", "Need caption or notes", "Ready to schedule", "Manual posts", "YouTube prep"]) ? (
              contentWorkflowSummary ? <ContentWorkflowCard summary={contentWorkflowSummary} /> : <StatCard label="Content workflow" value="N/A" sub="No stored content workflow summary yet." tone="amber" />
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
                    label="Estimated credit runway"
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
                  <MiniCard
                    label={workspaceVariant === "credit" ? "Tracked lead records" : "Tracked leads"}
                    value={data.kpis.leadsCreated.toLocaleString()}
                    sub={
                      workspaceVariant === "credit"
                        ? `${data.kpis.contactsCreated.toLocaleString()} contacts created in tracked records`
                        : `${data.kpis.contactsCreated.toLocaleString()} contacts created`
                    }
                  />
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
                    href={toCurrentPortalHref("/portal/app/services/ai-receptionist?tab=missed-call-textback", pathname) || "/portal/app/services/ai-receptionist?tab=missed-call-textback"}
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
