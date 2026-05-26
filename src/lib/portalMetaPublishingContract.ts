export const META_INSTAGRAM_FEED_REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
] as const;

export type MetaInstagramFeedDryRunBlockerCode =
  | "meta_provider_not_ready"
  | "meta_connection_missing"
  | "meta_reconnect_required"
  | "meta_publish_scopes_missing"
  | "meta_destination_missing"
  | "meta_destination_invalid"
  | "meta_schedule_invalid"
  | "meta_media_missing"
  | "meta_public_asset_url_missing"
  | "meta_asset_unsupported_type"
  | "meta_asset_too_large"
  | "meta_asset_format_unsupported"
  | "meta_asset_probe_failed"
  | "meta_asset_aspect_invalid"
  | "meta_live_publish_disabled";

export type MetaConnectionState =
  | "coming_soon"
  | "disabled"
  | "not_connected"
  | "connected"
  | "needs_permissions"
  | "reconnect_required";

export type MetaInstagramFeedDryRunBlocker = {
  code: MetaInstagramFeedDryRunBlockerCode;
  message: string;
  field: "connection" | "permissions" | "destination" | "schedule" | "asset" | "publish";
};

export type MetaInstagramFeedPublishSnapshot = {
  connection: {
    state: MetaConnectionState;
    connectedAccountLabel: string | null;
    connectedMetaUserId: string | null;
    hasAccessToken: boolean;
    accessTokenExpiresAtIso: string | null;
    grantedScopes: string[];
    permissionGaps: string[];
  };
  profile: {
    distributionProvider: string | null;
    targetPlatform: string | null;
    captionDraft: string | null;
    providerDestinationType: string | null;
    providerDestinationId: string | null;
    providerDestinationLabel: string | null;
    providerScheduledForIso: string | null;
  };
  asset: {
    mediaItemId: string;
    fileName: string;
    mimeType: string;
    fileSize: number | null;
    resolvedPublicUrl: string | null;
    format: "jpeg" | "png" | "gif" | "webp" | "unknown" | null;
    width: number | null;
    height: number | null;
    probeError: string | null;
  };
  livePublishApproved: boolean;
};

export type MetaInstagramFeedDryRunResult = {
  provider: "meta";
  target: "instagram_feed";
  mode: "dry_run";
  state: "blocked" | "ready_but_live_disabled";
  summary: string;
  blockers: MetaInstagramFeedDryRunBlocker[];
  requiredScopes: string[];
  missingScopes: string[];
  connection: MetaInstagramFeedPublishSnapshot["connection"];
  destination: {
    type: string | null;
    id: string | null;
    label: string | null;
  };
  asset: MetaInstagramFeedPublishSnapshot["asset"];
  plannedRequest: {
    createContainerPath: string | null;
    publishPath: string | null;
    imageUrl: string | null;
    caption: string | null;
    scheduledForIso: string | null;
  };
  livePublishEnabled: false;
};

const META_INSTAGRAM_ALLOWED_DESTINATION_TYPES = new Set(["instagram_business", "instagram_professional"]);
const META_INSTAGRAM_MIN_ASPECT = 4 / 5;
const META_INSTAGRAM_MAX_ASPECT = 1.91;
const META_INSTAGRAM_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function normalizeScopes(value: readonly string[]): string[] {
  return Array.from(new Set(value.map((entry) => normalizeString(entry)).filter((entry): entry is string => Boolean(entry)))).sort();
}

function buildBlockedSummary(blockers: MetaInstagramFeedDryRunBlocker[]): string {
  const primary = blockers[0];
  if (!primary) {
    return "Meta dry-run blocked before publishing, but Purely could not derive a specific blocker.";
  }
  if (blockers.length === 1) return primary.message;
  return `${primary.message} ${blockers.length - 1} additional Meta publishing requirement${blockers.length === 2 ? " is" : "s are"} still unresolved.`;
}

