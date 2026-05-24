"use client";

import { createPortal } from "react-dom";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";

import { AppModal } from "@/components/AppModal";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import type { PortalMetaProviderReadiness } from "@/lib/portalMetaProviderReadiness";
import { PORTAL_VARIANT_HEADER, portalVariantFromPathname } from "@/lib/portalVariant";
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

type ProviderPublishState = "manual_only" | "draft" | "ready" | "queued" | "published" | "failed" | "blocked";

type WorkflowFilterKey = "all" | "scheduled" | "ready" | "needs_copy" | "review" | "manual_only" | "posted";

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

type AllFoldersRes =
  | { ok: true; folders: Array<{ id: string; parentId: string | null; name: string; tag: string; createdAt: string }> }
  | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

function distributionProviderLabel(value: DistributionProviderKey | string | null | undefined) {
  switch (String(value || "")) {
    case "facebook_page":
      return "Social page";
    case "instagram_business":
      return "Social account";
    case "future_youtube":
      return "YouTube";
    case "future_tiktok":
      return "Future provider";
    case "future_linkedin":
      return "Future provider";
    default:
      return "Manual upload";
  }
}

function providerConnectionLabel(value: ProviderConnectionState | string | null | undefined) {
  switch (String(value || "")) {
    case "coming_soon":
      return "Coming soon";
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
      return "Metrics syncing";
    default:
      return "Connection required";
  }
}

function providerPublishLabel(value: ProviderPublishState | string | null | undefined) {
  switch (String(value || "")) {
    case "manual_only":
      return "Manual only";
    case "ready":
      return "Ready for provider";
    case "queued":
      return "Queued";
    case "published":
      return "Published";
    case "failed":
      return "Publish failed";
    case "blocked":
      return "Blocked";
    default:
      return "Draft";
  }
}

