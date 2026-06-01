import { prisma } from "@/lib/db";
import { validateMetaInstagramFeedPublishDryRun } from "@/lib/portalMetaPublishing.server";
import { getPortalMetaProviderReadiness } from "@/lib/portalMetaIntegration.server";
import {
  getPortalMediaGrowthProfile,
  type MediaDistributionProviderKey,
  type MediaProviderConnectionState,
  type MediaProviderPublishState,
  type PortalMediaGrowthProfile,
  upsertPortalMediaGrowthProfile,
} from "@/lib/portalMediaGrowth";

type PublishingReadiness = {
  providerKey: MediaDistributionProviderKey;
  connectionState: MediaProviderConnectionState;
  publishState: MediaProviderPublishState;
  canQueue: boolean;
  canPublishNow: boolean;
  blockerCode: string | null;
  blockerReason: string | null;
  retryEligible: boolean;
};

export type PortalMediaPublishJob = {
  ownerId: string;
  mediaItemId: string;
  fileName: string;
  mimeType: string;
  providerKey: MediaDistributionProviderKey;
  providerPublishState: MediaProviderPublishState | null;
  providerScheduledForIso: string | null;
  providerDestinationId: string | null;
  providerDestinationLabel: string | null;
  providerRetryEligible: boolean | null;
  providerRetryAtIso: string | null;
  providerPostId: string | null;
  providerPublishedAtIso: string | null;
};

export type PortalMediaPublishDispatchResult = {
  mediaItemId: string;
  fileName: string;
  outcome: "published" | "blocked" | "skipped" | "failed";
  providerKey: MediaDistributionProviderKey;
  reason: string;
  growthProfile: PortalMediaGrowthProfile;
};

function inferDistributionProvider(targetPlatform: string | null | undefined): MediaDistributionProviderKey {
  switch (String(targetPlatform || "")) {
    case "facebook_post":
      return "facebook_page";
    case "instagram_post":
    case "instagram_story":
      return "instagram_business";
    case "youtube_video":
      return "future_youtube";
    default:
      return "manual";
  }
}

function mapMetaConnectionState(status: string): MediaProviderConnectionState {
  switch (status) {
    case "connected":
      return "connected";
    case "needs_permissions":
      return "needs_permissions";
    case "reconnect_required":
      return "reconnect_required";
    case "disabled":
      return "disabled";
    case "not_connected":
      return "not_connected";
    default:
      return "coming_soon";
  }
}

function buildMetaDryRunProviderState(result: Awaited<ReturnType<typeof validateMetaInstagramFeedPublishDryRun>>) {
  const primary = result.blockers[0] || null;
  return {
    providerConnectionState: mapMetaConnectionState(result.connection.state),
    providerPublishState: "blocked" as MediaProviderPublishState,
    providerStatus: primary?.code || (result.state === "ready_but_live_disabled" ? "meta_live_publish_disabled" : "meta_publish_blocked"),
    providerLastError: result.summary,
    providerRetryEligible: true,
  };
}

const META_MEDIA_LIBRARY_PUBLISH_UNAVAILABLE_REASON = "Meta is connected, but Media Library still does not send live provider posts from this flow yet. Keep planning here and use manual posting until a validated publish path ships.";

export async function resolvePortalMediaPublishingReadiness(
  ownerId: string,
  profile: PortalMediaGrowthProfile,
  opts?: { portalVariant?: "portal" | "credit"; isOwnerSession?: boolean },
): Promise<PublishingReadiness> {
  const providerKey = profile.distributionProvider || inferDistributionProvider(profile.targetPlatform);

  if (providerKey === "manual") {
    return {
      providerKey,
      connectionState: "connected",
      publishState: "manual_only",
      canQueue: false,
      canPublishNow: false,
      blockerCode: "manual_only",
      blockerReason: "This asset is using the manual posting path. Purely stores the plan and the result, but it does not queue a provider publish job for manual uploads.",
      retryEligible: false,
    };
  }

  if (providerKey === "future_youtube") {
    return {
      providerKey,
      connectionState: "coming_soon",
      publishState: "unavailable",
      canQueue: false,
      canPublishNow: false,
      blockerCode: "youtube_publish_unavailable",
      blockerReason: "YouTube direct publishing is not live yet. Planning stays available here, but upload, scheduling, OAuth, analytics, and publishing remain manual/future-only.",
      retryEligible: true,
    };
  }

  if (providerKey === "facebook_page" || providerKey === "instagram_business") {
    const readiness = await getPortalMetaProviderReadiness(ownerId, {
      portalVariant: opts?.portalVariant || "portal",
      isOwnerSession: opts?.isOwnerSession ?? true,
    });
    const connectionState = mapMetaConnectionState(readiness.status);
    const publishFeatureLive = Boolean(readiness.capabilities.publish.available && readiness.capabilities.publish.liveEnabled);

    if (!publishFeatureLive) {
      const blocked = readiness.status === "not_connected" || readiness.status === "needs_permissions" || readiness.status === "reconnect_required";
      return {
        providerKey,
        connectionState,
        publishState: blocked ? "blocked" : "unavailable",
        canQueue: false,
        canPublishNow: false,
        blockerCode: `meta_${readiness.status}`,
        blockerReason: readiness.setupMessage || readiness.capabilities.publish.reason,
        retryEligible: true,
      };
    }

    return {
      providerKey,
      connectionState,
      publishState: "unavailable",
      canQueue: false,
      canPublishNow: false,
      blockerCode: "meta_publish_path_unavailable",
      blockerReason: META_MEDIA_LIBRARY_PUBLISH_UNAVAILABLE_REASON,
      retryEligible: false,
    };
  }

  return {
    providerKey,
    connectionState: "not_connected",
    publishState: "unavailable",
    canQueue: false,
    canPublishNow: false,
    blockerCode: "provider_unavailable",
    blockerReason: "This provider is not available for live publishing from Media Library yet. Keep the content plan in Purely and use manual posting until the provider path is implemented and validated.",
    retryEligible: true,
  };
}

