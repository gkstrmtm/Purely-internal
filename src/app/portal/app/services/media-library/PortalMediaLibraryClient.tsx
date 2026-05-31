"use client";

import { createPortal } from "react-dom";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";

import { AppModal } from "@/components/AppModal";
import { InlineSpinner } from "@/components/InlineSpinner";
import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
import PortalImageCropModal, { type AspectPreset } from "@/components/PortalImageCropModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import {
  defaultProviderConnectionState,
  distributionProviderLabel,
  inferDistributionProvider,
  normalizeMediaGrowthProfileForSave,
  providerConnectionLabel,
  providerPublishLabel,
  resolveProviderContinuity,
} from "@/lib/mediaGrowthInvariants";
import type { PortalMetaProviderReadiness } from "@/lib/portalMetaProviderReadiness";
import { PORTAL_VARIANT_HEADER, portalVariantFromPathname } from "@/lib/portalVariant";
import {
  buildMediaLibraryComposerReturnHref,
  buildMetaConnectRequestHref,
  buildProviderSetupWizardHref,
  portalBaseFromWorkspaceVariant,
} from "@/lib/providerSetupWizard";
import { hostedFunnelPath } from "@/lib/publicHostedKeys";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  tag: string;
  createdAt: string;
  shareUrl: string;
  downloadUrl?: string;
  color?: string | null;
};

type PendingMediaLibraryReturnContext = {
  itemId: string | null;
  openComposer: boolean;
  metaConnection: string | null;
  metaMessage: string | null;
};

type ComposerReturnNoticeTone = "emerald" | "amber" | "rose";

type ComposerReturnNotice = {
  tone: ComposerReturnNoticeTone;
  title: string;
  message: string;
};

type Item = {
  id: string;
  folderId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tag: string;
  createdAt: string;
  previewUrl?: string;
  openUrl?: string;
  downloadUrl: string;
  shareUrl: string;
  growthProfile?: MediaGrowthProfile | null;
};

type MediaGrowthState =
  | "needs_review"
  | "needs_caption"
  | "needs_approval"
  | "approved"
  | "ready_to_use"
  | "planned"
  | "provider_blocked"
  | "queued"
  | "provider_failed"
  | "posted_manually"
  | "used_in_campaign";

type DistributionProviderKey = "manual" | "facebook_page" | "instagram_business" | "future_youtube" | "future_tiktok" | "future_linkedin";

type ProviderConnectionState =
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

type ProviderPublishState = "manual_only" | "unavailable" | "draft" | "ready" | "queued" | "pending" | "published" | "failed" | "blocked";

type WorkflowFilterKey = "all" | "scheduled" | "ready" | "needs_copy" | "review" | "manual_only" | "posted";

type ComposerPostStatusTone = "zinc" | "sky" | "amber" | "emerald" | "rose";

type ComposerChecklistStatus = "ready" | "pending" | "blocked";

type ComposerReadinessItem = {
  key: string;
  label: string;
  detail: string;
  status: ComposerChecklistStatus;
};

type WorkspaceVariant = "portal" | "credit";

type ComposerPlatformKind = "instagram" | "facebook" | "youtube" | "manual";

type ComposerPlatformBehavior = {
  kind: ComposerPlatformKind;
  label: string;
  captionFieldLabel: string;
  captionPlaceholder: string;
  guidanceTitle: string;
  guidanceBody: string;
  guidanceDetail: string;
  linkFieldLabel: string;
  linkFieldHelper: string;
  linkFieldPlaceholder: string;
  ctaLabelFieldLabel: string;
  ctaLabelPlaceholder: string;
  savedLinkLabel: string;
  defaultCtaLabel: string;
  starterButtonLabel: string;
  copyButtonLabel: string;
  manualPostingGuidance: string;
  previewLabel: string;
  previewLinkLabel: string;
  previewLinkHelper: string;
  accountLabel: string;
  accountHandle: string;
};

type MediaGrowthProfile = {
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
  distributionProvider: DistributionProviderKey | null;
  providerConnectionState: ProviderConnectionState | null;
  providerPublishState: ProviderPublishState | null;
  providerDestinationType: string | null;
  providerDestinationId: string | null;
  providerDestinationLabel: string | null;
  providerAccountLabel: string | null;
  providerScheduledForIso: string | null;
  providerQueuedAtIso: string | null;
  providerPendingAtIso: string | null;
  queueOrder: number | null;
  dailyPostCap: number | null;
  providerStatus: string | null;
  providerPostId: string | null;
  providerLastError: string | null;
  providerRetryEligible: boolean | null;
  providerRetryAtIso: string | null;
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

type MediaGrowthContext = {
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

type ItemDetailRes =
  | {
      ok: true;
      item: Item;
      context: MediaGrowthContext;
    }
  | { ok: false; error?: string };

type ListRes =
  | {
      ok: true;
      folder: Folder | null;
      breadcrumbs: Folder[];
      folders: Folder[];
      items: Item[];
    }
  | { ok: false; error?: string };

type MetaReadinessRes =
  | {
      ok: true;
      readiness: PortalMetaProviderReadiness;
    }
  | { ok: false; error?: string };

type MetaDestinationOption = {
  value: string;
  label: string;
  hint?: string;
  destinationType: string;
  destinationId: string;
  destinationLabel: string;
  accountLabel: string | null;
};

type AllFoldersRes =
  | { ok: true; folders: Array<{ id: string; parentId: string | null; name: string; tag: string; createdAt: string }> }
  | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init?: RequestInit, timeoutMs?: number | null) {
  let controller: AbortController | null = null;
  let timeoutId: number | null = null;

  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    controller = new AbortController();
    timeoutId = window.setTimeout(() => controller?.abort(), timeoutMs);
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller?.signal,
    });
    const json = (await response.json().catch(() => null)) as T | null;
    return { response, json };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request took too long. Please try again.");
    }
    throw error;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

function MoreDotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </svg>
  );
}

