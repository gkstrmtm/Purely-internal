"use client";

import { createPortal } from "react-dom";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";

import { AppModal } from "@/components/AppModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { InlineSpinner } from "@/components/InlineSpinner";
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

type DistributionProviderKey = "manual" | "facebook_page" | "instagram_business" | "future_tiktok" | "future_linkedin";

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

type MetaDisconnectRes =
  | {
      ok: true;
      note?: string;
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
      return "Needs caption";
    case "needs_approval":
      return "Needs approval";
    case "approved":
      return "Approved";
    case "ready_to_use":
      return "Ready";
    case "planned":
      return "Planned";
    case "provider_blocked":
      return "Provider blocked";
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
      return "Facebook Page";
    case "instagram_business":
      return "Instagram Business";
    case "future_tiktok":
      return "TikTok (future)";
    case "future_linkedin":
      return "LinkedIn (future)";
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
      return "Metrics unavailable";
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
    default:
      return "manual";
  }
}

function defaultProviderConnectionState(provider: DistributionProviderKey): ProviderConnectionState {
  switch (provider) {
    case "manual":
      return "connected";
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
    : providerKey === "facebook_page" || providerKey === "instagram_business"
      ? connectionState === "connected"
        ? "Meta connection is ready. Purely will still require your approval before any direct publish path is used."
        : connectionState === "needs_permissions"
          ? "Meta is connected, but the next permission step is still missing. Purely can verify the account now, while direct publishing stays blocked and manual posting remains available."
        : connectionState === "permission_missing"
          ? "Meta is connected, but required permissions are still missing. Fix the granted permissions before direct publish can continue."
          : connectionState === "reconnect_required"
            ? "Meta needs to be reconnected before direct publish can continue. Until then, use manual posting."
            : connectionState === "disabled"
              ? "Meta connection is disabled in this environment. Each business connects its own Meta assets when the owner-scoped shell is enabled."
              : connectionState === "not_connected"
                ? "Connect your own Facebook Page and Instagram professional account when Meta early access is enabled. Purely will never post without your approval. Until then, use manual posting."
                : "Meta direct publishing is coming soon. Each business will connect its own Facebook Page and Instagram professional account when this is enabled. Publishing requires Meta approval and permissions. Until connected, use manual posting."
      : "This provider is future-facing. Manual posting is available now while direct provider continuity is not connected yet.";
  const metricsLabel = (providerKey === "facebook_page" || providerKey === "instagram_business") && connectionState !== "connected"
    ? "Metrics stay unavailable until a real Meta connection and approved provider publish exist."
    : profile.metricsSyncedAtIso
    ? `Metrics synced ${formatCalendarDay(profile.metricsSyncedAtIso)} at ${formatCalendarTime(profile.metricsSyncedAtIso)}`
    : profile.providerPostId || profile.providerPublishedAtIso
      ? "Metrics are pending or unavailable from the provider."
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
    : `Draft ${platform.toLowerCase()} copy for ${offer}.`;
  return [
    intro,
    `${item.fileName} supports ${purpose}. Keep the copy concrete, proof-led, and tied to one next step.`,
    ctaHref ? `${ctaLabel}: ${ctaHref}` : `CTA: ${ctaLabel}`,
  ].filter(Boolean).join("\n\n");
}

export function PortalMediaLibraryClient() {
  const toastNotify = useToast();
  const portalVariant = useMemo(() => {
    if (typeof window === "undefined") return "portal" as const;
    return portalVariantFromPathname(window.location.pathname);
  }, []);
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
  const [metaActionWorking, setMetaActionWorking] = useState(false);
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

  const loadMetaReadiness = useCallback(async () => {
    const res = await fetch("/api/portal/media/providers/meta/readiness", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as MetaReadinessRes | null;
    if (!res.ok || !json || json.ok !== true) {
      throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load Meta readiness");
    }
    setMetaReadiness(json.readiness);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadMetaReadiness().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Meta readiness");
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

  const metaActionLabel = metaReadiness?.actionLabel || "Coming soon";
  const metaConnectHref = metaReadiness?.connectHref || null;
  const metaDisconnectHref = metaReadiness?.disconnectHref || null;
  const metaShowDisconnect = Boolean(metaDisconnectHref && (metaReadiness?.status === "connected" || metaReadiness?.status === "needs_permissions" || metaReadiness?.status === "reconnect_required"));
  const metaActionDisabled = metaShowDisconnect ? metaActionWorking : Boolean(!metaConnectHref || metaActionWorking);
  const metaEducation = metaReadiness?.education || [
    "Connect your own Facebook Page and Instagram professional account when this is enabled.",
    "Purely will never post without your approval.",
    "Each business connects its own Meta assets.",
    "Publishing requires Meta approval and permissions.",
    "Until connected, use manual posting.",
  ];
  const metaSetupMessage = metaReadiness?.setupMessage || "Connection lets Purely verify your Meta account first. Posting and metrics will be enabled after permissions and app review are ready.";
  const metaPermissionGaps = metaReadiness?.permissionGaps || [];
  const metaTargetAccounts = metaReadiness?.targetAccounts || [
    { key: "facebook_page", label: "Facebook Page", status: "coming_soon", connected: false, placeholder: true },
    { key: "instagram_professional", label: "Instagram professional account", status: "coming_soon", connected: false, placeholder: true },
  ];

  const handleMetaConnect = useCallback(() => {
    if (!metaConnectHref || metaActionWorking) return;
    window.location.assign(metaConnectHref);
  }, [metaActionWorking, metaConnectHref]);

  const handleMetaDisconnect = useCallback(async () => {
    if (!metaDisconnectHref || metaActionWorking) return;
    setMetaActionWorking(true);
    try {
      const res = await fetch(metaDisconnectHref, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as MetaDisconnectRes | null;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Unable to disconnect Meta");
      }
      setMetaReadiness(json.readiness);
      toastNotify.success(json.note || "Meta disconnected.");
      await loadMetaReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disconnect Meta");
    } finally {
      setMetaActionWorking(false);
    }
  }, [loadMetaReadiness, metaActionWorking, metaDisconnectHref, toastNotify]);

  const queueSummary = useMemo(() => ([
    { label: "Needs caption", count: needsCaptionItems.length, tone: "zinc" },
    { label: "Needs approval", count: needsApprovalItems.length, tone: "amber" },
    { label: "Approved", count: approvedQueueItems.length, tone: "emerald" },
    { label: "Provider blocked", count: providerBlockedItems.length, tone: "rose" },
    { label: "Queued", count: queuedProviderItems.length, tone: "sky" },
    { label: "Provider failed", count: providerFailedItems.length, tone: "orange" },
  ]), [needsCaptionItems.length, needsApprovalItems.length, approvedQueueItems.length, providerBlockedItems.length, queuedProviderItems.length, providerFailedItems.length]);

  const calendarExportText = useMemo(() => {
    const plannedLines = plannedCalendarItems.map((item) => {
      const profile = item.growthProfile || emptyGrowthProfile(item.id);
      return `${formatCalendarDay(profile.plannedForIso)} ${formatCalendarTime(profile.plannedForIso)} | ${targetPlatformLabel(profile.targetPlatform)} | ${item.fileName} | ${profile.campaignLabel || "No campaign label"}`;
    });
    const readyLines = unscheduledReadyItems.map((item) => {
      const profile = item.growthProfile || emptyGrowthProfile(item.id);
      return `READY | ${targetPlatformLabel(profile.targetPlatform)} | ${item.fileName} | ${profile.campaignLabel || "No campaign label"}`;
    });
    const blockedLines = providerBlockedItems.map((item) => {
      const profile = item.growthProfile || emptyGrowthProfile(item.id);
      const continuity = resolveProviderContinuity(profile);
      return `BLOCKED | ${continuity.providerLabel} | ${item.fileName} | ${continuity.connectionLabel}`;
    });
    return [
      "Purely content calendar export",
      plannedLines.length ? ["", "Planned content", ...plannedLines].join("\n") : "",
      readyLines.length ? ["", "Unscheduled ready", ...readyLines].join("\n") : "",
      blockedLines.length ? ["", "Provider blocked", ...blockedLines].join("\n") : "",
    ].filter(Boolean).join("\n");
  }, [plannedCalendarItems, providerBlockedItems, unscheduledReadyItems]);

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

    return (
      <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <button
              type="button"
              onClick={() => openItemPreview(item.id)}
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100"
            >
              {previewKind === "image" && item.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
              ) : previewKind === "video" && (item.previewUrl || item.openUrl) ? (
                <video src={item.previewUrl || item.openUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <span className="text-xs font-semibold text-zinc-600">{itemTypeLabel(item)}</span>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold text-zinc-900">{item.fileName}</div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                  {growthStateLabel(profile.workflowState)}
                </span>
                {profile.targetPlatform ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                    {targetPlatformLabel(profile.targetPlatform)}
                  </span>
                ) : null}
                <span
                  className={classNames(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    continuity.blocked
                      ? "bg-rose-50 text-rose-700"
                      : continuity.publishState === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : continuity.publishState === "queued"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  {continuity.publishLabel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                <span>Planned: {profile.plannedForIso ? `${formatCalendarDay(profile.plannedForIso)} at ${formatCalendarTime(profile.plannedForIso)}` : "Not scheduled"}</span>
                <span>Campaign: {profile.campaignLabel || "Not labeled"}</span>
                <span>Offer: {profile.relatedOffer || "Not set"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                <span>Provider: {continuity.providerLabel}</span>
                <span>Connection: {continuity.connectionLabel}</span>
                <span>Metrics: {profile.metricsSyncedAtIso ? "Synced" : "Pending"}</span>
              </div>
              <div className="mt-2 text-xs text-zinc-600">
                {profile.captionDraft ? profile.captionDraft.slice(0, 200) : "No caption draft yet."}
              </div>
              <div className={classNames("mt-2 text-xs", continuity.blocked ? "text-rose-700" : "text-zinc-500")}>{continuity.detail}</div>
              {profile.providerLastError ? <div className="mt-2 text-xs text-rose-700">Provider error: {profile.providerLastError}</div> : null}
              {profile.postedAtIso ? (
                <div className="mt-2 text-xs text-emerald-700">
                  Posted manually on {formatCalendarDay(profile.postedAtIso)} at {formatCalendarTime(profile.postedAtIso)}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 lg:w-104">
            <button
              type="button"
              onClick={() => openItemPreview(item.id)}
              className={assetActionClass()}
            >
              Edit asset
            </button>
            <button
              type="button"
              disabled={!profile.captionDraft}
              onClick={(e) => void copyTextWithToast(profile.captionDraft, "Caption copied", e.currentTarget)}
              className={assetActionClass({ disabled: !profile.captionDraft })}
            >
              Copy caption
            </button>
            <button
              type="button"
              disabled={!profile.ctaHref}
              onClick={(e) => void copyTextWithToast(profile.ctaHref, "CTA link copied", e.currentTarget)}
              className={assetActionClass({ disabled: !profile.ctaHref })}
            >
              Copy CTA
            </button>
            <a
              href={profile.ctaHref || undefined}
              target="_blank"
              rel="noreferrer"
              className={assetActionClass({ disabled: !profile.ctaHref })}
            >
              Open CTA
            </a>
            {profile.workflowState !== "posted_manually" ? (
              <button
                type="button"
                onClick={() => void markItemPostedManually(item)}
                className={assetActionClass({ tone: "success" })}
              >
                Mark posted
              </button>
            ) : profile.postedUrl ? (
              <a
                href={profile.postedUrl}
                target="_blank"
                rel="noreferrer"
                className={assetActionClass({ tone: "successOutline" })}
              >
                Open post URL
              </a>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-sm font-semibold text-zinc-500">
                Posted manually
              </div>
            )}
            <button
              type="button"
              onClick={() => triggerDownload(item.downloadUrl, item.fileName)}
              className={assetActionClass()}
            >
              Download media
            </button>
          </div>
        </div>
      </div>
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

      <div className="mt-4 rounded-3xl border border-sky-200 bg-linear-to-br from-sky-50 via-white to-emerald-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
              Meta {providerConnectionLabel(metaReadiness?.status || "coming_soon")}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-zinc-950">Owner-scoped Meta connection</h2>
            <p className="mt-2 text-sm text-zinc-700">
              {metaSetupMessage}
            </p>
            {metaReadiness?.connectedAccountLabel ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Connected account: <span className="font-semibold">{metaReadiness.connectedAccountLabel}</span>
              </div>
            ) : null}
            {metaPermissionGaps.length ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <div className="font-semibold">Remaining Meta permissions</div>
                <div className="mt-1">Purely can verify the account now, but posting and metrics stay blocked until these permissions are approved.</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {metaPermissionGaps.map((gap) => (
                    <div key={gap} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                      {gap}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {metaTargetAccounts.map((account) => (
                <div key={account.key} className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                  {account.label} · {providerConnectionLabel(account.status)}
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {metaEducation.map((line) => (
                <div key={line} className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-zinc-700">
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-72 rounded-3xl border border-sky-200 bg-white/90 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Connection architecture</div>
            <div className="mt-2 text-sm font-semibold text-zinc-900">Each business connects its own Meta assets.</div>
            <div className="mt-2 text-sm text-zinc-600">{metaReadiness?.explanation || "Meta direct publishing is coming soon. Until then, use manual posting from Media Library."}</div>
            <button
              type="button"
              onClick={metaShowDisconnect ? handleMetaDisconnect : handleMetaConnect}
              disabled={metaActionDisabled}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={metaShowDisconnect ? "Disconnect Meta" : metaActionLabel}
              title={metaActionDisabled ? "Meta connection is not enabled in this environment yet." : metaShowDisconnect ? "Disconnect Meta" : "Connect Meta"}
            >
              {metaActionWorking ? (metaShowDisconnect ? "Disconnecting..." : "Opening Meta...") : metaShowDisconnect ? "Disconnect Meta" : metaActionLabel}
            </button>
            <div className="mt-2 text-xs text-zinc-500">Manual posting remains the active path today. Direct publish and metrics stay blocked until Meta permissions and app review are ready.</div>
            {metaReadiness?.callbackUrl ? (
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                Callback URL: {metaReadiness.callbackUrl}
              </div>
            ) : null}
          </div>
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
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{viewMode === "calendar" ? "Content calendar" : "Folders"}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {viewMode === "calendar"
                    ? "Planned posts, ready-to-schedule assets, and manual posting status all live here."
                    : "Each folder gets a tag you can reference later."}
                </div>
              </div>
              {viewMode === "calendar" ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>Manual posting is available now. Direct provider publish is not connected yet.</span>
                  <button
                    type="button"
                    onClick={(e) => void copyTextWithToast(calendarExportText, "Calendar export copied", e.currentTarget)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Copy export
                  </button>
                </div>
              ) : (
                <div className="text-xs text-zinc-500">Select any item for preview actions.</div>
              )}
            </div>
          </div>

          <div className="p-4">
            {refreshing ? (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
                Refreshing…
              </div>
            ) : null}
            {loading ? (
              <div className="text-sm text-zinc-600">Loading…</div>
            ) : viewMode === "calendar" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-semibold text-amber-950">Manual posting is available now.</div>
                  <div className="mt-1">No Meta, Facebook, or Instagram publishing is connected from this workspace yet.</div>
                  <div className="mt-2 text-xs text-amber-800">Connect your own Facebook Page and Instagram professional account when this is enabled. Purely will never post without your approval. Publishing requires Meta approval and permissions. Until connected, use manual posting.</div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  {queueSummary.map((entry) => (
                    <div
                      key={entry.label}
                      className={classNames(
                        "rounded-2xl border p-3",
                        entry.tone === "rose"
                          ? "border-rose-200 bg-rose-50"
                          : entry.tone === "amber"
                            ? "border-amber-200 bg-amber-50"
                            : entry.tone === "emerald"
                              ? "border-emerald-200 bg-emerald-50"
                              : entry.tone === "sky"
                                ? "border-sky-200 bg-sky-50"
                                : entry.tone === "orange"
                                  ? "border-orange-200 bg-orange-50"
                                  : "border-zinc-200 bg-zinc-50",
                      )}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{entry.label}</div>
                      <div className="mt-2 text-2xl font-semibold text-zinc-900">{entry.count}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Queue and readiness</div>
                      <div className="mt-1 text-xs text-zinc-500">See what still needs captioning, approval, scheduling, manual posting, or provider setup.</div>
                    </div>
                    <div className="text-xs text-zinc-500">Suggested pacing: keep social distribution under 3 posts per provider per day until direct queueing is live.</div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">Needs caption</div>
                        <div className="text-xs text-zinc-500">Assets still waiting on copy or review</div>
                      </div>
                      {needsCaptionItems.length ? <div className="mt-2 space-y-3">{needsCaptionItems.map((item) => renderCalendarItem(item))}</div> : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No assets are blocked on caption right now.</div>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">Needs approval</div>
                        <div className="text-xs text-zinc-500">Content that should be approved before queueing or posting</div>
                      </div>
                      {needsApprovalItems.length ? <div className="mt-2 space-y-3">{needsApprovalItems.map((item) => renderCalendarItem(item))}</div> : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No assets are waiting for approval.</div>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">Approved and waiting</div>
                        <div className="text-xs text-zinc-500">Approved assets that still need a schedule, queue slot, or manual post</div>
                      </div>
                      {approvedQueueItems.length ? <div className="mt-2 space-y-3">{approvedQueueItems.map((item) => renderCalendarItem(item))}</div> : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No approved assets are waiting on the next step.</div>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">Provider blocked</div>
                        <div className="text-xs text-zinc-500">Manual posting can continue, but direct provider continuity is blocked</div>
                      </div>
                      {providerBlockedItems.length ? <div className="mt-2 space-y-3">{providerBlockedItems.map((item) => renderCalendarItem(item))}</div> : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No assets are currently blocked on provider readiness.</div>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">Queued for provider</div>
                        <div className="text-xs text-zinc-500">Prepared for a future direct-publish path</div>
                      </div>
                      {queuedProviderItems.length ? <div className="mt-2 space-y-3">{queuedProviderItems.map((item) => renderCalendarItem(item))}</div> : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Nothing is queued for provider publishing yet.</div>}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">Provider failed</div>
                        <div className="text-xs text-zinc-500">Future provider attempts that need a clear operator fix</div>
                      </div>
                      {providerFailedItems.length ? <div className="mt-2 space-y-3">{providerFailedItems.map((item) => renderCalendarItem(item))}</div> : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No provider failures are stored yet.</div>}
                    </div>
                  </div>
                </div>

                {plannedCalendarItems.length === 0 && unscheduledReadyItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                    <div className="font-semibold text-zinc-900">No planned content yet</div>
                    <div className="mt-2">Upload media, add a caption draft, choose a platform, set a planned date, then post manually or wait for future integrations.</div>
                  </div>
                ) : null}

                {plannedCalendarGroups.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-900">{group.label}</div>
                      <div className="text-xs text-zinc-500">{group.entries.length} planned item{group.entries.length === 1 ? "" : "s"}</div>
                    </div>
                    <div className="mt-2 space-y-3">
                      {group.entries.map((item) => renderCalendarItem(item))}
                    </div>
                  </div>
                ))}

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900">Unscheduled ready</div>
                    <div className="text-xs text-zinc-500">Assets marked ready with no planned date</div>
                  </div>
                  {unscheduledReadyItems.length ? (
                    <div className="mt-2 space-y-3">
                      {unscheduledReadyItems.map((item) => renderCalendarItem(item))}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                      No ready items are waiting for a schedule.
                    </div>
                  )}
                </div>

                {postedCalendarItems.length ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-900">Posted manually</div>
                      <div className="text-xs text-zinc-500">Tracked here after you publish outside Purely</div>
                    </div>
                    <div className="mt-2 space-y-3">
                      {postedCalendarItems.map((item) => renderCalendarItem(item))}
                    </div>
                  </div>
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
                      <div className="text-sm font-semibold text-zinc-900">Next actions</div>
                      <div className="mt-1 text-xs text-zinc-600">Write the caption, route the asset through approval, set the schedule, then post manually now or queue it for a future provider path.</div>
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
                          Write caption
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
                          Needs approval
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
                          Mark ready
                        </button>
                        <button
                          type="button"
                          disabled={detailSaving || detailLoading}
                          onClick={() => void saveSelectedGrowthProfile({ workflowState: "posted_manually", postedAtIso: previewGrowthProfile.postedAtIso || new Date().toISOString(), providerPublishState: "manual_only" })}
                          className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                        >
                          Mark posted
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Campaign details</div>
                          <div className="mt-1 text-xs text-zinc-500">Stored with the asset so calendar planning, approval, provider continuity, and later reporting can reuse the same record.</div>
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
                            <option value="needs_caption">Needs caption</option>
                            <option value="needs_approval">Needs approval</option>
                            <option value="approved">Approved</option>
                            <option value="ready_to_use">Ready to use</option>
                            <option value="planned">Planned</option>
                            <option value="provider_blocked">Provider blocked</option>
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
                              <option value="facebook_page">Facebook Page</option>
                              <option value="instagram_business">Instagram Business</option>
                              <option value="future_tiktok">TikTok (future)</option>
                              <option value="future_linkedin">LinkedIn (future)</option>
                            </select>
                          </label>

                          <label className="block">
                            <div className="text-xs font-semibold text-zinc-700">Provider page/account label</div>
                            <input
                              value={previewGrowthProfile.providerAccountLabel || ""}
                              onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, providerAccountLabel: e.target.value || null })}
                              placeholder="Main Facebook Page, Clinic Instagram"
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
                            <div className="mt-1 text-xs text-zinc-500">{previewGrowthProfile.providerPostId ? `Provider post ID: ${previewGrowthProfile.providerPostId}` : previewGrowthProfile.workflowState === "posted_manually" ? "Manual posts do not create provider metrics or a provider post ID here." : "No provider post ID stored yet."}</div>
                          </div>
                        </div>

                        {previewContinuity?.providerKey === "facebook_page" || previewContinuity?.providerKey === "instagram_business" ? (
                          <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="font-semibold">Meta connection stays owner-scoped.</div>
                                <div className="mt-1 text-xs text-sky-800">{metaSetupMessage}</div>
                                {metaReadiness?.connectedAccountLabel ? (
                                  <div className="mt-2 text-xs font-semibold text-sky-900">Connected account: {metaReadiness.connectedAccountLabel}</div>
                                ) : null}
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {metaTargetAccounts.map((account) => (
                                    <div key={account.key} className="rounded-full border border-sky-200 bg-white px-3 py-1 text-[11px] font-semibold text-sky-800">
                                      {account.label} · {providerConnectionLabel(account.status)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={metaShowDisconnect ? handleMetaDisconnect : handleMetaConnect}
                                disabled={metaActionDisabled}
                                className="inline-flex h-10 min-w-40 items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={metaShowDisconnect ? "Disconnect Meta" : metaActionLabel}
                              >
                                {metaActionWorking ? (metaShowDisconnect ? "Disconnecting..." : "Opening Meta...") : metaShowDisconnect ? "Disconnect Meta" : metaActionLabel}
                              </button>
                            </div>
                            {metaPermissionGaps.length ? (
                              <div className="mt-3 text-xs text-sky-900">Missing permissions: {metaPermissionGaps.join(", ")}</div>
                            ) : null}
                          </div>
                        ) : null}

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
                            <div className="text-xs font-semibold text-zinc-700">Posted URL or permalink</div>
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
                        <div className="mt-2 text-[11px] text-zinc-500">Tracking a post here does not publish anything. It only stores planning and manual-post history. Manual posts do not generate provider metrics or provider post IDs in this flow.</div>
                      </div>

                      <label className="mt-4 block">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Caption or copy draft</div>
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
                          placeholder="Write or edit a caption, email blurb, SMS angle, or post draft here. This stays editable and does not publish anything."
                          className="mt-2 min-h-32 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-500"
                        />
                        <div className="mt-1 text-[11px] text-zinc-500">Drafts are editable planning notes only. No outbound action is triggered from this screen.</div>
                      </label>

                      <label className="mt-4 block">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Notes</div>
                        <textarea
                          value={previewGrowthProfile.notes || ""}
                          onChange={(e) => setSelectedGrowthProfile({ ...previewGrowthProfile, notes: e.target.value || null })}
                          placeholder="Add campaign notes, shot ideas, proof placement, export reminders, or manual posting notes."
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
