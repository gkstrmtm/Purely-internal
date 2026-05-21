import { prisma } from "@/lib/db";
import { ensurePortalMediaGrowthSchema } from "@/lib/portalMediaGrowthSchema";
import { getPortalReportingSummaryForOwner } from "@/lib/portalReportingSummary.server";
import { getPortalServiceStatusesForOwner } from "@/lib/portalServicesStatus";
import { buildPortalGrowthReadiness, type GrowthReadinessPayload, type GrowthReadinessSnapshot, type GrowthWorkspaceVariant } from "@/lib/portalGrowthReadiness";
import { getSalesReportingStatus } from "@/lib/salesReportingIntegration.server";

function portalBaseFromVariant(variant: GrowthWorkspaceVariant): "/portal" | "/credit" {
  return variant === "credit" ? "/credit" : "/portal";
}

export async function getPortalGrowthReadinessForOwner(input: {
  ownerId: string;
  fallbackEmail: string | null | undefined;
  workspaceVariant: GrowthWorkspaceVariant;
}): Promise<GrowthReadinessPayload> {
  const portalBase = portalBaseFromVariant(input.workspaceVariant);

  await ensurePortalMediaGrowthSchema().catch(() => null);

  const [services, reporting, salesStatus, continuityRows, itemsCount] = await Promise.all([
    getPortalServiceStatusesForOwner({
      ownerId: input.ownerId,
      fallbackEmail: input.fallbackEmail,
      portalVariant: input.workspaceVariant,
    }),
    getPortalReportingSummaryForOwner(input.ownerId, "30d"),
    getSalesReportingStatus(input.ownerId).catch(() => ({
      encryptionConfigured: false,
      activeProvider: null,
      providers: {
        stripe: { configured: false },
        authorizenet: { configured: false },
        braintree: { configured: false },
        razorpay: { configured: false },
        paystack: { configured: false },
        flutterwave: { configured: false },
        mollie: { configured: false },
        mercadopago: { configured: false },
      },
      stripe: { configured: false, prefix: null, accountId: null, connectedAtIso: null },
    })),
    prisma.$queryRawUnsafe<Array<{
      itemsCount: number | bigint | null;
      plannedPosts: number | bigint | null;
      approvedPosts: number | bigint | null;
      manuallyPostedAssets: number | bigint | null;
      providerReadyAssets: number | bigint | null;
      providerBlockedAssets: number | bigint | null;
      providerFailedAssets: number | bigint | null;
    }>>(
      `
SELECT
  (SELECT COUNT(*) FROM "PortalMediaItem" WHERE "ownerId" = $1) AS "itemsCount",
  COALESCE(SUM(CASE WHEN "workflowState" = 'planned' THEN 1 ELSE 0 END), 0) AS "plannedPosts",
  COALESCE(SUM(CASE WHEN "workflowState" = 'approved' THEN 1 ELSE 0 END), 0) AS "approvedPosts",
  COALESCE(SUM(CASE WHEN "workflowState" = 'posted_manually' OR "postedAt" IS NOT NULL THEN 1 ELSE 0 END), 0) AS "manuallyPostedAssets",
  COALESCE(SUM(CASE WHEN COALESCE("providerConnectionState", '') = 'connected' OR COALESCE("providerPublishState", '') IN ('queued', 'published', 'ready') THEN 1 ELSE 0 END), 0) AS "providerReadyAssets",
  COALESCE(SUM(CASE WHEN COALESCE("workflowState", '') = 'provider_blocked' OR COALESCE("providerConnectionState", '') IN ('not_connected', 'connection_required', 'needs_permissions', 'permission_missing', 'reconnect_required', 'direct_publish_unsupported') THEN 1 ELSE 0 END), 0) AS "providerBlockedAssets",
  COALESCE(SUM(CASE WHEN COALESCE("workflowState", '') = 'provider_failed' OR COALESCE("providerPublishState", '') = 'failed' OR COALESCE("providerLastError", '') <> '' THEN 1 ELSE 0 END), 0) AS "providerFailedAssets"
FROM "PortalMediaGrowthProfile"
WHERE "ownerId" = $1;
      `,
      input.ownerId,
    ).catch(() => []),
    (prisma as any).portalMediaItem.count({ where: { ownerId: input.ownerId } }).catch(() => 0),
  ]);

  const continuity = continuityRows[0] || {
    itemsCount,
    plannedPosts: 0,
    approvedPosts: 0,
    manuallyPostedAssets: 0,
    providerReadyAssets: 0,
    providerBlockedAssets: 0,
    providerFailedAssets: 0,
  };
  const toNumber = (value: number | bigint | null | undefined) => Number(value || 0);

  const snapshot: GrowthReadinessSnapshot = {
    workspaceVariant: input.workspaceVariant,
    portalBase,
    billingConfigured: true,
    statuses: Object.fromEntries(
      Object.entries(services.statuses).map(([key, value]) => [
        key,
        {
          state: value.state,
          readiness: {
            state: value.readiness.state,
            label: value.readiness.label,
            helper: value.readiness.helper,
            ctaLabel: value.readiness.ctaLabel,
            href: value.readiness.href,
          },
        },
      ]),
    ),
    reporting: {
      kpis: {
        bookingsCreated: reporting.kpis.bookingsCreated,
        reviewsCollected: reporting.kpis.reviewsCollected,
        leadsCreated: reporting.kpis.leadsCreated,
        contactsCreated: reporting.kpis.contactsCreated,
        aiCalls: reporting.kpis.aiCalls,
        textsSent: reporting.kpis.textsSent,
        missedCalls: reporting.kpis.missedCalls,
        nurtureEnrollmentsCreated: reporting.kpis.nurtureEnrollmentsCreated,
        nurtureEnrollmentsActiveNow: reporting.kpis.nurtureEnrollmentsActiveNow,
        nurtureEnrollmentsCompleted: reporting.kpis.nurtureEnrollmentsCompleted,
        newsletterSentCount: reporting.kpis.newsletterSentCount,
        blogGenerations: reporting.kpis.blogGenerations,
        tasksOpenNow: reporting.kpis.tasksOpenNow,
        tasksCompleted: reporting.kpis.tasksCompleted,
        inboxMessagesIn: reporting.kpis.inboxMessagesIn,
        inboxMessagesOut: reporting.kpis.inboxMessagesOut,
        aiOutboundCompleted: reporting.kpis.aiOutboundCompleted,
        aiOutboundQueuedNow: reporting.kpis.aiOutboundQueuedNow,
        aiOutboundFailed: reporting.kpis.aiOutboundFailed,
      },
      attention: {
        tasksOverdueNow: reporting.attention.tasksOverdueNow,
        inboxNeedsReplyNow: reporting.attention.inboxNeedsReplyNow,
        creditReportsImported: reporting.attention.creditReportsImported,
        creditReportItemsPendingNow: reporting.attention.creditReportItemsPendingNow,
        creditReportItemsNegativeNow: reporting.attention.creditReportItemsNegativeNow,
        creditDisputeDraftsNow: reporting.attention.creditDisputeDraftsNow,
        creditDisputePdfsReadyNow: reporting.attention.creditDisputePdfsReadyNow,
        creditDisputeMarkedMailedNow: reporting.attention.creditDisputeMarkedMailedNow,
      },
      externalBookingHandoff: {
        enabled: reporting.externalBookingHandoff.enabled,
        providerConfirmationAvailable: reporting.externalBookingHandoff.providerConfirmationAvailable,
        providerConfirmationConnected: reporting.externalBookingHandoff.providerConfirmationConnected,
        totalHandoffs: reporting.externalBookingHandoff.totalHandoffs,
        directHandoffs: reporting.externalBookingHandoff.directHandoffs,
        leadFirstCaptures: reporting.externalBookingHandoff.leadFirstCaptures,
        confirmedViaRedirect: reporting.externalBookingHandoff.confirmedViaRedirect,
        providerConfirmedBookings: reporting.externalBookingHandoff.providerConfirmedBookings,
        providerCanceledBookings: reporting.externalBookingHandoff.providerCanceledBookings,
        providerRescheduledBookings: reporting.externalBookingHandoff.providerRescheduledBookings,
        guidance: reporting.externalBookingHandoff.guidance,
      },
    },
    media: {
      itemsCount: toNumber(continuity.itemsCount) || itemsCount,
      foldersCount: 0,
      distributionContinuity: {
        plannedPosts: toNumber(continuity.plannedPosts),
        approvedPosts: toNumber(continuity.approvedPosts),
        manuallyPostedAssets: toNumber(continuity.manuallyPostedAssets),
        providerReadyAssets: toNumber(continuity.providerReadyAssets),
        providerBlockedAssets: toNumber(continuity.providerBlockedAssets),
        providerFailedAssets: toNumber(continuity.providerFailedAssets),
      },
    },
    sales: {
      encryptionConfigured: Boolean(salesStatus.encryptionConfigured),
      activeProvider: salesStatus.activeProvider,
      anyProviderConfigured: Object.values(salesStatus.providers || {}).some((entry) => Boolean(entry?.configured)),
      stripeConfigured: Boolean(salesStatus.stripe?.configured),
    },
  };

  return buildPortalGrowthReadiness(snapshot);
}