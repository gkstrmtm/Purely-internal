export type DistributionProviderKey = "manual" | "facebook_page" | "instagram_business" | "future_youtube" | "future_tiktok" | "future_linkedin";

export type ProviderConnectionState =
  | "coming_soon"
  | "not_connected"
  | "connection_required"
  | "connected"
  | "needs_permissions"
  | "permission_missing"
  | "reconnect_required"
  | "disabled"
  | "direct_publish_unsupported"
  | "metrics_unavailable";

export type ProviderPublishState = "manual_only" | "unavailable" | "draft" | "ready" | "queued" | "pending" | "published" | "failed" | "blocked";

export type MediaMetaReadinessLike = {
  status?: string | null;
  capabilities?: {
    publish?: {
      available?: boolean | null;
      liveEnabled?: boolean | null;
    } | null;
  } | null;
};

export type MediaGrowthInvariantProfile = {
  workflowState?: string | null;
  targetPlatform?: string | null;
  plannedForIso?: string | null;
  approvedAtIso?: string | null;
  postedAtIso?: string | null;
  distributionProvider?: DistributionProviderKey | null;
  providerConnectionState?: ProviderConnectionState | null;
  providerPublishState?: ProviderPublishState | null;
  providerScheduledForIso?: string | null;
  providerQueuedAtIso?: string | null;
  providerPendingAtIso?: string | null;
  queueOrder?: number | null;
  providerStatus?: string | null;
  providerPostId?: string | null;
  providerLastError?: string | null;
  providerLastAttemptAtIso?: string | null;
  providerPublishedAtIso?: string | null;
  metricsSyncedAtIso?: string | null;
};

type MediaGrowthSaveShape = MediaGrowthInvariantProfile;

