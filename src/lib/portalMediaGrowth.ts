import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { getExternalBookingLinkConfig } from "@/lib/externalBookingLink";
import { ensurePortalMediaGrowthSchema } from "@/lib/portalMediaGrowthSchema";

export const MEDIA_GROWTH_STATES = [
  "needs_review",
  "needs_caption",
  "needs_approval",
  "approved",
  "ready_to_use",
  "planned",
  "provider_blocked",
  "queued",
  "provider_failed",
  "posted_manually",
  "used_in_campaign",
] as const;

export const MEDIA_DISTRIBUTION_PROVIDER_KEYS = ["manual", "facebook_page", "instagram_business", "future_youtube", "future_tiktok", "future_linkedin"] as const;

export const MEDIA_PROVIDER_CONNECTION_STATES = [
  "coming_soon",
  "not_connected",
  "connection_required",
  "connected",
  "needs_permissions",
  "permission_missing",
  "reconnect_required",
  "disabled",
  "direct_publish_unsupported",
  "metrics_unavailable",
] as const;

export const MEDIA_PROVIDER_PUBLISH_STATES = ["manual_only", "draft", "ready", "queued", "published", "failed", "blocked"] as const;

export type MediaGrowthState = (typeof MEDIA_GROWTH_STATES)[number];
export type MediaDistributionProviderKey = (typeof MEDIA_DISTRIBUTION_PROVIDER_KEYS)[number];
export type MediaProviderConnectionState = (typeof MEDIA_PROVIDER_CONNECTION_STATES)[number];
export type MediaProviderPublishState = (typeof MEDIA_PROVIDER_PUBLISH_STATES)[number];

