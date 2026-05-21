import { prisma } from "@/lib/db";
import { getCreditsState } from "@/lib/credits";
import { listAiReceptionistEvents } from "@/lib/aiReceptionist";
import { parsePortalFeedbackPayload } from "@/lib/betaFeedback";
import { getExternalBookingHandoffSummaryForOwner, type ExternalBookingHandoffSummary } from "@/lib/externalBookingHandoffReporting";
import { listMissedCallTextBackEvents } from "@/lib/missedCallTextBack";

export type PortalReportingRangeKey = "today" | "7d" | "30d" | "90d" | "all";

export function clampPortalReportingRangeKey(value: string | null): PortalReportingRangeKey {
  switch ((value ?? "").toLowerCase().trim()) {
    case "today":
      return "today";
    case "7d":
    case "7":
      return "7d";
    case "30d":
    case "30":
      return "30d";
    case "90d":
    case "90":
      return "90d";
    case "all":
      return "all";
    default:
      return "30d";
  }
}

function startForRange(range: PortalReportingRangeKey, now: Date): Date {
  if (range === "all") return new Date(0);
  if (range === "today") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function dayKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function readPortalDiagnosticEvents(value: unknown): Array<{
  kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure";
  createdAtIso: string;
  lastSeenAtIso: string;
  count: number;
  message: string;
  path?: string;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.events)) return [];
  return rec.events.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [] as Array<any>;
    const item = raw as Record<string, unknown>;
    const kind =
      item.kind === "runtime_error" ||
      item.kind === "unhandled_rejection" ||
      item.kind === "resource_error" ||
      item.kind === "action_failure"
        ? item.kind
        : null;
    const createdAtIso = typeof item.createdAtIso === "string" ? item.createdAtIso.trim() : "";
    const lastSeenAtIso = typeof item.lastSeenAtIso === "string" ? item.lastSeenAtIso.trim() : createdAtIso;
    const message = typeof item.message === "string" ? item.message.trim().slice(0, 4000) : "";
    const count = Number.isFinite(Number(item.count)) ? Math.max(1, Math.floor(Number(item.count))) : 1;
    if (!kind || !createdAtIso || !message) return [] as Array<any>;
    return [
      {
        kind,
        createdAtIso,
        lastSeenAtIso: lastSeenAtIso || createdAtIso,
        count,
        message,
        ...(typeof item.path === "string" && item.path.trim() ? { path: item.path.trim().slice(0, 512) } : {}),
      },
    ];
  });
}

function readBugReportList(value: unknown): Array<{ createdAtIso: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.reports)) return [];
  return rec.reports.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [] as Array<any>;
    const item = raw as Record<string, unknown>;
    const createdAtIso = typeof item.createdAtIso === "string" ? item.createdAtIso.trim() : "";
    return createdAtIso ? [{ createdAtIso }] : [];
  });
}