export function inspectMetaInstagramFeedPublishDryRun(
  snapshot: MetaInstagramFeedPublishSnapshot,
): MetaInstagramFeedDryRunResult {
  const blockers: MetaInstagramFeedDryRunBlocker[] = [];
  const requiredScopes = normalizeScopes(META_INSTAGRAM_FEED_REQUIRED_SCOPES);
  const grantedScopes = normalizeScopes(snapshot.connection.grantedScopes || []);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
  const provider = normalizeString(snapshot.profile.distributionProvider);
  const destinationType = normalizeString(snapshot.profile.providerDestinationType);
  const destinationId = normalizeString(snapshot.profile.providerDestinationId);
  const destinationLabel = normalizeString(snapshot.profile.providerDestinationLabel);
  const scheduledForIso = normalizeString(snapshot.profile.providerScheduledForIso);
  const caption = normalizeString(snapshot.profile.captionDraft);
  const resolvedPublicUrl = normalizeString(snapshot.asset.resolvedPublicUrl);
  const aspectRatio = snapshot.asset.width && snapshot.asset.height ? snapshot.asset.width / snapshot.asset.height : null;

  if (snapshot.connection.state === "coming_soon" || snapshot.connection.state === "disabled") {
    blockers.push({
      code: "meta_provider_not_ready",
      field: "connection",
      message: "Purely's Meta publishing shell is not configured for a publishable connection in this environment yet.",
    });
  }

  if (snapshot.connection.state === "not_connected") {
    blockers.push({
      code: "meta_connection_missing",
      field: "connection",
      message: "Connect a Meta account before trying to validate or publish an Instagram feed post from Media Library.",
    });
  }

  if (
    snapshot.connection.state === "reconnect_required"
    || !snapshot.connection.hasAccessToken
    || (snapshot.connection.accessTokenExpiresAtIso
      && Number.isFinite(new Date(snapshot.connection.accessTokenExpiresAtIso).getTime())
      && new Date(snapshot.connection.accessTokenExpiresAtIso).getTime() <= Date.now())
  ) {
    blockers.push({
      code: "meta_reconnect_required",
      field: "connection",
      message: "Reconnect Meta before publishing. The saved access token is missing, expired, or no longer valid for provider work.",
    });
  }

  if (snapshot.connection.state === "needs_permissions" || missingScopes.length > 0) {
    blockers.push({
      code: "meta_publish_scopes_missing",
      field: "permissions",
      message: `The saved Meta connection does not include the Instagram publish scope set yet. Purely needs ${requiredScopes.join(", ")} before an Instagram feed post can proceed.`,
    });
  }

  if (provider !== "instagram_business") {
    blockers.push({
      code: "meta_destination_invalid",
      field: "destination",
      message: "This validator only supports the Meta Instagram business feed path in this first slice.",
    });
  }

  if (!destinationId) {
    blockers.push({
      code: "meta_destination_missing",
      field: "destination",
      message: "No Instagram professional account destination ID is saved for this asset yet.",
    });
  }

  if (destinationId && (!destinationType || !META_INSTAGRAM_ALLOWED_DESTINATION_TYPES.has(destinationType))) {
    blockers.push({
      code: "meta_destination_invalid",
      field: "destination",
      message: "The saved Meta destination is not marked as an Instagram professional account.",
    });
  }

  if (scheduledForIso && !Number.isFinite(new Date(scheduledForIso).getTime())) {
    blockers.push({
      code: "meta_schedule_invalid",
      field: "schedule",
      message: "The provider publish time is not a valid ISO timestamp.",
    });
  }

  if (!normalizeString(snapshot.asset.mediaItemId)) {
    blockers.push({
      code: "meta_media_missing",
      field: "asset",
      message: "Purely could not resolve the media item needed for Meta dry-run validation.",
    });
  }

  if (!resolvedPublicUrl) {
    blockers.push({
      code: "meta_public_asset_url_missing",
      field: "asset",
      message: "Meta requires a publicly reachable image URL for feed publishing, but this asset does not expose one yet.",
    });
  }

  if (!String(snapshot.asset.mimeType || "").toLowerCase().startsWith("image/")) {
    blockers.push({
      code: "meta_asset_unsupported_type",
      field: "asset",
      message: "This first slice only validates single-image Instagram feed posts.",
    });
  }

  if (typeof snapshot.asset.fileSize === "number" && snapshot.asset.fileSize > META_INSTAGRAM_MAX_IMAGE_BYTES) {
    blockers.push({
      code: "meta_asset_too_large",
      field: "asset",
      message: "Instagram feed images must be 8 MB or smaller for the Meta publishing API.",
    });
  }

  if (snapshot.asset.format !== "jpeg") {
    blockers.push({
      code: "meta_asset_format_unsupported",
      field: "asset",
      message: "Instagram feed publishing through Meta requires a JPEG image. The current asset is not a JPEG.",
    });
  }

  if (snapshot.asset.format === "jpeg" && snapshot.asset.probeError) {
    blockers.push({
      code: "meta_asset_probe_failed",
      field: "asset",
      message: `Purely could not confirm the Instagram image dimensions for this asset: ${snapshot.asset.probeError}`,
    });
  }

  if (
    snapshot.asset.format === "jpeg"
    && !snapshot.asset.probeError
    && aspectRatio !== null
    && (aspectRatio < META_INSTAGRAM_MIN_ASPECT || aspectRatio > META_INSTAGRAM_MAX_ASPECT)
  ) {
    blockers.push({
      code: "meta_asset_aspect_invalid",
      field: "asset",
      message: "Instagram feed images must stay within Meta's 4:5 to 1.91:1 aspect window.",
    });
  }

  if (blockers.length > 0) {
    return {
      provider: "meta",
      target: "instagram_feed",
      mode: "dry_run",
      state: "blocked",
      summary: buildBlockedSummary(blockers),
      blockers,
      requiredScopes,
      missingScopes,
      connection: snapshot.connection,
      destination: {
        type: destinationType,
        id: destinationId,
        label: destinationLabel,
      },
      asset: snapshot.asset,
      plannedRequest: {
        createContainerPath: destinationId ? `/${destinationId}/media` : null,
        publishPath: destinationId ? `/${destinationId}/media_publish` : null,
        imageUrl: resolvedPublicUrl,
        caption,
        scheduledForIso,
      },
      livePublishEnabled: false,
    };
  }

  return {
    provider: "meta",
    target: "instagram_feed",
    mode: "dry_run",
    state: "ready_but_live_disabled",
    summary: "Meta dry-run passed the saved connection, destination, and asset contract checks, but live Instagram publishing is still intentionally disabled in Purely.",
    blockers: [
      {
        code: "meta_live_publish_disabled",
        field: "publish",
        message: "Purely verified the dry-run contract, but live Meta publishing stays off until app review, destination discovery, and the real publish path are explicitly enabled.",
      },
    ],
    requiredScopes,
    missingScopes,
    connection: snapshot.connection,
    destination: {
      type: destinationType,
      id: destinationId,
      label: destinationLabel,
    },
    asset: snapshot.asset,
    plannedRequest: {
      createContainerPath: destinationId ? `/${destinationId}/media` : null,
      publishPath: destinationId ? `/${destinationId}/media_publish` : null,
      imageUrl: resolvedPublicUrl,
      caption,
      scheduledForIso,
    },
    livePublishEnabled: false,
  };
}