export async function queuePortalMediaPublishJob(
  ownerId: string,
  mediaItemId: string,
  opts?: { portalVariant?: "portal" | "credit"; isOwnerSession?: boolean },
): Promise<{ outcome: "queued" | "blocked" | "unavailable" | "manual_only"; growthProfile: PortalMediaGrowthProfile; reason: string }> {
  const current = await getPortalMediaGrowthProfile(ownerId, mediaItemId);
  const scheduledForIso = current.providerScheduledForIso || current.plannedForIso;
  const readiness = await resolvePortalMediaPublishingReadiness(ownerId, current, opts);

  if (!scheduledForIso) {
    const growthProfile = await upsertPortalMediaGrowthProfile(ownerId, mediaItemId, {
      providerPublishState: "blocked",
      providerStatus: "schedule_required",
      providerLastError: "Set a provider publish time before trying to queue this asset.",
      providerRetryEligible: false,
      providerQueuedAtIso: null,
      providerPendingAtIso: null,
    });
    return {
      outcome: "blocked",
      growthProfile,
      reason: "Set a provider publish time before trying to queue this asset.",
    };
  }

  if (!readiness.canQueue) {
    if (readiness.providerKey === "instagram_business" && readiness.blockerCode !== "meta_publish_path_unavailable") {
      const validation = await validateMetaInstagramFeedPublishDryRun({
        ownerId,
        mediaItemId,
        profile: current,
        portalVariant: opts?.portalVariant,
        isOwnerSession: opts?.isOwnerSession,
      });
      const next = buildMetaDryRunProviderState(validation);
      const growthProfile = await upsertPortalMediaGrowthProfile(ownerId, mediaItemId, {
        providerConnectionState: next.providerConnectionState,
        providerPublishState: next.providerPublishState,
        providerStatus: next.providerStatus,
        providerLastError: next.providerLastError,
        providerRetryEligible: next.providerRetryEligible,
        providerRetryAtIso: null,
        providerScheduledForIso: scheduledForIso,
        providerQueuedAtIso: null,
        providerPendingAtIso: null,
      });
      return {
        outcome: "blocked",
        growthProfile,
        reason: validation.summary,
      };
    }

    const growthProfile = await upsertPortalMediaGrowthProfile(ownerId, mediaItemId, {
      providerConnectionState: readiness.connectionState,
      providerPublishState: readiness.publishState,
      providerStatus: readiness.blockerCode,
      providerLastError: readiness.blockerReason,
      providerRetryEligible: readiness.retryEligible,
      providerRetryAtIso: null,
      providerScheduledForIso: scheduledForIso,
      providerQueuedAtIso: null,
      providerPendingAtIso: null,
    });
    return {
      outcome: readiness.publishState === "manual_only" ? "manual_only" : readiness.publishState === "unavailable" ? "unavailable" : "blocked",
      growthProfile,
      reason: readiness.blockerReason || "Provider publishing is not available for this asset yet.",
    };
  }

  const growthProfile = await upsertPortalMediaGrowthProfile(ownerId, mediaItemId, {
    providerConnectionState: readiness.connectionState,
    providerPublishState: "queued",
    providerStatus: "queued",
    providerLastError: null,
    providerRetryEligible: true,
    providerRetryAtIso: null,
    providerScheduledForIso: scheduledForIso,
    providerQueuedAtIso: new Date().toISOString(),
    providerPendingAtIso: null,
  });

  return {
    outcome: "queued",
    growthProfile,
    reason: "Provider publish job queued.",
  };
}