function assetActionClass(options?: { tone?: "neutral" | "success" | "successOutline"; size?: "sm" | "md"; disabled?: boolean }) {
  const tone = options?.tone || "neutral";
  const size = options?.size || "md";
  const disabled = options?.disabled || false;

  return classNames(
    "inline-flex w-full items-center justify-center rounded-2xl border text-center font-semibold leading-tight transition-colors whitespace-normal break-words",
    size === "sm" ? "min-h-10 px-3 py-2 text-sm" : "min-h-11 px-3 py-2.5 text-sm",
    disabled
      ? "pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        : tone === "successOutline"
          ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
  );
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let idx = 0;
  let v = n;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  return `${v.toFixed(v >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function inferFolderAccent(color?: string | null, tag?: string | null, name?: string | null) {
  const explicit = String(color || "").toLowerCase();
  if (explicit) return explicit;

  const text = `${String(tag || "")} ${String(name || "")}`.toLowerCase();
  if (text.includes("b2c")) return "pink";
  if (text.includes("b2b")) return "blue";
  return "default";
}

function itemPreviewKind(item: Item): "image" | "video" | "file" {
  if (item.mimeType.startsWith("image/")) return "image";
  if (item.mimeType.startsWith("video/")) return "video";
  return "file";
}

function itemTypeLabel(item: Item) {
  const ext = item.fileName.includes(".") ? item.fileName.split(".").pop() : "";
  if (ext) return String(ext).toUpperCase();
  if (item.mimeType.startsWith("audio/")) return "AUDIO";
  if (item.mimeType.startsWith("video/")) return "VIDEO";
  if (item.mimeType.startsWith("image/")) return "IMAGE";
  return "FILE";
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const cleanedExtension = nextExtension.replace(/^\./, "");
  const trimmed = String(fileName || "asset").trim() || "asset";
  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  return `${base}.${cleanedExtension}`;
}

function buildPreparedVariantFileName(fileName: string, suffix: string) {
  const trimmed = String(fileName || "asset").trim() || "asset";
  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  return `${base}-${suffix}.png`;
}

function resolveInstagramCropDefaultPreset(targetPlatform: string | null | undefined): AspectPreset {
  switch (String(targetPlatform || "")) {
    case "instagram_story":
      return "9:16";
    case "instagram_post":
      return "4:5";
    default:
      return "original";
  }
}

function resolveInstagramCropOptions(targetPlatform: string | null | undefined): Array<{ value: AspectPreset; label: string }> {
  switch (String(targetPlatform || "")) {
    case "instagram_story":
      return [
        { value: "9:16", label: "Story 9:16" },
        { value: "original", label: "Original" },
      ];
    case "instagram_post":
      return [
        { value: "4:5", label: "Feed 4:5" },
        { value: "1:1", label: "Feed 1:1" },
        { value: "1.91:1", label: "Feed 1.91:1" },
        { value: "9:16", label: "Story 9:16" },
        { value: "original", label: "Original" },
      ];
    default:
      return [
        { value: "original", label: "Original" },
        { value: "1:1", label: "1:1" },
        { value: "4:5", label: "4:5" },
        { value: "1.91:1", label: "1.91:1" },
        { value: "16:9", label: "16:9" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
        { value: "9:16", label: "9:16" },
      ];
  }
}

function resolveComposerPreviewAspectClass(
  targetPlatform: string | null | undefined,
  platformKind: ComposerPlatformKind | null | undefined,
) {
  switch (String(targetPlatform || "")) {
    case "instagram_story":
      return "aspect-[9/16]";
    case "instagram_post":
      return "aspect-[4/5]";
    case "youtube_video":
      return "aspect-video";
    case "facebook_post":
      return "aspect-16/10";
    default:
      break;
  }

  switch (platformKind) {
    case "facebook":
      return "aspect-16/10";
    case "youtube":
      return "aspect-video";
    case "instagram":
      return "aspect-[4/5]";
    default:
      return "aspect-square";
  }
}

function buildPreparedVariantGrowthProfile(source: MediaGrowthProfile, mediaItemId: string): Partial<MediaGrowthProfile> {
  const nextWorkflowState = source.postedAtIso || source.providerPostId || source.providerPublishedAtIso || source.workflowState === "posted_manually"
    ? "ready_to_use"
    : source.workflowState;
  const nextDistributionProvider = source.distributionProvider || inferDistributionProvider(source.targetPlatform);

  return {
    mediaItemId,
    workflowState: nextWorkflowState,
    assetPurpose: source.assetPurpose,
    relatedOffer: source.relatedOffer,
    targetPlatform: source.targetPlatform,
    campaignLabel: source.campaignLabel,
    captionDraft: source.captionDraft,
    ctaLabel: source.ctaLabel,
    ctaHref: source.ctaHref,
    notes: source.notes,
    bookingLinkUrl: source.bookingLinkUrl,
    funnelId: source.funnelId,
    funnelName: source.funnelName,
    funnelSlug: source.funnelSlug,
    funnelPageId: source.funnelPageId,
    funnelPageTitle: source.funnelPageTitle,
    funnelPageSlug: source.funnelPageSlug,
    plannedForIso: source.plannedForIso,
    approvedAtIso: source.approvedAtIso,
    postedAtIso: null,
    postedUrl: null,
    distributionProvider: nextDistributionProvider,
    providerConnectionState: source.providerConnectionState || defaultProviderConnectionState(nextDistributionProvider),
    providerPublishState: nextDistributionProvider === "manual" ? "manual_only" : null,
    providerDestinationType: source.providerDestinationType,
    providerDestinationId: source.providerDestinationId,
    providerDestinationLabel: source.providerDestinationLabel,
    providerAccountLabel: source.providerAccountLabel,
    providerScheduledForIso: source.providerScheduledForIso,
    providerQueuedAtIso: null,
    providerPendingAtIso: null,
    queueOrder: source.queueOrder,
    dailyPostCap: source.dailyPostCap,
    providerStatus: null,
    providerPostId: null,
    providerLastError: null,
    providerRetryEligible: null,
    providerRetryAtIso: null,
    providerLastAttemptAtIso: null,
    providerPublishedAtIso: null,
    metricsImpressions: null,
    metricsReach: null,
    metricsEngagementCount: null,
    metricsClickCount: null,
    metricsSyncedAtIso: null,
  };
}

function emptyGrowthProfile(mediaItemId: string): MediaGrowthProfile {
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
    providerDestinationType: null,
    providerDestinationId: null,
    providerDestinationLabel: null,
    providerAccountLabel: null,
    providerScheduledForIso: null,
    providerQueuedAtIso: null,
    providerPendingAtIso: null,
    queueOrder: null,
    dailyPostCap: null,
    providerStatus: null,
    providerPostId: null,
    providerLastError: null,
    providerRetryEligible: null,
    providerRetryAtIso: null,
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

function growthStateLabel(state: MediaGrowthState | null | undefined) {
  switch (state) {
    case "needs_caption":
      return "Needs copy";
    case "needs_approval":
      return "Review before posting";
    case "approved":
      return "Approved";
    case "ready_to_use":
      return "Ready to plan";
    case "planned":
      return "Planned";
    case "provider_blocked":
      return "Manual posting only";
    case "queued":
      return "Queued";
    case "provider_failed":
      return "Provider failed";
    case "posted_manually":
      return "Posted manually";
    case "used_in_campaign":
      return "Used in campaign";
    default:
      return "Needs review";
  }
}

function targetPlatformLabel(value: string | null | undefined) {
  switch (canonicalComposerTargetPlatform(value, { allowYouTube: true })) {
    case "instagram_post":
      return "Instagram feed post";
    case "instagram_story":
      return "Instagram story";
    case "facebook_post":
      return "Facebook post";
    case "youtube_video":
      return "YouTube video";
    default:
      return "Other/manual post";
  }
}

type ComposerTargetPlatformOptionValue = "" | "instagram_post" | "instagram_story" | "facebook_post" | "youtube_video";

function canonicalComposerTargetPlatform(
  value: string | null | undefined,
  options?: { allowYouTube?: boolean },
): ComposerTargetPlatformOptionValue {
  switch (String(value || "").trim()) {
    case "instagram_post":
      return "instagram_post";
    case "instagram_story":
      return "instagram_story";
    case "facebook_post":
      return "facebook_post";
    case "youtube_video":
      return options?.allowYouTube === false ? "" : "youtube_video";
    default:
      return "";
  }
}

function legacyTargetPlatformLabel(value: string | null | undefined) {
  switch (String(value || "").trim()) {
    case "newsletter":
      return "Newsletter";
    case "email":
      return "Gmail / email";
    case "sms":
      return "SMS";
    case "funnel_hero":
      return "Promo proof / funnel hero";
    case "booking_promo":
      return "Booking";
    case "review_proof":
      return "Review proof";
    default: {
      const raw = String(value || "").trim();
      if (!raw || canonicalComposerTargetPlatform(raw, { allowYouTube: true })) return null;
      return raw
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
    }
  }
}

function resolveVisibleDistributionProvider(
  targetPlatform: string | null | undefined,
  distributionProvider: DistributionProviderKey | null | undefined,
  options?: { allowYouTube?: boolean },
): DistributionProviderKey {
  const canonicalTargetPlatform = canonicalComposerTargetPlatform(targetPlatform, options);
  const inferredProvider = inferDistributionProvider(canonicalTargetPlatform || null);
  const provider = distributionProvider || inferredProvider;

  switch (canonicalTargetPlatform) {
    case "instagram_post":
    case "instagram_story":
      return provider === "manual" || provider === "instagram_business" ? provider : "instagram_business";
    case "facebook_post":
      return provider === "manual" || provider === "facebook_page" ? provider : "facebook_page";
    case "youtube_video":
      return provider === "manual" || provider === "future_youtube" ? provider : "future_youtube";
    default:
      return "manual";
  }
}

function resolveDestinationSummary(
  profile: Pick<MediaGrowthProfile, "providerDestinationLabel" | "providerAccountLabel">,
  provider: DistributionProviderKey,
  behavior: Pick<ComposerPlatformBehavior, "accountLabel" | "accountHandle"> | null,
) {
  const savedLabel = profile.providerDestinationLabel || profile.providerAccountLabel || behavior?.accountLabel || null;
  const savedHandle = behavior?.accountHandle || null;

  switch (provider) {
    case "instagram_business":
      return {
        label: "Instagram account",
        detail: savedLabel
          ? `${savedLabel}${savedHandle ? ` · ${savedHandle}` : ""}`
          : (savedHandle || "Destination stays on the Instagram account lane."),
      };
    case "facebook_page":
      return {
        label: "Facebook Page",
        detail: savedLabel
          ? `${savedLabel}${savedHandle ? ` · ${savedHandle}` : ""}`
          : (savedHandle || "Destination stays on the Facebook Page lane."),
      };
    case "future_youtube":
      return {
        label: "YouTube channel",
        detail: savedLabel
          ? `${savedLabel}${savedHandle ? ` · ${savedHandle}` : ""}`
          : (savedHandle || "YouTube remains manual/future-only until real provider support exists."),
      };
    default:
      return {
        label: "Manual / external channel",
        detail: savedLabel
          ? `${savedLabel}${savedHandle ? ` · ${savedHandle}` : ""}`
          : "Purely stores the plan here, but the real post still goes out through your manual or external lane.",
      };
  }
}

function metaTargetMatchesProvider(account: PortalMetaProviderReadiness["targetAccounts"][number], provider: DistributionProviderKey) {
  if (provider === "instagram_business") return account.kind === "instagram_professional";
  if (provider === "facebook_page") return account.kind === "facebook_page";
  return false;
}

function buildMetaDestinationOption(account: PortalMetaProviderReadiness["targetAccounts"][number]): MetaDestinationOption | null {
  if (!account.destinationId || !account.destinationType) return null;
  return {
    value: account.key,
    label: account.label,
    hint: account.reason || undefined,
    destinationType: account.destinationType,
    destinationId: account.destinationId,
    destinationLabel: account.label,
    accountLabel: account.label,
  };
}

function clearMetaDestinationBlocker(profile: MediaGrowthProfile): MediaGrowthProfile {
  const shouldClear = profile.providerStatus === "meta_destination_missing" || profile.providerStatus === "meta_destination_invalid";
  if (!shouldClear) return profile;

  return {
    ...profile,
    providerStatus: null,
    providerLastError: null,
    providerPublishState: profile.providerPublishState === "blocked" ? "draft" : profile.providerPublishState,
  };
}

function simplifyComposerWorkflowState(profile: MediaGrowthProfile): MediaGrowthState {
  if (profile.workflowState === "posted_manually" || profile.postedAtIso) return "posted_manually";
  if (profile.workflowState === "used_in_campaign") return "used_in_campaign";
  return profile.plannedForIso ? "planned" : "needs_review";
}

function buildComposerSavePartial(
  current: MediaGrowthProfile,
  partial?: Partial<MediaGrowthProfile>,
): Partial<MediaGrowthProfile> {
  const nextPlannedForIso = partial && Object.prototype.hasOwnProperty.call(partial, "plannedForIso")
    ? partial.plannedForIso ?? null
    : current.plannedForIso;
  const nextProfile = {
    ...current,
    ...partial,
    plannedForIso: nextPlannedForIso,
    providerScheduledForIso: nextPlannedForIso,
  } as MediaGrowthProfile;

  return {
    ...partial,
    workflowState: simplifyComposerWorkflowState(nextProfile),
    providerScheduledForIso: nextPlannedForIso,
  };
}

function resolveVariantCopy(variant: WorkspaceVariant) {
  if (variant === "credit") {
    return {
      brandLabel: "Your credit team",
      offerFallback: "your consultation offer",
      directAction: "book a consultation",
      profileAction: "the link in bio, DM, or your profile consultation button",
      savedLinkFallback: "Consultation link",
    };
  }

  return {
    brandLabel: "Your business",
    offerFallback: "your offer",
    directAction: "book now",
    profileAction: "the link in bio, DM, or your profile booking button",
    savedLinkFallback: "Booking link",
  };
}

function resolveComposerPlatformKind(
  targetPlatform: string | null | undefined,
  distributionProvider: DistributionProviderKey | null | undefined,
): ComposerPlatformKind {
  switch (String(targetPlatform || "")) {
    case "instagram_post":
    case "instagram_story":
      return "instagram";
    case "facebook_post":
      return "facebook";
    case "youtube_video":
      return "youtube";
    default:
      break;
  }

  switch (distributionProvider) {
    case "instagram_business":
      return "instagram";
    case "facebook_page":
      return "facebook";
    case "future_youtube":
      return "youtube";
    default:
      return "manual";
  }
}

function resolveComposerPlatformBehavior(profile: MediaGrowthProfile, variant: WorkspaceVariant): ComposerPlatformBehavior {
  const variantCopy = resolveVariantCopy(variant);
  const kind = resolveComposerPlatformKind(profile.targetPlatform, profile.distributionProvider);
  const accountLabel = profile.providerAccountLabel
    || (kind === "facebook"
      ? `${variantCopy.brandLabel} Page`
      : kind === "youtube"
        ? `${variantCopy.brandLabel} Channel`
        : kind === "instagram"
          ? variantCopy.brandLabel
          : `${variantCopy.brandLabel} Workflow`);
  const accountHandle = kind === "instagram"
    ? (variant === "credit" ? "@yourcreditbrand" : "@yourbusiness")
    : kind === "youtube"
      ? "Manual upload lane"
      : kind === "facebook"
        ? "Page preview"
        : "Local composer preview";

  switch (kind) {
    case "instagram":
      return {
        kind,
        label: "Instagram",
        captionFieldLabel: "Caption",
        captionPlaceholder: "Write the Instagram caption. Keep the next step native to Instagram instead of treating the caption like a clickable link post.",
      guidanceTitle: "Instagram should read like Instagram, not a generic link post.",
        guidanceBody: "Lead with the proof, then tell people to use the link in bio, send a DM, or use the profile booking button if it is configured. Do not write the caption like Instagram will turn a URL into a clean clickable CTA.",
      guidanceDetail: "Keep any URL here as planning-only support for bio, DM, profile booking, or internal follow-up. The post itself should stay platform-native.",
        linkFieldLabel: "Internal reference link",
      linkFieldHelper: "Optional. Save a planning-only URL for bio, DM, profile button, or internal follow-up. It does not become a clickable Instagram CTA in the post.",
        linkFieldPlaceholder: "https://bio-link-or-tracking-url",
      ctaLabelFieldLabel: "CTA note",
      ctaLabelPlaceholder: "Link in bio, DM us, Book from profile",
        savedLinkLabel: "Profile booking / bio reference",
        defaultCtaLabel: variant === "credit" ? "Link in bio / DM" : "Book from profile",
        starterButtonLabel: "Start caption",
        copyButtonLabel: "Copy caption",
        manualPostingGuidance: "Post it on Instagram in the real account, then save the live post URL here. Purely stores the record you enter, but does not detect manual posts automatically.",
        previewLabel: "Instagram preview",
        previewLinkLabel: "Instagram handoff",
        previewLinkHelper: "The preview keeps URLs as plain text and shows saved links as planning-only. Instagram does not get a fake clickable button here.",
        accountLabel,
        accountHandle,
      };
    case "facebook":
      return {
        kind,
        label: "Facebook",
        captionFieldLabel: "Caption",
        captionPlaceholder: "Write the Facebook post copy and any direct CTA language.",
        guidanceTitle: "Facebook can support a more direct link CTA.",
        guidanceBody: "Facebook post copy can point more directly to the destination, but the preview should still show the link honestly as part of the post instead of implying any hidden provider magic.",
        guidanceDetail: "If the link is part of the post, make the benefit, destination, and next step obvious. Keep it readable and tied to one clear action.",
        linkFieldLabel: "Post link",
        linkFieldHelper: "Use the direct destination you want visible in the Facebook post or attached as the main CTA path.",
        linkFieldPlaceholder: "https://post-destination-url",
        ctaLabelFieldLabel: "Post CTA label",
        ctaLabelPlaceholder: variant === "credit" ? "Book consultation, Message us, Learn more" : "Book now, Learn more, Claim offer",
        savedLinkLabel: "Saved post link",
        defaultCtaLabel: variant === "credit" ? "Book consultation" : "Book now",
        starterButtonLabel: "Start caption",
        copyButtonLabel: "Copy caption",
        manualPostingGuidance: "Post it on Facebook manually, then paste the live post URL here.",
        previewLabel: "Facebook preview",
        previewLinkLabel: "Visible post link",
        previewLinkHelper: "Facebook can carry a more direct link path, so the preview shows it as part of the post surface.",
        accountLabel,
        accountHandle,
      };
    case "youtube":
      return {
        kind,
        label: "YouTube",
        captionFieldLabel: "Title + description",
        captionPlaceholder: "Write the working title, description, and link handoff notes.",
        guidanceTitle: "YouTube stays manual and description-led here.",
        guidanceBody: "Use this composer to plan the title, description, and CTA handoff. Uploading, publishing, scheduling, and analytics remain manual or future-only until real integration exists.",
        guidanceDetail: "Put the real destination in the description or pinned comment plan. Keep the preview honest about the fact that this is local planning only.",
        linkFieldLabel: "Description link",
        linkFieldHelper: "Use the link you want available in the description or pinned comment after manual upload.",
        linkFieldPlaceholder: "https://description-link-url",
        ctaLabelFieldLabel: "Description CTA label",
        ctaLabelPlaceholder: variant === "credit" ? "Book consultation, Review your report, Message us" : "Book now, Learn more, Start here",
        savedLinkLabel: "Saved description link",
        defaultCtaLabel: variant === "credit" ? "Description consultation link" : "Description booking link",
        starterButtonLabel: "Start draft",
        copyButtonLabel: "Copy draft",
        manualPostingGuidance: "Upload it yourself, then paste the live video URL here. Description links and scheduling stay manual or future-only in this flow.",
        previewLabel: "YouTube preview",
        previewLinkLabel: "Description follow-up link",
        previewLinkHelper: "Shown as part of the description plan, not as a live provider preview.",
        accountLabel,
        accountHandle,
      };
    default:
      return {
        kind: "manual",
        label: "Manual / other",
        captionFieldLabel: "Caption",
        captionPlaceholder: "Write the draft copy, posting notes, or manual handoff copy here.",
        guidanceTitle: "This stays a local planning draft.",
        guidanceBody: "Use the copy and link fields to prepare the post honestly for the real channel or handoff you will use. Do not let the preview imply direct posting capability that does not exist.",
        guidanceDetail: "Keep the destination saved here for internal tracking, manual posting, or a later handoff to the real channel.",
        linkFieldLabel: "Manual link",
        linkFieldHelper: "Use the manual destination, reference URL, or tracked follow-up link you want attached to this asset.",
        linkFieldPlaceholder: "https://manual-destination-url",
        ctaLabelFieldLabel: "Manual CTA label",
        ctaLabelPlaceholder: variant === "credit" ? "Book consultation, Message us, Reply here" : "Book now, Learn more, Claim offer",
        savedLinkLabel: "Saved manual link",
        defaultCtaLabel: variantCopy.savedLinkFallback,
        starterButtonLabel: "Start draft",
        copyButtonLabel: "Copy draft",
        manualPostingGuidance: "Publish it manually in the real channel, then paste the live URL here if you want the result tracked.",
        previewLabel: "Local draft preview",
        previewLinkLabel: "Manual follow-up link",
        previewLinkHelper: "Shown as a local composer reference only.",
        accountLabel,
        accountHandle,
      };
  }
}

function toDateTimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCalendarDay(iso: string | null | undefined) {
  if (!iso) return "Unscheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCalendarTime(iso: string | null | undefined) {
  if (!iso) return "No time set";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No time set";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function sortIsoAsc(left: string | null | undefined, right: string | null | undefined) {
  const leftValue = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightValue = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;
  return leftValue - rightValue;
}

function fromDateTimeLocalValue(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildLinkedFunnelPath(profile: Pick<MediaGrowthProfile, "funnelId" | "funnelSlug" | "funnelPageSlug">): string | null {
  const basePath = hostedFunnelPath(profile.funnelSlug || "", profile.funnelId || "");
  if (!basePath) return null;
  const pageSlug = String(profile.funnelPageSlug || "").trim();
  if (!pageSlug || pageSlug.toLowerCase() === "home") return basePath;
  return `${basePath}/${encodeURIComponent(pageSlug)}`;
}

function resolveComposerDestination(
  profile: Pick<MediaGrowthProfile, "ctaHref" | "bookingLinkUrl" | "funnelId" | "funnelName" | "funnelSlug" | "funnelPageTitle" | "funnelPageSlug">,
  context?: Pick<MediaGrowthContext, "bookingLink"> | null,
) {
  if (profile.ctaHref) {
    return {
      href: profile.ctaHref,
      sourceLabel: "Direct override link",
      detail: "This explicit link overrides the saved booking handoff and linked funnel route below.",
    };
  }

  const funnelHref = buildLinkedFunnelPath(profile);
  if (funnelHref) {
    return {
      href: funnelHref,
      sourceLabel: profile.funnelPageTitle ? `Linked funnel page: ${profile.funnelPageTitle}` : `Linked funnel entry: ${profile.funnelName || profile.funnelSlug || "Selected funnel"}`,
      detail: profile.funnelPageTitle
        ? "This post will point to the selected page inside the linked funnel."
        : "This post will point to the funnel's main entry page until you choose a specific page.",
    };
  }

  if (profile.bookingLinkUrl) {
    return {
      href: profile.bookingLinkUrl,
      sourceLabel: "Saved booking / intake link",
      detail: "This uses the saved booking or intake handoff you selected below.",
    };
  }

  if (context?.bookingLink?.url) {
    return {
      href: context.bookingLink.url,
      sourceLabel: `${context.bookingLink.providerLabel} default link`,
      detail: "This falls back to the current booking handoff saved in Booking settings.",
    };
  }

  return {
    href: null,
    sourceLabel: "No destination selected",
    detail: "Leave the direct link blank only if you plan to use a saved booking handoff or linked funnel route.",
  };
}

function buildCaptionStarter(item: Item, profile: MediaGrowthProfile, context: MediaGrowthContext | null, variant: WorkspaceVariant) {
  const purpose = profile.assetPurpose || "a campaign asset";
  const variantCopy = resolveVariantCopy(variant);
  const offer = profile.relatedOffer || context?.bookingLink?.offerName || variantCopy.offerFallback;
  const ctaHref = resolveComposerDestination(profile, context).href || "";
  const behavior = resolveComposerPlatformBehavior(profile, variant);
  const ctaLabel = profile.ctaLabel || behavior.defaultCtaLabel;

  switch (behavior.kind) {
    case "instagram":
      return [
        `Instagram caption draft for ${offer}.`,
        `${item.fileName} should support ${purpose}. Lead with one concrete proof point or outcome, then point people to ${variantCopy.profileAction}.`,
        "Keep the Instagram CTA native to the platform: mention the link in bio, invite a DM, or point to the profile booking button if it is configured. Do not make a raw caption URL the main CTA.",
        ctaHref
          ? `${behavior.linkFieldLabel}: saved in the planner for bio, DM, profile, or internal follow-up.`
          : `${behavior.linkFieldLabel}: add one only if you need a planner reference for bio, DM, profile, or internal follow-up.`,
      ].join("\n\n");
    case "facebook":
      return [
        `Facebook post draft for ${offer}.`,
        `${item.fileName} should support ${purpose}. Lead with the clearest benefit, one proof point, and a direct invitation to ${variantCopy.directAction}.`,
        `CTA: ${ctaLabel}. Facebook can handle a more direct link path in the copy when it helps.`,
        ctaHref
          ? `${behavior.linkFieldLabel}: ${ctaHref}`
          : `${behavior.linkFieldLabel}: add the destination you want visible in the post.`,
      ].join("\n\n");
    case "youtube":
      return [
        `Title: ${offer}`,
        `Description opener: Explain what viewers will learn or see, why it matters, and the one next step to take after watching ${item.fileName}.`,
        `Description CTA: ${ctaLabel}. Keep upload, scheduling, and analytics manual or future-only in this flow.`,
        ctaHref
          ? `${behavior.linkFieldLabel}: ${ctaHref}`
          : `${behavior.linkFieldLabel}: add the follow-up link you want in the description or pinned comment.`,
      ].join("\n\n");
    default:
      return [
        `Draft copy for ${offer}.`,
        `${item.fileName} supports ${purpose}. Keep the copy concrete, proof-led, and tied to one real next step.`,
        `CTA: ${ctaLabel}.`,
        ctaHref
          ? `${behavior.linkFieldLabel}: ${ctaHref}`
          : `${behavior.linkFieldLabel}: add the destination or tracked follow-up link you will use manually.`,
      ].join("\n\n");
  }
}

function splitYouTubeDraftPreview(captionDraft: string | null | undefined, fallbackTitle: string) {
  const lines = String(captionDraft || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      title: fallbackTitle,
      body: "",
    };
  }

  const titleIndex = lines.findIndex((line) => /^title(?:\s+idea)?:/i.test(line));
  const title = titleIndex >= 0
    ? lines[titleIndex].replace(/^title(?:\s+idea)?:\s*/i, "")
    : lines[0];
  const body = lines.filter((_, index) => index !== titleIndex && (titleIndex >= 0 || index > 0)).join("\n\n");

  return {
    title: title || fallbackTitle,
    body,
  };
}

type WorkflowResultSlot = {
  label: string;
  value: string;
  detail: string;
  href?: string | null;
};

type WorkflowNextStep = {
  title: string;
  detail: string;
};

function isInstagramTargetPlatform(targetPlatform: string | null | undefined) {
  return targetPlatform === "instagram_post" || targetPlatform === "instagram_story";
}

function renderCaptionPreviewLine(line: string, lineIndex: number) {
  const parts = String(line || "").split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, partIndex) => {
    if (!part) return null;
    if (/^https?:\/\//i.test(part)) {
      return (
        <span
          key={`url-${lineIndex}-${partIndex}`}
          className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[12px] text-zinc-600"
        >
          {part}
        </span>
      );
    }
    return <span key={`text-${lineIndex}-${partIndex}`}>{part}</span>;
  });
}

function renderCaptionPreviewText(captionDraft: string | null | undefined, fallback: string) {
  const value = String(captionDraft || "").trim();
  const lines = (value || fallback).split(/\r?\n/);

  return (
    <div className="space-y-2 text-sm leading-6 text-zinc-800">
      {lines.map((line, index) => (
        <div key={`caption-line-${index}`} className="whitespace-pre-wrap wrap-break-word">
          {renderCaptionPreviewLine(line, index)}
        </div>
      ))}
    </div>
  );
}

function formatResultMetric(value: number | null | undefined, label: string) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return null;
  return `${count.toLocaleString()} ${label}`;
}

function buildWorkflowNextStep(
  profile: MediaGrowthProfile,
  continuity: ReturnType<typeof resolveProviderContinuity>,
  variant: "portal" | "credit",
): WorkflowNextStep {
  const nextStepLabel = variant === "credit" ? "consultation or document follow-up" : "booking or follow-up";
  const destination = resolveComposerDestination(profile);

  if (profile.targetPlatform === "youtube_video" && !profile.captionDraft) {
    return {
      title: "Draft the title and description",
      detail: "Use the draft field for the YouTube title, description outline, and the first pinned-link idea before manual upload.",
    };
  }

  if (profile.targetPlatform === "youtube_video" && !profile.notes) {
    return {
      title: "Add thumbnail and posting notes",
      detail: "Use the notes field for thumbnail direction, hook ideas, chapter notes, or the manual-upload checklist while YouTube sync stays off.",
    };
  }

  if (!profile.captionDraft) {
    return {
      title: "Write the draft",
      detail: "This asset still needs caption or copy before it should move into approval or the schedule.",
    };
  }

  if (!destination.href && (profile.targetPlatform || profile.workflowState === "ready_to_use" || profile.workflowState === "planned")) {
    return {
      title: isInstagramTargetPlatform(profile.targetPlatform) ? "Add an Instagram handoff plan" : "Add a tracked link",
      detail: isInstagramTargetPlatform(profile.targetPlatform)
        ? "Decide whether this Instagram post should push people to the link in bio, a DM, or the profile booking button. Keep any saved URL in the planner instead of treating it like a clickable caption CTA."
        : `Attach a ${nextStepLabel} link before posting so the next action is clear and future clicks have a real destination.`,
    };
  }

  if (profile.workflowState === "needs_approval") {
    return {
      title: "Approve before scheduling",
      detail: "The draft is ready for review. Approve it before it moves into the calendar or manual posting.",
    };
  }

  if ((profile.plannedForIso || profile.workflowState === "planned") && !profile.postedAtIso) {
    return {
      title: continuity.blocked ? "Still planned locally" : "Ready for the provider lane",
      detail: continuity.blocked
        ? "This post has a local plan, but it is not posted yet. Finish the provider lane when possible, or post it manually and save the live URL here after it is live."
        : "This post is planned and ready for the real automatic path. Queue it through the provider lane when that path is available, or change the timing if the campaign moved.",
    };
  }

  if (profile.workflowState === "posted_manually" && !profile.postedUrl) {
    return {
      title: profile.targetPlatform === "youtube_video" ? "Save the live YouTube URL" : "Save the live post URL",
      detail: profile.targetPlatform === "youtube_video"
        ? "Use this after uploading outside Purely so the live YouTube URL stays recorded here. Provider-posted is still the preferred synchronized state when it exists."
        : "Use this after posting outside Purely so the live post URL stays recorded here. Provider-posted is still the preferred synchronized state when it exists.",
    };
  }

  if (profile.workflowState === "posted_manually" && !destination.href) {
    return {
      title: "Use a tracked link next time",
      detail: "Manual post results do not connect automatically. Add a tracked Purely link on the next iteration so clicks and follow-up have a real path.",
    };
  }

  if (profile.workflowState === "posted_manually") {
    return {
      title: "Manual post is recorded",
      detail: "This item is saved as posted outside Purely. Reuse the asset with a different offer, caption, or timing, and keep the provider lane for the cases where true automatic posting becomes ready.",
    };
  }

  if (continuity.blocked) {
    return {
      title: "Finish the provider lane",
      detail: "Planned locally is not posted. Manual posting is still available as fallback, but the real automatic path stays blocked until the provider lane is ready.",
    };
  }

  if (profile.workflowState === "ready_to_use" || profile.workflowState === "approved") {
    return {
      title: "Schedule the asset",
      detail: "The draft and handoff details are in place. Pick a timing, then use the provider queue when available. A planned item in Purely is not posted yet.",
    };
  }

  return {
    title: "Move the asset forward",
    detail: "Add the missing workflow details, then schedule it or use it in the next manual-post cycle.",
  };
}

function supportsYouTubePlanning(item: Item | null | undefined, profile: MediaGrowthProfile | null | undefined) {
  return Boolean(
    (item && itemPreviewKind(item) === "video")
    || profile?.targetPlatform === "youtube_video"
    || profile?.distributionProvider === "future_youtube",
  );
}

function buildWorkflowResultSlots(
  profile: MediaGrowthProfile,
  continuity: ReturnType<typeof resolveProviderContinuity>,
  variant: "portal" | "credit",
  context?: MediaGrowthContext | null,
): WorkflowResultSlot[] {
  const providerMetrics = [
    formatResultMetric(profile.metricsImpressions, "impressions"),
    formatResultMetric(profile.metricsReach, "reach"),
    formatResultMetric(profile.metricsEngagementCount, "engagements"),
    formatResultMetric(profile.metricsClickCount, "clicks"),
  ].filter(Boolean).join(" | ");
  const destination = resolveComposerDestination(profile, context);

  return [
    {
      label: "Manual post record",
      value: profile.postedUrl ? "Outside post URL saved" : profile.postedAtIso ? "Marked outside Purely" : "Not used",
      detail: profile.postedUrl
        ? profile.postedUrl
        : profile.postedAtIso
          ? "Add the public post URL when you have it. Purely stores the record you enter here, but it does not mean Purely synchronized the post automatically."
          : "Use this after posting outside Purely so the live post record is easy to find.",
      href: profile.postedUrl,
    },
    {
      label: isInstagramTargetPlatform(profile.targetPlatform) ? "Instagram handoff" : "Destination link",
      value: destination.href
        ? (isInstagramTargetPlatform(profile.targetPlatform) ? "Internal follow-up saved" : (profile.ctaLabel || destination.sourceLabel))
        : (isInstagramTargetPlatform(profile.targetPlatform) ? "No internal handoff saved" : "No destination linked"),
      detail: destination.href
        ? destination.href
        : isInstagramTargetPlatform(profile.targetPlatform)
          ? "Use this for the link in bio, DM follow-up, profile booking button, or internal planning only. It does not become a clickable Instagram CTA."
          : variant === "credit"
          ? "Use a consultation, report, or document follow-up link before posting."
          : "Use a booking, funnel, or follow-up link before posting.",
      href: destination.href,
    },
    {
      label: "Funnel destination",
      value: profile.funnelPageTitle || profile.funnelName || "Not linked",
      detail: profile.funnelId
        ? "The linked funnel can supply the post destination now, but this asset still does not get automatic attribution inside that funnel flow yet."
        : "Link a funnel if you want the next step to stay inside Purely.",
    },
    {
      label: "Booking handoff",
      value: profile.bookingLinkUrl ? "Linked" : "Unavailable",
      detail: profile.bookingLinkUrl
        ? "Booking handoffs live in booking reporting when Purely stores them, but they are not attributed back to this asset automatically yet."
        : variant === "credit"
          ? "Attach a consultation or intake link if this asset should drive appointments."
          : "Attach a booking link if this asset should drive appointments.",
    },
    {
      label: "Provider metrics",
      value: providerMetrics || (profile.providerPostId || profile.providerPublishedAtIso ? "Provider post stored" : "Unavailable"),
      detail: providerMetrics
        ? continuity.metricsLabel
        : profile.workflowState === "posted_manually"
          ? "Manual post records do not sync platform metrics automatically."
          : continuity.metricsLabel,
    },
  ];
}

function composerStatusToneClass(tone: ComposerPostStatusTone) {
  switch (tone) {
    case "sky":
      return "bg-sky-50 text-sky-700";
    case "amber":
      return "bg-amber-50 text-amber-700";
    case "emerald":
      return "bg-emerald-50 text-emerald-700";
    case "rose":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

function composerReturnNoticeClass(tone: ComposerReturnNoticeTone) {
  switch (tone) {
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-rose-200 bg-rose-50 text-rose-900";
  }
}

function buildComposerReturnNotice(metaConnection: string | null, metaMessage: string | null): ComposerReturnNotice | null {
  const status = String(metaConnection || "").trim();
  const message = String(metaMessage || "").trim();
  if (!status && !message) return null;

  if (status === "connected") {
    return {
      tone: "emerald",
      title: "Instagram account connected",
      message: message || "You can finish this post with the updated Instagram connection.",
    };
  }

  if (status === "cancelled" || status === "missing_code" || status === "needs_permissions") {
    return {
      tone: "amber",
      title: status === "needs_permissions" ? "More Instagram setup is required" : "Instagram setup not completed",
      message: message || "Finish the Instagram connection before using this account for posting.",
    };
  }

  return {
    tone: "rose",
    title: "Instagram setup needs attention",
    message: message || "The Instagram connection could not be completed from this session.",
  };
}

function composerChecklistStatusClass(status: ComposerChecklistStatus) {
  switch (status) {
    case "ready":
      return "bg-emerald-50 text-emerald-700";
    case "blocked":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

function composerChecklistStatusLabel(status: ComposerChecklistStatus) {
  switch (status) {
    case "ready":
      return "Ready";
    case "blocked":
      return "Blocked";
    default:
      return "Pending";
  }
}

function resolveComposerPostStatus(
  profile: MediaGrowthProfile,
  continuity: ReturnType<typeof resolveProviderContinuity>,
): { label: string; detail: string; tone: ComposerPostStatusTone } | null {
  if (continuity.publishState === "published") {
    return {
      label: "Provider-posted",
      detail: "A real provider result is stored for this post. This is the ideal synchronized state.",
      tone: "emerald",
    };
  }

  if (profile.workflowState === "posted_manually" || Boolean(profile.postedAtIso)) {
    return {
      label: "Posted manually",
      detail: "Recorded as posted outside Purely. Purely stores the live URL and timing you save here, but this is not an automatic provider-posted state.",
      tone: "sky",
    };
  }

  if (continuity.publishState === "queued" || continuity.publishState === "pending") {
    return {
      label: "Queued",
      detail: "Queued through the provider lane. This is the intended automatic path once the provider route is truly live.",
      tone: "sky",
    };
  }

  if (continuity.blocked) {
    return {
      label: "Blocked",
      detail: continuity.detail,
      tone: "rose",
    };
  }

  if (profile.plannedForIso || profile.workflowState === "planned" || profile.workflowState === "approved" || profile.workflowState === "ready_to_use") {
    return {
      label: "Planned",
      detail: "Planned locally only. It is not posted yet.",
      tone: "amber",
    };
  }

  return null;
}

export function PortalMediaLibraryClient() {
  const toastNotify = useToast();
  const portalVariant = useMemo(() => {
    if (typeof window === "undefined") return "portal" as const;
    return portalVariantFromPathname(window.location.pathname);
  }, []);
  const isCreditWorkspace = portalVariant === "credit";
  const portalBase = useMemo(() => portalBaseFromWorkspaceVariant(portalVariant), [portalVariant]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingReturnContext, setPendingReturnContext] = useState<PendingMediaLibraryReturnContext | null>(null);
  const [composerReturnNotice, setComposerReturnNotice] = useState<ComposerReturnNotice | null>(null);

  useEffect(() => {
    if (error) toastNotify.error(error);
  }, [error, toastNotify]);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<"library" | "calendar">("library");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilterKey>("all");
  const [selected, setSelected] = useState<{ kind: "folder"; id: string } | { kind: "item"; id: string } | null>(null);

  const [openMenu, setOpenMenu] = useState<
    | null
    | {
        kind: "folder" | "item";
        id: string;
        left: number;
        top: number;
        maxHeight: number;
      }
  >(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const [toast, setToast] = useState<null | { text: string; left: number; top: number }>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const [renaming, setRenaming] = useState<null | { kind: "folder" | "item"; id: string; initial: string }>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moving, setMoving] = useState<null | { kind: "folder" | "item"; id: string }>(null);
  const [allFolders, setAllFolders] = useState<Array<{ id: string; parentId: string | null; name: string }>>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [moveDestId, setMoveDestId] = useState<string | null>(null);
  const [moveCreatingName, setMoveCreatingName] = useState("");
  const [moveWorking, setMoveWorking] = useState(false);
  const [selectedItemDetail, setSelectedItemDetail] = useState<Item | null>(null);
  const [selectedGrowthProfile, setSelectedGrowthProfile] = useState<MediaGrowthProfile | null>(null);
  const [growthContext, setGrowthContext] = useState<MediaGrowthContext | null>(null);
  const [metaReadiness, setMetaReadiness] = useState<PortalMetaProviderReadiness | null>(null);
  const [metaReadinessLoading, setMetaReadinessLoading] = useState(false);
  const [metaReadinessError, setMetaReadinessError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const nextView = String(url.searchParams.get("view") || "").trim();
    if (nextView === "library" || nextView === "calendar") setViewMode(nextView);

    const nextFolderId = String(url.searchParams.get("folderId") || "").trim();
    if (nextFolderId) setFolderId(nextFolderId);

    const itemId = String(url.searchParams.get("itemId") || "").trim() || null;
    const openComposer = Boolean(itemId && url.searchParams.get("composer") === "1");
    const metaConnection = String(url.searchParams.get("metaConnection") || "").trim() || null;
    const metaMessage = String(url.searchParams.get("metaMessage") || "").trim() || null;

    if (itemId || metaConnection || metaMessage) {
      setPendingReturnContext({
        itemId,
        openComposer,
        metaConnection,
        metaMessage,
      });
    }
  }, []);

  useEffect(() => {
    if (!pendingReturnContext) return;
    const nextNotice = buildComposerReturnNotice(pendingReturnContext.metaConnection, pendingReturnContext.metaMessage);
    if (nextNotice) setComposerReturnNotice(nextNotice);
    if (pendingReturnContext.metaMessage) {
      if (pendingReturnContext.metaConnection === "connected") toastNotify.success(pendingReturnContext.metaMessage);
      else toastNotify.error(pendingReturnContext.metaMessage);
      return;
    }
    if (pendingReturnContext.metaConnection === "connected") {
      toastNotify.success("Instagram connection updated");
    }
  }, [pendingReturnContext, toastNotify]);

  useEffect(() => {
    if (!pendingReturnContext?.itemId || !pendingReturnContext.openComposer) return;
    if (previewOpen) return;
    const matchingItem = items.find((item) => item.id === pendingReturnContext.itemId);
    if (!matchingItem) return;

    setSelected({ kind: "item", id: matchingItem.id });
    setPreviewOpen(true);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("itemId");
      url.searchParams.delete("composer");
      url.searchParams.delete("metaConnection");
      url.searchParams.delete("metaMessage");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    setPendingReturnContext((current) => current ? {
      ...current,
      itemId: null,
      openComposer: false,
      metaConnection: null,
      metaMessage: null,
    } : null);
  }, [items, pendingReturnContext, previewOpen]);

  useEffect(() => {
    if (!previewOpen) setComposerReturnNotice(null);
  }, [previewOpen]);

  const selectedItem = useMemo(() => {
    if (!selected || selected.kind !== "item") return null;
    return items.find((i) => i.id === selected.id) || null;
  }, [selected, items]);

  const previewItem = selectedItemDetail || selectedItem;

  const previewGrowthProfile = useMemo(() => {
    if (selectedGrowthProfile) return selectedGrowthProfile;
    if (previewItem) return previewItem.growthProfile || emptyGrowthProfile(previewItem.id);
    return null;
  }, [previewItem, selectedGrowthProfile]);

  const previewContinuity = useMemo(() => {
    return previewGrowthProfile ? resolveProviderContinuity(previewGrowthProfile, metaReadiness) : null;
  }, [metaReadiness, previewGrowthProfile]);

  const previewNextStep = useMemo(() => {
    return previewGrowthProfile && previewContinuity
      ? buildWorkflowNextStep(previewGrowthProfile, previewContinuity, portalVariant)
      : null;
  }, [portalVariant, previewContinuity, previewGrowthProfile]);

  const previewResultSlots = useMemo(() => {
    return previewGrowthProfile && previewContinuity
      ? buildWorkflowResultSlots(previewGrowthProfile, previewContinuity, portalVariant, growthContext)
      : [];
  }, [growthContext, portalVariant, previewContinuity, previewGrowthProfile]);

  const previewSupportsYouTubePlanning = useMemo(() => {
    return supportsYouTubePlanning(previewItem, previewGrowthProfile);
  }, [previewGrowthProfile, previewItem]);

  const workflowDropdownButtonClass = "flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300";

  const previewCanonicalTargetPlatform = useMemo<ComposerTargetPlatformOptionValue>(() => {
    return canonicalComposerTargetPlatform(previewGrowthProfile?.targetPlatform, { allowYouTube: previewSupportsYouTubePlanning });
  }, [previewGrowthProfile?.targetPlatform, previewSupportsYouTubePlanning]);

  const previewLegacyTargetPlatform = useMemo(() => {
    if (!previewGrowthProfile?.targetPlatform) return null;
    if (previewCanonicalTargetPlatform) return null;
    return legacyTargetPlatformLabel(previewGrowthProfile.targetPlatform);
  }, [previewCanonicalTargetPlatform, previewGrowthProfile?.targetPlatform]);

  const previewDistributionProvider = useMemo<DistributionProviderKey>(() => {
    return resolveVisibleDistributionProvider(
      previewGrowthProfile?.targetPlatform,
      previewGrowthProfile?.distributionProvider,
      { allowYouTube: previewSupportsYouTubePlanning },
    );
  }, [previewGrowthProfile?.distributionProvider, previewGrowthProfile?.targetPlatform, previewSupportsYouTubePlanning]);

  const previewPostComposerStatus = useMemo(() => {
    return previewGrowthProfile && previewContinuity
      ? resolveComposerPostStatus(previewGrowthProfile, previewContinuity)
      : null;
  }, [previewContinuity, previewGrowthProfile]);

  const previewPlatformBehavior = useMemo(() => {
    return previewGrowthProfile ? resolveComposerPlatformBehavior(previewGrowthProfile, portalVariant) : null;
  }, [portalVariant, previewGrowthProfile]);

  const previewIsInstagramComposer = previewPlatformBehavior?.kind === "instagram";

  const previewPlatformAspectClass = useMemo(() => {
    return resolveComposerPreviewAspectClass(previewGrowthProfile?.targetPlatform, previewPlatformBehavior?.kind);
  }, [previewGrowthProfile?.targetPlatform, previewPlatformBehavior?.kind]);

  const previewInstagramCropPreset = useMemo(() => {
    return resolveInstagramCropDefaultPreset(previewGrowthProfile?.targetPlatform);
  }, [previewGrowthProfile?.targetPlatform]);

  const previewInstagramCropOptions = useMemo(() => {
    return resolveInstagramCropOptions(previewGrowthProfile?.targetPlatform);
  }, [previewGrowthProfile?.targetPlatform]);

  const previewCanPrepareInstagramAsset = useMemo(() => {
    if (!previewItem?.previewUrl) return false;
    if (itemPreviewKind(previewItem) !== "image") return false;
    return previewPlatformBehavior?.kind === "instagram";
  }, [previewItem, previewPlatformBehavior?.kind]);

  const previewResolvedLinkHref = useMemo(() => {
    return previewGrowthProfile ? resolveComposerDestination(previewGrowthProfile, growthContext).href : null;
  }, [growthContext, previewGrowthProfile]);

  const previewResolvedDestinationMeta = useMemo(() => {
    return previewGrowthProfile ? resolveComposerDestination(previewGrowthProfile, growthContext) : null;
  }, [growthContext, previewGrowthProfile]);

  const previewResolvedCtaLabel = useMemo(() => {
    if (!previewPlatformBehavior) return previewGrowthProfile?.ctaLabel || null;
    return previewGrowthProfile?.ctaLabel || previewPlatformBehavior.defaultCtaLabel;
  }, [previewGrowthProfile?.ctaLabel, previewPlatformBehavior]);

  const previewYouTubeDraft = useMemo(() => {
    return splitYouTubeDraftPreview(
      previewGrowthProfile?.captionDraft,
      previewGrowthProfile?.relatedOffer || previewItem?.fileName || "Planned video title",
    );
  }, [previewGrowthProfile?.captionDraft, previewGrowthProfile?.relatedOffer, previewItem?.fileName]);

  const previewManualPostingGuidance = useMemo(() => {
    return previewPlatformBehavior?.manualPostingGuidance || "Post it yourself, then paste the live link here.";
  }, [previewPlatformBehavior]);

  const previewSocialSetupHref = useMemo(() => buildProviderSetupWizardHref(portalBase, "meta"), [portalBase]);
  const previewUsesMetaProviderLane = previewDistributionProvider === "facebook_page" || previewDistributionProvider === "instagram_business";
  const previewShowsInstagramSetup = previewPlatformBehavior?.kind === "instagram" || previewDistributionProvider === "instagram_business";
  const previewComposerPostStatusLabel = useMemo(() => {
    if (!previewGrowthProfile) return "Draft post";
    return previewGrowthProfile.plannedForIso ? "Scheduled post" : "Draft post";
  }, [previewGrowthProfile]);
  const previewMetaReturnHref = useMemo(() => {
    return buildMediaLibraryComposerReturnHref({
      portalBase,
      itemId: previewItem?.id || null,
      folderId,
      viewMode,
      includeComposer: true,
    });
  }, [folderId, portalBase, previewItem?.id, viewMode]);
  const previewDirectMetaActionHref = useMemo(() => {
    const inferredMode = previewDistributionProvider === "facebook_page" ? "page_linked_facebook_login" : "instagram_login";
    const integrationMode = metaReadiness?.integrationMode || inferredMode;
    if (!metaReadiness?.canStartOAuth) return previewSocialSetupHref;
    return buildMetaConnectRequestHref(previewMetaReturnHref, integrationMode);
  }, [metaReadiness?.canStartOAuth, metaReadiness?.integrationMode, previewDistributionProvider, previewMetaReturnHref, previewSocialSetupHref]);
  const previewMetaDestinationSetupLabel = useMemo(() => {
    const usesInstagramLogin = metaReadiness?.integrationMode === "instagram_login" || previewDistributionProvider === "instagram_business";
    if (metaReadiness?.actionHref) {
      if (metaReadiness.status === "reconnect_required" || metaReadiness.status === "needs_permissions") {
        return usesInstagramLogin ? "Reconnect Instagram account" : "Reconnect Meta account";
      }
      if (metaReadiness.status === "not_connected") {
        return usesInstagramLogin ? "Connect Instagram account" : "Connect Meta account";
      }
    }
    return usesInstagramLogin ? "Configure Instagram account" : "Open Facebook setup";
  }, [metaReadiness?.actionHref, metaReadiness?.integrationMode, metaReadiness?.status, previewDistributionProvider]);
  const previewBlockedSetupHref = previewUsesMetaProviderLane && previewContinuity?.blocked ? previewDirectMetaActionHref : null;

  const targetPlatformOptions = useMemo(() => {
    const base: Array<{ value: string; label: string }> = [
      { value: "", label: "Other/manual post" },
      { value: "instagram_post", label: "Instagram feed post" },
      { value: "instagram_story", label: "Instagram story" },
      { value: "facebook_post", label: "Facebook post" },
    ];
    if (previewSupportsYouTubePlanning) base.splice(4, 0, { value: "youtube_video", label: "YouTube video" });
    return base;
  }, [previewSupportsYouTubePlanning]);

  const distributionProviderOptions = useMemo(() => {
    const options: Array<{ value: DistributionProviderKey; label: string; hint?: string }> = [{
      value: "manual",
      label: "Draft only / post manually",
      hint: "Keep the draft inside Purely, then publish it yourself when you are ready.",
    }];

    if (previewCanonicalTargetPlatform === "instagram_post" || previewCanonicalTargetPlatform === "instagram_story") {
      options.push({
        value: "instagram_business",
        label: "Use Instagram account",
        hint: "Connect and choose the Instagram account that should receive this post.",
      });
    } else if (previewCanonicalTargetPlatform === "facebook_post") {
      options.push({
        value: "facebook_page",
        label: "Use Facebook Page",
        hint: "Connect and choose the Facebook Page that should receive this post.",
      });
    } else if (previewCanonicalTargetPlatform === "youtube_video") {
      options.push({
        value: "future_youtube",
        label: "Provider unavailable / coming soon",
        hint: "YouTube upload and scheduling still stay manual here.",
      });
    }

    return options;
  }, [previewCanonicalTargetPlatform]);

  const previewMetaDestinationOptions = useMemo(() => {
    if (!metaReadiness || !previewUsesMetaProviderLane) return [] as MetaDestinationOption[];
    return metaReadiness.targetAccounts
      .filter((account) => account.connected && !account.placeholder && metaTargetMatchesProvider(account, previewDistributionProvider))
      .map((account) => buildMetaDestinationOption(account))
      .filter((account): account is MetaDestinationOption => Boolean(account));
  }, [metaReadiness, previewDistributionProvider, previewUsesMetaProviderLane]);

  const previewSelectedMetaDestination = useMemo(() => {
    if (!previewGrowthProfile) return null;
    return previewMetaDestinationOptions.find((option) => {
      return option.destinationId === previewGrowthProfile.providerDestinationId
        && option.destinationType === previewGrowthProfile.providerDestinationType;
    }) || null;
  }, [previewGrowthProfile, previewMetaDestinationOptions]);

  const previewMetaDestinationBlockers = useMemo(() => {
    if (!previewUsesMetaProviderLane || !metaReadiness) return [] as string[];
    if (metaReadiness.primaryDiagnostic) {
      return [
        metaReadiness.primaryDiagnostic.message,
        metaReadiness.primaryDiagnostic.detail,
        ...metaReadiness.primaryDiagnostic.guidance,
      ];
    }
    if (metaReadiness.targetAccountBlockers.length) return metaReadiness.targetAccountBlockers;
    if (previewMetaDestinationOptions.length) return [] as string[];
    if (metaReadiness.status === "not_connected") {
      return [metaReadiness.integrationMode === "instagram_login"
        ? "Connect Instagram in Integrations before Purely can list the professional account for this provider lane."
        : "Connect Meta in Integrations before Purely can list available destinations for this provider lane."];
    }
    if (metaReadiness.status === "reconnect_required") {
      return [metaReadiness.integrationMode === "instagram_login"
        ? "Reconnect Instagram in Integrations before Purely can refresh the professional account for this provider lane."
        : "Reconnect Meta in Integrations before Purely can refresh available destinations for this provider lane."];
    }
    return [
      previewDistributionProvider === "instagram_business"
        ? "No Instagram professional account was hydrated for this connected workspace yet."
        : "No Facebook Page was hydrated for this connected workspace yet.",
    ];
  }, [metaReadiness, previewDistributionProvider, previewMetaDestinationOptions.length, previewUsesMetaProviderLane]);
  const previewPrimaryMetaDestinationBlocker = useMemo(() => {
    return previewMetaDestinationBlockers[0] || null;
  }, [previewMetaDestinationBlockers]);

  const previewMetaDestinationOptionsForDropdown = useMemo(() => {
    if (!previewUsesMetaProviderLane) return [] as Array<{ value: string; label: string; hint?: string }>;
    const emptyLabel = previewDistributionProvider === "instagram_business"
      ? "Choose Instagram professional account"
      : "Choose Facebook Page";
    return [
      {
        value: "",
        label: emptyLabel,
        hint: previewMetaDestinationBlockers[0] || "Pick the real destination returned by Meta for this workspace.",
      },
      ...previewMetaDestinationOptions.map((option) => ({
        value: option.value,
        label: option.label,
        hint: option.hint,
      })),
    ];
  }, [previewDistributionProvider, previewMetaDestinationBlockers, previewMetaDestinationOptions, previewUsesMetaProviderLane]);

  const previewDestinationSummary = useMemo(() => {
    return previewGrowthProfile
      ? resolveDestinationSummary(previewGrowthProfile, previewDistributionProvider, previewPlatformBehavior)
      : null;
  }, [previewDistributionProvider, previewGrowthProfile, previewPlatformBehavior]);

  const bookingLinkOptions = useMemo(() => {
    const emptyLabel = previewPlatformBehavior?.kind === "instagram"
      ? "No saved bio / DM booking link"
      : previewPlatformBehavior?.kind === "facebook"
        ? "No saved booking / intake link"
        : previewPlatformBehavior?.kind === "youtube"
          ? "No saved description booking link"
          : "No saved booking / intake link";
    const options: Array<{ value: string; label: string; hint?: string }> = [{
      value: "",
      label: emptyLabel,
      hint: growthContext?.bookingLink?.url
        ? "Attach the current booking CTA without triggering anything live."
        : "Save a booking link in Booking Settings to reuse it here.",
    }];

    if (growthContext?.bookingLink?.url) {
      options.push({
        value: growthContext.bookingLink.url,
        label: `${growthContext.bookingLink.providerLabel} ${growthContext.bookingLink.enabled ? "(active)" : "(saved)"}`,
        hint: growthContext.bookingLink.offerName || undefined,
      });
    }

    return options;
  }, [growthContext?.bookingLink, previewPlatformBehavior?.kind]);

  const funnelOptions = useMemo(() => ([
    { value: "", label: "No funnel destination" },
    ...(growthContext?.funnels || []).map((funnel) => ({ value: funnel.id, label: funnel.name })),
  ]), [growthContext?.funnels]);

  const previewProviderQueueAction = useMemo(() => {
    if (!previewItem || !previewGrowthProfile || !previewContinuity) {
      return {
        label: "Queue post",
        disabled: true,
        helper: "Open an asset to prepare a post.",
      };
    }

    if (detailLoading || detailSaving) {
      return {
        label: "Queue post",
        disabled: true,
        helper: "Finish saving the current post details first.",
      };
    }

    if (previewDistributionProvider === "manual") {
      return {
        label: "Queue post",
        disabled: true,
        helper: "Manual posting is selected for this post.",
      };
    }

    if (previewDistributionProvider === "future_youtube") {
      return {
        label: "Queue post",
        disabled: true,
        helper: "YouTube stays manual/future-only in this flow.",
      };
    }

    if (previewContinuity.publishState === "published") {
      return {
        label: "Posted by provider",
        disabled: true,
        helper: "A real provider result is already stored for this post.",
      };
    }

    if (previewContinuity.publishState === "queued" || previewContinuity.publishState === "pending") {
      return {
        label: "Queued",
        disabled: true,
        helper: "This post is already queued through the provider lane.",
      };
    }

    if (previewContinuity.blocked) {
      const providerBlockerMessage = typeof previewGrowthProfile.providerLastError === "string" && previewGrowthProfile.providerLastError.trim()
        ? previewGrowthProfile.providerLastError.trim()
        : null;
      if (previewBlockedSetupHref) {
        return {
          label: "Resolve setup",
          disabled: false,
          helper: providerBlockerMessage || metaReadiness?.setupMessage || (metaReadiness?.integrationMode === "instagram_login"
            ? "Open setup to reconnect Instagram, confirm permissions, and choose the professional account."
            : "Open setup to reconnect Meta, confirm permissions, and choose a destination."),
          href: previewBlockedSetupHref,
        };
      }
      return {
        label: "Queue post",
        disabled: true,
        helper: providerBlockerMessage || metaReadiness?.setupMessage || (metaReadiness?.integrationMode === "instagram_login"
          ? "Instagram auto-posting is not ready yet."
          : "Auto-posting is not ready yet."),
      };
    }

    return {
      label: "Queue post",
      disabled: false,
      helper: "Queues the saved post through the existing provider route only when the provider path is truly ready.",
    };
  }, [detailLoading, detailSaving, metaReadiness, previewBlockedSetupHref, previewContinuity, previewDistributionProvider, previewGrowthProfile, previewItem]);

  const loadMetaReadiness = useCallback(async () => {
    setMetaReadinessLoading(true);
    setMetaReadinessError(null);

    try {
      const { response, json } = await fetchJsonWithTimeout<MetaReadinessRes>("/api/portal/media/providers/meta/readiness", { cache: "no-store" });
      if (!response.ok || !json || json.ok !== true) {
        throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load provider readiness");
      }
      setMetaReadiness(json.readiness);
    } catch (err) {
      setMetaReadiness(null);
      const message = err instanceof Error ? err.message : "Failed to load provider readiness";
      setMetaReadinessError(message);
      throw err;
    } finally {
      setMetaReadinessLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadMetaReadiness().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load provider readiness");
    });

    return () => {
      cancelled = true;
    };
  }, [loadMetaReadiness]);

  const previewFunnelPages = useMemo(() => {
    const funnelId = previewGrowthProfile?.funnelId || "";
    if (!growthContext?.funnelPages?.length || !funnelId) return [];
    return growthContext.funnelPages.filter((page) => page.funnelId === funnelId);
  }, [growthContext, previewGrowthProfile?.funnelId]);

  const previewFunnelPageOptions = useMemo(() => ([
    { value: "", label: "Use funnel's main entry page" },
    ...previewFunnelPages.map((page) => ({ value: page.id, label: page.title })),
  ]), [previewFunnelPages]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  useEffect(() => {
    if (selected?.kind !== "item") setPreviewOpen(false);
  }, [selected?.kind]);

  useEffect(() => {
    if (!previewOpen || !selectedItem?.id) {
      setSelectedItemDetail(null);
      setSelectedGrowthProfile(null);
      setGrowthContext(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setSelectedItemDetail(null);
    setSelectedGrowthProfile(null);

    void fetchJsonWithTimeout<ItemDetailRes>(`/api/portal/media/items/${encodeURIComponent(selectedItem.id)}`, { cache: "no-store" })
      .then(({ response, json }) => {
        if (!response.ok || !json || json.ok !== true) {
          throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load asset details");
        }
        if (cancelled) return;
        setSelectedItemDetail(json.item);
        setSelectedGrowthProfile(json.item.growthProfile || emptyGrowthProfile(json.item.id));
        setGrowthContext(json.context);
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load asset details";
          setDetailError(message);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewOpen, selectedItem?.id]);

  const load = useCallback(async (nextFolderId: string | null) => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    setLibraryError(null);
    let didLoad = false;

    const url = new URL("/api/portal/media/list", window.location.origin);
    if (nextFolderId) url.searchParams.set("folderId", nextFolderId);

    try {
      const { response, json } = await fetchJsonWithTimeout<ListRes>(url.toString(), { cache: "no-store" });
      if (!response.ok || !json || json.ok !== true) {
        const message = typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load media library";
        setError(message);
        setLibraryError(message);
        return;
      }

      setBreadcrumbs(Array.isArray(json.breadcrumbs) ? json.breadcrumbs : []);
      setFolders(Array.isArray(json.folders) ? json.folders : []);
      setItems(Array.isArray(json.items) ? json.items : []);

      didLoad = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load media library";
      setError(message);
      setLibraryError(message);
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(folderId);
  }, [folderId, load]);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q) || f.tag.toLowerCase().includes(q));
  }, [folders, search]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.fileName.toLowerCase().includes(q) || i.tag.toLowerCase().includes(q));
  }, [items, search]);

  const needsCaptionItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const state = item.growthProfile?.workflowState;
        return state === "needs_review" || state === "needs_caption";
      })
      .sort((left, right) => sortIsoAsc(left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.updatedAtIso || right.createdAt));
  }, [filteredItems]);

  const needsApprovalItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => item.growthProfile?.workflowState === "needs_approval")
      .sort((left, right) => sortIsoAsc(left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.updatedAtIso || right.createdAt));
  }, [filteredItems]);

  const approvedQueueItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const profile = item.growthProfile;
        return Boolean(profile) && profile?.workflowState === "approved" && !profile.postedAtIso && !profile.plannedForIso;
      })
      .sort((left, right) => {
        const leftOrder = left.growthProfile?.queueOrder ?? Number.POSITIVE_INFINITY;
        const rightOrder = right.growthProfile?.queueOrder ?? Number.POSITIVE_INFINITY;
        return leftOrder - rightOrder || sortIsoAsc(left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.updatedAtIso || right.createdAt);
      });
  }, [filteredItems]);

  const plannedCalendarItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const profile = item.growthProfile;
        if (!profile?.plannedForIso) return false;
        return profile.workflowState !== "posted_manually" && !profile.postedAtIso;
      })
      .sort((left, right) => sortIsoAsc(left.growthProfile?.plannedForIso, right.growthProfile?.plannedForIso));
  }, [filteredItems]);

  const plannedCalendarGroups = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of plannedCalendarItems) {
      const label = formatCalendarDay(item.growthProfile?.plannedForIso);
      const list = groups.get(label) ?? [];
      list.push(item);
      groups.set(label, list);
    }
    return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
  }, [plannedCalendarItems]);

  const unscheduledReadyItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const profile = item.growthProfile;
        return Boolean(profile) && profile?.workflowState === "ready_to_use" && !profile.plannedForIso && !profile.postedAtIso;
      })
      .sort((left, right) => sortIsoAsc(left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.updatedAtIso || right.createdAt));
  }, [filteredItems]);

  const readyWithoutScheduleItems = useMemo(() => {
    return [...approvedQueueItems, ...unscheduledReadyItems].sort((left, right) =>
      sortIsoAsc(left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.updatedAtIso || right.createdAt),
    );
  }, [approvedQueueItems, unscheduledReadyItems]);

  const postedCalendarItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => Boolean(item.growthProfile?.postedAtIso) || item.growthProfile?.workflowState === "posted_manually")
      .sort((left, right) => sortIsoAsc(right.growthProfile?.postedAtIso, left.growthProfile?.postedAtIso));
  }, [filteredItems]);

  const providerBlockedItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const profile = item.growthProfile;
        if (!profile || profile.workflowState === "posted_manually") return false;
        return resolveProviderContinuity(profile).blocked;
      })
      .sort((left, right) => sortIsoAsc(left.growthProfile?.plannedForIso || left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.plannedForIso || right.growthProfile?.updatedAtIso || right.createdAt));
  }, [filteredItems]);

  const queuedProviderItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const profile = item.growthProfile;
        if (!profile) return false;
        const publishState = resolveProviderContinuity(profile).publishState;
        return publishState === "queued" || publishState === "pending";
      })
      .sort((left, right) => {
        const leftOrder = left.growthProfile?.queueOrder ?? Number.POSITIVE_INFINITY;
        const rightOrder = right.growthProfile?.queueOrder ?? Number.POSITIVE_INFINITY;
        return leftOrder - rightOrder || sortIsoAsc(left.growthProfile?.plannedForIso, right.growthProfile?.plannedForIso);
      });
  }, [filteredItems]);

  const providerFailedItems = useMemo(() => {
    return [...filteredItems]
      .filter((item) => {
        const profile = item.growthProfile;
        if (!profile) return false;
        return resolveProviderContinuity(profile).publishState === "failed";
      })
      .sort((left, right) => sortIsoAsc(right.growthProfile?.providerLastAttemptAtIso || right.growthProfile?.updatedAtIso || right.createdAt, left.growthProfile?.providerLastAttemptAtIso || left.growthProfile?.updatedAtIso || left.createdAt));
  }, [filteredItems]);

  const manualOnlyItems = useMemo(() => {
    const alreadyPlaced = new Set([
      ...plannedCalendarItems,
      ...readyWithoutScheduleItems,
      ...needsCaptionItems,
      ...needsApprovalItems,
      ...postedCalendarItems,
    ].map((item) => item.id));

    return [...providerBlockedItems]
      .filter((item) => !alreadyPlaced.has(item.id))
      .sort((left, right) => sortIsoAsc(left.growthProfile?.plannedForIso || left.growthProfile?.updatedAtIso || left.createdAt, right.growthProfile?.plannedForIso || right.growthProfile?.updatedAtIso || right.createdAt));
  }, [needsApprovalItems, needsCaptionItems, plannedCalendarItems, postedCalendarItems, providerBlockedItems, readyWithoutScheduleItems]);

  const providerHistoryItems = useMemo(() => {
    const alreadyPlaced = new Set([
      ...plannedCalendarItems,
      ...readyWithoutScheduleItems,
      ...needsCaptionItems,
      ...needsApprovalItems,
      ...manualOnlyItems,
      ...postedCalendarItems,
    ].map((item) => item.id));
    const uniqueItems = new Map<string, Item>();

    for (const item of [...providerFailedItems, ...queuedProviderItems]) {
      if (alreadyPlaced.has(item.id) || uniqueItems.has(item.id)) continue;
      uniqueItems.set(item.id, item);
    }

    return Array.from(uniqueItems.values());
  }, [manualOnlyItems, needsApprovalItems, needsCaptionItems, plannedCalendarItems, postedCalendarItems, providerFailedItems, queuedProviderItems, readyWithoutScheduleItems]);

  const workflowSections = useMemo(() => ([
    {
      key: "scheduled" as const,
      label: "Scheduled content",
      description: "Items with a planned date that still need manual posting or a schedule change.",
      count: plannedCalendarItems.length,
    },
    {
      key: "ready" as const,
      label: "Ready to plan",
      description: "Assets that are ready for a date, time, or immediate manual post.",
      count: readyWithoutScheduleItems.length,
    },
    {
      key: "review" as const,
      label: "Review before posting",
      description: "Assets that should be reviewed before they move onto the plan.",
      count: needsApprovalItems.length,
    },
    {
      key: "needs_copy" as const,
      label: "Needs copy",
      description: "Assets that still need caption or draft copy before they move forward.",
      count: needsCaptionItems.length,
    },
    {
      key: "manual_only" as const,
      label: "Manual posting only",
      description: "Manual posting is the current live lane. Post outside Purely, then save the live URL back here if you want it recorded.",
      count: manualOnlyItems.length,
    },
    {
      key: "posted" as const,
      label: "Posted manually",
      description: "Assets recorded as posted outside Purely. Purely stores the live URL you paste back here, but does not detect manual posts automatically.",
      count: postedCalendarItems.length,
    },
  ]), [manualOnlyItems.length, needsApprovalItems.length, needsCaptionItems.length, plannedCalendarItems.length, postedCalendarItems.length, readyWithoutScheduleItems.length]);

  const workflowFilterOptions = useMemo(() => {
    const totalCount = workflowSections.reduce((sum, section) => sum + section.count, 0);
    return [
      { key: "all" as const, label: "All", count: totalCount },
      ...workflowSections
        .filter((section) => section.count > 0)
        .map((section) => ({ key: section.key, label: section.label, count: section.count })),
    ];
  }, [workflowSections]);

  const visibleWorkflowSections = useMemo(() => {
    return workflowSections.filter((section) => section.count > 0 && (workflowFilter === "all" || workflowFilter === section.key));
  }, [workflowFilter, workflowSections]);

  const workflowEmptyMessage = useMemo(() => {
    switch (workflowFilter) {
      case "scheduled":
        return "Nothing is scheduled yet.";
      case "ready":
        return "Nothing is ready to plan yet.";
      case "review":
        return "Nothing is waiting for review right now.";
      case "needs_copy":
        return "Nothing needs copy right now.";
      case "manual_only":
        return "Nothing is sitting in a manual-only lane right now.";
      case "posted":
        return "No assets have been marked posted manually yet.";
      default:
        return isCreditWorkspace
          ? "Upload media, add the draft, attach the consultation link, set a plan, then mark it posted manually when it goes live."
          : "Upload media, add the draft, attach the booking or funnel link, set a plan, then mark it posted manually when it goes live.";
    }
  }, [isCreditWorkspace, workflowFilter]);

  const workflowFilterLabel = useMemo(() => {
    return workflowFilterOptions.find((option) => option.key === workflowFilter)?.label || "All";
  }, [workflowFilter, workflowFilterOptions]);

  const calendarExportText = useMemo(() => {
    const plannedLines = plannedCalendarItems.map((item) => {
      const profile = item.growthProfile || emptyGrowthProfile(item.id);
      return `${formatCalendarDay(profile.plannedForIso)} ${formatCalendarTime(profile.plannedForIso)} | ${targetPlatformLabel(profile.targetPlatform)} | ${item.fileName} | ${profile.campaignLabel || "No campaign label"}`;
    });
    const readyLines = unscheduledReadyItems.map((item) => {
      const profile = item.growthProfile || emptyGrowthProfile(item.id);
      return `READY | ${targetPlatformLabel(profile.targetPlatform)} | ${item.fileName} | ${profile.campaignLabel || "No campaign label"}`;
    });
    const blockedLines = manualOnlyItems.map((item) => {
      const profile = item.growthProfile || emptyGrowthProfile(item.id);
      const continuity = resolveProviderContinuity(profile);
      return `MANUAL ONLY | ${continuity.providerLabel} | ${item.fileName} | ${continuity.connectionLabel}`;
    });
    return [
      "Purely content calendar export",
      plannedLines.length ? ["", "Planned content", ...plannedLines].join("\n") : "",
      readyLines.length ? ["", "Ready to plan", ...readyLines].join("\n") : "",
      blockedLines.length ? ["", "Manual posting only", ...blockedLines].join("\n") : "",
    ].filter(Boolean).join("\n");
  }, [manualOnlyItems, plannedCalendarItems, unscheduledReadyItems]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);

    const res = await fetch("/api/portal/media/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: folderId, name }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setCreatingFolder(false);
      setError(typeof json?.error === "string" ? json.error : "Could not create folder");
      return;
    }

    setNewFolderName("");
    setNewFolderOpen(false);
    setCreatingFolder(false);
    await load(folderId);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    if (uploading) return;
    setUploading(true);
    setError(null);

    try {
      const list = Array.from(files);
      const totalBytes = list.reduce((sum, f) => sum + (typeof f.size === "number" ? f.size : 0), 0);
      const wantsBlobUpload =
        totalBytes > 4 * 1024 * 1024 ||
        list.some((f) => (typeof f.size === "number" ? f.size : 0) > 4 * 1024 * 1024);

      if (wantsBlobUpload) {
        for (const f of list) {
          let blob: PutBlobResult;
          try {
            blob = await uploadToVercelBlob(f.name || "upload.bin", f, {
              access: "public",
              handleUploadUrl: "/api/portal/media/blob-upload",
              headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
            });
          } catch (err) {
            const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
            throw new Error(msg);
          }

          const finalizeRes = await fetch("/api/portal/media/items/from-blob", {
            method: "POST",
            headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
            body: JSON.stringify({
              url: blob.url,
              fileName: f.name || blob.pathname || "upload.bin",
              mimeType: f.type || blob.contentType || "application/octet-stream",
              fileSize: Number.isFinite(f.size) ? f.size : 0,
              folderId: folderId || null,
            }),
          });
          const finalizeJson = (await finalizeRes.json().catch(() => null)) as any;
          if (!finalizeRes.ok || !finalizeJson || finalizeJson.ok !== true) {
            throw new Error(typeof finalizeJson?.error === "string" ? finalizeJson.error : "Upload failed");
          }
        }

        setUploading(false);
        await load(folderId);
        return;
      }

      const form = new FormData();
      if (folderId) form.append("folderId", folderId);
      list.forEach((f) => form.append("files", f));

      const res = await fetch("/api/portal/media/items", {
        method: "POST",
        body: form,
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setUploading(false);
        setError(typeof json?.error === "string" ? json.error : "Upload failed");
        return;
      }

      setUploading(false);
      await load(folderId);
    } catch {
      setUploading(false);
      setError("Upload failed. Please try again.");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  async function copyTextWithToast(text: string | null | undefined, toastText: string, el?: HTMLElement | null) {
    if (!text) return;
    await copy(text);
    showToastNear(el ?? null, toastText);
  }

  function updateListGrowthProfile(itemId: string, profile: MediaGrowthProfile) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, growthProfile: profile } : item)));
    setSelectedItemDetail((prev) => (prev && prev.id === itemId ? { ...prev, growthProfile: profile } : prev));
    setSelectedGrowthProfile(profile);
  }

  async function saveGrowthProfileForItem(itemId: string, current: MediaGrowthProfile, partial?: Partial<MediaGrowthProfile>, successText: string | null = "Post details saved") {
    if (!itemId || !current) return;

    const next = normalizeMediaGrowthProfileForSave(current, partial) as MediaGrowthProfile;

    setDetailSaving(true);
    setError(null);

    const res = await fetch(`/api/portal/media/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        growthProfile: {
          workflowState: next.workflowState,
          assetPurpose: next.assetPurpose,
          relatedOffer: next.relatedOffer,
          targetPlatform: next.targetPlatform,
          campaignLabel: next.campaignLabel,
          captionDraft: next.captionDraft,
          ctaLabel: next.ctaLabel,
          ctaHref: next.ctaHref,
          notes: next.notes,
          bookingLinkUrl: next.bookingLinkUrl,
          funnelId: next.funnelId,
          funnelName: next.funnelName,
          funnelSlug: next.funnelSlug,
          funnelPageId: next.funnelPageId,
          funnelPageTitle: next.funnelPageTitle,
          funnelPageSlug: next.funnelPageSlug,
          plannedForIso: next.plannedForIso,
          approvedAtIso: next.approvedAtIso,
          postedAtIso: next.postedAtIso,
          postedUrl: next.postedUrl,
          distributionProvider: next.distributionProvider,
          providerConnectionState: next.providerConnectionState,
          providerPublishState: next.providerPublishState,
          providerDestinationType: next.providerDestinationType,
          providerDestinationId: next.providerDestinationId,
          providerDestinationLabel: next.providerDestinationLabel,
          providerAccountLabel: next.providerAccountLabel,
          providerScheduledForIso: next.providerScheduledForIso,
          providerQueuedAtIso: next.providerQueuedAtIso,
          providerPendingAtIso: next.providerPendingAtIso,
          queueOrder: next.queueOrder,
          dailyPostCap: next.dailyPostCap,
          providerStatus: next.providerStatus,
          providerPostId: next.providerPostId,
          providerLastError: next.providerLastError,
          providerRetryEligible: next.providerRetryEligible,
          providerRetryAtIso: next.providerRetryAtIso,
          providerLastAttemptAtIso: next.providerLastAttemptAtIso,
          providerPublishedAtIso: next.providerPublishedAtIso,
          metricsImpressions: next.metricsImpressions,
          metricsReach: next.metricsReach,
          metricsEngagementCount: next.metricsEngagementCount,
          metricsClickCount: next.metricsClickCount,
          metricsSyncedAtIso: next.metricsSyncedAtIso,
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; growthProfile?: MediaGrowthProfile } | null;
    if (!res.ok || !json?.ok || !json.growthProfile) {
      setDetailSaving(false);
      setError(typeof json?.error === "string" ? json.error : "Could not save campaign details");
      return null;
    }

    updateListGrowthProfile(itemId, json.growthProfile);
    setDetailSaving(false);
    if (successText) toastNotify.success(successText);
    return json.growthProfile;
  }

  async function saveSelectedGrowthProfile(partial?: Partial<MediaGrowthProfile>, options?: { preserveWorkflowState?: boolean }) {
    const itemId = previewItem?.id;
    const current = previewGrowthProfile;
    if (!itemId || !current) return;
    await saveGrowthProfileForItem(
      itemId,
      current,
      options?.preserveWorkflowState ? partial : buildComposerSavePartial(current, partial),
    );
  }

  async function queueProviderPublishForSelectedItem() {
    const itemId = previewItem?.id;
    const current = previewGrowthProfile;
    if (!itemId || !current) return;

    const savedProfile = await saveGrowthProfileForItem(itemId, current, buildComposerSavePartial(current), null);
    if (!savedProfile) return;

    setDetailSaving(true);
    setError(null);

    const res = await fetch("/api/portal/media/publish/queue", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [PORTAL_VARIANT_HEADER]: portalVariant,
      },
      body: JSON.stringify({ mediaItemId: itemId }),
    });

    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      outcome?: string;
      reason?: string;
      error?: string;
      growthProfile?: MediaGrowthProfile;
    } | null;

    if (!res.ok || !json?.ok || !json.growthProfile || json.outcome !== "queued") {
      setDetailSaving(false);
      const message = typeof json?.reason === "string"
        ? json.reason
        : typeof json?.error === "string"
          ? json.error
          : "Auto-posting is not ready yet.";
      setError(message);
      toastNotify.error(message);
      return;
    }

    updateListGrowthProfile(itemId, json.growthProfile);
    setDetailSaving(false);
    toastNotify.success("Post queued");
  }

  async function createBlobBackedItem(file: File, nextFolderId: string | null) {
    let blob: PutBlobResult;
    try {
      blob = await uploadToVercelBlob(file.name || "upload.bin", file, {
        access: "public",
        handleUploadUrl: "/api/portal/media/blob-upload",
        headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
      });
    } catch (err) {
      const message = (err as any)?.message ? String((err as any).message) : "Upload failed";
      throw new Error(message);
    }

    const finalizeRes = await fetch("/api/portal/media/items/from-blob", {
      method: "POST",
      headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
      body: JSON.stringify({
        url: blob.url,
        fileName: file.name || blob.pathname || "upload.bin",
        mimeType: file.type || blob.contentType || "application/octet-stream",
        fileSize: Number.isFinite(file.size) ? file.size : 0,
        folderId: nextFolderId,
      }),
    });

    const finalizeJson = (await finalizeRes.json().catch(() => null)) as { ok?: boolean; error?: string; item?: Item } | null;
    if (!finalizeRes.ok || !finalizeJson?.ok || !finalizeJson.item) {
      throw new Error(typeof finalizeJson?.error === "string" ? finalizeJson.error : "Upload failed");
    }

    return finalizeJson.item;
  }

  async function prepareInstagramVariantForSelectedItem(file: File) {
    if (!previewItem || !previewGrowthProfile) return;

    setDetailSaving(true);
    setError(null);

    try {
      const preparedFileName = buildPreparedVariantFileName(
        replaceFileExtension(previewItem.fileName, "png"),
        previewGrowthProfile.targetPlatform === "instagram_story" ? "instagram-story-ready" : "instagram-feed-ready",
      );
      const preparedFile = new File([file], preparedFileName, { type: file.type || "image/png" });
      const createdItem = await createBlobBackedItem(preparedFile, previewItem.folderId || folderId || null);
      const clonedProfile = await saveGrowthProfileForItem(
        createdItem.id,
        emptyGrowthProfile(createdItem.id),
        buildPreparedVariantGrowthProfile(previewGrowthProfile, createdItem.id),
        null,
      );

      await load(folderId);

      setSelected({ kind: "item", id: createdItem.id });
      setSelectedItemDetail({ ...createdItem, growthProfile: clonedProfile || emptyGrowthProfile(createdItem.id) });
      setSelectedGrowthProfile(clonedProfile || emptyGrowthProfile(createdItem.id));
      setCropModalOpen(false);
      toastNotify.success("Instagram-ready asset created");
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Could not prepare the Instagram-ready asset";
      setError(message);
      toastNotify.error(message);
    } finally {
      setDetailSaving(false);
    }
  }

  function openItemPreview(itemId: string) {
    setSelected({ kind: "item", id: itemId });
    setPreviewOpen(true);
  }

  function showToastNear(el: HTMLElement | null, text: string) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 220, Math.max(12, r.left));
    const top = Math.min(window.innerHeight - 48, Math.max(12, r.top - 42));
    setToast({ text, left, top });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1400);
  }

  async function copyAbsoluteUrl(urlPath: string, el?: HTMLElement | null) {
    const absolute = urlPath.startsWith("http") ? urlPath : toPurelyHostedUrl(urlPath);
    await copy(absolute);
    showToastNear(el ?? null, "Link copied");
  }

  function triggerDownload(urlPath: string, fileName?: string) {
    const a = document.createElement("a");
    a.href = urlPath.startsWith("http") ? urlPath : toPurelyHostedUrl(urlPath);
    a.download = fileName || "";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function folderColorClass(color?: string | null, tag?: string | null, name?: string | null) {
    switch (inferFolderAccent(color, tag, name)) {
      case "blue":
        return "bg-(--color-brand-blue)";
      case "green":
        return "bg-emerald-500";
      case "amber":
        return "bg-amber-500";
      case "purple":
        return "bg-violet-500";
      case "pink":
        return "bg-pink-500";
      case "red":
        return "bg-red-500";
      default:
        return "bg-zinc-400";
    }
  }

  async function setFolderColor(folderIdToSet: string, color: string | null) {
    setError(null);
    const res = await fetch(`/api/portal/media/folders/${folderIdToSet}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      setError(typeof json?.error === "string" ? json.error : "Could not update folder color");
      return;
    }
    await load(folderId);
  }

  function openDotsMenu(e: MouseEvent, kind: "folder" | "item", id: string) {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const menuWidth = 224; // w-56
    const VIEWPORT_PAD = 12;
    const GAP = 8;
    const EST_HEIGHT = 320;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, r.right - menuWidth));

    const spaceBelow = viewportH - r.bottom - GAP - VIEWPORT_PAD;
    const spaceAbove = r.top - GAP - VIEWPORT_PAD;
    const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 260) || spaceBelow >= spaceAbove;

    const available = placeDown ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(160, Math.min(EST_HEIGHT, available));
    const usedHeight = Math.min(EST_HEIGHT, maxHeight);

    const rawTop = placeDown ? r.bottom + GAP : r.top - GAP - usedHeight;
    const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

    setOpenMenu({ kind, id, left, top, maxHeight });
  }

  const menuTarget = useMemo(() => {
    if (!openMenu) return null;
    if (openMenu.kind === "item") return items.find((x) => x.id === openMenu.id) || null;
    return folders.find((x) => x.id === openMenu.id) || null;
  }, [openMenu, items, folders]);

  async function removeItemById(id: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"?`)) return;

    const res = await fetch(`/api/portal/media/items/${id}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setError(typeof json?.error === "string" ? json.error : "Delete failed");
      return;
    }

    setSelected(null);
    await load(folderId);
  }

  async function ensureAllFoldersLoaded() {
    if (foldersLoading) return;
    setFoldersLoading(true);
    const res = await fetch("/api/portal/media/folders", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as AllFoldersRes | null;
    if (!res.ok || !json || json.ok !== true) {
      setFoldersLoading(false);
      setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load folders");
      return;
    }
    setAllFolders((json.folders || []).map((f) => ({ id: f.id, parentId: f.parentId, name: f.name })));
    setFoldersLoading(false);
  }

  function openRename(kind: "folder" | "item", id: string, initial: string) {
    setOpenMenu(null);
    setRenaming({ kind, id, initial });
    setRenameValue(initial);
  }

  async function submitRename() {
    if (!renaming) return;
    const next = renameValue.replace(/[\r\n\t\0]/g, " ").replace(/\s+/g, " ").trim();
    if (!next) return;

    setMoveWorking(true);
    setError(null);

    const endpoint =
      renaming.kind === "item" ? `/api/portal/media/items/${renaming.id}` : `/api/portal/media/folders/${renaming.id}`;
    const payload = renaming.kind === "item" ? { fileName: next } : { name: next };

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      setMoveWorking(false);
      setError(typeof json?.error === "string" ? json.error : "Rename failed");
      return;
    }

    setRenaming(null);
    setMoveWorking(false);
    await load(folderId);
  }

  async function openMove(kind: "folder" | "item", id: string) {
    setOpenMenu(null);
    setMoving({ kind, id });
    setMoveDestId(kind === "item" ? folderId : folderId);
    await ensureAllFoldersLoaded();
  }

  function buildFolderOptions() {
    const children = new Map<string | null, Array<{ id: string; parentId: string | null; name: string }>>();
    for (const f of allFolders) {
      const k = f.parentId ?? null;
      const arr = children.get(k) ?? [];
      arr.push(f);
      children.set(k, arr);
    }
    for (const [k, arr] of children) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      children.set(k, arr);
    }

    const out: Array<{ id: string; name: string; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const list = children.get(parentId) ?? [];
      for (const f of list) {
        out.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  async function submitMove() {
    if (!moving) return;
    setMoveWorking(true);
    setError(null);

    const endpoint = moving.kind === "item" ? `/api/portal/media/items/${moving.id}` : `/api/portal/media/folders/${moving.id}`;
    const payload = moving.kind === "item" ? { folderId: moveDestId } : { parentId: moveDestId };

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      setMoveWorking(false);
      setError(typeof json?.error === "string" ? json.error : "Move failed");
      return;
    }

    setMoving(null);
    setMoveWorking(false);
    await load(folderId);
  }

  async function createFolderInMove() {
    const name = moveCreatingName.trim();
    if (!name) return;
    if (moveWorking) return;
    setMoveWorking(true);
    setError(null);

    const res = await fetch("/api/portal/media/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: moveDestId, name }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setMoveWorking(false);
      setError(typeof json?.error === "string" ? json.error : "Could not create folder");
      return;
    }

    setMoveCreatingName("");
    await ensureAllFoldersLoaded();
    setMoveDestId(String(json.folderId));
    setMoveWorking(false);
    await load(folderId);
  }

  async function markItemPostedManually(item: Item) {
    const profile = item.growthProfile || emptyGrowthProfile(item.id);
    await saveGrowthProfileForItem(
      item.id,
      profile,
      {
        workflowState: "posted_manually",
        postedAtIso: profile.postedAtIso || new Date().toISOString(),
        providerPublishState: "manual_only",
      },
      "Marked as posted manually",
    );
  }

  function renderCalendarItem(item: Item) {
    const profile = item.growthProfile || emptyGrowthProfile(item.id);
    const previewKind = itemPreviewKind(item);
    const continuity = resolveProviderContinuity(profile);
    const nextStep = buildWorkflowNextStep(profile, continuity, portalVariant);
    const resolvedDestination = resolveComposerDestination(profile);
    const scheduleLabel = profile.plannedForIso ? `${formatCalendarDay(profile.plannedForIso)} at ${formatCalendarTime(profile.plannedForIso)}` : "No schedule";
    const campaignLabel = profile.campaignLabel || profile.relatedOffer || "Not labeled";
    const ctaLabel = profile.ctaLabel || (resolvedDestination.href ? resolvedDestination.sourceLabel : isCreditWorkspace ? "No consultation link yet" : "No booking link yet");
    const providerLabel = `${continuity.providerLabel} -+ ${continuity.connectionLabel}`;
    const cardSummary = profile.captionDraft
      ? profile.captionDraft.slice(0, 140)
      : nextStep.detail;
    const supportHref = profile.postedUrl || resolvedDestination.href || null;
    const supportLabel = profile.postedUrl ? "Open post" : resolvedDestination.href ? "Open destination" : null;

    return (
      <article key={item.id} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md">
        <button
          type="button"
          onClick={() => openItemPreview(item.id)}
          className="group block w-full text-left"
        >
          <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
            {previewKind === "image" && item.previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
            ) : previewKind === "video" && (item.previewUrl || item.openUrl) ? (
              <video src={item.previewUrl || item.openUrl} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" muted playsInline preload="metadata" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-zinc-500">{itemTypeLabel(item)}</div>
            )}
            <div className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-zinc-900 shadow-sm">
                  {growthStateLabel(profile.workflowState)}
                </span>
                {profile.targetPlatform ? (
                  <span className="rounded-full bg-sky-50/95 px-2.5 py-1 text-[11px] font-semibold text-sky-700 shadow-sm">
                    {targetPlatformLabel(profile.targetPlatform)}
                  </span>
                ) : null}
              </div>
              <span
                className={classNames(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm",
                  continuity.blocked
                    ? "bg-rose-50/95 text-rose-700"
                    : continuity.publishState === "published"
                      ? "bg-emerald-50/95 text-emerald-700"
                      : continuity.publishState === "queued"
                        ? "bg-sky-50/95 text-sky-700"
                        : "bg-white/92 text-zinc-700",
                )}
              >
                {continuity.publishLabel}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-zinc-950/75 via-zinc-950/30 to-transparent p-3 text-white">
              <div className="truncate text-base font-semibold">{item.fileName}</div>
              <div className="mt-1 text-xs text-white/85">{campaignLabel}</div>
            </div>
          </div>
        </button>

        <div className="p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl bg-zinc-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Schedule</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{scheduleLabel}</div>
            </div>
            <div className="rounded-2xl bg-zinc-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">CTA</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{ctaLabel}</div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Provider lane</div>
                <div className="mt-1 font-semibold text-zinc-900">{providerLabel}</div>
              </div>
              {profile.postedAtIso ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Posted {formatCalendarDay(profile.postedAtIso)}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-zinc-600">{cardSummary}</div>
            {profile.providerLastError ? <div className="mt-2 text-xs text-rose-700">{profile.providerLastError}</div> : null}
          </div>

          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Next step</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{nextStep.title}</div>
            <div className="mt-1 text-xs text-zinc-600">{nextStep.detail}</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openItemPreview(item.id)}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              Create post
            </button>
            {supportHref && supportLabel ? (
              <a
                href={supportHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                {supportLabel}
              </a>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderWorkflowSection(section: { key: Exclude<WorkflowFilterKey, "all">; label: string; description: string; count: number }) {
    if (section.key === "scheduled") {
      return (
        <section key={section.key} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{section.label}</div>
              <div className="mt-1 text-xs text-zinc-500">{section.description}</div>
            </div>
            <div className="text-xs text-zinc-500">{section.count} item{section.count === 1 ? "" : "s"}</div>
          </div>
          <div className="space-y-5">
            {plannedCalendarGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{group.label}</div>
                  <div className="text-xs text-zinc-500">{group.entries.length} item{group.entries.length === 1 ? "" : "s"}</div>
                </div>
                <div className="mt-2 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{group.entries.map((item) => renderCalendarItem(item))}</div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    const itemsForSection =
      section.key === "ready"
        ? readyWithoutScheduleItems
        : section.key === "review"
          ? needsApprovalItems
          : section.key === "needs_copy"
            ? needsCaptionItems
            : section.key === "manual_only"
              ? manualOnlyItems
              : postedCalendarItems;

    const gridClass = section.key === "posted" ? "md:grid-cols-2 2xl:grid-cols-3" : "md:grid-cols-2";

    return (
      <section key={section.key} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">{section.label}</div>
            <div className="mt-1 text-xs text-zinc-500">{section.description}</div>
          </div>
          <div className="text-xs text-zinc-500">{section.count} item{section.count === 1 ? "" : "s"}</div>
        </div>
        <div className={classNames("grid gap-4", gridClass)}>{itemsForSection.map((item) => renderCalendarItem(item))}</div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Media library</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Store media, plan content against real assets, and track manual posting. Direct social publishing is not connected yet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-2xl border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("library")}
              className={classNames(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                viewMode === "library" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
              )}
            >
              Library
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("calendar");
                if (folderId) setFolderId(null);
              }}
              className={classNames(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                viewMode === "calendar" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
              )}
            >
              Content calendar
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files and tags..."
            className="h-10 w-60 max-w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
          />
          <input
            ref={uploadRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void uploadFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-base leading-none">+</span>
            {uploading ? "Uploading" : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            New folder
          </button>
        </div>
      </div>

      {folderId && viewMode === "library" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
          >
            All media
          </button>
          {breadcrumbs.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">/</span>
              <button
                type="button"
                onClick={() => setFolderId(b.id)}
                className="text-xs font-semibold text-zinc-700 hover:underline"
                title={b.tag}
              >
                {b.name}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <div className={classNames(viewMode === "calendar" ? "" : "overflow-hidden rounded-3xl border border-zinc-200 bg-white")}>
          {viewMode === "calendar" ? null : (
          <div className="border-b border-zinc-100 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Folders</div>
                <div className="mt-1 text-xs text-zinc-500">Each folder gets a tag you can reference later.</div>
              </div>
              <div className="text-xs text-zinc-500">Select any item for preview actions.</div>
            </div>
          </div>
          )}

          <div className={viewMode === "calendar" ? "" : "p-4"}>
            {refreshing ? (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
                Refreshing
              </div>
            ) : null}
            {loading ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                <div className="flex items-center gap-3">
                  <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
                  <span>Loading media library</span>
                </div>
              </div>
            ) : libraryError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                <div className="font-semibold">Media Library could not be loaded.</div>
                <div className="mt-2">{libraryError}</div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void load(folderId)}
                    className="inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : viewMode === "calendar" ? (
              <div className="space-y-6">
                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Content planning</div>
                      <div className="mt-1 text-sm text-zinc-600">
                        {isCreditWorkspace
                          ? "Plan directly from your media, then open any card for consultation links, notes, scheduling, and posted-manual tracking."
                          : "Plan directly from your media, then open any card for booking links, notes, scheduling, and posted-manual tracking."}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">Video assets can be prepared for YouTube here. Upload and analytics stay manual for now.</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => void copyTextWithToast(calendarExportText, "Calendar export copied", e.currentTarget)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Copy export
                    </button>
                  </div>

                  {workflowFilterOptions.length > 1 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {workflowFilterOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setWorkflowFilter(option.key)}
                          className={classNames(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                            workflowFilter === option.key
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                          )}
                        >
                          <span className="font-semibold">{option.label}</span>
                          <span className={classNames(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            workflowFilter === option.key ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-600",
                          )}>
                            {option.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {visibleWorkflowSections.length === 0 && !(workflowFilter === "all" && providerHistoryItems.length) ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                    <div className="font-semibold text-zinc-900">
                      {workflowFilter === "all" ? "Nothing is in the planner yet" : `${workflowFilterLabel} is clear`}
                    </div>
                    <div className="mt-2">{workflowEmptyMessage}</div>
                  </div>
                ) : null}

                <div className="space-y-6">
                  {visibleWorkflowSections.map((section) => renderWorkflowSection(section))}
                </div>

                {workflowFilter === "all" && providerHistoryItems.length ? (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Stored provider history</div>
                        <div className="mt-1 text-xs text-zinc-500">Older provider records stay attached to the asset for continuity, but live publishing still stays manual here.</div>
                      </div>
                      <div className="text-xs text-zinc-500">{providerHistoryItems.length} item{providerHistoryItems.length === 1 ? "" : "s"}</div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{providerHistoryItems.map((item) => renderCalendarItem(item))}</div>
                  </section>
                ) : null}
              </div>
            ) : filteredFolders.length === 0 && filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                Upload photos, service examples, testimonials, or offer assets. Then turn them into posts, pages, emails, or booking traffic.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  <div className="font-semibold text-zinc-900">Media-to-campaign workflow</div>
                  <div className="mt-1">Upload once, organize it, draft copy, attach a booking or funnel destination, then mark the asset ready, planned, or used in a campaign.</div>
                </div>
                {filteredFolders.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">Folders</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredFolders.map((f) => (
                        <div
                          key={f.id}
                          onClick={() => {
                            setFolderId(f.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFolderId(f.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className="flex min-h-40 w-full cursor-pointer flex-col rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className={classNames("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", folderColorClass(f.color, f.tag, f.name))}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path
                                    d="M3.75 7.5C3.75 6.25736 4.75736 5.25 6 5.25H10.05C10.4478 5.25 10.8293 5.40767 11.1107 5.68934L12.1716 6.75H18C19.2426 6.75 20.25 7.75736 20.25 9V16.5C20.25 17.7426 19.2426 18.75 18 18.75H6C4.75736 18.75 3.75 17.7426 3.75 16.5V7.5Z"
                                    stroke="white"
                                    strokeWidth="1.8"
                                  />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{f.name}</div>
                                <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">tag: {f.tag}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
                              aria-label="Folder actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDotsMenu(e, "folder", f.id);
                              }}
                            >
                              <MoreDotsIcon />
                            </button>
                          </div>
                          <div className="mt-auto inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                            Open folder
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {filteredItems.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">Files</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredItems.map((it) => {
                        const previewKind = itemPreviewKind(it);
                        return (
                          <div
                            key={it.id}
                            onClick={() => {
                              setSelected({ kind: "item", id: it.id });
                              setPreviewOpen(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelected({ kind: "item", id: it.id });
                                setPreviewOpen(true);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className={classNames(
                              "flex min-h-56 w-full cursor-pointer flex-col rounded-2xl border p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50",
                              selected?.kind === "item" && selected.id === it.id ? "border-zinc-900" : "border-zinc-200",
                            )}
                          >
                            <div className="flex w-full items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 wrap-break-word text-sm font-semibold leading-5 text-zinc-900">{it.fileName}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                  <span className="font-mono">tag: {it.tag}</span>
                                  <span>|</span>
                                  <span>{formatBytes(it.fileSize)}</span>
                                </div>
                                <div className="mt-2 space-y-2 text-[11px]">
                                  <div className="flex min-h-7 flex-wrap gap-2">
                                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700">
                                      {growthStateLabel(it.growthProfile?.workflowState)}
                                    </span>
                                    {it.growthProfile?.targetPlatform ? (
                                      <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                                        {targetPlatformLabel(it.growthProfile.targetPlatform)}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex min-h-7 flex-wrap gap-2">
                                    {it.growthProfile && resolveComposerDestination(it.growthProfile).href ? (
                                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">Destination linked</span>
                                    ) : null}
                                    {it.growthProfile?.funnelId ? (
                                      <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Funnel linked</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
                                aria-label="File actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDotsMenu(e, "item", it.id);
                                }}
                              >
                                <MoreDotsIcon />
                              </button>
                            </div>
                            <div className="mt-3 flex min-w-0 w-full flex-1 flex-col items-start gap-3">
                              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-zinc-100">
                                {previewKind === "image" && it.previewUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={it.previewUrl} alt={it.fileName} className="h-full w-full object-cover" />
                                ) : previewKind === "video" && (it.previewUrl || it.openUrl) ? (
                                  <video
                                    src={it.previewUrl || it.openUrl}
                                    className="h-full w-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-700">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path
                                        d="M7.5 3.75H13.5L16.5 6.75V20.25H7.5V3.75Z"
                                        stroke="#3f3f46"
                                        strokeWidth="1.8"
                                      />
                                      <path d="M13.5 3.75V6.75H16.5" stroke="#3f3f46" strokeWidth="1.8" />
                                    </svg>
                                    <div className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold tracking-wide text-zinc-700">
                                      {itemTypeLabel(it)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

      </div>

      {openMenu && menuTarget && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-90" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenMenu(null)} onTouchStart={() => setOpenMenu(null)} />
              <div
                className="fixed z-95 w-56 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                style={{ left: openMenu.left, top: openMenu.top, maxHeight: openMenu.maxHeight }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {openMenu.kind === "item" ? (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const it = menuTarget as Item;
                        openRename("item", it.id, it.fileName);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const it = menuTarget as Item;
                        void openMove("item", it.id);
                      }}
                    >
                      Add to folder
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={(e) => {
                        setOpenMenu(null);
                        void copyAbsoluteUrl((menuTarget as Item).shareUrl, e.currentTarget);
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const it = menuTarget as Item;
                        setOpenMenu(null);
                        triggerDownload(it.downloadUrl, it.fileName);
                      }}
                    >
                      Download
                    </button>
                    <a
                      className="block w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      href={(menuTarget as Item).openUrl || (menuTarget as Item).previewUrl || (menuTarget as Item).downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpenMenu(null)}
                    >
                      Open in new tab
                    </a>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setOpenMenu(null);
                        const it = menuTarget as Item;
                        void removeItemById(it.id, it.fileName);
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const f = menuTarget as Folder;
                        openRename("folder", f.id, f.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const f = menuTarget as Folder;
                        void openMove("folder", f.id);
                      }}
                    >
                      Move to folder
                    </button>
                    <div className="px-4 py-2 text-[11px] font-semibold text-zinc-500">Color</div>
                    <div className="flex flex-wrap gap-2 px-4 pb-3">
                      {[
                        { k: null, c: "bg-zinc-400" },
                        { k: "blue", c: "bg-(--color-brand-blue)" },
                        { k: "green", c: "bg-emerald-500" },
                        { k: "amber", c: "bg-amber-500" },
                        { k: "purple", c: "bg-violet-500" },
                        { k: "pink", c: "bg-pink-500" },
                        { k: "red", c: "bg-red-500" },
                      ].map((x) => (
                        <button
                          key={String(x.k)}
                          type="button"
                          className={classNames("h-6 w-6 rounded-xl border border-white", x.c)}
                          onClick={() => {
                            setOpenMenu(null);
                            const f = menuTarget as Folder;
                            void setFolderColor(f.id, x.k);
                          }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={(e) => {
                        setOpenMenu(null);
                        void copyAbsoluteUrl((menuTarget as Folder).shareUrl, e.currentTarget);
                      }}
                    >
                      Copy folder link
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const f = menuTarget as Folder;
                        setOpenMenu(null);
                        triggerDownload(f.downloadUrl || f.shareUrl, `${f.name}.zip`);
                      }}
                    >
                      Download zip
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {toast && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-200 rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white shadow-lg"
              style={{ left: toast.left, top: toast.top }}
            >
              {toast.text}
            </div>,
            document.body,
          )
        : null}

      {renaming && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pa-modal-safe-pad sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setRenaming(null)} />
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-md overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                <div className="text-sm font-semibold text-zinc-900">Rename</div>
                <div className="mt-1 text-xs text-zinc-500">Update the display name.</div>

                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="mt-4 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                />

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setRenaming(null)}
                    disabled={moveWorking}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-2xl bg-brand-ink px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    onClick={() => void submitRename()}
                    disabled={moveWorking || !renameValue.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moving && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pa-modal-safe-pad sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setMoving(null)} />
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-lg overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                <div className="text-sm font-semibold text-zinc-900">
                  {moving.kind === "item" ? "Add to folder" : "Move folder"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">Pick a destination, or create a new folder.</div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-zinc-600">Destination</label>
                  <PortalListboxDropdown
                    value={moveDestId ?? ""}
                    onChange={(v) => setMoveDestId(v ? v : null)}
                    disabled={foldersLoading || moveWorking}
                    options={[
                      { value: "", label: "Top level" },
                      ...buildFolderOptions().map((opt) => ({
                        value: opt.id,
                        label: "\u00A0".repeat(opt.depth * 2) + opt.name,
                      })),
                    ]}
                    className="mt-2 w-full"
                    buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-700">Create a new folder here</div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={moveCreatingName}
                      onChange={(e) => setMoveCreatingName(e.target.value)}
                      placeholder="Folder name"
                      className="h-10 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                      disabled={moveWorking}
                    />
                    <button
                      type="button"
                      onClick={() => void createFolderInMove()}
                      disabled={moveWorking || !moveCreatingName.trim()}
                      className="h-10 rounded-2xl bg-brand-ink px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setMoving(null)}
                    disabled={moveWorking}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    onClick={() => void submitMove()}
                    disabled={moveWorking}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {previewOpen && previewItem && previewGrowthProfile && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-110 flex items-end justify-center px-4 pa-modal-safe-pad sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setPreviewOpen(false)} />
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-6xl overflow-auto rounded-4xl border border-zinc-200 bg-white p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-zinc-900">Create post</div>
                      {previewPostComposerStatus ? (
                        previewBlockedSetupHref && previewPostComposerStatus.label === "Blocked" ? (
                          <a
                            href={previewBlockedSetupHref}
                            className={classNames(
                              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors hover:opacity-90",
                              composerStatusToneClass(previewPostComposerStatus.tone),
                            )}
                          >
                            {previewPostComposerStatus.label}
                          </a>
                        ) : (
                          <span className={classNames("rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", composerStatusToneClass(previewPostComposerStatus.tone))}>
                            {previewPostComposerStatus.label}
                          </span>
                        )
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-zinc-500">Write the caption, choose the destination, and schedule the post without the extra builder clutter.</div>
                    <div className="mt-1 truncate text-xs text-zinc-500">{previewItem.fileName} | {previewItem.mimeType} | {formatBytes(previewItem.fileSize)}</div>
                    {composerReturnNotice ? (
                      <div
                        data-meta-return-notice="true"
                        className={classNames("mt-3 rounded-2xl border px-4 py-3", composerReturnNoticeClass(composerReturnNotice.tone))}
                      >
                        <div className="text-sm font-semibold">{composerReturnNotice.title}</div>
                        <div className="mt-1 text-xs leading-5 opacity-90">{composerReturnNotice.message}</div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Close preview"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-500 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-800"
                    onClick={() => setPreviewOpen(false)}
                  >
                    x
                  </button>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.95fr)]">
                  <div className="space-y-4 lg:sticky lg:top-0">
                    {!previewPlatformBehavior ? (
                      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50">
                        {itemPreviewKind(previewItem) === "image" && previewItem.previewUrl ? (
                          <div className="overflow-hidden bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewItem.previewUrl} alt={previewItem.fileName} className="w-full object-cover" />
                          </div>
                        ) : itemPreviewKind(previewItem) === "video" && (previewItem.previewUrl || previewItem.openUrl) ? (
                          <div className="overflow-hidden bg-black">
                            <video
                              src={previewItem.previewUrl || previewItem.openUrl}
                              className="w-full"
                              controls
                              playsInline
                              preload="metadata"
                            />
                          </div>
                        ) : (
                          <div className="p-8 text-sm text-zinc-600">Preview not available for this file type.</div>
                        )}
                      </div>
                    ) : null}

                    {previewPlatformBehavior ? (
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Local platform preview</div>
                            <div className="mt-1 text-sm font-semibold text-zinc-900">{previewPlatformBehavior.previewLabel}</div>
                          </div>
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-700">{previewPlatformBehavior.label}</span>
                        </div>

                        <div className="mt-4 rounded-[28px] border border-zinc-200 bg-zinc-50 p-4">
                          {previewPlatformBehavior.kind === "youtube" ? (
                            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200">
                              <div className="overflow-hidden bg-zinc-100">
                                {itemPreviewKind(previewItem) === "video" && (previewItem.previewUrl || previewItem.openUrl) ? (
                                  <video
                                    src={previewItem.previewUrl || previewItem.openUrl}
                                    className="aspect-video w-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : itemPreviewKind(previewItem) === "image" && previewItem.previewUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={previewItem.previewUrl} alt={previewItem.fileName} className="aspect-video w-full object-cover" />
                                ) : (
                                  <div className="aspect-video w-full bg-zinc-100" />
                                )}
                              </div>

                              <div className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-full bg-zinc-200" />
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{previewPlatformBehavior.accountLabel}</div>
                                    <div className="text-xs text-zinc-500">{previewPlatformBehavior.accountHandle}</div>
                                  </div>
                                </div>

                                <div className="mt-4 text-base font-semibold leading-6 text-zinc-900">{previewYouTubeDraft.title}</div>

                                <div className="mt-4 rounded-2xl bg-zinc-50 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Description</div>
                                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                                    {previewYouTubeDraft.body || "Your description draft will render here."}
                                  </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewPlatformBehavior.previewLinkLabel}</div>
                                  <div className="mt-2 text-sm font-semibold text-zinc-900">{previewResolvedCtaLabel || previewPlatformBehavior.defaultCtaLabel}</div>
                                  <div className="mt-1 break-all text-xs text-zinc-500">{previewResolvedLinkHref || "Add the follow-up link you want in the description or pinned comment."}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200">
                              <div className="flex items-center gap-3 px-4 py-3">
                                <div className="h-10 w-10 rounded-full bg-zinc-200" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-zinc-900">{previewPlatformBehavior.accountLabel}</div>
                                  <div className="text-xs text-zinc-500">{previewPlatformBehavior.accountHandle}</div>
                                </div>
                              </div>

                              <div className="overflow-hidden border-y border-zinc-200 bg-zinc-100">
                                {itemPreviewKind(previewItem) === "image" && previewItem.previewUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    data-local-platform-preview-media="true"
                                    src={previewItem.previewUrl}
                                    alt={previewItem.fileName}
                                    className={classNames(
                                      "w-full object-cover",
                                      previewPlatformAspectClass,
                                    )}
                                  />
                                ) : itemPreviewKind(previewItem) === "video" && (previewItem.previewUrl || previewItem.openUrl) ? (
                                  <video
                                    data-local-platform-preview-media="true"
                                    src={previewItem.previewUrl || previewItem.openUrl}
                                    className={classNames(
                                      "w-full object-cover",
                                      previewPlatformAspectClass,
                                    )}
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : (
                                  <div data-local-platform-preview-media="true" className={classNames("w-full bg-zinc-100", previewPlatformAspectClass)} />
                                )}
                              </div>

                              <div className="space-y-3 px-4 py-4">
                                {renderCaptionPreviewText(
                                  previewGrowthProfile.captionDraft,
                                  `Your ${previewPlatformBehavior.label.toLowerCase()} copy will render here.`,
                                )}

                                {previewPlatformBehavior.kind === "instagram" ? (
                                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewPlatformBehavior.previewLinkLabel}</div>
                                    <div className="mt-2 text-sm font-semibold text-zinc-900">
                                      {previewResolvedDestinationMeta?.sourceLabel || "No bio / DM / profile handoff saved yet"}
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-zinc-500">
                                      Use the link in bio, a DM/message prompt, or the profile booking button if it is configured. Any saved URL stays inside planning and does not become a clickable Instagram button.
                                    </div>
                                    {previewResolvedLinkHref ? (
                                      <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-zinc-500">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Internal reference only</div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-zinc-600">{previewResolvedLinkHref}</div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewPlatformBehavior.previewLinkLabel}</div>
                                    <div className="mt-2 text-sm font-semibold text-zinc-900">{previewResolvedCtaLabel || previewPlatformBehavior.defaultCtaLabel}</div>
                                    <div className="mt-1 break-all text-xs text-zinc-500">
                                      {previewResolvedLinkHref || "Add the direct destination you want visible in the post."}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600">{previewPlatformBehavior.previewLinkHelper}</div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={(e) => void copyAbsoluteUrl(previewItem.shareUrl, e.currentTarget)}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerDownload(previewItem.downloadUrl, previewItem.fileName)}
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Download
                      </button>
                      <a
                        href={previewItem.openUrl || previewItem.previewUrl || previewItem.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => setPreviewOpen(false)}
                      >
                        Open
                      </a>
                    </div>

                    <details className="rounded-3xl border border-zinc-200 bg-white p-4">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Asset actions</summary>
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
                        {previewCanPrepareInstagramAsset ? (
                          <button
                            type="button"
                            onClick={() => setCropModalOpen(true)}
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Prepare for Instagram
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewOpen(false);
                            openRename("item", previewItem.id, previewItem.fileName);
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewOpen(false);
                            void openMove("item", previewItem.id);
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Add to folder
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewOpen(false);
                            void removeItemById(previewItem.id, previewItem.fileName);
                          }}
                          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </details>
                  </div>

                  <div className="space-y-4">
                    <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">{previewPlatformBehavior?.captionFieldLabel || "Caption"}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            {previewIsInstagramComposer
                              ? "Write it like a native Instagram caption. Keep the next step in bio, profile, or DMs instead of faking a post CTA."
                              : previewPlatformBehavior?.guidanceDetail || "Write the post exactly how it should read in the real channel."}
                          </div>
                        </div>
                        {detailLoading ? <div className="text-xs text-zinc-500">Syncing details</div> : null}
                      </div>

                      {detailError ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <div className="font-semibold">Could not refresh the latest post details.</div>
                          <div className="mt-1 text-xs leading-5 text-amber-800">{detailError}. You can keep editing the current asset snapshot and save again.</div>
                        </div>
                      ) : null}

                      <textarea
                        value={previewGrowthProfile.captionDraft || ""}
                        onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, captionDraft: e.target.value || null })}
                        placeholder={previewPlatformBehavior?.captionPlaceholder || "Write the caption, draft copy, or post copy here."}
                        className="mt-4 min-h-44 w-full rounded-[28px] border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                      />

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile()}
                          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                        >
                          {detailSaving ? "Saving" : "Save"}
                        </button>
                        {previewProviderQueueAction.href ? (
                          <a
                            href={previewProviderQueueAction.href}
                            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            {previewProviderQueueAction.label}
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled={previewProviderQueueAction.disabled}
                            onClick={() => void queueProviderPublishForSelectedItem()}
                            className={classNames(
                              "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-semibold",
                              previewProviderQueueAction.disabled
                                ? "border-zinc-200 bg-zinc-100 text-zinc-400"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            {previewProviderQueueAction.label}
                          </button>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-zinc-500">{previewProviderQueueAction.helper}</div>
                    </section>

                    <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Post type and account</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">Choose the post format, how it should go out, and connect the Instagram account here when this workflow should publish through Instagram.</div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-3">
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Format</div>
                          <div className="mt-2">
                            <PortalListboxDropdown
                              value={previewCanonicalTargetPlatform}
                              onChange={(value) => {
                                const nextTarget = value || null;
                                const nextProvider = resolveVisibleDistributionProvider(nextTarget, previewGrowthProfile.distributionProvider, {
                                  allowYouTube: previewSupportsYouTubePlanning,
                                });
                                const providerChanged = nextProvider !== previewGrowthProfile.distributionProvider;
                                const nextProfile = providerChanged ? clearMetaDestinationBlocker({
                                  ...previewGrowthProfile,
                                  providerDestinationType: null,
                                  providerDestinationId: null,
                                  providerDestinationLabel: null,
                                  providerAccountLabel: null,
                                }) : previewGrowthProfile;
                                setSelectedGrowthProfile({
                                  ...nextProfile,
                                  targetPlatform: nextTarget,
                                  distributionProvider: nextProvider,
                                });
                              }}
                              options={targetPlatformOptions}
                              buttonClassName={workflowDropdownButtonClass}
                            />
                          </div>
                        </label>

                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Posting path</div>
                          <div className="mt-2">
                            <PortalListboxDropdown
                              value={previewDistributionProvider}
                              onChange={(value) => {
                                const nextProvider = value as DistributionProviderKey;
                                const providerChanged = nextProvider !== previewGrowthProfile.distributionProvider;
                                const nextProfile = providerChanged ? clearMetaDestinationBlocker({
                                  ...previewGrowthProfile,
                                  providerDestinationType: null,
                                  providerDestinationId: null,
                                  providerDestinationLabel: null,
                                  providerAccountLabel: null,
                                }) : previewGrowthProfile;
                                setSelectedGrowthProfile({
                                  ...nextProfile,
                                  distributionProvider: nextProvider,
                                });
                              }}
                              options={distributionProviderOptions}
                              buttonClassName={workflowDropdownButtonClass}
                            />
                          </div>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Post status</div>
                          <div className="mt-2 text-sm font-semibold text-zinc-900">{previewComposerPostStatusLabel}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">Set one schedule to make this a scheduled post. Clear the schedule to keep it as a draft.</div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
                        <div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                              {previewUsesMetaProviderLane ? "Destination" : "Destination"}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-zinc-900">
                              {previewUsesMetaProviderLane ? "Choose destination" : (previewDestinationSummary?.label || "Manual / external channel")}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-zinc-500">
                              {previewUsesMetaProviderLane
                                ? "Connect or switch the account here first, then choose the destination for this post."
                                : (previewDestinationSummary?.detail || "Purely keeps the plan here without triggering a live provider action.")}
                            </div>
                          </div>
                        </div>

                        {previewShowsInstagramSetup ? (
                          <div className="mt-3 rounded-2xl border border-brand-blue/20 bg-white px-4 py-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-blue">Instagram account</div>
                                <div className="mt-1 text-sm font-semibold text-zinc-900">{metaReadiness?.connectedAccountLabel || "No Instagram account connected yet"}</div>
                                <div className="mt-1 text-xs leading-5 text-zinc-500">
                                  {metaReadiness?.connectedAccountLabel
                                    ? "This is the Instagram account Purely can see right now. If it is the wrong business or creator account, reconfigure it here before choosing the destination below."
                                    : "If this post should publish through Instagram, connect the business or creator account here first."
                                  }
                                </div>
                              </div>
                              <a
                                href={previewDirectMetaActionHref}
                                className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                              >
                                {previewMetaDestinationSetupLabel}
                              </a>
                            </div>
                          </div>
                        ) : null}

                        {previewUsesMetaProviderLane ? (
                          <div className="mt-3 space-y-3">
                            {metaReadinessLoading ? (
                              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                                <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
                                Loading destinations
                              </div>
                            ) : null}
                            {metaReadinessError ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                                {metaReadinessError}
                              </div>
                            ) : null}
                            <PortalListboxDropdown
                              value={previewSelectedMetaDestination?.value || ""}
                              onChange={(value) => {
                                const nextOption = previewMetaDestinationOptions.find((option) => option.value === value) || null;
                                const baseProfile = clearMetaDestinationBlocker(previewGrowthProfile);
                                setSelectedGrowthProfile({
                                  ...baseProfile,
                                  providerDestinationType: nextOption?.destinationType || null,
                                  providerDestinationId: nextOption?.destinationId || null,
                                  providerDestinationLabel: nextOption?.destinationLabel || null,
                                  providerAccountLabel: nextOption?.accountLabel || null,
                                });
                              }}
                              options={previewMetaDestinationOptionsForDropdown}
                              buttonClassName={workflowDropdownButtonClass}
                            />
                            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Current destination</div>
                              <div className="mt-1 text-sm font-semibold text-zinc-900">{previewSelectedMetaDestination?.destinationLabel || "No destination selected yet"}</div>
                              <div className="mt-1 text-xs leading-5 text-zinc-500">
                                {previewSelectedMetaDestination?.hint || "Select the account you want this post to use."}
                              </div>
                            </div>
                            {previewPrimaryMetaDestinationBlocker ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                                {previewPrimaryMetaDestinationBlocker}
                              </div>
                            ) : (
                              <div className="text-xs leading-5 text-emerald-700">Destination is selected and ready to carry into validation.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Post timing</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">Leave this as a draft or give it one schedule. There is no extra planning-state step in this popup.</div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Current status</div>
                          <div className="mt-2 text-sm font-semibold text-zinc-900">{previewComposerPostStatusLabel}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            {previewGrowthProfile.plannedForIso
                              ? `${formatCalendarDay(previewGrowthProfile.plannedForIso)} at ${formatCalendarTime(previewGrowthProfile.plannedForIso)}`
                              : "No schedule is set yet."}
                          </div>
                        </div>

                        <label className="block">
                          <div className="text-xs font-medium text-zinc-600">Schedule post</div>
                          <div className="mt-2">
                            <LocalDateTimePicker
                              value={toDateTimeLocalValue(previewGrowthProfile.plannedForIso)}
                              onChange={(value) => setSelectedGrowthProfile({
                                ...previewGrowthProfile,
                                ...buildComposerSavePartial(previewGrowthProfile, { plannedForIso: fromDateTimeLocalValue(value) }),
                                plannedForIso: fromDateTimeLocalValue(value),
                              })}
                              placeholder="Choose date and time"
                              buttonClassName="h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-left text-sm text-zinc-900 hover:bg-zinc-50"
                            />
                          </div>
                          <div className="mt-2 text-xs text-zinc-500">Clear the schedule to keep this post as a draft.</div>
                        </label>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{previewIsInstagramComposer ? "Link in bio / DM handoff" : "Link and destination"}</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">
                          {previewIsInstagramComposer
                            ? "Keep the CTA native to Instagram. Save the follow-up path here for bio, profile, DMs, or internal tracking."
                            : "Set the visible CTA, linked booking route, or funnel destination for this post."}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {!previewIsInstagramComposer ? (
                          <label className="block">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewPlatformBehavior?.ctaLabelFieldLabel || "CTA label"}</div>
                            <input
                              value={previewGrowthProfile.ctaLabel || ""}
                              onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, ctaLabel: e.target.value || null })}
                              placeholder={previewPlatformBehavior?.ctaLabelPlaceholder || "Book now, Learn more, See offer"}
                              className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                            />
                          </label>
                        ) : (
                          <div className="sm:col-span-2 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Instagram next step</div>
                            <div className="mt-2 font-semibold text-zinc-900">Keep it native</div>
                            <div className="mt-1 text-xs leading-5 text-zinc-500">Tell people to use the link in bio, send a DM, or tap the profile booking button if it exists.</div>
                          </div>
                        )}

                        <label className="block sm:col-span-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewPlatformBehavior?.linkFieldLabel || "Direct link"}</div>
                          <input
                            value={previewGrowthProfile.ctaHref || ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, ctaHref: e.target.value || null })}
                            placeholder={previewPlatformBehavior?.linkFieldPlaceholder || "https://..."}
                            className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                          />
                          <div className="mt-2 text-xs leading-5 text-zinc-500">{previewPlatformBehavior?.linkFieldHelper || "Use the best destination for this post."}</div>
                        </label>

                        <label className="block sm:col-span-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewIsInstagramComposer ? (previewPlatformBehavior?.savedLinkLabel || "Profile booking / bio reference") : "Saved booking / intake link"}</div>
                          <div className="mt-2">
                            <PortalListboxDropdown
                              value={previewGrowthProfile.bookingLinkUrl || ""}
                              onChange={(value) => {
                                const url = value || null;
                                setSelectedGrowthProfile({
                                  ...previewGrowthProfile,
                                  bookingLinkUrl: url,
                                  ctaLabel: !previewIsInstagramComposer && url && !previewGrowthProfile.ctaLabel
                                    ? (previewPlatformBehavior?.defaultCtaLabel || previewGrowthProfile.ctaLabel)
                                    : previewGrowthProfile.ctaLabel,
                                });
                              }}
                              options={bookingLinkOptions}
                              buttonClassName={workflowDropdownButtonClass}
                            />
                          </div>
                        </label>

                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Funnel destination</div>
                          <div className="mt-2">
                            <PortalListboxDropdown
                              value={previewGrowthProfile.funnelId || ""}
                              onChange={(value) => {
                                const selectedFunnel = growthContext?.funnels.find((funnel) => funnel.id === value) || null;
                                setSelectedGrowthProfile({
                                  ...previewGrowthProfile,
                                  funnelId: selectedFunnel?.id || null,
                                  funnelName: selectedFunnel?.name || null,
                                  funnelSlug: selectedFunnel?.slug || null,
                                  funnelPageId: null,
                                  funnelPageTitle: null,
                                  funnelPageSlug: null,
                                });
                              }}
                              options={funnelOptions}
                              buttonClassName={workflowDropdownButtonClass}
                            />
                          </div>
                        </label>

                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Funnel page</div>
                          <div className="mt-2">
                            <PortalListboxDropdown
                              value={previewGrowthProfile.funnelPageId || ""}
                              onChange={(value) => {
                                const selectedPage = previewFunnelPages.find((page) => page.id === value) || null;
                                setSelectedGrowthProfile({
                                  ...previewGrowthProfile,
                                  funnelPageId: selectedPage?.id || null,
                                  funnelPageTitle: selectedPage?.title || null,
                                  funnelPageSlug: selectedPage?.slug || null,
                                });
                              }}
                              disabled={!previewGrowthProfile.funnelId}
                              options={previewFunnelPageOptions}
                              buttonClassName={workflowDropdownButtonClass}
                            />
                          </div>
                        </label>
                      </div>

                      <div className="mt-4 rounded-2xl bg-zinc-50 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewIsInstagramComposer ? "Resolved follow-up path" : "Resolved destination"}</div>
                        <div className="mt-2 text-sm font-semibold text-zinc-900">{previewResolvedDestinationMeta?.sourceLabel || "No destination selected"}</div>
                        <div className="mt-1 break-all text-xs leading-5 text-zinc-500">
                          {previewResolvedLinkHref
                            || previewResolvedDestinationMeta?.detail
                            || (previewIsInstagramComposer
                              ? "Keep the follow-up path here for bio, DM, profile booking, or internal tracking."
                              : "Add a direct link, saved booking handoff, or linked funnel route before posting.")}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Result</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">Use this after the post goes live outside Purely, or when you want to keep a result URL attached to the asset.</div>
                      </div>

                      <label className="mt-4 block">
                        <div className="text-xs font-medium text-zinc-600">Live post URL</div>
                        <input
                          value={previewGrowthProfile.postedUrl || ""}
                          onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, postedUrl: e.target.value || null })}
                          placeholder="https://live-post-url"
                          className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                        />
                      </label>

                      <div className="mt-3 text-xs text-zinc-500">
                        {previewGrowthProfile.postedAtIso
                          ? `Marked as posted outside Purely on ${formatCalendarDay(previewGrowthProfile.postedAtIso)} at ${formatCalendarTime(previewGrowthProfile.postedAtIso)}.`
                          : previewManualPostingGuidance}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile({ workflowState: "posted_manually", postedAtIso: previewGrowthProfile.postedAtIso || new Date().toISOString(), providerPublishState: "manual_only" }, { preserveWorkflowState: true })}
                          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                        >
                          Mark as posted outside Purely
                        </button>
                        {previewUsesMetaProviderLane && previewContinuity?.blocked ? (
                          <a
                            href={previewDirectMetaActionHref}
                            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            {previewMetaDestinationSetupLabel}
                          </a>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <AppModal
        open={newFolderOpen}
        onClose={() => {
          if (creatingFolder) return;
          setNewFolderOpen(false);
        }}
        title="Create folder"
      >
        <div className="space-y-3">
          <div className="text-sm text-zinc-600">Create a new folder in {folderId ? "the current folder" : "Media Library"}.</div>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createFolder();
              }
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setNewFolderOpen(false)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              disabled={creatingFolder}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createFolder()}
              disabled={creatingFolder || !newFolderName.trim()}
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {creatingFolder ? "Creating" : "Create folder"}
            </button>
          </div>
        </div>
      </AppModal>

      <PortalImageCropModal
        open={cropModalOpen}
        imageUrl={cropModalOpen ? previewItem?.previewUrl || null : null}
        title={previewGrowthProfile?.targetPlatform === "instagram_story" ? "Prepare Instagram story asset" : "Prepare Instagram feed asset"}
        description={previewGrowthProfile?.targetPlatform === "instagram_story"
          ? "Create the final 9:16 image you want Instagram to receive. Purely stores the prepared asset so posting uses the finished media, not a CSS preview crop."
          : "Create the final feed image you want Instagram to receive. Purely stores the prepared asset so posting uses the finished media, not a CSS preview crop."}
        defaultAspectPreset={previewInstagramCropPreset}
        aspectOptions={previewInstagramCropOptions}
        onClose={() => {
          if (detailSaving) return;
          setCropModalOpen(false);
        }}
        onSave={prepareInstagramVariantForSelectedItem}
      />
    </div>
  );
}
