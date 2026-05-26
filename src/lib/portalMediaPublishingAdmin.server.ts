import { prisma } from "@/lib/db";
import type { MediaDistributionProviderKey, MediaProviderPublishState } from "@/lib/portalMediaGrowth";

export type ProviderJobAdminState = "queued" | "pending" | "blocked" | "failed" | "published" | "manual_only";

export type ProviderJobAdminRecord = {
  ownerId: string;
  ownerLabel: string;
  ownerEmail: string | null;
  ownerVariant: "portal" | "credit";
  mediaItemId: string;
  assetLabel: string;
  assetTag: string | null;
  providerKey: MediaDistributionProviderKey;
  providerLabel: string;
  destinationLabel: string | null;
  destinationId: string | null;
  scheduledForIso: string | null;
  state: ProviderJobAdminState;
  stateLabel: string;
  stateReason: string;
  lastAttemptAtIso: string | null;
  providerError: string | null;
  providerPostId: string | null;
  retryEligible: boolean;
  providerPublishedAtIso: string | null;
};

type ProviderJobAdminRow = {
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerVariant: string | null;
  mediaItemId: string;
  assetLabel: string | null;
  assetTag: string | null;
  distributionProvider: string | null;
  providerPublishState: string | null;
  providerConnectionState: string | null;
  providerDestinationId: string | null;
  providerDestinationLabel: string | null;
  providerScheduledForAt: Date | string | null;
  providerPendingAt: Date | string | null;
  providerQueuedAt: Date | string | null;
  providerLastAttemptAt: Date | string | null;
  providerLastError: string | null;
  providerRetryEligible: boolean | null;
  providerPostId: string | null;
  providerPublishedAt: Date | string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeProviderKey(value: string | null | undefined): MediaDistributionProviderKey {
  switch (String(value || "")) {
    case "facebook_page":
    case "instagram_business":
    case "future_youtube":
    case "future_tiktok":
    case "future_linkedin":
    case "manual":
      return value as MediaDistributionProviderKey;
    default:
      return "manual";
  }
}

function providerLabel(value: MediaDistributionProviderKey) {
  switch (value) {
    case "facebook_page":
      return "Facebook";
    case "instagram_business":
      return "Instagram";
    case "future_youtube":
      return "YouTube";
    case "future_tiktok":
      return "TikTok";
    case "future_linkedin":
      return "LinkedIn";
    default:
      return "Manual";
  }
}

function blockedReason(row: ProviderJobAdminRow) {
  const message = String(row.providerLastError || "").trim();
  const connectionState = String(row.providerConnectionState || "").trim();
  const normalized = message.toLowerCase();

  if (connectionState === "not_connected" || connectionState === "connection_required") return "Blocked because provider is not connected";
  if (connectionState === "needs_permissions" || connectionState === "permission_missing") return "Blocked because provider permissions are missing";
  if (connectionState === "reconnect_required") return "Blocked because provider needs to reconnect";
  if (connectionState === "coming_soon" || connectionState === "direct_publish_unsupported" || connectionState === "disabled") {
    return "Blocked because provider publishing is not available yet";
  }

  if (normalized.includes("not connected")) return "Blocked because provider is not connected";
  if (normalized.includes("publish time")) return "Blocked because scheduled publish time is missing";
  if (normalized.includes("permission")) return "Blocked because provider permissions are missing";
  if (normalized.includes("reconnect")) return "Blocked because provider needs to reconnect";
  if (normalized.includes("approval") || normalized.includes("app review")) return "Blocked because provider approval is not ready";
  if (normalized.includes("youtube direct publishing is not live") || normalized.includes("not available")) return "Blocked because provider publishing is not available yet";
  return message || "Blocked because provider readiness is incomplete";
}

function failedReason(row: ProviderJobAdminRow) {
  const message = String(row.providerLastError || "").trim();
  if (message.toLowerCase().includes("did not send any external post")) {
    return "Failed at the queue boundary before any live provider post";
  }
  return message || "Provider publish failed";
}

function effectiveState(row: ProviderJobAdminRow): ProviderJobAdminState | null {
  const rawState = String(row.providerPublishState || "").trim() as MediaProviderPublishState | "";
  if (rawState === "published" || row.providerPostId || row.providerPublishedAt) return "published";
  if (rawState === "pending" || row.providerPendingAt) return "pending";
  if (rawState === "queued" || row.providerQueuedAt) return "queued";
  if (rawState === "failed") return "failed";
  if (rawState === "blocked" || rawState === "unavailable") return "blocked";
  if (rawState === "manual_only" || normalizeProviderKey(row.distributionProvider) === "manual") return "manual_only";
  return null;
}

function stateLabel(state: ProviderJobAdminState) {
  switch (state) {
    case "queued":
      return "Queued";
    case "pending":
      return "Pending";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    case "published":
      return "Published by provider";
    default:
      return "Manual-only";
  }
}

function stateReason(state: ProviderJobAdminState, row: ProviderJobAdminRow) {
  switch (state) {
    case "queued":
      return row.providerScheduledForAt ? "Waiting for scheduled time" : "Queued for provider publishing";
    case "pending":
      return "Waiting for provider dispatch";
    case "blocked":
      return blockedReason(row);
    case "failed":
      return failedReason(row);
    case "published":
      return "Published by provider";
    default:
      return "Manual-only path";
  }
}

function ownerVariant(value: string | null | undefined): "portal" | "credit" {
  return String(value || "PORTAL").toUpperCase() === "CREDIT" ? "credit" : "portal";
}

function ownerLabel(row: ProviderJobAdminRow) {
  const name = String(row.ownerName || "").trim();
  const email = String(row.ownerEmail || "").trim();
  return name || email || row.ownerId;
}

export async function listProviderPublishingAdminRecords(filters?: {
  state?: ProviderJobAdminState | null;
  ownerQuery?: string | null;
  query?: string | null;
  take?: number;
}) {
  const take = Math.max(1, Math.min(filters?.take || 200, 500));
  const ownerQuery = String(filters?.ownerQuery || "").trim().toLowerCase();
  const query = String(filters?.query || "").trim().toLowerCase();

  const rows = await prisma.$queryRaw<ProviderJobAdminRow[]>`
SELECT
  growth."ownerId",
  users."name" AS "ownerName",
  users."email" AS "ownerEmail",
  users."clientPortalVariant" AS "ownerVariant",
  growth."mediaItemId",
  media."fileName" AS "assetLabel",
  media."tag" AS "assetTag",
  growth."distributionProvider",
  growth."providerPublishState",
  growth."providerConnectionState",
  growth."providerDestinationId",
  growth."providerDestinationLabel",
  growth."providerScheduledForAt",
  growth."providerPendingAt",
  growth."providerQueuedAt",
  growth."providerLastAttemptAt",
  growth."providerLastError",
  growth."providerRetryEligible",
  growth."providerPostId",
  growth."providerPublishedAt"
FROM "PortalMediaGrowthProfile" growth
INNER JOIN "PortalMediaItem" media ON media."id" = growth."mediaItemId"
INNER JOIN "User" users ON users."id" = growth."ownerId"
WHERE (
  COALESCE(growth."providerPublishState", '') <> ''
  OR COALESCE(growth."distributionProvider", '') <> ''
  OR COALESCE(growth."providerQueuedAt", NULL) IS NOT NULL
  OR COALESCE(growth."providerPendingAt", NULL) IS NOT NULL
  OR COALESCE(growth."providerPublishedAt", NULL) IS NOT NULL
  OR COALESCE(growth."providerPostId", '') <> ''
  OR COALESCE(growth."providerLastError", '') <> ''
)
ORDER BY COALESCE(growth."providerScheduledForAt", growth."providerPublishedAt", growth."providerLastAttemptAt", growth."updatedAt", growth."createdAt") DESC
LIMIT ${take};
  `;

  return rows
    .map((row) => {
      const state = effectiveState(row);
      if (!state) return null;
      const providerKey = normalizeProviderKey(row.distributionProvider);
      const record: ProviderJobAdminRecord = {
        ownerId: row.ownerId,
        ownerLabel: ownerLabel(row),
        ownerEmail: row.ownerEmail || null,
        ownerVariant: ownerVariant(row.ownerVariant),
        mediaItemId: row.mediaItemId,
        assetLabel: String(row.assetLabel || row.mediaItemId),
        assetTag: row.assetTag || null,
        providerKey,
        providerLabel: providerLabel(providerKey),
        destinationLabel: row.providerDestinationLabel || null,
        destinationId: row.providerDestinationId || null,
        scheduledForIso: toIso(row.providerScheduledForAt),
        state,
        stateLabel: stateLabel(state),
        stateReason: stateReason(state, row),
        lastAttemptAtIso: toIso(row.providerLastAttemptAt),
        providerError: row.providerLastError || null,
        providerPostId: row.providerPostId || null,
        retryEligible: Boolean(row.providerRetryEligible),
        providerPublishedAtIso: toIso(row.providerPublishedAt),
      };
      return record;
    })
    .filter((record): record is ProviderJobAdminRecord => Boolean(record))
    .filter((record) => !filters?.state || record.state === filters.state)
    .filter((record) => {
      if (!ownerQuery) return true;
      return [record.ownerId, record.ownerLabel, record.ownerEmail, record.ownerVariant].some((value) => String(value || "").toLowerCase().includes(ownerQuery));
    })
    .filter((record) => {
      if (!query) return true;
      return [
        record.assetLabel,
        record.assetTag,
        record.providerLabel,
        record.destinationLabel,
        record.destinationId,
        record.stateLabel,
        record.stateReason,
        record.providerError,
        record.providerPostId,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
}