export async function listDuePortalMediaPublishJobs(args?: {
  ownerId?: string;
  now?: Date;
  limit?: number;
}): Promise<PortalMediaPublishJob[]> {
  const now = args?.now || new Date();
  const limit = Math.max(1, Math.min(args?.limit || 25, 100));

  const rows = await prisma.$queryRawUnsafe<Array<{
    ownerId: string;
    mediaItemId: string;
    fileName: string;
    mimeType: string;
    distributionProvider: string | null;
    providerPublishState: string | null;
    providerScheduledForAt: Date | string | null;
    providerDestinationId: string | null;
    providerDestinationLabel: string | null;
    providerRetryEligible: boolean | null;
    providerRetryAt: Date | string | null;
    providerPostId: string | null;
    providerPublishedAt: Date | string | null;
  }>>(
    `
SELECT
  growth."ownerId",
  growth."mediaItemId",
  media."fileName",
  media."mimeType",
  growth."distributionProvider",
  growth."providerPublishState",
  growth."providerScheduledForAt",
  growth."providerDestinationId",
  growth."providerDestinationLabel",
  growth."providerRetryEligible",
  growth."providerRetryAt",
  growth."providerPostId",
  growth."providerPublishedAt"
FROM "PortalMediaGrowthProfile" growth
INNER JOIN "PortalMediaItem" media ON media."id" = growth."mediaItemId"
WHERE ($1::text IS NULL OR growth."ownerId" = $1)
  AND growth."providerPostId" IS NULL
  AND growth."providerPublishedAt" IS NULL
  AND (
    (growth."providerPublishState" = 'queued' AND growth."providerScheduledForAt" IS NOT NULL AND growth."providerScheduledForAt" <= $2)
    OR
    (growth."providerPublishState" = 'failed' AND COALESCE(growth."providerRetryEligible", false) = true AND growth."providerRetryAt" IS NOT NULL AND growth."providerRetryAt" <= $2)
  )
ORDER BY COALESCE(growth."providerScheduledForAt", growth."providerRetryAt") ASC
LIMIT $3;
    `,
    args?.ownerId || null,
    now,
    limit,
  ).catch(() => []);

  return rows.map((row) => ({
    ownerId: String(row.ownerId),
    mediaItemId: String(row.mediaItemId),
    fileName: String(row.fileName || ""),
    mimeType: String(row.mimeType || ""),
    providerKey: (String(row.distributionProvider || "manual") || "manual") as MediaDistributionProviderKey,
    providerPublishState: (row.providerPublishState as MediaProviderPublishState | null) || null,
    providerScheduledForIso: row.providerScheduledForAt ? new Date(row.providerScheduledForAt).toISOString() : null,
    providerDestinationId: row.providerDestinationId || null,
    providerDestinationLabel: row.providerDestinationLabel || null,
    providerRetryEligible: row.providerRetryEligible,
    providerRetryAtIso: row.providerRetryAt ? new Date(row.providerRetryAt).toISOString() : null,
    providerPostId: row.providerPostId || null,
    providerPublishedAtIso: row.providerPublishedAt ? new Date(row.providerPublishedAt).toISOString() : null,
  }));
}