function formatCalendarDay(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCalendarTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function distributionProviderLabel(value: DistributionProviderKey | string | null | undefined) {
  switch (String(value || "")) {
    case "facebook_page":
      return "Social page";
    case "instagram_business":
      return "Social account";
    case "future_youtube":
      return "YouTube";
    case "future_tiktok":
    case "future_linkedin":
      return "Future provider";
    default:
      return "Manual upload";
  }
}

export function providerConnectionLabel(value: ProviderConnectionState | string | null | undefined) {
  switch (String(value || "")) {
    case "coming_soon":
      return "Not live yet";
    case "not_connected":
      return "Not connected";
    case "connection_required":
      return "Connection required";
    case "connected":
      return "Connected";
    case "needs_permissions":
      return "Needs permissions";
    case "permission_missing":
      return "Permission missing";
    case "reconnect_required":
      return "Reconnect required";
    case "disabled":
      return "Disabled";
    case "direct_publish_unsupported":
      return "Direct publish unsupported";
    case "metrics_unavailable":
      return "Metrics unavailable";
    default:
      return "Connection required";
  }
}

export function providerPublishLabel(value: ProviderPublishState | string | null | undefined) {
  switch (String(value || "")) {
    case "manual_only":
      return "Manual only";
    case "unavailable":
      return "Unavailable";
    case "ready":
      return "Ready for connected posting";
    case "queued":
      return "Queued";
    case "pending":
      return "Dispatching";
    case "published":
      return "Published";
    case "failed":
      return "Posting failed";
    case "blocked":
      return "Blocked";
    default:
      return "Draft";
  }
}

export function inferDistributionProvider(targetPlatform: string | null | undefined): DistributionProviderKey {
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

export function defaultProviderConnectionState(provider: DistributionProviderKey): ProviderConnectionState {
  switch (provider) {
    case "manual":
      return "connected";
    case "future_youtube":
      return "coming_soon";
    case "future_tiktok":
    case "future_linkedin":
      return "not_connected";
    case "facebook_page":
    case "instagram_business":
      return "not_connected";
    default:
      return "connection_required";
  }
}

function resolveMetaConnectionState(metaReadiness?: MediaMetaReadinessLike | null): ProviderConnectionState | null {
  switch (metaReadiness?.status) {
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
      return null;
  }
}

function isMetaPublishLiveEnabled(metaReadiness?: MediaMetaReadinessLike | null): boolean | null {
  if (!metaReadiness?.capabilities?.publish) return null;
  return Boolean(metaReadiness.capabilities.publish.available && metaReadiness.capabilities.publish.liveEnabled);
}

function hasActualQueuedProviderJob(profile: MediaGrowthInvariantProfile): boolean {
  if (profile.providerQueuedAtIso || profile.providerPendingAtIso) return true;
  if (typeof profile.queueOrder === "number" && Number.isFinite(profile.queueOrder)) return true;
  if (profile.providerStatus === "queued" || profile.providerStatus === "dispatch_pending") return true;
  if (profile.providerPublishState === "queued" && (profile.providerQueuedAtIso || profile.providerStatus === "queued")) return true;
  if (profile.providerPublishState === "pending" && (profile.providerPendingAtIso || profile.providerStatus === "dispatch_pending")) return true;
  return false;
}

function hasActualPublishedProviderResult(profile: MediaGrowthInvariantProfile): boolean {
  return Boolean(profile.providerPostId || profile.providerPublishedAtIso);
}

function hasProviderFailureEvidence(profile: MediaGrowthInvariantProfile): boolean {
  if (profile.providerPublishState === "failed") return true;
  if (profile.workflowState === "provider_failed") return true;
  if (profile.providerLastError && profile.providerLastAttemptAtIso) return true;
  return false;
}

export function resolveProviderContinuity(profile: MediaGrowthInvariantProfile, metaReadiness?: MediaMetaReadinessLike | null) {
  const providerKey = profile.distributionProvider || inferDistributionProvider(profile.targetPlatform);
  const metaPublishLiveEnabled = (providerKey === "facebook_page" || providerKey === "instagram_business")
    ? isMetaPublishLiveEnabled(metaReadiness)
    : null;
  const rawConnectionState = (providerKey === "facebook_page" || providerKey === "instagram_business")
    ? (resolveMetaConnectionState(metaReadiness) || profile.providerConnectionState || defaultProviderConnectionState(providerKey))
    : (profile.providerConnectionState || defaultProviderConnectionState(providerKey));
  const normalizedConnectionState = (providerKey === "facebook_page" || providerKey === "instagram_business") && rawConnectionState === "coming_soon"
    ? "not_connected"
    : rawConnectionState;
  const hasQueuedJob = hasActualQueuedProviderJob(profile);
  const hasPublishedPost = hasActualPublishedProviderResult(profile);
  const hasFailure = hasProviderFailureEvidence(profile);
  const isManualRecorded = profile.workflowState === "posted_manually" || Boolean(profile.postedAtIso && !hasPublishedPost);
  const connectionState = (providerKey === "facebook_page" || providerKey === "instagram_business")
    && metaPublishLiveEnabled === false
    && normalizedConnectionState === "connected"
    && !hasPublishedPost
    && !isManualRecorded
      ? "direct_publish_unsupported"
      : normalizedConnectionState;
  const rawPublishState = isManualRecorded
    ? "manual_only"
    : hasPublishedPost
      ? "published"
      : providerKey === "future_youtube"
        ? "manual_only"
        : providerKey !== "manual" && (profile.providerPublishState === "unavailable" || connectionState === "direct_publish_unsupported")
            ? "unavailable"
            : providerKey !== "manual" && (profile.providerPublishState === "blocked" || connectionState !== "connected")
              ? "blocked"
              : hasFailure
                ? "failed"
                : hasQueuedJob
                  ? (profile.providerPendingAtIso || profile.providerStatus === "dispatch_pending" ? "pending" : "queued")
                  : profile.workflowState === "approved"
                    ? "ready"
                    : providerKey === "manual"
                      ? "manual_only"
                      : "draft";
  const blocked = rawPublishState === "blocked" || rawPublishState === "unavailable";
  const providerError = typeof profile.providerLastError === "string" ? profile.providerLastError.trim() : "";
  const detail = isManualRecorded || providerKey === "manual"
    ? "Manual posting is available now. Open or download the asset, then track the manual post here."
    : hasFailure && providerError
      ? providerError
      : blocked && providerError
        ? providerError
        : providerKey === "future_youtube"
          ? "YouTube planning is available here now. Upload and analytics stay manual until direct sync is ready."
          : providerKey === "facebook_page" || providerKey === "instagram_business"
            ? metaPublishLiveEnabled === false
              ? "Meta is connected, but Media Library still does not send live provider posts from this flow yet. Use manual posting and keep planning inside Purely."
              : connectionState === "connected"
              ? "A connected publishing provider is available, but direct publishing stays off. Use manual posting and track the result here."
              : connectionState === "needs_permissions" || connectionState === "permission_missing"
                ? "Provider access is incomplete, so direct publishing stays blocked. Use manual posting and keep the schedule here."
                : connectionState === "reconnect_required"
                  ? "Reconnect the provider before direct publishing can continue. Until then, use manual posting."
                  : connectionState === "disabled"
                    ? "Provider connection is disabled in this environment. Use manual posting and keep planning inside Purely."
                    : connectionState === "not_connected"
                      ? "Direct publishing is not connected from this workspace yet. Use manual posting and keep planning inside Purely."
                      : "Direct provider publishing is not available yet. Use manual posting and keep planning inside Purely."
            : "This provider is future-facing. Manual posting is available now while direct provider continuity is not connected yet.";
  const metricsLabel = providerKey === "future_youtube"
    ? "YouTube analytics stay unavailable until Google OAuth, API scopes, quota, and app verification are ready."
    : (providerKey === "facebook_page" || providerKey === "instagram_business") && metaPublishLiveEnabled === false
      ? "Metrics stay unavailable until Media Library can create a real provider post from this flow."
    : (providerKey === "facebook_page" || providerKey === "instagram_business") && connectionState !== "connected"
      ? "Metrics stay unavailable until a connected provider post exists."
      : profile.metricsSyncedAtIso
        ? `Metrics synced ${formatCalendarDay(profile.metricsSyncedAtIso)} at ${formatCalendarTime(profile.metricsSyncedAtIso)}`
        : hasPublishedPost
          ? "Metrics are pending or unavailable from the provider."
          : "Metrics require a connected provider post.";

  return {
    providerKey,
    providerLabel: distributionProviderLabel(providerKey),
    connectionState,
    connectionLabel: providerConnectionLabel(connectionState),
    publishState: rawPublishState as ProviderPublishState,
    publishLabel: providerPublishLabel(rawPublishState),
    blocked,
    detail,
    metricsLabel,
    hasQueuedJob,
    hasPublishedPost,
  };
}

export function normalizeMediaGrowthProfileForSave<T extends MediaGrowthSaveShape>(
  current: T,
  partial?: Partial<T>,
  options?: { nowIso?: string },
): T {
  const next = {
    ...current,
    ...partial,
  } as T;

  next.distributionProvider = (next.distributionProvider || inferDistributionProvider(next.targetPlatform)) as T["distributionProvider"];
  next.providerConnectionState = (next.providerConnectionState || defaultProviderConnectionState(next.distributionProvider || "manual")) as T["providerConnectionState"];

  const nowIso = options?.nowIso || new Date().toISOString();
  if (next.workflowState === "posted_manually" && !next.postedAtIso) {
    next.postedAtIso = nowIso as T["postedAtIso"];
  }

  if (next.workflowState === "approved" && !next.approvedAtIso) {
    next.approvedAtIso = nowIso as T["approvedAtIso"];
  }

  const continuity = resolveProviderContinuity(next);
  if (!next.providerPublishState || next.workflowState === "posted_manually") {
    next.providerPublishState = continuity.publishState as T["providerPublishState"];
  }

  return next;
}