export type PortalReportingSummaryPayload = {
  ok: true;
  range: PortalReportingRangeKey;
  startIso: string;
  endIso: string;
  creditsRemaining: number;
  externalBookingHandoff: ExternalBookingHandoffSummary;
  warnings?: string[];
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

export async function getPortalReportingSummaryForOwner(
  ownerId: string,
  range: PortalReportingRangeKey,
): Promise<PortalReportingSummaryPayload> {
  const now = new Date();
  const start = startForRange(range, now);

  const warnings: string[] = [];

  async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      console.error(`/api/portal/reporting: ${label} failed`, err);
      warnings.push(label);
      return fallback;
    }
  }

  const [
    credits,
    aiEventsRaw,
    missedEventsRaw,
    leadRuns,
    bookingSite,
    reviewsAgg,
    leadsCount,
    contactsCount,
    aiOutboundQueuedNow,
    aiOutboundCompleted,
    aiOutboundFailed,
    nurtureEnrollmentsCreated,
    nurtureEnrollmentsActiveNow,
    nurtureEnrollmentsCompleted,
    newsletterAgg,
    tasksOpenNow,
    tasksOverdueNow,
    tasksCompleted,
    inboxMessagesIn,
    inboxMessagesOut,
    inboxNeedsReplyNow,
    creditReportsImported,
    creditReportItemsPendingNow,
    creditReportItemsNegativeNow,
    creditDisputeDraftsNow,
    creditDisputePdfsReadyNow,
    creditDisputeMarkedMailedNow,
    diagnosticsSetups,
  ] = await Promise.all([
    safe("credits", () => getCreditsState(ownerId), { balance: 0, autoTopUp: false }),
    safe("aiEvents", () => listAiReceptionistEvents(ownerId, 200), []),
    safe("missedCallEvents", () => listMissedCallTextBackEvents(ownerId, 200), []),
    safe(
      "leadScrapeRuns",
      () =>
        prisma.portalLeadScrapeRun.findMany({
          where: { ownerId, createdAt: { gte: start } },
          select: {
            id: true,
            createdAt: true,
            requestedCount: true,
            createdCount: true,
            chargedCredits: true,
            refundedCredits: true,
            error: true,
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      [],
    ),
    safe("bookingSite", () => prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } }), null),
    safe(
      "reviewsAgg",
      () =>
        prisma.portalReview.aggregate({
          where: { ownerId, createdAt: { gte: start }, archivedAt: null },
          _count: { id: true },
          _avg: { rating: true },
        }),
      { _count: { id: 0 }, _avg: { rating: null } },
    ),
    safe("leadsCount", () => prisma.portalLead.count({ where: { ownerId, createdAt: { gte: start } } }), 0),
    safe("contactsCount", () => prisma.portalContact.count({ where: { ownerId, createdAt: { gte: start } } }), 0),

    safe(
      "aiOutboundQueuedNow",
      () => prisma.portalAiOutboundCallEnrollment.count({ where: { ownerId, status: "QUEUED" } }),
      0,
    ),
    safe(
      "aiOutboundCompleted",
      () =>
        prisma.portalAiOutboundCallEnrollment.count({
          where: { ownerId, status: "COMPLETED", completedAt: { gte: start } },
        }),
      0,
    ),
    safe(
      "aiOutboundFailed",
      () =>
        prisma.portalAiOutboundCallEnrollment.count({
          where: { ownerId, status: "FAILED", updatedAt: { gte: start } },
        }),
      0,
    ),

    safe(
      "nurtureEnrollmentsCreated",
      () => prisma.portalNurtureEnrollment.count({ where: { ownerId, createdAt: { gte: start } } }),
      0,
    ),
    safe("nurtureEnrollmentsActiveNow", () => prisma.portalNurtureEnrollment.count({ where: { ownerId, status: "ACTIVE" } }), 0),
    safe(
      "nurtureEnrollmentsCompleted",
      () =>
        prisma.portalNurtureEnrollment.count({
          where: { ownerId, status: "COMPLETED", updatedAt: { gte: start } },
        }),
      0,
    ),

    safe(
      "newsletterAgg",
      () =>
        prisma.portalNewsletterSendEvent.aggregate({
          where: { ownerId, createdAt: { gte: start } },
          _count: { id: true },
          _sum: { sentCount: true, failedCount: true },
        }),
      { _count: { id: 0 }, _sum: { sentCount: 0, failedCount: 0 } },
    ),

    safe("tasksOpenNow", () => prisma.portalTask.count({ where: { ownerId, status: "OPEN" } }), 0),
    safe(
      "tasksOverdueNow",
      () =>
        prisma.portalTask.count({
          where: { ownerId, status: "OPEN", dueAt: { lt: now } },
        }),
      0,
    ),
    safe(
      "tasksCompleted",
      () => prisma.portalTask.count({ where: { ownerId, status: "DONE", updatedAt: { gte: start } } }),
      0,
    ),

    safe(
      "inboxMessagesIn",
      () =>
        prisma.portalInboxMessage.count({
          where: { ownerId, direction: "IN", createdAt: { gte: start } },
        }),
      0,
    ),
    safe(
      "inboxMessagesOut",
      () =>
        prisma.portalInboxMessage.count({
          where: { ownerId, direction: "OUT", createdAt: { gte: start } },
        }),
      0,
    ),
    safe(
      "inboxNeedsReplyNow",
      () =>
        prisma.portalInboxThread.count({
          where: { ownerId, lastMessageDirection: "IN" },
        }),
      0,
    ),
    safe(
      "creditReportsImported",
      () =>
        prisma.creditReport.count({
          where: { ownerId, importedAt: { gte: start } },
        }),
      0,
    ),
    safe(
      "creditReportItemsPendingNow",
      () =>
        prisma.creditReportItem.count({
          where: { report: { ownerId }, auditTag: "PENDING" },
        }),
      0,
    ),
    safe(
      "creditReportItemsNegativeNow",
      () =>
        prisma.creditReportItem.count({
          where: { report: { ownerId }, auditTag: "NEGATIVE" },
        }),
      0,
    ),
    safe(
      "creditDisputeDraftsNow",
      () => prisma.creditDisputeLetter.count({ where: { ownerId, status: "DRAFT" } }),
      0,
    ),
    safe(
      "creditDisputePdfsReadyNow",
      () => prisma.creditDisputeLetter.count({ where: { ownerId, status: "GENERATED" } }),
      0,
    ),
    safe(
      "creditDisputeMarkedMailedNow",
      () => prisma.creditDisputeLetter.count({ where: { ownerId, status: "SENT" } }),
      0,
    ),
    safe(
      "diagnosticsSetups",
      () =>
        prisma.portalServiceSetup.findMany({
          where: { ownerId, serviceSlug: { in: ["portal_diagnostics", "bug-reports"] } },
          select: { serviceSlug: true, dataJson: true },
        }),
      [],
    ),
  ]);

  const diagnosticSetupMap = new Map(
    (diagnosticsSetups as Array<{ serviceSlug: string; dataJson: unknown }>).map((item) => [item.serviceSlug, item.dataJson]),
  );
  const feedbackItems = parsePortalFeedbackPayload(diagnosticSetupMap.get("bug-reports")).items;
  const diagnosticsInRange = readPortalDiagnosticEvents(diagnosticSetupMap.get("portal_diagnostics")).filter((item) => {
    const seenAt = safeDate(item.lastSeenAtIso || item.createdAtIso);
    return seenAt ? seenAt >= start : false;
  });
  const bugReportsInRange = readBugReportList(diagnosticSetupMap.get("bug-reports")).filter((item) => {
    const createdAt = safeDate(item.createdAtIso);
    return createdAt ? createdAt >= start : false;
  });
  const unresolvedFeedbackStatuses = new Set(["new", "reviewing", "planned"]);
  const highSeverityFeedback = new Set(["high", "critical"]);
  const portalFeedbackItems = feedbackItems.filter((item) => item.portalVariant !== "credit");
  const creditFeedbackItems = feedbackItems.filter((item) => item.portalVariant === "credit");
  const portalFeedbackRecent = portalFeedbackItems.filter((item) => {
    const createdAt = safeDate(item.createdAtIso);
    return createdAt ? createdAt >= start : false;
  });
  const creditFeedbackRecent = creditFeedbackItems.filter((item) => {
    const createdAt = safeDate(item.createdAtIso);
    return createdAt ? createdAt >= start : false;
  });
  const portalFeedbackUnresolved = portalFeedbackItems.filter((item) => unresolvedFeedbackStatuses.has(item.triage.status));
  const creditFeedbackUnresolved = creditFeedbackItems.filter((item) => unresolvedFeedbackStatuses.has(item.triage.status));
  const portalFeedbackHighSeverity = portalFeedbackUnresolved.filter((item) => highSeverityFeedback.has(item.severity));
  const creditFeedbackHighSeverity = creditFeedbackUnresolved.filter((item) => highSeverityFeedback.has(item.severity));

  const diagnosticCounts = diagnosticsInRange.reduce(
    (acc, item) => {
      if (item.kind === "action_failure") acc.actionFailures += item.count;
      if (item.kind === "runtime_error") acc.runtimeErrors += item.count;
      if (item.kind === "unhandled_rejection") acc.unhandledRejections += item.count;
      if (item.kind === "resource_error") acc.resourceErrors += item.count;
      return acc;
    },
    { actionFailures: 0, runtimeErrors: 0, unhandledRejections: 0, resourceErrors: 0 },
  );

  const topPathCounts = new Map<string, number>();
  const topMessageCounts = new Map<string, { kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure"; message: string; count: number }>();
  for (const item of diagnosticsInRange) {
    const path = String(item.path || "").trim();
    if (path) topPathCounts.set(path, (topPathCounts.get(path) ?? 0) + item.count);
    const key = `${item.kind}::${item.message}`;
    const current = topMessageCounts.get(key);
    if (current) current.count += item.count;
    else topMessageCounts.set(key, { kind: item.kind, message: item.message, count: item.count });
  }

  const [blogAgg, blogEvents] = await Promise.all([
    safe(
      "blogGenerationAgg",
      () =>
        prisma.portalBlogGenerationEvent.aggregate({
          where: { ownerId, createdAt: { gte: start } },
          _count: { id: true },
          _sum: { chargedCredits: true },
        }),
      { _count: { id: 0 }, _sum: { chargedCredits: 0 } } as any,
    ),
    safe(
      "blogGenerationEvents",
      () =>
        prisma.portalBlogGenerationEvent.findMany({
          where: { ownerId, createdAt: { gte: start } },
          select: { createdAt: true, chargedCredits: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      [],
    ),
  ]);

  const bookingCount = bookingSite
    ? await safe(
        "bookingCount",
        () => prisma.portalBooking.count({ where: { siteId: bookingSite.id, createdAt: { gte: start } } }),
        0,
      )
    : 0;

  const aiEvents = (aiEventsRaw as any[]).filter((e) => {
    const d = safeDate((e as any)?.createdAtIso);
    return d ? d >= start : false;
  });

  const missedEvents = (missedEventsRaw as any[]).filter((e) => {
    const d = safeDate((e as any)?.createdAtIso);
    return d ? d >= start : false;
  });

  const aiCompleted = aiEvents.filter((e) => (e as any).status === "COMPLETED").length;
  const aiFailed = aiEvents.filter((e) => (e as any).status === "FAILED").length;
  const missedCalls = missedEvents.filter((e) => (e as any).finalStatus === "MISSED").length;
  const textsSent = missedEvents.filter((e) => (e as any).smsStatus === "SENT").length;
  const textsFailed = missedEvents.filter((e) => (e as any).smsStatus === "FAILED").length;

  const aiCreditsUsed = aiEvents.reduce(
    (sum, e) => sum + (typeof (e as any).chargedCredits === "number" ? (e as any).chargedCredits : 0),
    0,
  );
  const leadScrapeRuns = (leadRuns as any[]).length;
  const leadScrapeCharged = (leadRuns as any[]).reduce((sum, r) => sum + ((r as any).chargedCredits || 0), 0);
  const leadScrapeRefunded = (leadRuns as any[]).reduce((sum, r) => sum + ((r as any).refundedCredits || 0), 0);
  const leadScrapeNetCredits = Math.max(0, leadScrapeCharged - leadScrapeRefunded);

  const blogGenerations = typeof (blogAgg as any)?._count?.id === "number" ? (blogAgg as any)._count.id : 0;
  const blogCreditsUsed = typeof (blogAgg as any)?._sum?.chargedCredits === "number" ? (blogAgg as any)._sum.chargedCredits : 0;

  const creditsUsed = aiCreditsUsed + leadScrapeNetCredits + blogCreditsUsed;

  const automationsRun = aiEvents.length + missedEvents.length + leadScrapeRuns + blogGenerations;

  const daysBack = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 30;
  const dailyMap = new Map<
    string,
    {
      day: string;
      aiCalls: number;
      missedCalls: number;
      leadScrapeRuns: number;
      bookings: number;
      reviews: number;
      creditsUsed: number;
    }
  >();

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKeyUtc(d);
    dailyMap.set(key, { day: key, aiCalls: 0, missedCalls: 0, leadScrapeRuns: 0, bookings: 0, reviews: 0, creditsUsed: 0 });
  }

  for (const e of aiEvents) {
    const d = safeDate((e as any)?.createdAtIso);
    if (!d) continue;
    const key = dayKeyUtc(d);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.aiCalls += 1;
    row.creditsUsed += typeof (e as any).chargedCredits === "number" ? (e as any).chargedCredits : 0;
  }

  for (const e of missedEvents) {
    const d = safeDate((e as any)?.createdAtIso);
    if (!d) continue;
    const key = dayKeyUtc(d);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.missedCalls += (e as any).finalStatus === "MISSED" ? 1 : 0;
  }

  for (const r of leadRuns as any[]) {
    const key = dayKeyUtc((r as any).createdAt);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.leadScrapeRuns += 1;
    const net = Math.max(0, ((r as any).chargedCredits || 0) - ((r as any).refundedCredits || 0));
    row.creditsUsed += net;
  }

  for (const e of blogEvents as any[]) {
    const d = e && typeof e === "object" && (e as any).createdAt instanceof Date ? (e as any).createdAt : null;
    if (!d) continue;
    const key = dayKeyUtc(d);
    const row = dailyMap.get(key);
    if (!row) continue;
    const charged = typeof (e as any).chargedCredits === "number" ? (e as any).chargedCredits : 0;
    row.creditsUsed += charged;
  }

  if (bookingSite) {
    const bookings = await prisma.portalBooking.findMany({
      where: { siteId: bookingSite.id, createdAt: { gte: start } },
      select: { createdAt: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    for (const b of bookings) {
      const key = dayKeyUtc(b.createdAt);
      const row = dailyMap.get(key);
      if (!row) continue;
      row.bookings += 1;
    }
  }

  const reviews = await safe(
    "reviewsList",
    () =>
      prisma.portalReview.findMany({
        where: { ownerId, createdAt: { gte: start }, archivedAt: null },
        select: { createdAt: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
    [],
  );

  for (const r of reviews as any[]) {
    const key = dayKeyUtc((r as any).createdAt);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.reviews += 1;
  }

  const daily = Array.from(dailyMap.values());
  const externalBookingHandoff = await safe(
    "externalBookingHandoff",
    () => getExternalBookingHandoffSummaryForOwner(ownerId, { startAt: start }),
    {
      enabled: false,
      handoffMode: "direct_book" as const,
      providerKey: "unknown" as const,
      providerLabel: "External booking page",
      destinationHost: "",
      confirmationState: "handoff_only" as const,
      providerConfirmationAvailable: false,
      providerConfirmationConnected: false,
      totalHandoffs: 0,
      directHandoffs: 0,
      leadFirstCaptures: 0,
      distinctCapturedContacts: 0,
      confirmedViaRedirect: 0,
      distinctConfirmedContacts: 0,
      providerConfirmedBookings: 0,
      distinctProviderConfirmedContacts: 0,
      providerCanceledBookings: 0,
      providerRescheduledBookings: 0,
      latestHandoffAt: null,
      latestConfirmedAt: null,
      latestProviderConfirmedAt: null,
      latestActivityAt: null,
      providerBreakdown: [],
      guidance: {
        state: "disabled" as const,
        title: "External booking handoff is off",
        detail: "Turn the external booking link on and share the tracked booking handoff if you want Purely to record sends to the booking page.",
      },
    },
  );

  return {
    ok: true,
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    creditsRemaining: (credits as any).balance,
    externalBookingHandoff,
    ...(warnings.length ? { warnings } : {}),
    attention: {
      tasksOverdueNow: tasksOverdueNow as number,
      inboxNeedsReplyNow: inboxNeedsReplyNow as number,
      creditReportsImported: creditReportsImported as number,
      creditReportItemsPendingNow: creditReportItemsPendingNow as number,
      creditReportItemsNegativeNow: creditReportItemsNegativeNow as number,
      creditDisputeDraftsNow: creditDisputeDraftsNow as number,
      creditDisputePdfsReadyNow: creditDisputePdfsReadyNow as number,
      creditDisputeMarkedMailedNow: creditDisputeMarkedMailedNow as number,
      betaFeedbackPortalRecent: portalFeedbackRecent.length,
      betaFeedbackPortalUnresolvedNow: portalFeedbackUnresolved.length,
      betaFeedbackPortalHighSeverityNow: portalFeedbackHighSeverity.length,
      betaFeedbackCreditRecent: creditFeedbackRecent.length,
      betaFeedbackCreditUnresolvedNow: creditFeedbackUnresolved.length,
      betaFeedbackCreditHighSeverityNow: creditFeedbackHighSeverity.length,
    },
    diagnostics: {
      ...diagnosticCounts,
      manualBugReports: bugReportsInRange.length,
      topPaths: Array.from(topPathCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([path, count]) => ({ path, count })),
      topMessages: Array.from(topMessageCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
    kpis: {
      automationsRun,
      aiCalls: aiEvents.length,
      aiCompleted,
      aiFailed,
      missedCallAttempts: missedEvents.length,
      missedCalls,
      textsSent,
      textsFailed,
      leadScrapeRuns,
      leadScrapeChargedCredits: leadScrapeCharged,
      leadScrapeRefundedCredits: leadScrapeRefunded,
      blogGenerations,
      blogCreditsUsed,
      creditsUsed,
      bookingsCreated: bookingCount,
      reviewsCollected: (reviewsAgg as any)._count.id,
      avgReviewRating: (reviewsAgg as any)._avg.rating,
      leadsCreated: leadsCount as any,
      contactsCreated: contactsCount as any,

      aiOutboundQueuedNow: aiOutboundQueuedNow as any,
      aiOutboundCompleted: aiOutboundCompleted as any,
      aiOutboundFailed: aiOutboundFailed as any,

      nurtureEnrollmentsCreated: nurtureEnrollmentsCreated as any,
      nurtureEnrollmentsActiveNow: nurtureEnrollmentsActiveNow as any,
      nurtureEnrollmentsCompleted: nurtureEnrollmentsCompleted as any,

      newsletterSendEvents: (newsletterAgg as any)?._count?.id ?? 0,
      newsletterSentCount: (newsletterAgg as any)?._sum?.sentCount ?? 0,
      newsletterFailedCount: (newsletterAgg as any)?._sum?.failedCount ?? 0,

      tasksOpenNow: tasksOpenNow as any,
      tasksCompleted: tasksCompleted as any,

      inboxMessagesIn: inboxMessagesIn as any,
      inboxMessagesOut: inboxMessagesOut as any,
    },
    daily,
  };
}