export async function executePortalMediaPublishJob(
  job: PortalMediaPublishJob,
  opts?: { portalVariant?: "portal" | "credit"; isOwnerSession?: boolean },
): Promise<PortalMediaPublishDispatchResult> {
  const current = await getPortalMediaGrowthProfile(job.ownerId, job.mediaItemId);

  if (current.providerPostId || current.providerPublishedAtIso) {
    return {
      mediaItemId: job.mediaItemId,
      fileName: job.fileName,
      outcome: "skipped",
      providerKey: current.distributionProvider || inferDistributionProvider(current.targetPlatform),
      reason: "A provider post is already stored for this asset.",
      growthProfile: current,
    };
  }

  if (current.providerPublishState !== "queued" && current.providerPublishState !== "pending" && current.providerPublishState !== "failed") {
    return {
      mediaItemId: job.mediaItemId,
      fileName: job.fileName,
      outcome: "skipped",
      providerKey: current.distributionProvider || inferDistributionProvider(current.targetPlatform),
      reason: "This asset is not waiting in the provider publish queue.",
      growthProfile: current,
    };
  }

  const pendingProfile = await upsertPortalMediaGrowthProfile(job.ownerId, job.mediaItemId, {
    providerPublishState: "pending",
    providerStatus: "dispatch_pending",
    providerPendingAtIso: new Date().toISOString(),
    providerLastAttemptAtIso: new Date().toISOString(),
  });

  const readiness = await resolvePortalMediaPublishingReadiness(job.ownerId, pendingProfile, opts);

  if (!readiness.canPublishNow) {
    if (readiness.providerKey === "instagram_business" && readiness.blockerCode !== "meta_publish_path_unavailable") {
      const validation = await validateMetaInstagramFeedPublishDryRun({
        ownerId: job.ownerId,
        mediaItemId: job.mediaItemId,
        profile: pendingProfile,
        portalVariant: opts?.portalVariant,
        isOwnerSession: opts?.isOwnerSession,
      });
      const next = buildMetaDryRunProviderState(validation);
      const growthProfile = await upsertPortalMediaGrowthProfile(job.ownerId, job.mediaItemId, {
        providerConnectionState: next.providerConnectionState,
        providerPublishState: next.providerPublishState,
        providerStatus: next.providerStatus,
        providerLastError: next.providerLastError,
        providerRetryEligible: next.providerRetryEligible,
        providerRetryAtIso: null,
        providerQueuedAtIso: null,
        providerPendingAtIso: null,
      });
      return {
        mediaItemId: job.mediaItemId,
        fileName: job.fileName,
        outcome: "blocked",
        providerKey: readiness.providerKey,
        reason: validation.summary,
        growthProfile,
      };
    }

    const growthProfile = await upsertPortalMediaGrowthProfile(job.ownerId, job.mediaItemId, {
      providerConnectionState: readiness.connectionState,
      providerPublishState: "blocked",
      providerStatus: readiness.blockerCode,
      providerLastError: readiness.blockerReason,
      providerRetryEligible: readiness.retryEligible,
      providerRetryAtIso: null,
      providerQueuedAtIso: null,
      providerPendingAtIso: null,
    });
    return {
      mediaItemId: job.mediaItemId,
      fileName: job.fileName,
      outcome: "blocked",
      providerKey: readiness.providerKey,
      reason: readiness.blockerReason || "Provider publishing is not ready.",
      growthProfile,
    };
  }

  if (readiness.providerKey === "instagram_business") {
    const validation = await validateMetaInstagramFeedPublishDryRun({
      ownerId: job.ownerId,
      mediaItemId: job.mediaItemId,
      profile: pendingProfile,
      portalVariant: opts?.portalVariant,
      isOwnerSession: opts?.isOwnerSession,
    });
    const next = buildMetaDryRunProviderState(validation);
    const growthProfile = await upsertPortalMediaGrowthProfile(job.ownerId, job.mediaItemId, {
      providerConnectionState: next.providerConnectionState,
      providerPublishState: next.providerPublishState,
      providerStatus: next.providerStatus,
      providerLastError: next.providerLastError,
      providerRetryEligible: next.providerRetryEligible,
      providerRetryAtIso: null,
      providerQueuedAtIso: null,
      providerPendingAtIso: null,
    });

    return {
      mediaItemId: job.mediaItemId,
      fileName: job.fileName,
      outcome: "blocked",
      providerKey: readiness.providerKey,
      reason: validation.summary,
      growthProfile,
    };
  }

  const growthProfile = await upsertPortalMediaGrowthProfile(job.ownerId, job.mediaItemId, {
    providerPublishState: "failed",
    providerStatus: "publish_path_missing",
    providerLastError: "A live provider publishing path has not been implemented for this provider yet. Purely stopped at the queue boundary and did not send any external post.",
    providerRetryEligible: false,
    providerRetryAtIso: null,
    providerQueuedAtIso: null,
    providerPendingAtIso: null,
  });

  return {
    mediaItemId: job.mediaItemId,
    fileName: job.fileName,
    outcome: "failed",
    providerKey: readiness.providerKey,
    reason: "The queue boundary ran, but no validated provider publish call is implemented for this provider yet.",
    growthProfile,
  };
}

export async function dispatchDuePortalMediaPublishJobs(args?: {
  ownerId?: string;
  now?: Date;
  limit?: number;
  portalVariant?: "portal" | "credit";
  isOwnerSession?: boolean;
}): Promise<{ jobs: PortalMediaPublishJob[]; results: PortalMediaPublishDispatchResult[] }> {
  const jobs = await listDuePortalMediaPublishJobs(args);
  const results: PortalMediaPublishDispatchResult[] = [];

  for (const job of jobs) {
    results.push(await executePortalMediaPublishJob(job, {
      portalVariant: args?.portalVariant,
      isOwnerSession: args?.isOwnerSession,
    }));
  }

  return { jobs, results };
}