export type PortalMediaGrowthProfile = {
  mediaItemId: string;
  workflowState: MediaGrowthState;
  assetPurpose: string | null;
  relatedOffer: string | null;
  targetPlatform: string | null;
  campaignLabel: string | null;
  captionDraft: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  notes: string | null;
  bookingLinkUrl: string | null;
  funnelId: string | null;
  funnelName: string | null;
  funnelSlug: string | null;
  funnelPageId: string | null;
  funnelPageTitle: string | null;
  funnelPageSlug: string | null;
  plannedForIso: string | null;
  approvedAtIso: string | null;
  postedAtIso: string | null;
  postedUrl: string | null;
  distributionProvider: MediaDistributionProviderKey | null;
  providerConnectionState: MediaProviderConnectionState | null;
  providerPublishState: MediaProviderPublishState | null;
  providerAccountLabel: string | null;
  queueOrder: number | null;
  dailyPostCap: number | null;
  providerPostId: string | null;
  providerLastError: string | null;
  providerLastAttemptAtIso: string | null;
  providerPublishedAtIso: string | null;
  metricsImpressions: number | null;
  metricsReach: number | null;
  metricsEngagementCount: number | null;
  metricsClickCount: number | null;
  metricsSyncedAtIso: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

export type PortalMediaGrowthContext = {
  bookingLink: {
    configured: boolean;
    enabled: boolean;
    providerKey: string;
    providerLabel: string;
    url: string | null;
    offerName: string | null;
    handoffMode: string;
  } | null;
  funnels: Array<{ id: string; name: string; slug: string; status: string; updatedAtIso: string }>;
  funnelPages: Array<{ id: string; funnelId: string; title: string; slug: string; updatedAtIso: string }>;
};

export type PortalMediaGrowthProfileInput = Partial<{
  workflowState: string | null;
  assetPurpose: string | null;
  relatedOffer: string | null;
  targetPlatform: string | null;
  campaignLabel: string | null;
  captionDraft: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  notes: string | null;
  bookingLinkUrl: string | null;
  funnelId: string | null;
  funnelName: string | null;
  funnelSlug: string | null;
  funnelPageId: string | null;
  funnelPageTitle: string | null;
  funnelPageSlug: string | null;
  plannedForIso: string | null;
  approvedAtIso: string | null;
  postedAtIso: string | null;
  postedUrl: string | null;
  distributionProvider: string | null;
  providerConnectionState: string | null;
  providerPublishState: string | null;
  providerAccountLabel: string | null;
  queueOrder: number | null;
  dailyPostCap: number | null;
  providerPostId: string | null;
  providerLastError: string | null;
  providerLastAttemptAtIso: string | null;
  providerPublishedAtIso: string | null;
  metricsImpressions: number | null;
  metricsReach: number | null;
  metricsEngagementCount: number | null;
  metricsClickCount: number | null;
  metricsSyncedAtIso: string | null;
}>;

type GrowthRow = {
  mediaItemId: string;
  workflowState: string | null;
  assetPurpose: string | null;
  relatedOffer: string | null;
  targetPlatform: string | null;
  campaignLabel: string | null;
  captionDraft: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  notes: string | null;
  bookingLinkUrl: string | null;
  funnelId: string | null;
  funnelName: string | null;
  funnelSlug: string | null;
  funnelPageId: string | null;
  funnelPageTitle: string | null;
  funnelPageSlug: string | null;
  plannedForAt: Date | string | null;
  approvedAt: Date | string | null;
  postedAt: Date | string | null;
  postedUrl: string | null;
  distributionProvider: string | null;
  providerConnectionState: string | null;
  providerPublishState: string | null;
  providerAccountLabel: string | null;
  queueOrder: number | null;
  dailyPostCap: number | null;
  providerPostId: string | null;
  providerLastError: string | null;
  providerLastAttemptAt: Date | string | null;
  providerPublishedAt: Date | string | null;
  metricsImpressions: number | null;
  metricsReach: number | null;
  metricsEngagementCount: number | null;
  metricsClickCount: number | null;
  metricsSyncedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

function normalizeString(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.replace(/[\r\n\t\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalizeMultiline(value: unknown, max = 12000): string {
  return typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "";
}

function normalizeUrl(value: unknown, max = 2000): string | null {
  const next = normalizeString(value, max);
  if (!next) return null;
  try {
    const url = new URL(next);
    return url.toString().slice(0, max);
  } catch {
    return null;
  }
}

function normalizeNullableString(value: unknown, max = 4000): string | null {
  const next = normalizeString(value, max);
  return next || null;
}

function normalizeNullableMultiline(value: unknown, max = 12000): string | null {
  const next = normalizeMultiline(value, max);
  return next || null;
}

function normalizeEnumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const raw = normalizeString(value, 120).toLowerCase();
  return (allowed as readonly string[]).includes(raw) ? (raw as T[number]) : fallback;
}

function normalizeState(value: unknown): MediaGrowthState {
  return normalizeEnumValue(value, MEDIA_GROWTH_STATES, "needs_review");
}

function normalizeDistributionProvider(value: unknown, fallback: MediaDistributionProviderKey): MediaDistributionProviderKey {
  return normalizeEnumValue(value, MEDIA_DISTRIBUTION_PROVIDER_KEYS, fallback);
}

function normalizeProviderConnectionState(value: unknown, fallback: MediaProviderConnectionState): MediaProviderConnectionState {
  return normalizeEnumValue(value, MEDIA_PROVIDER_CONNECTION_STATES, fallback);
}

function normalizeProviderPublishState(value: unknown, fallback: MediaProviderPublishState): MediaProviderPublishState {
  return normalizeEnumValue(value, MEDIA_PROVIDER_PUBLISH_STATES, fallback);
}

function normalizeDate(value: unknown): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeNullableInteger(value: unknown, min = 0, max = 1_000_000_000): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

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

function defaultProviderConnectionState(provider: MediaDistributionProviderKey): MediaProviderConnectionState {
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
      return "coming_soon";
    default:
      return "connection_required";
  }
}

function defaultProviderPublishState(args: {
  workflowState: MediaGrowthState;
  distributionProvider: MediaDistributionProviderKey;
  providerConnectionState: MediaProviderConnectionState;
  providerPostId: string | null;
  providerPublishedAtIso: string | null;
  providerLastError: string | null;
}): MediaProviderPublishState {
  if (args.providerPostId || args.providerPublishedAtIso) return "published";
  if (args.distributionProvider === "future_youtube") return "manual_only";
  if (args.workflowState === "queued") return "queued";
  if (args.workflowState === "provider_failed" || args.providerLastError) return "failed";
  if (args.workflowState === "provider_blocked") return "blocked";
  if (args.distributionProvider !== "manual" && args.providerConnectionState !== "connected") return "blocked";
  if (args.workflowState === "approved") return "ready";
  if (args.distributionProvider === "manual" || args.workflowState === "posted_manually") return "manual_only";
  return "draft";
}

function emptyProfile(mediaItemId: string): PortalMediaGrowthProfile {
  return {
    mediaItemId,
    workflowState: "needs_review",
    assetPurpose: null,
    relatedOffer: null,
    targetPlatform: null,
    campaignLabel: null,
    captionDraft: null,
    ctaLabel: null,
    ctaHref: null,
    notes: null,
    bookingLinkUrl: null,
    funnelId: null,
    funnelName: null,
    funnelSlug: null,
    funnelPageId: null,
    funnelPageTitle: null,
    funnelPageSlug: null,
    plannedForIso: null,
    approvedAtIso: null,
    postedAtIso: null,
    postedUrl: null,
    distributionProvider: null,
    providerConnectionState: null,
    providerPublishState: null,
    providerAccountLabel: null,
    queueOrder: null,
    dailyPostCap: null,
    providerPostId: null,
    providerLastError: null,
    providerLastAttemptAtIso: null,
    providerPublishedAtIso: null,
    metricsImpressions: null,
    metricsReach: null,
    metricsEngagementCount: null,
    metricsClickCount: null,
    metricsSyncedAtIso: null,
    createdAtIso: null,
    updatedAtIso: null,
  };
}

function rowToProfile(row: GrowthRow): PortalMediaGrowthProfile {
  const workflowState = normalizeState(row.workflowState);
  const targetPlatform = normalizeNullableString(row.targetPlatform, 80);
  const distributionProvider = normalizeDistributionProvider(row.distributionProvider, inferDistributionProvider(targetPlatform));
  const providerConnectionState = normalizeProviderConnectionState(row.providerConnectionState, defaultProviderConnectionState(distributionProvider));
  const providerPostId = normalizeNullableString(row.providerPostId, 200);
  const providerLastError = normalizeNullableMultiline(row.providerLastError, 4000);
  const providerPublishedAtIso = toIso(row.providerPublishedAt);
  return {
    mediaItemId: String(row.mediaItemId),
    workflowState,
    assetPurpose: normalizeNullableString(row.assetPurpose, 160),
    relatedOffer: normalizeNullableString(row.relatedOffer, 160),
    targetPlatform,
    campaignLabel: normalizeNullableString(row.campaignLabel, 160),
    captionDraft: normalizeNullableMultiline(row.captionDraft, 12000),
    ctaLabel: normalizeNullableString(row.ctaLabel, 120),
    ctaHref: normalizeUrl(row.ctaHref, 2000),
    notes: normalizeNullableMultiline(row.notes, 12000),
    bookingLinkUrl: normalizeUrl(row.bookingLinkUrl, 2000),
    funnelId: normalizeNullableString(row.funnelId, 80),
    funnelName: normalizeNullableString(row.funnelName, 200),
    funnelSlug: normalizeNullableString(row.funnelSlug, 160),
    funnelPageId: normalizeNullableString(row.funnelPageId, 80),
    funnelPageTitle: normalizeNullableString(row.funnelPageTitle, 200),
    funnelPageSlug: normalizeNullableString(row.funnelPageSlug, 160),
    plannedForIso: toIso(row.plannedForAt),
    approvedAtIso: toIso(row.approvedAt),
    postedAtIso: toIso(row.postedAt),
    postedUrl: normalizeUrl(row.postedUrl, 2000),
    distributionProvider,
    providerConnectionState,
    providerPublishState: normalizeProviderPublishState(
      row.providerPublishState,
      defaultProviderPublishState({
        workflowState,
        distributionProvider,
        providerConnectionState,
        providerPostId,
        providerPublishedAtIso,
        providerLastError,
      }),
    ),
    providerAccountLabel: normalizeNullableString(row.providerAccountLabel, 200),
    queueOrder: normalizeNullableInteger(row.queueOrder, 1, 999),
    dailyPostCap: normalizeNullableInteger(row.dailyPostCap, 1, 20),
    providerPostId,
    providerLastError,
    providerLastAttemptAtIso: toIso(row.providerLastAttemptAt),
    providerPublishedAtIso,
    metricsImpressions: normalizeNullableInteger(row.metricsImpressions, 0, 2_000_000_000),
    metricsReach: normalizeNullableInteger(row.metricsReach, 0, 2_000_000_000),
    metricsEngagementCount: normalizeNullableInteger(row.metricsEngagementCount, 0, 2_000_000_000),
    metricsClickCount: normalizeNullableInteger(row.metricsClickCount, 0, 2_000_000_000),
    metricsSyncedAtIso: toIso(row.metricsSyncedAt),
    createdAtIso: toIso(row.createdAt),
    updatedAtIso: toIso(row.updatedAt),
  };
}

function applyInput(base: PortalMediaGrowthProfile, input: PortalMediaGrowthProfileInput): PortalMediaGrowthProfile {
  const workflowState = input.workflowState === undefined ? base.workflowState : normalizeState(input.workflowState);
  const targetPlatform = input.targetPlatform === undefined ? base.targetPlatform : normalizeNullableString(input.targetPlatform, 80);
  const distributionProvider = input.distributionProvider === undefined
    ? base.distributionProvider || inferDistributionProvider(targetPlatform)
    : normalizeDistributionProvider(input.distributionProvider, inferDistributionProvider(targetPlatform));
  const providerConnectionState = input.providerConnectionState === undefined
    ? base.providerConnectionState || defaultProviderConnectionState(distributionProvider)
    : normalizeProviderConnectionState(input.providerConnectionState, defaultProviderConnectionState(distributionProvider));
  const providerPostId = input.providerPostId === undefined ? base.providerPostId : normalizeNullableString(input.providerPostId, 200);
  const providerLastError = input.providerLastError === undefined ? base.providerLastError : normalizeNullableMultiline(input.providerLastError, 4000);
  const providerPublishedAtIso = input.providerPublishedAtIso === undefined ? base.providerPublishedAtIso : toIso(normalizeDate(input.providerPublishedAtIso));
  return {
    ...base,
    workflowState,
    assetPurpose: input.assetPurpose === undefined ? base.assetPurpose : normalizeNullableString(input.assetPurpose, 160),
    relatedOffer: input.relatedOffer === undefined ? base.relatedOffer : normalizeNullableString(input.relatedOffer, 160),
    targetPlatform,
    campaignLabel: input.campaignLabel === undefined ? base.campaignLabel : normalizeNullableString(input.campaignLabel, 160),
    captionDraft: input.captionDraft === undefined ? base.captionDraft : normalizeNullableMultiline(input.captionDraft, 12000),
    ctaLabel: input.ctaLabel === undefined ? base.ctaLabel : normalizeNullableString(input.ctaLabel, 120),
    ctaHref: input.ctaHref === undefined ? base.ctaHref : normalizeUrl(input.ctaHref, 2000),
    notes: input.notes === undefined ? base.notes : normalizeNullableMultiline(input.notes, 12000),
    bookingLinkUrl: input.bookingLinkUrl === undefined ? base.bookingLinkUrl : normalizeUrl(input.bookingLinkUrl, 2000),
    funnelId: input.funnelId === undefined ? base.funnelId : normalizeNullableString(input.funnelId, 80),
    funnelName: input.funnelName === undefined ? base.funnelName : normalizeNullableString(input.funnelName, 200),
    funnelSlug: input.funnelSlug === undefined ? base.funnelSlug : normalizeNullableString(input.funnelSlug, 160),
    funnelPageId: input.funnelPageId === undefined ? base.funnelPageId : normalizeNullableString(input.funnelPageId, 80),
    funnelPageTitle: input.funnelPageTitle === undefined ? base.funnelPageTitle : normalizeNullableString(input.funnelPageTitle, 200),
    funnelPageSlug: input.funnelPageSlug === undefined ? base.funnelPageSlug : normalizeNullableString(input.funnelPageSlug, 160),
    plannedForIso: input.plannedForIso === undefined ? base.plannedForIso : toIso(normalizeDate(input.plannedForIso)),
    approvedAtIso: input.approvedAtIso === undefined ? base.approvedAtIso : toIso(normalizeDate(input.approvedAtIso)),
    postedAtIso: input.postedAtIso === undefined ? base.postedAtIso : toIso(normalizeDate(input.postedAtIso)),
    postedUrl: input.postedUrl === undefined ? base.postedUrl : normalizeUrl(input.postedUrl, 2000),
    distributionProvider,
    providerConnectionState,
    providerPublishState: input.providerPublishState === undefined
      ? base.providerPublishState || defaultProviderPublishState({
          workflowState,
          distributionProvider,
          providerConnectionState,
          providerPostId,
          providerPublishedAtIso,
          providerLastError,
        })
      : normalizeProviderPublishState(
          input.providerPublishState,
          defaultProviderPublishState({
            workflowState,
            distributionProvider,
            providerConnectionState,
            providerPostId,
            providerPublishedAtIso,
            providerLastError,
          }),
        ),
    providerAccountLabel: input.providerAccountLabel === undefined ? base.providerAccountLabel : normalizeNullableString(input.providerAccountLabel, 200),
    queueOrder: input.queueOrder === undefined ? base.queueOrder : normalizeNullableInteger(input.queueOrder, 1, 999),
    dailyPostCap: input.dailyPostCap === undefined ? base.dailyPostCap : normalizeNullableInteger(input.dailyPostCap, 1, 20),
    providerPostId,
    providerLastError,
    providerLastAttemptAtIso: input.providerLastAttemptAtIso === undefined ? base.providerLastAttemptAtIso : toIso(normalizeDate(input.providerLastAttemptAtIso)),
    providerPublishedAtIso,
    metricsImpressions: input.metricsImpressions === undefined ? base.metricsImpressions : normalizeNullableInteger(input.metricsImpressions, 0, 2_000_000_000),
    metricsReach: input.metricsReach === undefined ? base.metricsReach : normalizeNullableInteger(input.metricsReach, 0, 2_000_000_000),
    metricsEngagementCount: input.metricsEngagementCount === undefined ? base.metricsEngagementCount : normalizeNullableInteger(input.metricsEngagementCount, 0, 2_000_000_000),
    metricsClickCount: input.metricsClickCount === undefined ? base.metricsClickCount : normalizeNullableInteger(input.metricsClickCount, 0, 2_000_000_000),
    metricsSyncedAtIso: input.metricsSyncedAtIso === undefined ? base.metricsSyncedAtIso : toIso(normalizeDate(input.metricsSyncedAtIso)),
  };
}

export async function getPortalMediaGrowthProfiles(ownerId: string, mediaItemIds: string[]): Promise<Map<string, PortalMediaGrowthProfile>> {
  await ensurePortalMediaGrowthSchema().catch(() => null);

  const ids = Array.from(new Set(mediaItemIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return new Map();

  const rows = await prisma.$queryRawUnsafe<GrowthRow[]>(
    `
SELECT
  "mediaItemId",
  "workflowState",
  "assetPurpose",
  "relatedOffer",
  "targetPlatform",
  "campaignLabel",
  "captionDraft",
  "ctaLabel",
  "ctaHref",
  "notes",
  "bookingLinkUrl",
  "funnelId",
  "funnelName",
  "funnelSlug",
  "funnelPageId",
  "funnelPageTitle",
  "funnelPageSlug",
  "plannedForAt",
  "approvedAt",
  "postedAt",
  "postedUrl",
  "distributionProvider",
  "providerConnectionState",
  "providerPublishState",
  "providerAccountLabel",
  "queueOrder",
  "dailyPostCap",
  "providerPostId",
  "providerLastError",
  "providerLastAttemptAt",
  "providerPublishedAt",
  "metricsImpressions",
  "metricsReach",
  "metricsEngagementCount",
  "metricsClickCount",
  "metricsSyncedAt",
  "createdAt",
  "updatedAt"
FROM "PortalMediaGrowthProfile"
WHERE "ownerId" = $1 AND "mediaItemId" = ANY($2::text[]);
    `,
    ownerId,
    ids,
  ).catch(() => []);

  const map = new Map<string, PortalMediaGrowthProfile>();
  for (const row of rows) {
    map.set(String(row.mediaItemId), rowToProfile(row));
  }
  return map;
}

export async function getPortalMediaGrowthProfile(ownerId: string, mediaItemId: string): Promise<PortalMediaGrowthProfile> {
  const map = await getPortalMediaGrowthProfiles(ownerId, [mediaItemId]);
  return map.get(mediaItemId) ?? emptyProfile(mediaItemId);
}

export async function upsertPortalMediaGrowthProfile(
  ownerId: string,
  mediaItemId: string,
  input: PortalMediaGrowthProfileInput,
): Promise<PortalMediaGrowthProfile> {
  await ensurePortalMediaGrowthSchema().catch(() => null);

  const current = await getPortalMediaGrowthProfile(ownerId, mediaItemId);
  const next = applyInput(current, input);
  const now = new Date();

  await prisma.$executeRawUnsafe(
    `
INSERT INTO "PortalMediaGrowthProfile" (
  "id",
  "ownerId",
  "mediaItemId",
  "workflowState",
  "assetPurpose",
  "relatedOffer",
  "targetPlatform",
  "campaignLabel",
  "captionDraft",
  "ctaLabel",
  "ctaHref",
  "notes",
  "bookingLinkUrl",
  "funnelId",
  "funnelName",
  "funnelSlug",
  "funnelPageId",
  "funnelPageTitle",
  "funnelPageSlug",
  "plannedForAt",
  "approvedAt",
  "postedAt",
  "postedUrl",
  "distributionProvider",
  "providerConnectionState",
  "providerPublishState",
  "providerAccountLabel",
  "queueOrder",
  "dailyPostCap",
  "providerPostId",
  "providerLastError",
  "providerLastAttemptAt",
  "providerPublishedAt",
  "metricsImpressions",
  "metricsReach",
  "metricsEngagementCount",
  "metricsClickCount",
  "metricsSyncedAt",
  "createdAt",
  "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
)
ON CONFLICT ("mediaItemId") DO UPDATE SET
  "workflowState" = EXCLUDED."workflowState",
  "assetPurpose" = EXCLUDED."assetPurpose",
  "relatedOffer" = EXCLUDED."relatedOffer",
  "targetPlatform" = EXCLUDED."targetPlatform",
  "campaignLabel" = EXCLUDED."campaignLabel",
  "captionDraft" = EXCLUDED."captionDraft",
  "ctaLabel" = EXCLUDED."ctaLabel",
  "ctaHref" = EXCLUDED."ctaHref",
  "notes" = EXCLUDED."notes",
  "bookingLinkUrl" = EXCLUDED."bookingLinkUrl",
  "funnelId" = EXCLUDED."funnelId",
  "funnelName" = EXCLUDED."funnelName",
  "funnelSlug" = EXCLUDED."funnelSlug",
  "funnelPageId" = EXCLUDED."funnelPageId",
  "funnelPageTitle" = EXCLUDED."funnelPageTitle",
  "funnelPageSlug" = EXCLUDED."funnelPageSlug",
  "plannedForAt" = EXCLUDED."plannedForAt",
  "approvedAt" = EXCLUDED."approvedAt",
  "postedAt" = EXCLUDED."postedAt",
  "postedUrl" = EXCLUDED."postedUrl",
  "distributionProvider" = EXCLUDED."distributionProvider",
  "providerConnectionState" = EXCLUDED."providerConnectionState",
  "providerPublishState" = EXCLUDED."providerPublishState",
  "providerAccountLabel" = EXCLUDED."providerAccountLabel",
  "queueOrder" = EXCLUDED."queueOrder",
  "dailyPostCap" = EXCLUDED."dailyPostCap",
  "providerPostId" = EXCLUDED."providerPostId",
  "providerLastError" = EXCLUDED."providerLastError",
  "providerLastAttemptAt" = EXCLUDED."providerLastAttemptAt",
  "providerPublishedAt" = EXCLUDED."providerPublishedAt",
  "metricsImpressions" = EXCLUDED."metricsImpressions",
  "metricsReach" = EXCLUDED."metricsReach",
  "metricsEngagementCount" = EXCLUDED."metricsEngagementCount",
  "metricsClickCount" = EXCLUDED."metricsClickCount",
  "metricsSyncedAt" = EXCLUDED."metricsSyncedAt",
  "updatedAt" = EXCLUDED."updatedAt";
    `,
    crypto.randomUUID(),
    ownerId,
    mediaItemId,
    next.workflowState,
    next.assetPurpose,
    next.relatedOffer,
    next.targetPlatform,
    next.campaignLabel,
    next.captionDraft,
    next.ctaLabel,
    next.ctaHref,
    next.notes,
    next.bookingLinkUrl,
    next.funnelId,
    next.funnelName,
    next.funnelSlug,
    next.funnelPageId,
    next.funnelPageTitle,
    next.funnelPageSlug,
    next.plannedForIso ? new Date(next.plannedForIso) : null,
    next.approvedAtIso ? new Date(next.approvedAtIso) : null,
    next.postedAtIso ? new Date(next.postedAtIso) : null,
    next.postedUrl,
    next.distributionProvider,
    next.providerConnectionState,
    next.providerPublishState,
    next.providerAccountLabel,
    next.queueOrder,
    next.dailyPostCap,
    next.providerPostId,
    next.providerLastError,
    next.providerLastAttemptAtIso ? new Date(next.providerLastAttemptAtIso) : null,
    next.providerPublishedAtIso ? new Date(next.providerPublishedAtIso) : null,
    next.metricsImpressions,
    next.metricsReach,
    next.metricsEngagementCount,
    next.metricsClickCount,
    next.metricsSyncedAtIso ? new Date(next.metricsSyncedAtIso) : null,
    current.createdAtIso ? new Date(current.createdAtIso) : now,
    now,
  );

  return getPortalMediaGrowthProfile(ownerId, mediaItemId);
}

export async function getPortalMediaGrowthContext(ownerId: string): Promise<PortalMediaGrowthContext> {
  const [bookingConfig, funnels, funnelPages] = await Promise.all([
    getExternalBookingLinkConfig(ownerId).catch(() => null),
    prisma.creditFunnel.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, status: true, updatedAt: true },
      take: 100,
    }).catch(() => []),
    prisma.creditFunnelPage.findMany({
      where: { funnel: { ownerId } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true, funnelId: true, title: true, slug: true, updatedAt: true },
      take: 400,
    }).catch(() => []),
  ]);

  return {
    bookingLink: bookingConfig
      ? {
          configured: Boolean((bookingConfig.normalizedUrl || bookingConfig.sourceUrl || "").trim()),
          enabled: Boolean(bookingConfig.enabled),
          providerKey: String(bookingConfig.providerKey || "unknown"),
          providerLabel: String(bookingConfig.providerLabel || "Booking link"),
          url: normalizeUrl(bookingConfig.normalizedUrl || bookingConfig.sourceUrl, 2000),
          offerName: normalizeNullableString(bookingConfig.offerName, 120),
          handoffMode: String(bookingConfig.handoffMode || "direct_book"),
        }
      : null,
    funnels: funnels.map((f) => ({
      id: String(f.id),
      name: String(f.name || "Untitled funnel"),
      slug: String(f.slug || ""),
      status: String(f.status || "DRAFT"),
      updatedAtIso: f.updatedAt.toISOString(),
    })),
    funnelPages: funnelPages.map((page) => ({
      id: String(page.id),
      funnelId: String(page.funnelId),
      title: String(page.title || "Untitled page"),
      slug: String(page.slug || ""),
      updatedAtIso: page.updatedAt.toISOString(),
    })),
  };
}