function inferDistributionProvider(targetPlatform: string | null | undefined): DistributionProviderKey {
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

function defaultProviderConnectionState(provider: DistributionProviderKey): ProviderConnectionState {
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

function resolveProviderContinuity(profile: MediaGrowthProfile, metaReadiness?: PortalMetaProviderReadiness | null) {
  const providerKey = profile.distributionProvider || inferDistributionProvider(profile.targetPlatform);
  const connectionState = (providerKey === "facebook_page" || providerKey === "instagram_business") && metaReadiness
    ? (metaReadiness.status === "connected"
      ? "connected"
      : metaReadiness.status === "needs_permissions"
        ? "needs_permissions"
        : metaReadiness.status === "reconnect_required"
          ? "reconnect_required"
          : metaReadiness.status === "disabled"
            ? "disabled"
            : metaReadiness.status === "not_connected"
              ? "not_connected"
              : "coming_soon")
    : profile.providerConnectionState || defaultProviderConnectionState(providerKey);
  const publishState = profile.workflowState === "posted_manually"
    ? "manual_only"
    : profile.providerPublishState
      || (profile.providerPostId || profile.providerPublishedAtIso
        ? "published"
        : providerKey === "future_youtube"
          ? "manual_only"
        : profile.workflowState === "queued"
          ? "queued"
          : profile.workflowState === "provider_failed" || profile.providerLastError
            ? "failed"
            : profile.workflowState === "provider_blocked" || (providerKey !== "manual" && connectionState !== "connected")
              ? "blocked"
              : profile.workflowState === "approved"
                ? "ready"
                : providerKey === "manual"
                  ? "manual_only"
                  : "draft");
  const blocked = publishState === "blocked";
  const detail = profile.workflowState === "posted_manually" || providerKey === "manual"
    ? "Manual posting is available now. Open or download the asset, then track the manual post here."
    : providerKey === "future_youtube"
      ? "YouTube planning is available here now. Upload and analytics stay manual until direct sync is ready."
    : providerKey === "facebook_page" || providerKey === "instagram_business"
      ? connectionState === "connected"
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
    ? "YouTube analytics stay offline until Google OAuth, API scopes, quota, and app verification are ready."
    : (providerKey === "facebook_page" || providerKey === "instagram_business") && connectionState !== "connected"
      ? "Metrics stay pending until a connected provider post exists."
    : profile.metricsSyncedAtIso
      ? `Metrics synced ${formatCalendarDay(profile.metricsSyncedAtIso)} at ${formatCalendarTime(profile.metricsSyncedAtIso)}`
      : profile.providerPostId || profile.providerPublishedAtIso
        ? "Metrics are pending or still syncing from the provider."
        : "Metrics require a connected provider post.";

  return {
    providerKey,
    providerLabel: distributionProviderLabel(providerKey),
    connectionState,
    connectionLabel: providerConnectionLabel(connectionState),
    publishState: publishState as ProviderPublishState,
    publishLabel: providerPublishLabel(publishState),
    blocked,
    detail,
    metricsLabel,
  };
}

function targetPlatformLabel(value: string | null | undefined) {
  switch (String(value || "")) {
    case "instagram_post":
      return "Instagram post";
    case "instagram_story":
      return "Instagram story";
    case "facebook_post":
      return "Facebook post";
    case "youtube_video":
      return "YouTube video";
    case "newsletter":
      return "Newsletter";
    case "email":
      return "Email";
    case "sms":
      return "SMS";
    case "funnel_hero":
      return "Funnel hero";
    case "booking_promo":
      return "Booking promo";
    case "review_proof":
      return "Review proof";
    default:
      return value || "General";
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

function buildCaptionStarter(item: Item, profile: MediaGrowthProfile, context: MediaGrowthContext | null) {
  const purpose = profile.assetPurpose || "a campaign asset";
  const offer = profile.relatedOffer || context?.bookingLink?.offerName || "your offer";
  const platform = targetPlatformLabel(profile.targetPlatform);
  const ctaLabel = profile.ctaLabel || (context?.bookingLink?.url ? "Book now" : "Learn more");
  const ctaHref = profile.ctaHref || profile.bookingLinkUrl || context?.bookingLink?.url || "";
  const intro = platform === "SMS"
    ? `Quick update about ${offer}:`
    : platform === "YouTube video"
      ? `YouTube title + description ideas for ${offer}.`
    : `Draft ${platform.toLowerCase()} copy for ${offer}.`;
  return [
    intro,
    `${item.fileName} supports ${purpose}. Keep the copy concrete, proof-led, and tied to one next step.`,
    ctaHref ? `${ctaLabel}: ${ctaHref}` : `CTA: ${ctaLabel}`,
  ].filter(Boolean).join("\n\n");
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

  if (!profile.ctaHref && (profile.targetPlatform || profile.workflowState === "ready_to_use" || profile.workflowState === "planned")) {
    return {
      title: "Add a tracked link",
      detail: `Attach a ${nextStepLabel} link before posting so the next action is clear and future clicks have a real destination.`,
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
      title: continuity.blocked ? "Post manually or reschedule" : "Post or reschedule",
      detail: continuity.blocked
        ? "The time is set, but direct provider publishing stays blocked. Post it manually and store the public URL here, or move the schedule."
        : "This asset already has a time. Post it manually when due, or adjust the timing if the campaign changed.",
    };
  }

  if (profile.workflowState === "posted_manually" && !profile.postedUrl) {
    return {
      title: profile.targetPlatform === "youtube_video" ? "Save the live YouTube URL" : "Save the live post URL",
      detail: profile.targetPlatform === "youtube_video"
        ? "Store the public YouTube URL after manual upload so the team can review the live video later."
        : "Store the public URL after posting so the team can review the live asset later.",
    };
  }

  if (profile.workflowState === "posted_manually" && !profile.ctaHref) {
    return {
      title: "Use a tracked link next time",
      detail: "Manual post results do not connect automatically. Add a tracked Purely link on the next iteration so clicks and follow-up have a real path.",
    };
  }

  if (profile.workflowState === "posted_manually") {
    return {
      title: "Try the next iteration",
      detail: "Reuse the asset with a different offer, caption, or posting time based on what happened after the manual post.",
    };
  }

  if (continuity.blocked) {
    return {
      title: "Finish provider setup",
      detail: "Manual posting is still available, but direct provider continuity remains blocked until the provider connection is ready.",
    };
  }

  if (profile.workflowState === "ready_to_use" || profile.workflowState === "approved") {
    return {
      title: "Schedule the asset",
      detail: "The draft, target, and CTA are in place. Pick a posting time and keep the asset moving through the manual-post workflow.",
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
): WorkflowResultSlot[] {
  const providerMetrics = [
    formatResultMetric(profile.metricsImpressions, "impressions"),
    formatResultMetric(profile.metricsReach, "reach"),
    formatResultMetric(profile.metricsEngagementCount, "engagements"),
    formatResultMetric(profile.metricsClickCount, "clicks"),
  ].filter(Boolean).join(" • ");

  return [
    {
      label: "Manual post",
      value: profile.postedUrl ? "Live URL saved" : profile.postedAtIso ? "Posted manually" : "Not posted yet",
      detail: profile.postedUrl
        ? profile.postedUrl
        : profile.postedAtIso
          ? "Add the public post URL when you have it."
          : "Use this slot after a manual post so the live asset is easy to find.",
      href: profile.postedUrl,
    },
    {
      label: "Tracked link",
      value: profile.ctaHref ? (profile.ctaLabel || "Tracked link attached") : "No tracked link",
      detail: profile.ctaHref
        ? profile.ctaHref
        : variant === "credit"
          ? "Use a consultation, report, or document follow-up link before posting."
          : "Use a booking, funnel, or follow-up link before posting.",
      href: profile.ctaHref,
    },
    {
      label: "Funnel or form",
      value: profile.funnelPageTitle || profile.funnelName || "Not linked",
      detail: profile.funnelId
        ? "Form submissions stay in the linked funnel flow, but this asset does not get automatic attribution yet."
        : "Link a funnel or form if you want the next step to stay inside Purely.",
    },
    {
      label: "Booking handoff",
      value: profile.bookingLinkUrl ? "Linked" : "Not linked yet",
      detail: profile.bookingLinkUrl
        ? "Booking handoffs live in booking reporting when Purely stores them, but they are not attributed back to this asset automatically yet."
        : variant === "credit"
          ? "Attach a consultation or intake link if this asset should drive appointments."
          : "Attach a booking link if this asset should drive appointments.",
    },
    {
      label: "Provider metrics",
      value: providerMetrics || (profile.providerPostId || profile.providerPublishedAtIso ? "Provider post stored" : "Metrics syncing"),
      detail: providerMetrics
        ? continuity.metricsLabel
        : profile.workflowState === "posted_manually"
          ? "Manual post results are not connected automatically."
          : continuity.metricsLabel,
    },
  ];
}

export function PortalMediaLibraryClient() {
  const toastNotify = useToast();
  const portalVariant = useMemo(() => {
    if (typeof window === "undefined") return "portal" as const;
    return portalVariantFromPathname(window.location.pathname);
  }, []);
  const isCreditWorkspace = portalVariant === "credit";
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

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
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);

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
      ? buildWorkflowResultSlots(previewGrowthProfile, previewContinuity, portalVariant)
      : [];
  }, [portalVariant, previewContinuity, previewGrowthProfile]);

  const previewSupportsYouTubePlanning = useMemo(() => {
    return supportsYouTubePlanning(previewItem, previewGrowthProfile);
  }, [previewGrowthProfile, previewItem]);

  const loadMetaReadiness = useCallback(async () => {
    const res = await fetch("/api/portal/media/providers/meta/readiness", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as MetaReadinessRes | null;
    if (!res.ok || !json || json.ok !== true) {
      throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load provider readiness");
    }
    setMetaReadiness(json.readiness);
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
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setSelectedItemDetail(null);
    setSelectedGrowthProfile(null);

    void fetch(`/api/portal/media/items/${encodeURIComponent(selectedItem.id)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as ItemDetailRes | null;
        if (!res.ok || !json || json.ok !== true) {
          throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load asset details");
        }
        if (cancelled) return;
        setSelectedItemDetail(json.item);
        setSelectedGrowthProfile(json.item.growthProfile || emptyGrowthProfile(json.item.id));
        setGrowthContext(json.context);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load asset details");
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
    let didLoad = false;

    const url = new URL("/api/portal/media/list", window.location.origin);
    if (nextFolderId) url.searchParams.set("folderId", nextFolderId);

    try {
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ListRes | null;

      if (!res.ok || !json || json.ok !== true) {
        setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load media library");
        return;
      }

      setBreadcrumbs(Array.isArray(json.breadcrumbs) ? json.breadcrumbs : []);
      setFolders(Array.isArray(json.folders) ? json.folders : []);
      setItems(Array.isArray(json.items) ? json.items : []);

      didLoad = true;
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
        return profile.workflowState === "queued" || resolveProviderContinuity(profile).publishState === "queued";
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
        return profile.workflowState === "provider_failed" || resolveProviderContinuity(profile).publishState === "failed" || Boolean(profile.providerLastError);
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
      description: "These assets can move ahead, but the live post still needs to be handled manually.",
      count: manualOnlyItems.length,
    },
    {
      key: "posted" as const,
      label: "Posted manually",
      description: "Assets already posted outside Purely and saved here for future reference.",
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
        return "Nothing is scheduled yet. Pick a ready asset, set the publish plan, and keep the manual posting step tracked here.";
      case "ready":
        return "Nothing is ready to plan yet. Finish the draft, attach the right destination link, and the next asset will move here.";
      case "review":
        return "Nothing is waiting for review right now. New uploads and draft updates will show up here when they need approval.";
      case "needs_copy":
        return "Nothing needs copy right now. Add caption notes, CTA details, or campaign context to move the next asset forward.";
      case "manual_only":
        return "Nothing is sitting in a manual-only lane right now. When a provider stays manual, that work will surface here so the workflow stays honest.";
      case "posted":
        return "No assets have been marked posted manually yet. Mark manual posts here so continuity and reporting stay grounded in real work.";
      default:
        return isCreditWorkspace
          ? "Upload media, add the draft, attach the consultation link, choose the workflow plan, then mark it posted manually when it goes live."
          : "Upload media, add the draft, attach the booking or funnel link, choose the workflow plan, then mark it posted manually when it goes live.";
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

  async function saveGrowthProfileForItem(itemId: string, current: MediaGrowthProfile, partial?: Partial<MediaGrowthProfile>, successText = "Campaign details saved") {
    if (!itemId || !current) return;

    const next: MediaGrowthProfile = {
      ...current,
      ...partial,
    };

    next.distributionProvider = next.distributionProvider || inferDistributionProvider(next.targetPlatform);
    next.providerConnectionState = next.providerConnectionState || defaultProviderConnectionState(next.distributionProvider);

    if (next.workflowState === "posted_manually" && !next.postedAtIso) {
      next.postedAtIso = new Date().toISOString();
    }

    if (next.workflowState === "approved" && !next.approvedAtIso) {
      next.approvedAtIso = new Date().toISOString();
    }

    if (!next.providerPublishState) {
      next.providerPublishState = resolveProviderContinuity(next).publishState;
    }

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
          providerAccountLabel: next.providerAccountLabel,
          queueOrder: next.queueOrder,
          dailyPostCap: next.dailyPostCap,
          providerPostId: next.providerPostId,
          providerLastError: next.providerLastError,
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
      return;
    }

    updateListGrowthProfile(itemId, json.growthProfile);
    setDetailSaving(false);
    toastNotify.success(successText);
  }

  async function saveSelectedGrowthProfile(partial?: Partial<MediaGrowthProfile>) {
    const itemId = previewItem?.id;
    const current = previewGrowthProfile;
    if (!itemId || !current) return;
    await saveGrowthProfileForItem(itemId, current, partial);
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

  function renderCalendarItem(item: Item) {
    const profile = item.growthProfile || emptyGrowthProfile(item.id);
    const previewKind = itemPreviewKind(item);
    const continuity = resolveProviderContinuity(profile);
    const nextStep = buildWorkflowNextStep(profile, continuity, portalVariant);
    const scheduleLabel = profile.plannedForIso ? `${formatCalendarDay(profile.plannedForIso)} at ${formatCalendarTime(profile.plannedForIso)}` : "No schedule";
    const campaignLabel = profile.campaignLabel || profile.relatedOffer || "Not labeled";
    const ctaLabel = profile.ctaLabel || (profile.ctaHref ? "Tracked link attached" : isCreditWorkspace ? "No consultation link yet" : "No booking link yet");
    const providerLabel = `${continuity.providerLabel} · ${continuity.connectionLabel}`;
    const cardSummary = profile.captionDraft
      ? profile.captionDraft.slice(0, 140)
      : nextStep.detail;
    const supportHref = profile.postedUrl || profile.ctaHref || null;
    const supportLabel = profile.postedUrl ? "Open post" : profile.ctaHref ? "Open CTA" : null;

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
              Open workflow
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
            placeholder="Search files and tags…"
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
            {uploading ? "Uploading…" : "Upload"}
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
                Refreshing…
              </div>
            ) : null}
            {loading ? (
              <div className="text-sm text-zinc-600">Loading…</div>
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
                      {workflowFilter === "all" ? "Planner is still empty" : `${workflowFilterLabel} is clear`}
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
                              ⋯
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
                                  <span>•</span>
                                  <span>{formatBytes(it.fileSize)}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700">
                                    {growthStateLabel(it.growthProfile?.workflowState)}
                                  </span>
                                  {it.growthProfile?.targetPlatform ? (
                                    <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                                      {targetPlatformLabel(it.growthProfile.targetPlatform)}
                                    </span>
                                  ) : null}
                                  {it.growthProfile?.ctaHref ? (
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">CTA linked</span>
                                  ) : null}
                                  {it.growthProfile?.funnelId ? (
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Funnel linked</span>
                                  ) : null}
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
                                ⋯
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
                            <div className="mt-auto inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                              {previewKind === "video" ? "Preview video" : previewKind === "image" ? "Preview image" : "Open file"}
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
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-4xl overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{previewItem.fileName}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {previewItem.mimeType} • {formatBytes(previewItem.fileSize)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close preview"
                    className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-800"
                    onClick={() => setPreviewOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                  <div>
                    {itemPreviewKind(previewItem) === "image" && previewItem.previewUrl ? (
                      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewItem.previewUrl} alt={previewItem.fileName} className="w-full object-cover" />
                      </div>
                    ) : itemPreviewKind(previewItem) === "video" && (previewItem.previewUrl || previewItem.openUrl) ? (
                      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-black">
                        <video
                          src={previewItem.previewUrl || previewItem.openUrl}
                          className="w-full"
                          controls
                          playsInline
                          preload="metadata"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                        Preview not available for this file type.
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                        className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                      >
                        Download
                      </button>
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
                      <a
                        href={previewItem.openUrl || previewItem.previewUrl || previewItem.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => setPreviewOpen(false)}
                      >
                        Open
                      </a>
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
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-semibold text-zinc-900">Workflow actions</div>
                      <div className="mt-1 text-xs text-zinc-600">Update the asset, move it through approval, set the schedule, then store the manual-post result here when it goes live.</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => {
                            const starter = buildCaptionStarter(previewItem, previewGrowthProfile, growthContext);
                            setSelectedGrowthProfile({
                              ...previewGrowthProfile,
                              captionDraft: starter,
                              workflowState: previewGrowthProfile.captionDraft ? previewGrowthProfile.workflowState : "needs_caption",
                            });
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Write copy
                        </button>
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading || !growthContext?.bookingLink?.url}
                          onClick={() => {
                            setSelectedGrowthProfile({
                              ...previewGrowthProfile,
                              ctaHref: growthContext?.bookingLink?.url || previewGrowthProfile.ctaHref,
                              ctaLabel: previewGrowthProfile.ctaLabel || "Book now",
                              bookingLinkUrl: growthContext?.bookingLink?.url || previewGrowthProfile.bookingLinkUrl,
                            });
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Attach booking link
                        </button>
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile({ workflowState: "needs_approval" })}
                          className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Review before posting
                        </button>
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile({ workflowState: "approved", approvedAtIso: previewGrowthProfile.approvedAtIso || new Date().toISOString() })}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile({ workflowState: "ready_to_use" })}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Mark ready to plan
                        </button>
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile({ workflowState: "posted_manually", postedAtIso: previewGrowthProfile.postedAtIso || new Date().toISOString(), providerPublishState: "manual_only" })}
                          className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                        >
                          Mark posted manually
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[0.85fr,1.15fr]">
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">What to do next</div>
                        <div className="mt-2 text-sm font-semibold text-zinc-900">{previewNextStep?.title || "Move this asset forward"}</div>
                        <div className="mt-1 text-xs text-zinc-600">{previewNextStep?.detail || "Add the missing workflow details, then schedule or post it manually."}</div>
                        {previewContinuity ? <div className="mt-3 text-xs text-zinc-500">{previewContinuity.detail}</div> : null}
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Result slots</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {previewResultSlots.slice(0, 4).map((slot) => (
                            <div key={slot.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{slot.label}</div>
                              <div className="mt-2 font-semibold text-zinc-900">{slot.value}</div>
                              <div className="mt-1 wrap-break-word text-xs text-zinc-500">{slot.detail}</div>
                              {slot.href ? (
                                <a href={slot.href} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-brand-ink hover:underline">
                                  Open
                                </a>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Content workflow details</div>
                          <div className="mt-1 text-xs text-zinc-500">Stored with the asset so schedule, posting status, provider state, and later reporting can reuse the same record.</div>
                        </div>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                          {growthStateLabel(previewGrowthProfile.workflowState)}
                        </span>
                      </div>

                      {detailLoading ? <div className="mt-3 text-sm text-zinc-600">Loading campaign details...</div> : null}

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">State</div>
                          <select
                            value={previewGrowthProfile.workflowState}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, workflowState: e.target.value as MediaGrowthState })}
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          >
                            <option value="needs_review">Needs review</option>
                            <option value="needs_caption">Needs copy</option>
                            <option value="needs_approval">Review before posting</option>
                            <option value="approved">Approved</option>
                            <option value="ready_to_use">Ready to plan</option>
                            <option value="planned">Planned</option>
                            <option value="provider_blocked">Manual posting only</option>
                            <option value="queued">Queued</option>
                            <option value="provider_failed">Provider failed</option>
                            <option value="posted_manually">Posted manually</option>
                            <option value="used_in_campaign">Used in campaign</option>
                          </select>
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Target platform</div>
                          <select
                            value={previewGrowthProfile.targetPlatform || ""}
                            onChange={(e) => {
                              const nextTarget = e.target.value || null;
                              const previousInferredProvider = inferDistributionProvider(previewGrowthProfile.targetPlatform);
                              const nextInferredProvider = inferDistributionProvider(nextTarget);
                              setSelectedGrowthProfile({
                                ...previewGrowthProfile,
                                targetPlatform: nextTarget,
                                distributionProvider:
                                  previewGrowthProfile.distributionProvider && previewGrowthProfile.distributionProvider !== previousInferredProvider
                                    ? previewGrowthProfile.distributionProvider
                                    : nextInferredProvider,
                              });
                            }}
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          >
                            <option value="">General</option>
                            <option value="instagram_post">Instagram post</option>
                            <option value="instagram_story">Instagram story</option>
                            <option value="facebook_post">Facebook post</option>
                            {previewSupportsYouTubePlanning ? <option value="youtube_video">YouTube video</option> : null}
                            <option value="newsletter">Newsletter</option>
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                            <option value="funnel_hero">Funnel hero</option>
                            <option value="booking_promo">Booking promo</option>
                            <option value="review_proof">Review proof</option>
                          </select>
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Asset purpose</div>
                          <input
                            value={previewGrowthProfile.assetPurpose || ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, assetPurpose: e.target.value || null })}
                            placeholder="Offer proof, before/after, testimonial, team photo"
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Offer or service</div>
                          <input
                            value={previewGrowthProfile.relatedOffer || ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, relatedOffer: e.target.value || null })}
                            placeholder="Credit repair consult, whitening offer, spring promo"
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Campaign label</div>
                          <input
                            value={previewGrowthProfile.campaignLabel || ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, campaignLabel: e.target.value || null })}
                            placeholder="June booking push, testimonials, newsletter hero"
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Planned for</div>
                          <input
                            type="datetime-local"
                            value={toDateTimeLocalValue(previewGrowthProfile.plannedForIso)}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, plannedForIso: fromDateTimeLocalValue(e.target.value) })}
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          />
                          <button
                            type="button"
                            disabled={!previewGrowthProfile.plannedForIso}
                            onClick={() => setSelectedGrowthProfile({ ...previewGrowthProfile, plannedForIso: null, workflowState: previewGrowthProfile.postedAtIso ? previewGrowthProfile.workflowState : "ready_to_use" })}
                            className="mt-2 inline-flex text-xs font-semibold text-zinc-600 hover:text-zinc-900 disabled:pointer-events-none disabled:text-zinc-400"
                          >
                            Clear schedule
                          </button>
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Queue order</div>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={previewGrowthProfile.queueOrder ?? ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, queueOrder: e.target.value ? Number(e.target.value) : null })}
                            placeholder="1"
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Daily post cap</div>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={previewGrowthProfile.dailyPostCap ?? ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, dailyPostCap: e.target.value ? Number(e.target.value) : null })}
                            placeholder="3"
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          />
                        </label>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">CTA label</div>
                          <input
                            value={previewGrowthProfile.ctaLabel || ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, ctaLabel: e.target.value || null })}
                            placeholder="Book now, See offer, Learn more"
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">CTA or booking link</div>
                          <input
                            value={previewGrowthProfile.ctaHref || ""}
                            onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, ctaHref: e.target.value || null })}
                            placeholder="https://..."
                            className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                          />
                        </label>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          disabled={!previewGrowthProfile.captionDraft}
                          onClick={(e) => void copyTextWithToast(previewGrowthProfile.captionDraft, "Caption copied", e.currentTarget)}
                          className={assetActionClass({ size: "sm", disabled: !previewGrowthProfile.captionDraft })}
                        >
                          Copy caption
                        </button>
                        <button
                          type="button"
                          disabled={!previewGrowthProfile.ctaHref}
                          onClick={(e) => void copyTextWithToast(previewGrowthProfile.ctaHref, "CTA link copied", e.currentTarget)}
                          className={assetActionClass({ size: "sm", disabled: !previewGrowthProfile.ctaHref })}
                        >
                          Copy CTA link
                        </button>
                        <a
                          href={previewGrowthProfile.ctaHref || undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={assetActionClass({ size: "sm", disabled: !previewGrowthProfile.ctaHref })}
                        >
                          Open CTA
                        </a>
                      </div>

                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Growth destinations</div>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs font-semibold text-zinc-700">Current booking link</div>
                            <select
                              value={previewGrowthProfile.bookingLinkUrl || ""}
                              onChange={(e) => {
                                const url = e.target.value || null;
                                setSelectedGrowthProfile({
                                  ...previewGrowthProfile,
                                  bookingLinkUrl: url,
                                  ctaHref: url || previewGrowthProfile.ctaHref,
                                  ctaLabel: url && !previewGrowthProfile.ctaLabel ? "Book now" : previewGrowthProfile.ctaLabel,
                                });
                              }}
                              className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                            >
                              <option value="">No booking CTA attached</option>
                              {growthContext?.bookingLink?.url ? (
                                <option value={growthContext.bookingLink.url}>
                                  {growthContext.bookingLink.providerLabel} {growthContext.bookingLink.enabled ? "(active)" : "(saved)"}
                                </option>
                              ) : null}
                            </select>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              {growthContext?.bookingLink?.url
                                ? "Attach the current booking CTA without triggering any live outreach."
                                : "Save a booking link in Booking Settings to reuse it here."}
                            </div>
                          </label>

                          <div className="grid grid-cols-1 gap-3">
                            <label className="block">
                              <div className="text-xs font-semibold text-zinc-700">Funnel</div>
                              <select
                                value={previewGrowthProfile.funnelId || ""}
                                onChange={(e) => {
                                  const selectedFunnel = growthContext?.funnels.find((funnel) => funnel.id === e.target.value) || null;
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
                                className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                              >
                                <option value="">No funnel linked</option>
                                {(growthContext?.funnels || []).map((funnel) => (
                                  <option key={funnel.id} value={funnel.id}>{funnel.name}</option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <div className="text-xs font-semibold text-zinc-700">Funnel page</div>
                              <select
                                value={previewGrowthProfile.funnelPageId || ""}
                                onChange={(e) => {
                                  const selectedPage = previewFunnelPages.find((page) => page.id === e.target.value) || null;
                                  setSelectedGrowthProfile({
                                    ...previewGrowthProfile,
                                    funnelPageId: selectedPage?.id || null,
                                    funnelPageTitle: selectedPage?.title || null,
                                    funnelPageSlug: selectedPage?.slug || null,
                                  });
                                }}
                                disabled={!previewGrowthProfile.funnelId}
                                className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 disabled:opacity-60"
                              >
                                <option value="">No page linked</option>
                                {previewFunnelPages.map((page) => (
                                  <option key={page.id} value={page.id}>{page.title}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Provider continuity</div>
                            <div className="mt-1 text-xs text-zinc-500">Manual posting is live now. Direct provider continuity is prepared here without sending any live post.</div>
                          </div>
                          {previewContinuity ? (
                            <span
                              className={classNames(
                                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                previewContinuity.blocked
                                  ? "bg-rose-50 text-rose-700"
                                  : previewContinuity.publishState === "published"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : previewContinuity.publishState === "queued"
                                      ? "bg-sky-50 text-sky-700"
                                      : "bg-zinc-100 text-zinc-700",
                              )}
                            >
                              {previewContinuity.publishLabel}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs font-semibold text-zinc-700">Publish target</div>
                            <select
                              value={previewGrowthProfile.distributionProvider || inferDistributionProvider(previewGrowthProfile.targetPlatform)}
                              onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, distributionProvider: e.target.value as DistributionProviderKey })}
                              className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                            >
                              <option value="manual">Manual upload</option>
                              <option value="facebook_page">Social page</option>
                              <option value="instagram_business">Social account</option>
                              {previewSupportsYouTubePlanning ? <option value="future_youtube">YouTube (coming soon)</option> : null}
                              <option value="future_tiktok">TikTok (future)</option>
                              <option value="future_linkedin">LinkedIn (future)</option>
                            </select>
                          </label>

                          <label className="block">
                            <div className="text-xs font-semibold text-zinc-700">Provider page/account label</div>
                            <input
                              value={previewGrowthProfile.providerAccountLabel || ""}
                              onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, providerAccountLabel: e.target.value || null })}
                              placeholder="Main social page or account"
                              className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                            />
                          </label>

                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Connection state</div>
                            <div className="mt-2 font-semibold text-zinc-900">{previewContinuity?.connectionLabel || "Connection required"}</div>
                            <div className="mt-1 text-xs text-zinc-500">{previewContinuity?.detail}</div>
                          </div>

                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Metrics continuity</div>
                            <div className="mt-2 font-semibold text-zinc-900">{previewContinuity?.metricsLabel || "Metrics require a connected provider post."}</div>
                            <div className="mt-1 text-xs text-zinc-500">{previewGrowthProfile.providerPostId ? `Provider post ID: ${previewGrowthProfile.providerPostId}` : previewGrowthProfile.workflowState === "posted_manually" ? "Posted-manual records do not create provider metrics or a provider post ID here." : "No provider post ID stored yet."}</div>
                          </div>
                        </div>

                        {previewGrowthProfile.providerLastError ? (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">
                            <div className="font-semibold">Provider failure</div>
                            <div className="mt-1">{previewGrowthProfile.providerLastError}</div>
                          </div>
                        ) : null}

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Provider post ID</div>
                            <div className="mt-2">{previewGrowthProfile.providerPostId || "Not stored yet"}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Last provider attempt</div>
                            <div className="mt-2">{previewGrowthProfile.providerLastAttemptAtIso ? `${formatCalendarDay(previewGrowthProfile.providerLastAttemptAtIso)} at ${formatCalendarTime(previewGrowthProfile.providerLastAttemptAtIso)}` : "No provider attempt stored"}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Provider publish time</div>
                            <div className="mt-2">{previewGrowthProfile.providerPublishedAtIso ? `${formatCalendarDay(previewGrowthProfile.providerPublishedAtIso)} at ${formatCalendarTime(previewGrowthProfile.providerPublishedAtIso)}` : "No provider publish stored"}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Metrics sync</div>
                            <div className="mt-2">{previewGrowthProfile.metricsSyncedAtIso ? `${formatCalendarDay(previewGrowthProfile.metricsSyncedAtIso)} at ${formatCalendarTime(previewGrowthProfile.metricsSyncedAtIso)}` : "No metrics sync stored"}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Manual post tracking</div>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block sm:col-span-2">
                            <div className="text-xs font-semibold text-zinc-700">{previewGrowthProfile.targetPlatform === "youtube_video" ? "Posted URL or YouTube permalink" : "Posted URL or permalink"}</div>
                            <input
                              value={previewGrowthProfile.postedUrl || ""}
                              onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, postedUrl: e.target.value || null })}
                              placeholder="https://..."
                              className="mt-2 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                            />
                          </label>
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 sm:col-span-2">
                            {previewGrowthProfile.postedAtIso
                              ? `Posted manually on ${formatCalendarDay(previewGrowthProfile.postedAtIso)} at ${formatCalendarTime(previewGrowthProfile.postedAtIso)}.`
                              : "This item has not been marked as posted manually yet."}
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] text-zinc-500">
                          {previewGrowthProfile.targetPlatform === "youtube_video"
                            ? "Tracking a YouTube URL here does not upload, schedule, or publish anything. It only stores manual-post history until Google OAuth, scopes, quota, and verification are ready."
                            : "Tracking a post here does not publish anything. It only stores planning and posted-manual history. Posted-manual records do not generate provider metrics or provider post IDs in this flow."}
                        </div>
                      </div>

                      {previewSupportsYouTubePlanning ? (
                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">YouTube continuity</div>
                          <div className="mt-2">Prepare the video, title, description, thumbnail direction, and posting notes here now. Direct YouTube upload, scheduling, and analytics stay off in this beta slice.</div>
                          <div className="mt-2 text-xs text-zinc-500">Use the draft field for title and description ideas, the notes field for thumbnail or upload notes, and the posted URL field for the live YouTube link after manual upload.</div>
                        </div>
                      ) : null}

                      <label className="mt-4 block">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewGrowthProfile.targetPlatform === "youtube_video" ? "Title, description, or copy draft" : "Caption or copy draft"}</div>
                          <div className="grid grid-cols-1 gap-2 md:min-w-64 md:grid-cols-2">
                            <button
                              type="button"
                              disabled={detailSaving || detailLoading}
                              onClick={() => setSelectedGrowthProfile({
                                ...previewGrowthProfile,
                                captionDraft: buildCaptionStarter(previewItem, previewGrowthProfile, growthContext),
                                workflowState: previewGrowthProfile.workflowState === "needs_review" ? "needs_caption" : previewGrowthProfile.workflowState,
                              })}
                              className={assetActionClass({ size: "sm", disabled: detailSaving || detailLoading })}
                            >
                              Start draft
                            </button>
                            <button
                              type="button"
                              disabled={!previewGrowthProfile.captionDraft}
                              onClick={(e) => void copyTextWithToast(previewGrowthProfile.captionDraft, "Caption copied", e.currentTarget)}
                              className={assetActionClass({ size: "sm", disabled: !previewGrowthProfile.captionDraft })}
                            >
                              Copy draft
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={previewGrowthProfile.captionDraft || ""}
                          onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, captionDraft: e.target.value || null })}
                          placeholder={previewGrowthProfile.targetPlatform === "youtube_video"
                            ? "Write a YouTube title, description outline, pinned-link copy, or manual posting draft here. This stays editable and does not upload anything."
                            : "Write or edit a caption, email blurb, SMS angle, or post draft here. This stays editable and does not publish anything."}
                          className="mt-2 min-h-32 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                        />
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {previewGrowthProfile.targetPlatform === "youtube_video"
                            ? "Drafts are planning notes only. Purely does not upload, schedule, or publish YouTube content from this screen yet."
                            : "Drafts are editable planning notes only. No outbound action is triggered from this screen."}
                        </div>
                      </label>

                      <label className="mt-4 block">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{previewSupportsYouTubePlanning ? "Next iteration notes / thumbnail plan" : "Next iteration notes"}</div>
                        <textarea
                          value={previewGrowthProfile.notes || ""}
                          onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, notes: e.target.value || null })}
                          placeholder={previewSupportsYouTubePlanning
                            ? "Add thumbnail direction, opening hook, chapters, upload checklist notes, blocked reasons, or the next title/description version to try."
                            : "Add what changed, what to test next, blocked reasons, follow-up reminders, or the next offer/caption/time to try."}
                          className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                        />
                      </label>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile()}
                          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                        >
                          {detailSaving ? "Saving..." : "Save campaign details"}
                        </button>
                      </div>
                    </div>
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
              {creatingFolder ? "Creating…" : "Create folder"}
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
