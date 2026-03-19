"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SignOutButton } from "@/components/SignOutButton";
import { useToast } from "@/components/ToastProvider";
import {
  IconBilling,
  IconChevron,
  IconDashboard,
  IconHamburger,
  IconLock,
  IconPeople,
  IconProfile,
  IconService,
  IconServiceGlyph,
} from "@/app/portal/PortalIcons";
import { PORTAL_SERVICES, type PortalService } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";
import { PortalFloatingTools } from "@/app/portal/PortalFloatingTools";
import { PORTAL_SERVICE_KEYS, type PortalServiceKey } from "@/lib/portalPermissions.shared";
import type { Entitlements } from "@/lib/entitlements.shared";
import { usePortalActiveTimeTracker } from "@/lib/portalActiveTime.client";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: Entitlements;
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
};

type PortalMe =
  | {
      ok: true;
      ownerId: string;
      memberId: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      permissions: Record<string, { view: boolean; edit: boolean }>;
    }
  | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  usePortalActiveTimeTracker();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const embeddedFromQuery = searchParams?.get("embed") === "1" || searchParams?.get("pa_embed") === "1";
  const [embeddedSticky, setEmbeddedSticky] = useState(embeddedFromQuery);

  useEffect(() => {
    const key = "pa.portal.embed";
    if (embeddedFromQuery) {
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        // ignore
      }
      if (!embeddedSticky) setEmbeddedSticky(true);
      return;
    }

    // Internal portal navigation often drops query params; keep embed mode sticky
    // for the lifetime of the current browsing context (tab/iframe/webview).
    try {
      if (window.sessionStorage.getItem(key) === "1" && !embeddedSticky) {
        setEmbeddedSticky(true);
      }
    } catch {
      // ignore
    }
  }, [embeddedFromQuery, embeddedSticky]);

  const embedded = embeddedFromQuery || embeddedSticky;
  const variant = typeof pathname === "string" && (pathname === "/credit" || pathname.startsWith("/credit/")) ? "credit" : "portal";
  const basePath = variant === "credit" ? "/credit" : "/portal";
  const logoSrc = variant === "credit" ? "/brand/2.png" : "/brand/1.png";
  const sidebarLogoSrc = "/brand/purelylogo.png";

  type AdPlacement = "SIDEBAR_BANNER" | "TOP_BANNER" | "FULLSCREEN_REWARD" | "POPUP_CARD";

  const isFunnelBuilderEditor =
    typeof pathname === "string" &&
    pathname.includes("/app/services/funnel-builder/") &&
    (pathname.includes("/funnels/") || pathname.includes("/forms/")) &&
    pathname.includes("/edit");

  const isAutomationsEditor =
    typeof pathname === "string" &&
    pathname.includes("/app/services/automations/") &&
    pathname.includes("/editor");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, { state: string; label: string }> | null>(null);
  const [showGettingStartedHint, setShowGettingStartedHint] = useState(false);
  const [sidebarCampaign, setSidebarCampaign] = useState<null | {
    id: string;
    creative?: {
      headline?: string;
      body?: string;
      ctaText?: string;
      linkUrl?: string;
      mediaUrl?: string;
      mediaKind?: "image" | "video";
      mediaFit?: "cover" | "contain";
      mediaPosition?: string;
      sidebarImageHeight?: number;

      dismissEnabled?: boolean;
      dismissDelaySeconds?: number;
      dismissReshowAfterSeconds?: number;
    };
  }>(null);

  const [topBannerCampaign, setTopBannerCampaign] = useState<null | {
    id: string;
    creative?: {
      headline?: string;
      body?: string;
      ctaText?: string;
      linkUrl?: string;
      mediaUrl?: string;
      mediaKind?: "image" | "video";
      mediaFit?: "cover" | "contain";
      mediaPosition?: string;
      topBannerImageSize?: number;

      dismissEnabled?: boolean;
      dismissDelaySeconds?: number;
      dismissReshowAfterSeconds?: number;
    };
  }>(null);

  const [rewardCampaign, setRewardCampaign] = useState<null | {
    id: string;
    reward?: { credits?: number; cooldownHours?: number; minWatchSeconds?: number } | null;
    creative?: {
      headline?: string;
      body?: string;
      ctaText?: string;
      linkUrl?: string;
      mediaUrl?: string;
      mediaKind?: "image" | "video";
      mediaFit?: "cover" | "contain";
      mediaPosition?: string;
      fullscreenMediaMaxWidthPct?: number;

      dismissEnabled?: boolean;
      dismissDelaySeconds?: number;
      dismissReshowAfterSeconds?: number;
    };
  }>(null);

  const [rewardStatus, setRewardStatus] = useState<null | { eligible: boolean; nextEligibleAtIso: string | null }>(null);

  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [rewardWatchedSeconds, setRewardWatchedSeconds] = useState(0);
  const [rewardMediaReady, setRewardMediaReady] = useState(false);
  const [rewardPlaying, setRewardPlaying] = useState(false);
  const [rewardNeedsUserGesture, setRewardNeedsUserGesture] = useState(false);
  const [rewardConfirmExit, setRewardConfirmExit] = useState(false);
  const [rewardAutoClaimed, setRewardAutoClaimed] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const rewardVideoRef = useRef<HTMLVideoElement | null>(null);

  const [popupCampaign, setPopupCampaign] = useState<null | {
    id: string;
    creative?: {
      headline?: string;
      body?: string;
      ctaText?: string;
      linkUrl?: string;
      mediaUrl?: string;
      mediaKind?: "image" | "video";
      mediaFit?: "cover" | "contain";
      mediaPosition?: string;

      showDelaySeconds?: number;

      dismissEnabled?: boolean;
      dismissDelaySeconds?: number;
      dismissReshowAfterSeconds?: number;
    };
  }>(null);

  const [popupCampaignPending, setPopupCampaignPending] = useState<null | {
    id: string;
    creative?: {
      headline?: string;
      body?: string;
      ctaText?: string;
      linkUrl?: string;
      mediaUrl?: string;
      mediaKind?: "image" | "video";
      mediaFit?: "cover" | "contain";
      mediaPosition?: string;

      showDelaySeconds?: number;

      dismissEnabled?: boolean;
      dismissDelaySeconds?: number;
      dismissReshowAfterSeconds?: number;
    };
  }>(null);

  const [sidebarShownAtMs, setSidebarShownAtMs] = useState(0);
  const [topBannerShownAtMs, setTopBannerShownAtMs] = useState(0);
  const [rewardShownAtMs, setRewardShownAtMs] = useState(0);
  const [popupShownAtMs, setPopupShownAtMs] = useState(0);

  const popupVideoRef = useRef<HTMLVideoElement | null>(null);
  const popupShowTimeoutRef = useRef<number | null>(null);
  const [popupVideoMuted, setPopupVideoMuted] = useState(false);
  const [popupVideoNeedsUserGesture, setPopupVideoNeedsUserGesture] = useState(false);

  const [nowMs, setNowMs] = useState(0);

  const lastSeenPingRef = useRef<{ atMs: number; path: string } | null>(null);

  useEffect(() => {
    const path = typeof pathname === "string" ? pathname : "";
    const search = searchParams ? searchParams.toString() : "";
    const fullPath = search ? `${path}?${search}` : path;

    const now = Date.now();
    const prev = lastSeenPingRef.current;
    const shouldPing = !prev || prev.path !== fullPath || now - prev.atMs > 30_000;
    if (!shouldPing) return;

    lastSeenPingRef.current = { atMs: now, path: fullPath };

    void fetch("/api/portal/engagement/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: fullPath, source: "portal-shell" }),
      keepalive: true,
    }).catch(() => {
      // ignore
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (sidebarCampaign?.id) setSidebarShownAtMs(Date.now());
  }, [sidebarCampaign?.id]);

  useEffect(() => {
    if (topBannerCampaign?.id) setTopBannerShownAtMs(Date.now());
  }, [topBannerCampaign?.id]);

  useEffect(() => {
    if (rewardCampaign?.id) setRewardShownAtMs(Date.now());
  }, [rewardCampaign?.id]);

  useEffect(() => {
    if (popupCampaign?.id) setPopupShownAtMs(Date.now());
  }, [popupCampaign?.id]);

  useEffect(() => {
    if (popupShowTimeoutRef.current) {
      window.clearTimeout(popupShowTimeoutRef.current);
      popupShowTimeoutRef.current = null;
    }

    if (!popupCampaignPending?.id) {
      setPopupCampaign(null);
      return;
    }

    const delaySeconds = Math.max(0, Math.floor(Number(popupCampaignPending?.creative?.showDelaySeconds ?? 0)));
    if (delaySeconds <= 0) {
      setPopupCampaign(popupCampaignPending);
      return;
    }

    const campaignToShow = popupCampaignPending;
    const pendingId = campaignToShow.id;
    popupShowTimeoutRef.current = window.setTimeout(() => {
      setPopupCampaign((prev) => {
        if (prev?.id === pendingId) return prev;
        return campaignToShow;
      });
    }, delaySeconds * 1000);

    return () => {
      if (popupShowTimeoutRef.current) {
        window.clearTimeout(popupShowTimeoutRef.current);
        popupShowTimeoutRef.current = null;
      }
    };
  }, [popupCampaignPending]);

  useEffect(() => {
    const isVideo =
      Boolean(popupCampaign?.id) &&
      popupCampaign?.creative?.mediaKind === "video" &&
      Boolean(String(popupCampaign?.creative?.mediaUrl || "").trim());

    if (!isVideo) {
      setPopupVideoMuted(false);
      setPopupVideoNeedsUserGesture(false);
      return;
    }

    setPopupVideoMuted(false);
    setPopupVideoNeedsUserGesture(false);

    const el = popupVideoRef.current;
    if (!el) return;

    el.volume = 1;
    el.muted = false;

    (async () => {
      try {
        await el.play();
      } catch {
        // Many browsers block autoplay with sound. Fallback to muted autoplay,
        // and let the user tap once to enable sound.
        try {
          el.muted = true;
          setPopupVideoMuted(true);
          await el.play();
        } catch {
          // ignore
        }
        setPopupVideoNeedsUserGesture(true);
      }
    })();
  }, [popupCampaign?.creative?.mediaKind, popupCampaign?.creative?.mediaUrl, popupCampaign?.id]);

  const dismissStorageKey = useCallback(
    (placement: AdPlacement) => `portalAdDismissed:${variant}:${placement}`,
    [variant],
  );

  const readDismissMap = useCallback(
    (placement: AdPlacement): Record<string, number> => {
    try {
      const raw = window.localStorage.getItem(dismissStorageKey(placement));
      const json = raw ? (JSON.parse(raw) as unknown) : null;
      if (!json || typeof json !== "object" || Array.isArray(json)) return {};

      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
        const id = String(k || "").trim();
        const untilMs = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (!id) continue;
        if (!Number.isFinite(untilMs)) continue;
        out[id] = untilMs;
      }
      return out;
    } catch {
      return {};
    }
    },
    [dismissStorageKey],
  );

  const writeDismissMap = useCallback(
    (placement: AdPlacement, map: Record<string, number>) => {
    try {
      window.localStorage.setItem(dismissStorageKey(placement), JSON.stringify(map));
    } catch {
      // ignore
    }
    },
    [dismissStorageKey],
  );

  const getExcludedCampaignIds = useCallback(
    (placement: AdPlacement): string[] => {
    const nowMs = Date.now();
    const map = readDismissMap(placement);
    const out: string[] = [];
    let changed = false;
    for (const [id, untilMs] of Object.entries(map)) {
      if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
        delete map[id];
        changed = true;
        continue;
      }
      out.push(id);
    }
    if (changed) writeDismissMap(placement, map);
    return out.slice(0, 200);
    },
    [readDismissMap, writeDismissMap],
  );

  const dismissCampaign = useCallback((opts: {
    placement: AdPlacement;
    campaignId: string;
    reshowAfterSeconds: number | null | undefined;
  }) => {
    const base = Number.isFinite(Number(opts.reshowAfterSeconds)) ? Math.max(0, Math.floor(Number(opts.reshowAfterSeconds))) : 0;
    const reshowAfterSeconds = base > 0 ? base : 60 * 60;
    const hideUntilMs = Date.now() + reshowAfterSeconds * 1000;

    const map = readDismissMap(opts.placement);
    map[opts.campaignId] = hideUntilMs;
    writeDismissMap(opts.placement, map);
  }, [readDismissMap, writeDismissMap]);

  function canShowDismiss(campaign: { creative?: { dismissEnabled?: boolean; dismissDelaySeconds?: number } } | null, shownAtMs: number) {
    if (!campaign?.creative?.dismissEnabled) return false;
    const delaySeconds = Math.max(0, Math.floor(Number(campaign.creative.dismissDelaySeconds ?? 0)));
    if (!shownAtMs) return delaySeconds <= 0;
    if (!nowMs) return false;
    return nowMs - shownAtMs >= delaySeconds * 1000;
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("portalSidebarCollapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/services/status", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        setServiceStatuses(null);
        return;
      }
      const json = await res.json().catch(() => null);
      const statuses = json && (json as any).ok === true ? (json as any).statuses : null;
      setServiceStatuses(statuses && typeof statuses === "object" ? statuses : null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // One-time "Getting started" helper for first-time visitors to the portal.
    try {
      const seen = window.localStorage.getItem("portalGettingStartedSeen");
      if (!seen) {
        setShowGettingStartedHint(true);
      }
    } catch {
      // If localStorage is unavailable, silently skip the hint.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/me", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        setPortalMe({ ok: false, error: "Forbidden" });
        return;
      }
      const json = (await res.json().catch(() => null)) as PortalMe | null;
      setPortalMe(json);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("portalSidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    // Close mobile drawer on navigation.
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/customer/me", {
        cache: "no-store",
        headers: { "x-pa-app": "portal", "x-portal-variant": variant },
      });
      if (!mounted) return;
      if (!res.ok) return;
      const json = (await res.json()) as Me;
      setMe(json);
    })();
    return () => {
      mounted = false;
    };
  }, [variant]);

  const isFullDemo = (me?.user.email ?? "").toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const knownServiceKeys = useMemo(() => new Set<string>(PORTAL_SERVICE_KEYS as unknown as string[]), []);

  const refreshAds = useCallback(
    async (opts: { placement: AdPlacement; reason: "path" | "focus" | "dismiss" }) => {
      const excludeIds = getExcludedCampaignIds(opts.placement);
      const url =
        `/api/portal/ads/next?placement=${opts.placement}&path=${encodeURIComponent(pathname || "")}` +
        (excludeIds.length ? `&exclude=${encodeURIComponent(excludeIds.join(","))}` : "");
      const res = await fetch(url, { cache: "no-store" }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;

      if (!res?.ok || !json?.ok) {
        if (opts.placement === "SIDEBAR_BANNER") setSidebarCampaign(null);
        if (opts.placement === "TOP_BANNER") setTopBannerCampaign(null);
        if (opts.placement === "FULLSCREEN_REWARD") {
          setRewardCampaign(null);
          setRewardStatus(null);
        }
        if (opts.placement === "POPUP_CARD") {
          setPopupCampaign(null);
          setPopupCampaignPending(null);
        }
        return;
      }

      if (opts.placement === "SIDEBAR_BANNER") setSidebarCampaign(json.campaign ?? null);
      if (opts.placement === "TOP_BANNER") setTopBannerCampaign(json.campaign ?? null);
      if (opts.placement === "FULLSCREEN_REWARD") {
        setRewardCampaign(json.campaign ?? null);
        setRewardStatus(
          json?.rewardStatus && typeof json.rewardStatus === "object"
            ? {
                eligible: Boolean(json.rewardStatus.eligible),
                nextEligibleAtIso:
                  typeof json.rewardStatus.nextEligibleAtIso === "string" && json.rewardStatus.nextEligibleAtIso
                    ? json.rewardStatus.nextEligibleAtIso
                    : null,
              }
            : null,
        );
      }
      if (opts.placement === "POPUP_CARD") {
        setPopupCampaign(null);
        setPopupCampaignPending(json.campaign ?? null);
      }
    },
    [getExcludedCampaignIds, pathname],
  );

  useEffect(() => {
    void refreshAds({ placement: "SIDEBAR_BANNER", reason: "path" });
  }, [pathname, refreshAds]);

  useEffect(() => {
    void refreshAds({ placement: "TOP_BANNER", reason: "path" });
  }, [pathname, refreshAds]);

  useEffect(() => {
    void refreshAds({ placement: "FULLSCREEN_REWARD", reason: "path" });
  }, [pathname, refreshAds]);

  useEffect(() => {
    void refreshAds({ placement: "POPUP_CARD", reason: "path" });
  }, [pathname, refreshAds]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      // Common workflow: edit campaigns in staff tab -> switch back to portal tab.
      // Refresh once on focus so disabled campaigns immediately fall back.
      void refreshAds({ placement: "SIDEBAR_BANNER", reason: "focus" });
      void refreshAds({ placement: "TOP_BANNER", reason: "focus" });
      void refreshAds({ placement: "FULLSCREEN_REWARD", reason: "focus" });
      void refreshAds({ placement: "POPUP_CARD", reason: "focus" });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [refreshAds]);

  const rewardEligible = rewardStatus?.eligible ?? true;
  const rewardMinWatchSeconds = Math.max(0, Math.floor(Number(rewardCampaign?.reward?.minWatchSeconds ?? 15)));
  const rewardCredits = Math.max(0, Math.floor(Number(rewardCampaign?.reward?.credits ?? 0)));
  const rewardRemainingSeconds = Math.max(0, (rewardMinWatchSeconds || 0) - Math.floor(rewardWatchedSeconds || 0));

  const claimReward = useCallback(
    async (opts: { watchedSeconds: number; closeModalOnSuccess?: boolean }) => {
      const campaignId = rewardCampaign?.id ?? "";
      if (!campaignId) return { ok: false as const };
      if (!rewardEligible) return { ok: false as const };
      try {
        const watchedSeconds = Math.max(0, Math.floor(Number(opts.watchedSeconds) || 0));
        const res = await fetch("/api/portal/ads/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ campaignId, watchedSeconds, path: pathname || "" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = String(body?.error || "Unable to claim reward");
          toast.error(msg);
          if (res.status === 429 && typeof body?.nextAtIso === "string" && body.nextAtIso) {
            setRewardStatus({ eligible: false, nextEligibleAtIso: body.nextAtIso });
          }
          return { ok: false as const };
        }

        if (body?.ok) {
          toast.success("Credits added.");
          setRewardClaimed(true);
          setRewardStatus(
            typeof body?.nextAtIso === "string" && body.nextAtIso
              ? { eligible: false, nextEligibleAtIso: body.nextAtIso }
              : null,
          );
          if (opts.closeModalOnSuccess) {
            setRewardModalOpen(false);
          }
          void refreshAds({ placement: "FULLSCREEN_REWARD", reason: "focus" });
          return { ok: true as const };
        }

        toast.error("Unable to claim reward");
        return { ok: false as const };
      } finally {
      }
    },
    [pathname, refreshAds, rewardCampaign?.id, rewardEligible, toast],
  );

  useEffect(() => {
    if (!rewardModalOpen) return;
    setRewardWatchedSeconds(0);
    setRewardMediaReady(false);
    setRewardPlaying(false);
    setRewardNeedsUserGesture(false);
    setRewardConfirmExit(false);
    setRewardAutoClaimed(false);
    setRewardClaimed(false);
  }, [rewardCampaign?.id, rewardModalOpen]);

  useEffect(() => {
    const shouldOpen = (searchParams?.get("openRewardAd") || "").trim() === "1";
    if (!shouldOpen) return;
    if (!rewardCampaign?.id) return;
    if (!rewardEligible) return;
    setRewardModalOpen(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("openRewardAd");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, [rewardCampaign?.id, rewardEligible, searchParams]);

  useEffect(() => {
    if (!rewardModalOpen) return;
    if (!rewardMediaReady) return;

    const kind = rewardCampaign?.creative?.mediaKind || "image";
    if (kind === "video" && !rewardPlaying) return;

    let raf = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.max(0, now - last);
      last = now;

      if (kind === "video") {
        const video = rewardVideoRef.current;
        const isReallyPlaying = Boolean(video && !video.paused && !video.ended && video.readyState >= 2);
        if (isReallyPlaying) setRewardWatchedSeconds((s) => Math.min(600, s + dt / 1000));
      } else {
        if (document.visibilityState === "visible") setRewardWatchedSeconds((s) => Math.min(600, s + dt / 1000));
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [rewardCampaign?.creative?.mediaKind, rewardMediaReady, rewardModalOpen, rewardPlaying]);

  useEffect(() => {
    if (!rewardModalOpen) return;
    if (!rewardCampaign?.id) return;
    if (!rewardMediaReady) return;
    if (rewardCampaign?.creative?.mediaKind !== "video") return;

    const el = rewardVideoRef.current;
    if (!el) return;

    setRewardNeedsUserGesture(false);

    (async () => {
      try {
        el.muted = false;
        await el.play();
        setRewardPlaying(true);
      } catch {
        try {
          el.muted = true;
          await el.play();
          setRewardPlaying(true);
        } catch {
          setRewardNeedsUserGesture(true);
        }
      }
    })();
  }, [rewardCampaign?.creative?.mediaKind, rewardCampaign?.id, rewardMediaReady, rewardModalOpen]);

  useEffect(() => {
    if (!rewardModalOpen) return;
    if (rewardAutoClaimed) return;
    if (!rewardCampaign?.id) return;
    if (!rewardEligible) return;
    if (rewardCredits <= 0) return;
    const minWatch = rewardMinWatchSeconds || 0;
    if (minWatch <= 0) return;
    if (Math.floor(rewardWatchedSeconds || 0) < minWatch) return;

    setRewardAutoClaimed(true);
    void claimReward({ watchedSeconds: Math.floor(rewardWatchedSeconds || 0), closeModalOnSuccess: false });
  }, [claimReward, rewardAutoClaimed, rewardCampaign?.id, rewardCredits, rewardEligible, rewardMinWatchSeconds, rewardModalOpen, rewardWatchedSeconds]);

  const navItems = useMemo(() => {
    const can = (key: PortalServiceKey) => {
      if (portalMe && portalMe.ok === true) {
        const p = (portalMe.permissions as any)?.[key];
        return Boolean(p?.view);
      }
      // Before we load permissions, show everything to avoid flicker.
      return true;
    };

    const base = [
      { href: `${basePath}/app`, label: "Dashboard", icon: <IconDashboard /> },
      { href: `${basePath}/app/services`, label: "Services", icon: <IconService /> },
      ...(can("people") ? [{ href: `${basePath}/app/people`, label: "People", icon: <IconPeople /> }] : []),
      ...(can("billing") ? [{ href: `${basePath}/app/billing`, label: "Billing", icon: <IconBilling /> }] : []),
      ...(can("profile") ? [{ href: `${basePath}/app/profile`, label: "Profile", icon: <IconProfile /> }] : []),
    ];
    return base;
  }, [portalMe, basePath]);

  function canViewServiceKey(key: PortalServiceKey) {
    if (!portalMe || portalMe.ok !== true) return true;
    const p = (portalMe.permissions as any)?.[key];
    return Boolean(p?.view);
  }

  function canViewServiceSlug(slug: string) {
    switch (slug) {
      case "inbox":
        return canViewServiceKey("inbox") || canViewServiceKey("outbox");
      case "nurture-campaigns":
        return canViewServiceKey("nurtureCampaigns");
      case "media-library":
        return canViewServiceKey("media");
      case "ai-receptionist":
        return canViewServiceKey("aiReceptionist");
      case "ai-outbound-calls":
        return canViewServiceKey("aiOutboundCalls");
      case "lead-scraping":
        return canViewServiceKey("leadScraping");
      case "missed-call-textback":
        return canViewServiceKey("missedCallTextback");
      case "follow-up":
        return canViewServiceKey("followUp");
      default:
        if (!knownServiceKeys.has(slug)) return true;
        return canViewServiceKey(slug as any);
    }
  }

  function isActive(href: string) {
    if (href === `${basePath}/app`) return pathname === `${basePath}/app`;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function serviceUnlocked(service: Pick<PortalService, "slug" | "included">) {
    if (isFullDemo) return true;
    if (service.included) return true;

    // While loading, avoid showing incorrect paywall-style locks.
    if (!serviceStatuses) return true;

    // Canonical ownership lives in `/api/portal/services/status` (computed for the owner).
    const st = (serviceStatuses as any)?.[service.slug];
    const state = String(st?.state || "").toLowerCase();
    return !(state === "locked" || state === "paused" || state === "canceled" || state === "coming_soon");
  }

  function serviceLockBadge(slug: string) {
    const st = serviceStatuses?.[slug];
    if (!st) return null;
    const state = String(st.state || "").toLowerCase();
    if (state === "locked" || state === "paused" || state === "canceled" || state === "coming_soon") {
      const label = String(st.label || "").trim();
      return { label: label || (state === "coming_soon" ? "Coming soon" : state === "paused" ? "Paused" : state === "canceled" ? "Canceled" : "Locked") };
    }
    return null;
  }

  function dismissGettingStartedHint() {
    try {
      window.localStorage.setItem("portalGettingStartedSeen", "1");
    } catch {
      // Ignore storage failures; the hint may reappear in that case.
    }
    setShowGettingStartedHint(false);
  }

  const visibleSidebarServices = PORTAL_SERVICES.filter((s) => !s.hidden)
    .filter((s) => canViewServiceSlug(s.slug))
    .filter((s) => !s.variants || s.variants.includes(variant));
  const sidebarServiceGroups = groupPortalServices(visibleSidebarServices);

  if (isFunnelBuilderEditor || isAutomationsEditor) {
    return (
      <div className="h-[calc(100dvh-var(--pa-portal-topbar-height,0px))] overflow-hidden bg-brand-mist text-brand-ink">
        <main className="h-full overflow-y-auto">
          {children}
          <div aria-hidden className="h-[calc(env(safe-area-inset-bottom)+5rem)]" />
        </main>
        {isAutomationsEditor ? <PortalFloatingTools /> : null}
      </div>
    );
  }

  if (embedded) {
    const footerTabs = [
      { href: `${basePath}/app`, label: "Dashboard", key: "home" },
      { href: `${basePath}/app/services/inbox`, label: "Inbox", key: "inbox" },
      { href: `${basePath}/app/services/tasks`, label: "Tasks", key: "tasks" },
      { href: `${basePath}/app/people`, label: "People", key: "people" },
      { href: `${basePath}/app/profile`, label: "Settings", key: "settings" },
    ] as const;

    return (
      <>
        <style>{`
          /* Embedded portal mode owns its own chrome; hide the /portal layout topbar. */
          .pa-portal-topbar { display: none !important; }
        `}</style>

        <div className="flex h-[100dvh] flex-col overflow-hidden bg-brand-mist text-brand-ink">
          {/* Top header (single header in embedded mode) */}
          <header className="shrink-0 border-b border-zinc-200 bg-white">
            <div className="mx-auto flex h-16 w-full max-w-md items-center gap-2 px-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
              >
                <IconHamburger />
              </button>

              <div className="flex min-w-0 flex-1 items-center justify-center">
                <Link href={`${basePath}/app`} className="flex items-center justify-center">
                  <Image
                    src={sidebarLogoSrc}
                    alt="Purely Automation"
                    width={220}
                    height={44}
                    className="h-8 w-auto max-w-[12.5rem] object-contain"
                    priority
                  />
                </Link>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/book-a-call"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  aria-label="Book a call"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3v3M16 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path
                      d="M6 5h12a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path d="M8 11h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M8 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </Link>
                <Link
                  href={`${basePath}/tutorials/getting-started?embed=1`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  aria-label="Help"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M9.1 9a3 3 0 115.8 0c0 2-3 2-3 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path
                      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </header>

          {/* Embedded drawer (secondary navigation only) */}
          <div
            className={classNames(
              "fixed inset-0 z-40",
              mobileOpen ? "" : "pointer-events-none",
            )}
            aria-hidden={!mobileOpen}
          >
            <button
              type="button"
              className={classNames(
                "absolute inset-0 bg-black/30 transition-opacity",
                mobileOpen ? "opacity-100" : "opacity-0",
              )}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            />

            <aside
              className={classNames(
                "absolute left-0 top-0 flex h-full w-72 flex-col overflow-hidden border-r border-zinc-200 bg-white shadow-xl transition-transform",
                mobileOpen ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 bg-white p-3">
                <Link href={`${basePath}/app`} className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                  <Image
                    src={sidebarLogoSrc}
                    alt="Purely Automation"
                    width={120}
                    height={34}
                    className="h-6 w-auto max-w-32 object-contain"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Services</div>
                <div className="mt-2 space-y-4">
                  {sidebarServiceGroups.map((group) => (
                    <div key={group.key}>
                      <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                      <div className="mt-1 space-y-1">
                        {group.services.map((s) => {
                          const lockBadge = serviceLockBadge(s.slug);
                          const unlocked = serviceUnlocked(s);
                          return (
                            <Link
                              key={s.slug}
                              href={`${basePath}/app/services/${s.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className={classNames(
                                "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                                pathname.startsWith(`${basePath}/app/services/${s.slug}`)
                                  ? "bg-zinc-100 text-zinc-900"
                                  : "text-zinc-700 hover:bg-zinc-50",
                              )}
                            >
                              <span className="text-zinc-500">
                                <IconServiceGlyph slug={s.slug} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">{s.title}</span>
                              {!unlocked ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600">
                                  <IconLock />
                                  {lockBadge?.label || "Locked"}
                                </span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 px-3">
                  <SignOutButton className="w-full justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" />
                </div>
              </div>
            </aside>
          </div>

          {/* Main content */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-md px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-3">
              {children}
            </div>
          </main>

          {/* Bottom footer tabs */}
          <nav className="shrink-0 border-t border-zinc-200 bg-white">
            <div className="mx-auto grid w-full max-w-md grid-cols-5 gap-1 px-2 py-2">
              {footerTabs.map((t) => {
                const active = isActive(t.href);
                const tone = active ? "text-(--color-brand-blue)" : "text-zinc-500";

                function FooterIcon() {
                  switch (t.key) {
                    case "home":
                      return (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M3 10.5l9-7 9 7V21a1 1 0 01-1 1h-5v-6a2 2 0 00-2-2H11a2 2 0 00-2 2v6H4a1 1 0 01-1-1V10.5z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      );
                    case "inbox":
                      return (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M4 4h16v12H4V4z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M22 16l-3 5H5l-3-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path d="M9 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      );
                    case "tasks":
                      return (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M9 11l2 2 4-4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7 4h12a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path d="M7 8h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      );
                    case "people":
                      return (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M17 21v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M10 12a4 4 0 100-8 4 4 0 000 8z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M21 21v-1a3 3 0 00-2-2.83"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M17 3.13a4 4 0 010 7.75"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      );
                    case "settings":
                      return (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <path
                            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-1.41 3.41h-.08a1.65 1.65 0 00-1.49 1.1l-.02.06a2 2 0 01-3.58 0l-.02-.06a1.65 1.65 0 00-1.49-1.1H9.9a1.65 1.65 0 00-1.49 1.1l-.02.06a2 2 0 01-3.58 0l-.02-.06a1.65 1.65 0 00-1.49-1.1H3.3a2 2 0 01-1.41-3.41l.06-.06A1.65 1.65 0 002.28 15v-.12a1.65 1.65 0 00-.33-1.82l-.06-.06A2 2 0 013.3 9.59h.08A1.65 1.65 0 004.87 8.5l.02-.06a2 2 0 013.58 0l.02.06A1.65 1.65 0 009.98 9.6h.12a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 013.41 1.41v.08a1.65 1.65 0 001.1 1.49l.06.02a2 2 0 010 3.58l-.06.02a1.65 1.65 0 00-1.1 1.49z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      );
                    default:
                      return null;
                  }
                }

                return (
                  <Link
                    key={t.key}
                    href={t.href}
                    className={classNames(
                      "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold",
                      active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50",
                    )}
                  >
                    <span className={classNames(tone)}>
                      <FooterIcon />
                    </span>
                    <span className="max-w-full truncate">{t.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <PortalFloatingTools />
        </div>
      </>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--pa-portal-topbar-height,0px))] overflow-hidden bg-brand-mist text-brand-ink">
      {showGettingStartedHint ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-4 pb-6 sm:items-center sm:pb-0">
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 bg-black/25"
            aria-label="Dismiss getting started hint"
            onClick={dismissGettingStartedHint}
          />
          <div className="pointer-events-auto relative w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New here?</div>
            <h2 className="mt-2 text-lg font-semibold text-brand-ink">Watch the getting started tour</h2>
            <p className="mt-2 text-sm text-zinc-700">
              See how the portal fits together, what to turn on first, and how to configure the core pieces in a couple of minutes.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`${basePath}/tutorials/getting-started`}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                onClick={dismissGettingStartedHint}
              >
                Open getting started
              </Link>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={dismissGettingStartedHint}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      ) : null}

  <div className="flex h-full min-h-0">
        {/* Mobile drawer */}
        <div
          className={classNames(
            "fixed inset-0 z-40 sm:hidden",
            mobileOpen ? "" : "pointer-events-none",
          )}
          aria-hidden={!mobileOpen}
        >
          <button
            type="button"
            className={classNames(
              "absolute inset-0 bg-black/30 transition-opacity",
              mobileOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />

          <aside
            className={classNames(
              "absolute left-0 top-0 flex h-full w-72.5 flex-col overflow-hidden border-r border-zinc-200 bg-white shadow-xl transition-transform",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 bg-white/90 p-3 backdrop-blur">
              <Link href={`${basePath}/app`} className="flex items-center gap-3">
                <Image
                  src={sidebarLogoSrc}
                  alt="Purely Automation"
                  width={120}
                  height={34}
                  className="h-6 w-auto max-w-32 object-contain"
                  priority
                />
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="ml-auto inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                aria-label="Close menu"
              >
                <span className="rotate-180">
                  <IconChevron />
                </span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={classNames(
                      "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold",
                      isActive(item.href)
                        ? "bg-[rgba(29,78,216,0.10)] text-(--color-brand-blue)"
                        : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>

              <div className="mt-6">
                <div className="px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Services
                </div>
                <div className="mt-2 space-y-4">
                  {sidebarServiceGroups.map((group) => (
                    <div key={group.key}>
                      <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                      <div className="mt-1 space-y-1">
                        {group.services.map((s) => {
                          const lockBadge = serviceLockBadge(s.slug);
                          const unlocked = serviceUnlocked(s);
                          return (
                            <Link
                              key={s.slug}
                              href={`${basePath}/app/services/${s.slug}`}
                              className={classNames(
                                "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                                pathname.startsWith(`${basePath}/app/services/${s.slug}`)
                                  ? "bg-zinc-100 text-zinc-900"
                                  : "text-zinc-700 hover:bg-zinc-50",
                              )}
                            >
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                                <span
                                  className={classNames(
                                    s.accent === "blue"
                                      ? "text-(--color-brand-blue)"
                                      : s.accent === "coral"
                                        ? "text-(--color-brand-pink)"
                                        : "text-zinc-700",
                                  )}
                                >
                                  <IconServiceGlyph slug={s.slug} />
                                </span>
                              </span>

                              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                <span className="truncate">{s.title}</span>
                                {!unlocked ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500">
                                    <IconLock /> {lockBadge?.label || "Locked"}
                                  </span>
                                ) : null}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-200 p-4">
              {sidebarCampaign ? (
                <div className="mb-4 rounded-2xl border border-brand-ink/10 bg-linear-to-br from-brand-blue/10 to-white p-3 text-sm text-zinc-800">
                  {canShowDismiss(sidebarCampaign, sidebarShownAtMs) ? (
                    <div className="mb-2 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        aria-label="Dismiss"
                        onClick={() => {
                          dismissCampaign({
                            placement: "SIDEBAR_BANNER",
                            campaignId: sidebarCampaign.id,
                            reshowAfterSeconds: sidebarCampaign?.creative?.dismissReshowAfterSeconds,
                          });
                          setSidebarCampaign(null);
                          void refreshAds({ placement: "SIDEBAR_BANNER", reason: "dismiss" });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  {sidebarCampaign?.creative?.mediaUrl && sidebarCampaign?.creative?.mediaKind !== "video" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={sidebarCampaign.creative.mediaUrl}
                      alt={sidebarCampaign?.creative?.headline || "Sponsored"}
                      className="mb-2 w-full rounded-xl border border-zinc-200 object-cover"
                      style={{
                        height: Math.max(60, Math.min(240, Math.floor(Number(sidebarCampaign?.creative?.sidebarImageHeight || 120)))),
                        objectFit: sidebarCampaign?.creative?.mediaFit || "cover",
                        objectPosition: sidebarCampaign?.creative?.mediaPosition || "center",
                      }}
                      loading="lazy"
                    />
                  ) : null}
                  <div className="font-semibold text-zinc-900">
                    {sidebarCampaign?.creative?.headline || "Sponsored by Purely Automation"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">{sidebarCampaign?.creative?.body || "Explore add-ons and unlock more automation."}</div>
                  <a
                    href={
                      `/api/portal/ads/click?campaignId=${encodeURIComponent(sidebarCampaign.id)}` +
                      `&placement=SIDEBAR_BANNER` +
                      `&path=${encodeURIComponent(pathname || "")}` +
                      `&to=${encodeURIComponent(sidebarCampaign?.creative?.linkUrl || `${basePath}/app/billing`)}`
                    }
                    className="mt-2 inline-flex rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                  >
                    {sidebarCampaign?.creative?.ctaText || "View upgrades"}
                  </a>
                </div>
              ) : null}

              <div className="text-xs text-zinc-500">Signed in as</div>
              <div className="mt-1 truncate text-sm font-semibold text-brand-ink">
                {me?.user.email ?? ""}
              </div>
              <div className="mt-3">
                <SignOutButton />
              </div>
            </div>
          </aside>
        </div>

        <aside
          className={classNames(
            "hidden shrink-0 border-r border-zinc-200 bg-white overflow-hidden sm:flex sm:flex-col sm:sticky sm:top-0 sm:h-full",
            collapsed ? "w-19" : "w-70",
          )}
        >
          <div className={classNames("shrink-0 flex items-center gap-3 border-b border-zinc-200 p-3", collapsed && "justify-center")}
          >
            {!collapsed ? (
              <Link href={`${basePath}/app`} className="flex items-center gap-3">
                <Image
                  src={sidebarLogoSrc}
                  alt="Purely Automation"
                  width={120}
                  height={34}
                  className="h-6 w-auto max-w-36 object-contain"
                  priority
                />
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={classNames(
                "ml-auto inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50",
                collapsed && "ml-0",
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <IconHamburger /> : <span className="rotate-180"><IconChevron /></span>}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classNames(
                    "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold",
                    isActive(item.href)
                      ? "bg-[rgba(29,78,216,0.10)] text-(--color-brand-blue)"
                      : "text-zinc-700 hover:bg-zinc-50",
                    collapsed && "justify-center px-2",
                  )}
                >
                  {item.icon}
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              ))}
            </div>

            <div className={classNames("mt-4", collapsed && "px-1")}>
              {!collapsed ? (
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Services
                </div>
              ) : null}
              {collapsed ? (
                <div className="mt-2 space-y-1">
                  {visibleSidebarServices.map((s) => {
                    return (
                      <Link
                        key={s.slug}
                        href={`${basePath}/app/services/${s.slug}`}
                        className={classNames(
                          "flex items-center gap-3 rounded-2xl px-3 py-1.5 text-sm font-medium",
                          pathname === `${basePath}/app/services/${s.slug}` || pathname.startsWith(`${basePath}/app/services/${s.slug}/`)
                            ? "bg-zinc-100 text-zinc-900"
                            : "text-zinc-700 hover:bg-zinc-50",
                          "justify-center px-2",
                        )}
                        title={s.title}
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                          <span
                            className={classNames(
                              s.accent === "blue"
                                ? "text-(--color-brand-blue)"
                                : s.accent === "coral"
                                  ? "text-(--color-brand-pink)"
                                  : "text-zinc-700",
                            )}
                          >
                            <IconServiceGlyph slug={s.slug} />
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {sidebarServiceGroups.map((group) => (
                    <div key={group.key}>
                      <div className="px-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                      <div className="mt-1 space-y-1">
                        {group.services.map((s) => {
                          const lockBadge = serviceLockBadge(s.slug);
                          const unlocked = serviceUnlocked(s);
                          return (
                            <Link
                              key={s.slug}
                              href={`${basePath}/app/services/${s.slug}`}
                              className={classNames(
                                "flex items-center gap-3 rounded-2xl px-3 py-1.5 text-sm font-medium",
                                pathname === `${basePath}/app/services/${s.slug}` || pathname.startsWith(`${basePath}/app/services/${s.slug}/`)
                                  ? "bg-zinc-100 text-zinc-900"
                                  : "text-zinc-700 hover:bg-zinc-50",
                              )}
                            >
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                                <span
                                  className={classNames(
                                    s.accent === "blue"
                                      ? "text-(--color-brand-blue)"
                                      : s.accent === "coral"
                                        ? "text-(--color-brand-pink)"
                                        : "text-zinc-700",
                                  )}
                                >
                                  <IconServiceGlyph slug={s.slug} />
                                </span>
                              </span>

                              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                <span className="truncate">{s.title}</span>
                                {!unlocked ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500">
                                    <IconLock /> {lockBadge?.label || "Locked"}
                                  </span>
                                ) : null}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={classNames("shrink-0 border-t border-zinc-200 bg-white p-3 z-20", collapsed && "px-2")}>
            {sidebarCampaign && !collapsed ? (
              <div className="mb-4 rounded-2xl border border-brand-ink/10 bg-linear-to-br from-brand-blue/10 to-white p-3 text-sm text-zinc-800">
                {canShowDismiss(sidebarCampaign, sidebarShownAtMs) ? (
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      aria-label="Dismiss"
                      onClick={() => {
                        dismissCampaign({
                          placement: "SIDEBAR_BANNER",
                          campaignId: sidebarCampaign.id,
                          reshowAfterSeconds: sidebarCampaign?.creative?.dismissReshowAfterSeconds,
                        });
                        setSidebarCampaign(null);
                        void refreshAds({ placement: "SIDEBAR_BANNER", reason: "dismiss" });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                {sidebarCampaign?.creative?.mediaUrl && sidebarCampaign?.creative?.mediaKind !== "video" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={sidebarCampaign.creative.mediaUrl}
                    alt={sidebarCampaign?.creative?.headline || "Sponsored"}
                    className="mb-2 max-h-30 w-full rounded-xl border border-zinc-200 object-cover"
                    style={{
                      objectFit: sidebarCampaign?.creative?.mediaFit || "cover",
                      objectPosition: sidebarCampaign?.creative?.mediaPosition || "center",
                    }}
                    loading="lazy"
                  />
                ) : null}
                <div className="font-semibold text-zinc-900">
                  {sidebarCampaign?.creative?.headline || "Sponsored by Purely Automation"}
                </div>
                <div className="mt-1 text-xs text-zinc-600">{sidebarCampaign?.creative?.body || "Explore add-ons and unlock more automation."}</div>
                <a
                  href={
                    `/api/portal/ads/click?campaignId=${encodeURIComponent(sidebarCampaign.id)}` +
                    `&placement=SIDEBAR_BANNER` +
                    `&path=${encodeURIComponent(pathname || "")}` +
                    `&to=${encodeURIComponent(sidebarCampaign?.creative?.linkUrl || `${basePath}/app/billing`)}`
                  }
                  className="mt-2 inline-flex rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                >
                  {sidebarCampaign?.creative?.ctaText || "View upgrades"}
                </a>
              </div>
            ) : null}

            {!collapsed ? (
              <div className="text-xs text-zinc-500">Signed in as</div>
            ) : null}
            {!collapsed ? (
              <div className="mt-1 truncate text-sm font-semibold text-brand-ink">
                {me?.user.email ?? ""}
              </div>
            ) : null}
            <div className={classNames("mt-3", collapsed && "mt-0 flex justify-center")}>
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur sm:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                aria-label="Open menu"
              >
                <IconHamburger />
              </button>

              <Link href={`${basePath}/app`} className="flex items-center gap-3">
                <Image
                  src={logoSrc}
                  alt="Purely Automation"
                  width={150}
                  height={46}
                  className="h-8 w-auto object-contain"
                  priority
                />
              </Link>
              <Link
                href={`${basePath}/app/services`}
                className="inline-flex items-center justify-center rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white"
              >
                Services
              </Link>
            </div>
          </header>

          <main className="min-h-0 min-w-0 flex-1 p-4 pb-4 sm:p-8 sm:pb-6">
            {topBannerCampaign ? (
              <div className="mb-4 rounded-3xl border border-brand-ink/10 bg-linear-to-r from-brand-blue/15 via-white to-white p-4 text-brand-ink">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {topBannerCampaign?.creative?.mediaUrl && topBannerCampaign?.creative?.mediaKind !== "video" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={topBannerCampaign.creative.mediaUrl}
                        alt={topBannerCampaign?.creative?.headline || "Sponsored"}
                        className="shrink-0 rounded-2xl border border-zinc-200 object-cover"
                        style={{
                          height: Math.max(40, Math.min(160, Math.floor(Number(topBannerCampaign?.creative?.topBannerImageSize || 56)))),
                          width: Math.max(40, Math.min(160, Math.floor(Number(topBannerCampaign?.creative?.topBannerImageSize || 56)))),
                          objectFit: topBannerCampaign?.creative?.mediaFit || "cover",
                          objectPosition: topBannerCampaign?.creative?.mediaPosition || "center",
                        }}
                        loading="lazy"
                      />
                    ) : null}

                    <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sponsored by Purely Automation</div>
                    <div className="mt-1 truncate text-base font-semibold text-zinc-900">
                      {topBannerCampaign?.creative?.headline || "Sponsored"}
                    </div>
                    {topBannerCampaign?.creative?.body ? (
                      <div className="mt-1 line-clamp-2 text-sm text-zinc-700">{topBannerCampaign.creative.body}</div>
                    ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={
                        `/api/portal/ads/click?campaignId=${encodeURIComponent(topBannerCampaign.id)}` +
                        `&placement=TOP_BANNER` +
                        `&path=${encodeURIComponent(pathname || "")}` +
                        `&to=${encodeURIComponent(topBannerCampaign?.creative?.linkUrl || `${basePath}/app/billing`)}`
                      }
                      className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                    >
                      {topBannerCampaign?.creative?.ctaText || "Learn more"}
                    </Link>

                    {canShowDismiss(topBannerCampaign, topBannerShownAtMs) ? (
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        aria-label="Dismiss"
                        onClick={() => {
                          dismissCampaign({
                            placement: "TOP_BANNER",
                            campaignId: topBannerCampaign.id,
                            reshowAfterSeconds: topBannerCampaign?.creative?.dismissReshowAfterSeconds,
                          });
                          setTopBannerCampaign(null);
                          void refreshAds({ placement: "TOP_BANNER", reason: "dismiss" });
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {children}
            <div aria-hidden className="h-[calc(env(safe-area-inset-bottom)+5rem)]" />
          </main>

          {rewardCampaign && rewardEligible ? (
            <div className="fixed bottom-4 left-4 z-9996 w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl ring-1 ring-[rgba(29,78,216,0.14)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded-full bg-brand-blue/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-(--color-brand-blue)">
                      Sponsored
                    </span>
                    <div className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                      {rewardCampaign?.creative?.headline || "Purely Automation"}
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-600">
                    {rewardCampaign?.creative?.body || "Watch a short video."}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                    onClick={() => setRewardModalOpen(true)}
                  >
                    Watch
                  </button>

                  {canShowDismiss(rewardCampaign, rewardShownAtMs) ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      aria-label="Dismiss"
                      onClick={() => {
                        dismissCampaign({
                          placement: "FULLSCREEN_REWARD",
                          campaignId: rewardCampaign.id,
                          reshowAfterSeconds: rewardCampaign?.creative?.dismissReshowAfterSeconds,
                        });
                        setRewardCampaign(null);
                        setRewardStatus(null);
                        void refreshAds({ placement: "FULLSCREEN_REWARD", reason: "dismiss" });
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {rewardModalOpen ? (
            <div
              className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 p-3 sm:p-6"
              onMouseDown={() => {
                if (rewardCredits > 0 && rewardRemainingSeconds > 0) setRewardConfirmExit(true);
                else setRewardModalOpen(false);
              }}
            >
              <div
                className="flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10"
                style={{ maxHeight: "100%" }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 border-b border-zinc-200 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-brand-blue/15 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-(--color-brand-blue)">
                          Sponsored by Purely Automation
                        </span>
                        {rewardCredits > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-emerald-900">
                            Earn {rewardCredits} credits
                          </span>
                        ) : null}
                        {rewardCredits > 0 && rewardMinWatchSeconds > 0 ? (
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-zinc-800">
                            {rewardCampaign?.creative?.mediaKind === "video" && !rewardPlaying && rewardMediaReady
                              ? "Press play to start"
                              : rewardRemainingSeconds > 0
                                ? `${rewardRemainingSeconds}s remaining`
                                : "Complete"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 truncate text-lg font-semibold text-zinc-900">
                        {rewardCampaign?.creative?.headline || "Purely Automation"}
                      </div>
                      <div className="mt-1 truncate text-sm text-zinc-600">
                        {rewardCampaign?.creative?.body || ""}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {rewardCampaign?.creative?.linkUrl ? (
                        <a
                          href={
                            `/api/portal/ads/click?campaignId=${encodeURIComponent(rewardCampaign.id)}` +
                            `&placement=FULLSCREEN_REWARD` +
                            `&path=${encodeURIComponent(pathname || "")}` +
                            `&to=${encodeURIComponent(rewardCampaign.creative.linkUrl)}`
                          }
                          className="hidden rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:inline-flex"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {rewardCampaign?.creative?.ctaText || "Open"}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        onClick={() => {
                          if (rewardCredits > 0 && rewardRemainingSeconds > 0) setRewardConfirmExit(true);
                          else setRewardModalOpen(false);
                        }}
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 bg-black">
                  {rewardCampaign?.creative?.mediaUrl ? (
                    <div
                      className="mx-auto flex h-full w-full items-center justify-center"
                      style={{
                        maxWidth: `min(${Math.max(
                          40,
                          Math.min(
                            100,
                            Math.floor(Number(rewardCampaign?.creative?.fullscreenMediaMaxWidthPct || 100)),
                          ),
                        )}vw, 960px)`,
                      }}
                    >
                      {rewardCampaign?.creative?.mediaKind === "video" ? (
                        <div className="relative h-full w-full">
                          <video
                            ref={rewardVideoRef}
                            className="h-full w-full"
                            style={{
                              objectFit: rewardCampaign?.creative?.mediaFit || "contain",
                              objectPosition: rewardCampaign?.creative?.mediaPosition || "center",
                            }}
                            controls
                            playsInline
                            preload="auto"
                            src={rewardCampaign.creative.mediaUrl}
                            onLoadedData={() => setRewardMediaReady(true)}
                            onCanPlay={() => setRewardMediaReady(true)}
                            onPlay={() => setRewardPlaying(true)}
                            onPause={() => setRewardPlaying(false)}
                            onEnded={() => setRewardPlaying(false)}
                          />

                          {rewardNeedsUserGesture ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6">
                              <button
                                type="button"
                                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                                onClick={async () => {
                                  const el = rewardVideoRef.current;
                                  if (!el) return;
                                  setRewardNeedsUserGesture(false);
                                  try {
                                    el.muted = false;
                                    await el.play();
                                    setRewardPlaying(true);
                                  } catch {
                                    try {
                                      el.muted = true;
                                      await el.play();
                                      setRewardPlaying(true);
                                    } catch {
                                      setRewardNeedsUserGesture(true);
                                    }
                                  }
                                }}
                              >
                                Tap to play
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <Image
                          className="h-full w-full"
                          style={{
                            objectFit: rewardCampaign?.creative?.mediaFit || "contain",
                            objectPosition: rewardCampaign?.creative?.mediaPosition || "center",
                          }}
                          src={rewardCampaign.creative.mediaUrl}
                          alt={rewardCampaign?.creative?.headline || "Sponsored"}
                          width={1920}
                          height={1080}
                          unoptimized
                          onLoad={() => setRewardMediaReady(true)}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-white/80">
                      Media is not configured for this campaign.
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-zinc-200 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-zinc-700">
                      {rewardCredits > 0 ? (
                        rewardMinWatchSeconds > 0 ? (
                          rewardCampaign?.creative?.mediaKind === "video" && !rewardPlaying && rewardMediaReady ? (
                            <>Press play to start the countdown.</>
                          ) : rewardRemainingSeconds > 0 ? (
                            <>
                              Keep watching to earn <span className="font-semibold">{rewardCredits}</span> credits.
                            </>
                          ) : (
                            <>
                              {rewardClaimed ? (
                                <>Credits added.</>
                              ) : (
                                <>You are all set. Claiming your credits...</>
                              )}
                            </>
                          )
                        ) : (
                          <>Sponsored message</>
                        )
                      ) : (
                        <>Sponsored message</>
                      )}
                      {rewardCampaign?.creative?.mediaKind === "video" && !rewardMediaReady ? (
                        <div className="mt-1 text-xs text-zinc-500">Loading video...</div>
                      ) : null}
                    </div>

                    {rewardCampaign?.creative?.linkUrl ? (
                      <a
                        href={
                          `/api/portal/ads/click?campaignId=${encodeURIComponent(rewardCampaign.id)}` +
                          `&placement=FULLSCREEN_REWARD` +
                          `&path=${encodeURIComponent(pathname || "")}` +
                          `&to=${encodeURIComponent(rewardCampaign.creative.linkUrl)}`
                        }
                        className="inline-flex rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:hidden"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {rewardCampaign?.creative?.ctaText || "Open"}
                      </a>
                    ) : null}
                  </div>

                  {rewardCredits > 0 && rewardMinWatchSeconds > 0 ? (
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              (Math.max(0, Math.floor(rewardWatchedSeconds || 0)) / Math.max(1, rewardMinWatchSeconds)) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                {rewardConfirmExit ? (
                  <div
                    className="absolute inset-0 z-10000 flex items-center justify-center bg-black/60 p-4"
                    onMouseDown={() => setRewardConfirmExit(false)}
                  >
                    <div
                      className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="text-base font-semibold text-zinc-900">Stop watching?</div>
                      <div className="mt-2 text-sm text-zinc-700">
                        If you stop now, you will not receive the {rewardCredits} credits.
                      </div>
                      {rewardMinWatchSeconds > 0 ? (
                        <div className="mt-2 text-sm text-zinc-700">
                          {rewardRemainingSeconds > 0 ? (
                            <>
                              <span className="font-semibold">{rewardRemainingSeconds}s</span> remaining.
                            </>
                          ) : (
                            <>You are done, claiming now...</>
                          )}
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => setRewardConfirmExit(false)}
                        >
                          Keep watching
                        </button>
                        <button
                          type="button"
                          className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                          onClick={() => {
                            setRewardConfirmExit(false);
                            setRewardModalOpen(false);
                          }}
                        >
                          Stop
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {popupCampaign ? (
            <div className="fixed inset-0 z-9995 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Dismiss"
                onClick={() => {
                  dismissCampaign({
                    placement: "POPUP_CARD",
                    campaignId: popupCampaign.id,
                    reshowAfterSeconds: popupCampaign?.creative?.dismissReshowAfterSeconds,
                  });
                  setPopupCampaign(null);
                  setPopupCampaignPending(null);
                  void refreshAds({ placement: "POPUP_CARD", reason: "dismiss" });
                }}
              />

              <div className="relative w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sponsored</div>
                    <div className="mt-1 text-base font-semibold text-zinc-900">
                      {popupCampaign?.creative?.headline || "Sponsored"}
                    </div>
                    {popupCampaign?.creative?.body ? (
                      <div className="mt-2 text-sm text-zinc-700">{popupCampaign.creative.body}</div>
                    ) : null}
                  </div>
                  {canShowDismiss(popupCampaign, popupShownAtMs) ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      aria-label="Dismiss"
                      onClick={() => {
                        dismissCampaign({
                          placement: "POPUP_CARD",
                          campaignId: popupCampaign.id,
                          reshowAfterSeconds: popupCampaign?.creative?.dismissReshowAfterSeconds,
                        });
                        setPopupCampaign(null);
                        setPopupCampaignPending(null);
                        void refreshAds({ placement: "POPUP_CARD", reason: "dismiss" });
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                {popupCampaign?.creative?.mediaUrl ? (
                  popupCampaign?.creative?.mediaKind === "video" ? (
                    <div className="relative">
                      <video
                        ref={popupVideoRef}
                        className="mt-4 w-full rounded-2xl border border-zinc-200 bg-black"
                        style={{
                          maxHeight: 320,
                          objectFit: popupCampaign?.creative?.mediaFit || "contain",
                          objectPosition: popupCampaign?.creative?.mediaPosition || "center",
                        }}
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        muted={popupVideoMuted}
                        src={popupCampaign.creative.mediaUrl}
                      />

                      {popupVideoNeedsUserGesture ? (
                        <button
                          type="button"
                          className="absolute bottom-3 right-3 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white hover:bg-black/80"
                          onClick={async () => {
                            const el = popupVideoRef.current;
                            if (!el) return;
                            try {
                              el.volume = 1;
                              el.muted = false;
                              setPopupVideoMuted(false);
                              await el.play();
                              setPopupVideoNeedsUserGesture(false);
                            } catch {
                              setPopupVideoNeedsUserGesture(true);
                            }
                          }}
                        >
                          Tap for sound
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={popupCampaign.creative.mediaUrl}
                      alt={popupCampaign?.creative?.headline || "Sponsored"}
                      className="mt-4 w-full rounded-2xl border border-zinc-200 object-cover"
                      style={{
                        maxHeight: 320,
                        objectFit: popupCampaign?.creative?.mediaFit || "cover",
                        objectPosition: popupCampaign?.creative?.mediaPosition || "center",
                      }}
                      loading="lazy"
                    />
                  )
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <a
                    href={
                      `/api/portal/ads/click?campaignId=${encodeURIComponent(popupCampaign.id)}` +
                      `&placement=POPUP_CARD` +
                      `&path=${encodeURIComponent(pathname || "")}` +
                      `&to=${encodeURIComponent(popupCampaign?.creative?.linkUrl || `${basePath}/app/billing`)}`
                    }
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  >
                    {popupCampaign?.creative?.ctaText || "Learn more"}
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <PortalFloatingTools />
        </div>
      </div>
    </div>
  );
}
