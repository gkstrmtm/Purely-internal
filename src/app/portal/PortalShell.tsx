"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import GlassSurface from "@/components/GlassSurface";
import { SignOutButton } from "@/components/SignOutButton";
import { useToast } from "@/components/ToastProvider";
import {
  IconChevron,
  IconAiChatGlyph,
  IconCalendar,
  IconBillingGlyph,
  IconDashboardGlyph,
  IconSalesDashboardGlyph,
  IconEyeGlyph,
  IconApiKeysGlyph,
  IconBusinessGlyph,
  IconHamburger,
  IconHelpCircle,
  IconInboxGlyph,
  IconLock,
  IconPeopleGlyph,
  IconProfileGlyph,
  IconServicesGlyph,
  IconServiceGlyph,
  IconSettingsGlyph,
} from "@/app/portal/PortalIcons";
import { PORTAL_SERVICES, type PortalService } from "@/app/portal/services/catalog";
import { groupPortalServices, portalServiceCategoryForSlug, type PortalServiceCategory } from "@/app/portal/services/categories";
import { PortalFloatingTools } from "@/app/portal/PortalFloatingTools";
import { usePortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import { PORTAL_SERVICE_KEYS, type PortalServiceKey } from "@/lib/portalPermissions.shared";
import type { Entitlements } from "@/lib/entitlements.shared";
import { usePortalActiveTimeTracker } from "@/lib/portalActiveTime.client";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { usePuraCanvasUiBridgeResponder } from "@/lib/puraCanvasUiBridge.client";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

const PORTAL_SERVICE_TITLE_BY_SLUG = new Map<string, string>(PORTAL_SERVICES.map((s) => [s.slug, s.title]));
const PORTAL_SERVICE_BY_SLUG = new Map<string, PortalService>(PORTAL_SERVICES.map((s) => [s.slug, s]));

const DASHBOARD_SALES_SHORTCUT_SLUG = "sales-dashboard";

type Me = {
  user: { email: string; name: string; role: string; businessName?: string | null };
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

function PortalNavLink(props: React.ComponentProps<typeof Link>) {
  return <Link {...props} scroll={props.scroll ?? false} />;
}

function dispatchTopbarIntent(hidden: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden } }));
}

function sidebarIconToneClassForCategory(category: PortalServiceCategory) {
  switch (category) {
    case "communication":
    case "leads":
      return "text-(--color-brand-blue) pa-portal-service-icon-tone pa-portal-service-icon-tone--blue";
    case "marketing":
    case "operations":
      return "text-(--color-brand-pink) pa-portal-service-icon-tone pa-portal-service-icon-tone--pink";
    case "automation":
    case "analytics":
      return "text-brand-ink pa-portal-service-icon-tone pa-portal-service-icon-tone--ink";
    case "credit":
    case "other":
    default:
      return "text-zinc-700 pa-portal-service-icon-tone pa-portal-service-icon-tone--neutral";
  }
}

function sidebarIconToneClassForSlug(slug: string) {
  return `${sidebarIconToneClassForCategory(portalServiceCategoryForSlug(slug))} pa-portal-service-icon-tone--${slug}`;
}

function sidebarIconButtonClass(active: boolean, extra?: string) {
  return classNames(
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-zinc-700 transition-all duration-100 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20",
    active ? "bg-zinc-100 text-brand-blue ring-2 ring-brand-blue/20" : "bg-transparent hover:bg-zinc-50 hover:text-zinc-900",
    extra,
  );
}

function sidebarIconChipClass(active: boolean) {
  return classNames(
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition-all duration-100",
    active ? "bg-zinc-100 text-zinc-700" : "bg-transparent group-hover:bg-zinc-100 group-hover:scale-105",
  );
}

const portalPrimaryActionClass =
  "transition-opacity duration-100 hover:opacity-95";

const portalSecondaryActionClass =
  "transition-colors duration-100 hover:border-zinc-300 hover:bg-zinc-50";

const portalIconActionClass =
  "transition-all duration-100 hover:bg-zinc-50 hover:text-zinc-900";

const portalGlassIconSurfaceProps = {
  width: 40,
  height: 40,
  borderRadius: 16,
  borderWidth: 0.04,
  blur: 7,
  displace: 0.22,
  distortionScale: -72,
  redOffset: 0,
  greenOffset: 2,
  blueOffset: 6,
  backgroundOpacity: 0.16,
  saturation: 1.05,
  brightness: 46,
  opacity: 0.985,
  mixBlendMode: "soft-light" as const,
  style: { background: "rgba(255,255,255,0.46)", boxShadow: "none" },
};

const DESKTOP_SIDEBAR_EXPANDED_WIDTH = "17.5rem";
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = "4.75rem";

export function PortalShell({ children }: { children: React.ReactNode }) {
  usePortalActiveTimeTracker();
  usePuraCanvasUiBridgeResponder();

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
  const sidebarLogoSrc = "/brand/purelylogo.png";

  useEffect(() => {
    if (!pathname) return;

    const appRoot = `${basePath}/app`;
    let sectionTitle: string | null = null;

    if (pathname === appRoot) {
      sectionTitle = "Dashboard";
    } else if (pathname.startsWith(`${appRoot}/ai-chat`)) {
      sectionTitle = "Pura";
    } else if (pathname.startsWith(`${appRoot}/people`)) {
      sectionTitle = "People";
    } else if (pathname.startsWith(`${appRoot}/billing`)) {
      sectionTitle = "Billing";
    } else if (pathname.startsWith(`${appRoot}/profile`)) {
      sectionTitle = "Profile";
    } else if (pathname.startsWith(`${appRoot}/settings`)) {
      sectionTitle = "Settings";
    } else if (pathname.startsWith(`${appRoot}/services`)) {
      const rest = pathname.slice(`${appRoot}/services`.length);
      const segs = rest.split("/").filter(Boolean);
      const slug = segs[0] || "";
      const sub = segs[1] || "";

      if (!slug) {
        sectionTitle = "Services";
      } else {
        const baseTitle = PORTAL_SERVICE_TITLE_BY_SLUG.get(slug) || "Services";

        if (slug === "inbox" && (sub === "email" || sub === "sms")) {
          sectionTitle = `${baseTitle} - ${sub === "sms" ? "SMS" : "Email"}`;
        } else if (slug === "ai-outbound-calls" && (sub === "calls" || sub === "messages" || sub === "settings")) {
          const pretty = sub === "calls" ? "Calls" : sub === "messages" ? "Messages" : "Settings";
          sectionTitle = `${baseTitle} - ${pretty}`;
        } else {
          sectionTitle = baseTitle;
        }
      }
    }

    if (!sectionTitle) return;
    document.title = `${sectionTitle} • Purely Automation`;
  }, [pathname, basePath]);

  type AdPlacement = "SIDEBAR_BANNER" | "TOP_BANNER" | "FULLSCREEN_REWARD" | "POPUP_CARD";

  const isAiChat = typeof pathname === "string" && pathname.startsWith(`${basePath}/app/ai-chat`);

  const [puraCanvasOpen, setPuraCanvasOpen] = useState(false);
  useEffect(() => {
    if (!isAiChat) return;

    const read = () => {
      try {
        const raw = window.localStorage.getItem("puraCanvasOpen");
        // Default to "closed" so simply opening the Pura tab doesn't collapse the sidebar.
        // The canvas/work area should opt-in by setting localStorage or dispatching the event.
        const open = raw === "true";
        // Treat localStorage sync as state hydration (not a user-triggered toggle), so
        // we don't auto-collapse the sidebar just because the user navigated to Pura.
        prevPuraCanvasOpenRef.current = open;
        collapsedBeforeCanvasOpenRef.current = null;
        setPuraCanvasOpen(open);
      } catch {
        // ignore
      }
    };

    read();
    const onChanged = (e: Event) => {
      const ev = e as CustomEvent<{ open?: boolean }>;
      if (typeof ev?.detail?.open === "boolean") {
        setPuraCanvasOpen(ev.detail.open);
      } else {
        read();
      }
    };

    window.addEventListener("puraCanvasOpenChanged", onChanged as any);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("puraCanvasOpenChanged", onChanged as any);
      window.removeEventListener("focus", read);
    };
  }, [isAiChat]);

  const isAutomationsEditor =
    typeof pathname === "string" &&
    pathname.includes("/app/services/automations/") &&
    pathname.includes("/editor");

  const isFunnelBuilderFormEditor =
    typeof pathname === "string" &&
    pathname.includes("/app/services/funnel-builder/forms/") &&
    (pathname.endsWith("/edit") || pathname.includes("/edit?"));

  const isFunnelBuilderFunnelEditor =
    typeof pathname === "string" &&
    pathname.includes("/app/services/funnel-builder/funnels/") &&
    (pathname.endsWith("/edit") || pathname.includes("/edit?"));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--pa-portal-sidebar-width", collapsed ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH : DESKTOP_SIDEBAR_EXPANDED_WIDTH);
    return () => {
      root.style.setProperty("--pa-portal-sidebar-width", "0px");
    };
  }, [collapsed]);
  const collapsedBeforeCanvasOpenRef = useRef<boolean | null>(null);
  const collapsedBeforeOverrideRef = useRef<boolean | null>(null);
  const prevPuraCanvasOpenRef = useRef(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onClose = () => setMobileOpen(false);
    window.addEventListener("pa.portal.mobile-drawer.close", onClose as EventListener);
    return () => window.removeEventListener("pa.portal.mobile-drawer.close", onClose as EventListener);
  }, []);

  const sidebarOverride = usePortalSidebarOverride();

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
    if (!isAiChat) {
      collapsedBeforeCanvasOpenRef.current = null;
      prevPuraCanvasOpenRef.current = false;
      return;
    }

    const wasCanvasOpen = prevPuraCanvasOpenRef.current;
    prevPuraCanvasOpenRef.current = puraCanvasOpen;

    if (puraCanvasOpen && !wasCanvasOpen) {
      collapsedBeforeCanvasOpenRef.current = collapsed;
      if (!collapsed) setCollapsed(true);
      return;
    }

    if (!puraCanvasOpen && wasCanvasOpen && collapsedBeforeCanvasOpenRef.current !== null) {
      setCollapsed(collapsedBeforeCanvasOpenRef.current);
      collapsedBeforeCanvasOpenRef.current = null;
    }
  }, [collapsed, isAiChat, puraCanvasOpen]);

  useEffect(() => {
    if (!sidebarOverride?.forceCollapsed) {
      if (collapsedBeforeOverrideRef.current !== null) {
        setCollapsed(collapsedBeforeOverrideRef.current);
        collapsedBeforeOverrideRef.current = null;
      }
      return;
    }

    if (collapsedBeforeOverrideRef.current === null) {
      collapsedBeforeOverrideRef.current = collapsed;
    }
    if (!collapsed) setCollapsed(true);
  }, [collapsed, sidebarOverride?.forceCollapsed]);

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
  const signedInLabel = (me?.user.email ?? "").trim();
  const knownServiceKeys = useMemo(() => new Set<string>(PORTAL_SERVICE_KEYS as unknown as string[]), []);

  const canViewServiceKey = useCallback(
    (key: PortalServiceKey) => {
      if (!portalMe || portalMe.ok !== true) return true;
      const p = (portalMe.permissions as any)?.[key];
      return Boolean(p?.view);
    },
    [portalMe],
  );

  const canViewServiceSlug = useCallback(
    (slug: string) => {
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
    },
    [canViewServiceKey, knownServiceKeys],
  );

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

    const canSeeSettings = can("profile") || can("billing");

    const base = [
      { href: `${basePath}/app/ai-chat`, label: "Pura", key: "pura", iconGlyph: <IconAiChatGlyph /> },
      { href: `${basePath}/app`, label: "Dashboard", key: "dashboard", iconGlyph: <IconDashboardGlyph /> },
      { href: `${basePath}/app/services`, label: "Services", key: "services", iconGlyph: <IconServicesGlyph /> },
      ...(canSeeSettings
        ? [{ href: `${basePath}/app/settings`, label: "Settings", key: "settings", iconGlyph: <IconSettingsGlyph /> }]
        : []),
    ];
    return base;
  }, [portalMe, basePath]);

  const derivedTopKey = useMemo<"pura" | "dashboard" | "services" | "settings">(() => {
    if (isAiChat) return "pura";
    if (pathname === `${basePath}/app` || pathname === `${basePath}/app/`) return "dashboard";
    if (
      typeof pathname === "string" &&
      (pathname.startsWith(`${basePath}/app/services`) || pathname.startsWith(`${basePath}/app/people`))
    ) {
      return "services";
    }
    return "settings";
  }, [basePath, isAiChat, pathname]);

  const [sidebarModeOverride, setSidebarModeOverride] = useState<null | "pura" | "dashboard" | "services" | "settings">(null);
  useEffect(() => {
    // Any real navigation resets the manual sidebar mode.
    setSidebarModeOverride(null);
  }, [pathname]);

  const activeTopKey = sidebarModeOverride ?? derivedTopKey;
  const hasSidebarOverrideContent = Boolean(sidebarOverride?.desktopSidebarContent || sidebarOverride?.mobileSidebarContent);
  const showSidebarOverrideInServices = derivedTopKey === "services" && hasSidebarOverrideContent;
  const sidebarPanelTopKey = showSidebarOverrideInServices ? "services" : activeTopKey;
  const showSidebarOverridePanel = sidebarPanelTopKey === "pura" || showSidebarOverrideInServices;

  const [dashboardEditMode, setDashboardEditMode] = useState(false);
  useEffect(() => {
    const onEdit = (ev: Event) => {
      const detail = (ev as any)?.detail;
      if (typeof detail?.editing === "boolean") setDashboardEditMode(detail.editing);
    };
    window.addEventListener("pa.portal.dashboard.edit", onEdit as any);
    return () => window.removeEventListener("pa.portal.dashboard.edit", onEdit as any);
  }, []);
  useEffect(() => {
    if (activeTopKey !== "dashboard" && dashboardEditMode) setDashboardEditMode(false);
  }, [activeTopKey, dashboardEditMode]);

  const activeServiceSlug = useMemo(() => {
    if (typeof pathname !== "string") return null;
    const prefix = `${basePath}/app/services/`;
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    const slug = rest.split("/").filter(Boolean)[0] || "";
    return slug || null;
  }, [basePath, pathname]);

  // Track service usage for “top 5” defaults.
  useEffect(() => {
    if (!activeServiceSlug) return;
    try {
      const key = "pa.portal.serviceUsageCounts";
      const raw = window.localStorage.getItem(key);
      const rec = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const cur = typeof rec?.[activeServiceSlug] === "number" ? (rec[activeServiceSlug] as number) : 0;
      const next = { ...(rec || {}), [activeServiceSlug]: Math.min(999999, Math.max(0, Math.floor(cur) + 1)) };
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [activeServiceSlug]);

  const [dashboardQuickAccess, setDashboardQuickAccess] = useState<string[] | null>(null);
  const [dashboardQuickAccessFallback, setDashboardQuickAccessFallback] = useState<string[]>([DASHBOARD_SALES_SHORTCUT_SLUG]);

  const saveDashboardQuickAccess = useCallback(
    async (slugs: string[]) => {
      const res = await fetch("/api/portal/dashboard/quick-access", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slugs }),
      }).catch(() => null as any);
      if (!res?.ok) {
        const body = (await res?.json().catch(() => ({}))) as { error?: string };
        toast?.push({ kind: "error", message: body?.error || "Unable to save shortcuts" });
        return null;
      }
      const json = (await res.json().catch(() => null)) as { ok?: boolean; slugs?: string[] } | null;
      if (!json?.ok) return null;
      const next = Array.isArray(json.slugs) ? json.slugs : [];
      setDashboardQuickAccess(next);
      return next;
    },
    [toast],
  );

  useEffect(() => {
    if (activeTopKey !== "dashboard" || collapsed) return;
    let mounted = true;
    (async () => {
      const allowed = PORTAL_SERVICES.filter((s) => !s.hidden)
        .filter((s) => canViewServiceSlug(s.slug))
        .filter((s) => !s.variants || s.variants.includes(variant))
        .map((s) => s.slug);

      const counts: Record<string, number> = {};
      try {
        const raw = window.localStorage.getItem("pa.portal.serviceUsageCounts");
        const rec = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        for (const slug of allowed) {
          const v = rec?.[slug];
          const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
          counts[slug] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
        }
      } catch {
        // ignore
      }

      const ordered = [...allowed].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
      const computedServices = (ordered.filter(Boolean).slice(0, 5).length ? ordered.filter(Boolean).slice(0, 5) : allowed.slice(0, 5)).slice(0, 5);
      const computed = [DASHBOARD_SALES_SHORTCUT_SLUG, ...computedServices.filter((s) => s !== DASHBOARD_SALES_SHORTCUT_SLUG)].slice(0, 6);
      if (mounted) setDashboardQuickAccessFallback(computed);

      const res = await fetch("/api/portal/dashboard/quick-access", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) return;
      const json = (await res.json().catch(() => null)) as { ok?: boolean; slugs?: string[] } | null;
      if (!mounted || !json?.ok) return;

      const slugs = Array.isArray(json.slugs) ? json.slugs : [];
      setDashboardQuickAccess(slugs);

      // If not configured yet, persist a sensible “top used” default.
      if (!slugs.length && computed.length) {
        void saveDashboardQuickAccess(computed);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTopKey, canViewServiceSlug, collapsed, portalMe, variant, saveDashboardQuickAccess, serviceStatuses]);

  const dashboardQuickAccessEffective = useMemo(() => {
    const base = (dashboardQuickAccess && dashboardQuickAccess.length ? dashboardQuickAccess : dashboardQuickAccessFallback) || [];
    const unique = Array.from(new Set(base.map((s) => String(s || "").trim()).filter(Boolean)));
    const withoutSales = unique.filter((s) => s !== DASHBOARD_SALES_SHORTCUT_SLUG);
    const salesFirst = [DASHBOARD_SALES_SHORTCUT_SLUG, ...withoutSales];
    return salesFirst.slice(0, 6);
  }, [dashboardQuickAccess, dashboardQuickAccessFallback]);

  const [dashboardAnalysis, setDashboardAnalysis] = useState<null | { text: string; generatedAtIso: string }>(null);
  const [dashboardAnalysisLoading, setDashboardAnalysisLoading] = useState(false);

  const refreshDashboardAnalysis = useCallback(
    async (trigger: string) => {
      if (dashboardAnalysisLoading) return;
      setDashboardAnalysisLoading(true);
      try {
        const res = await fetch("/api/portal/dashboard/analysis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trigger }),
        }).catch(() => null as any);
        if (!res?.ok) return;
        const json = (await res.json().catch(() => null)) as { ok?: boolean; analysis?: any } | null;
        if (json?.ok) setDashboardAnalysis(json.analysis ?? null);
      } finally {
        setDashboardAnalysisLoading(false);
      }
    },
    [dashboardAnalysisLoading],
  );

  useEffect(() => {
    if (activeTopKey !== "dashboard" || collapsed) return;
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/dashboard/analysis", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) return;
      const json = (await res.json().catch(() => null)) as { ok?: boolean; analysis?: any } | null;
      if (!mounted || !json?.ok) return;
      setDashboardAnalysis(json.analysis ?? null);

      // Lazy weekly refresh if missing or stale.
      const iso = String(json.analysis?.generatedAtIso || "");
      const d = iso ? new Date(iso) : null;
      const stale = !d || !Number.isFinite(d.getTime()) || Date.now() - d.getTime() > 7 * 24 * 60 * 60 * 1000;
      if (!json.analysis || stale) void refreshDashboardAnalysis("weekly_auto");
    })();
    return () => {
      mounted = false;
    };
  }, [activeTopKey, collapsed, refreshDashboardAnalysis]);

  useEffect(() => {
    const onSaved = () => {
      if (activeTopKey === "dashboard") void refreshDashboardAnalysis("dashboard_saved_event");
    };
    window.addEventListener("pa.portal.dashboard.saved", onSaved as any);
    return () => window.removeEventListener("pa.portal.dashboard.saved", onSaved as any);
  }, [activeTopKey, refreshDashboardAnalysis]);

  const sidebarHeaderLabel = useMemo(() => {
    if (sidebarPanelTopKey === "pura") return "pura";
    if (sidebarPanelTopKey === "dashboard") return "dashboard";
    if (sidebarPanelTopKey === "settings") return "settings";
    if (sidebarPanelTopKey === "services") {
      if (pathname === `${basePath}/app/people` || pathname.startsWith(`${basePath}/app/people/`)) return "people";
      if (activeServiceSlug) return (PORTAL_SERVICE_TITLE_BY_SLUG.get(activeServiceSlug) || "services").toLowerCase();
      return "services";
    }
    return "";
  }, [activeServiceSlug, basePath, pathname, sidebarPanelTopKey]);

  const mobileHeaderTitle = useMemo(() => {
    if (activeTopKey === "pura") return "Pura";
    if (pathname === `${basePath}/app` || pathname === `${basePath}/app/`) return "Dashboard";
    if (pathname === `${basePath}/app/people` || pathname.startsWith(`${basePath}/app/people/`)) return "People";
    if (pathname.startsWith(`${basePath}/app/profile`)) return "Profile";
    if (pathname.startsWith(`${basePath}/app/billing`)) return "Billing";
    if (pathname.startsWith(`${basePath}/app/settings/appearance`)) return "Appearance";
    if (pathname.startsWith(`${basePath}/app/settings/integrations`)) return "Integrations";
    if (pathname.startsWith(`${basePath}/app/settings/business`)) return "Business";
    if (pathname.startsWith(`${basePath}/app/settings`)) return "Settings";
    if (pathname.startsWith(`${basePath}/app/services/`) && activeServiceSlug) {
      return PORTAL_SERVICE_TITLE_BY_SLUG.get(activeServiceSlug) || "Services";
    }
    if (pathname.startsWith(`${basePath}/app/services`)) return "Services";
    return sidebarHeaderLabel ? sidebarHeaderLabel.charAt(0).toUpperCase() + sidebarHeaderLabel.slice(1) : "Portal";
  }, [activeServiceSlug, activeTopKey, basePath, pathname, sidebarHeaderLabel]);

  const dashboardShortcutCandidates = PORTAL_SERVICES.filter((s) => !s.hidden)
    .filter((s) => canViewServiceSlug(s.slug))
    .filter((s) => !s.variants || s.variants.includes(variant));

  function isActive(href: string) {
    if (href === `${basePath}/app`) return pathname === `${basePath}/app`;
    if (href === `${basePath}/app/services`) {
      return (
        pathname === href ||
        pathname.startsWith(href + "/") ||
        pathname === `${basePath}/app/people` ||
        pathname.startsWith(`${basePath}/app/people/`)
      );
    }
    if (href === `${basePath}/app/settings`) {
      return (
        pathname === href ||
        pathname.startsWith(href + "/") ||
        pathname === `${basePath}/app/profile` ||
        pathname.startsWith(`${basePath}/app/profile/`) ||
        pathname === `${basePath}/app/billing` ||
        pathname.startsWith(`${basePath}/app/billing/`)
      );
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  function renderSidebarServiceLink(s: PortalService) {
    const lockBadge = serviceLockBadge(s.slug);
    const unlocked = serviceUnlocked(s);
    const active = pathname === `${basePath}/app/services/${s.slug}` || pathname.startsWith(`${basePath}/app/services/${s.slug}/`);

    return (
      <PortalNavLink
        href={`${basePath}/app/services/${s.slug}`}
        className={classNames(
          "group flex items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
          active ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
        )}
      >
        <span className={sidebarIconChipClass(active)} aria-hidden>
          <span className={sidebarIconToneClassForSlug(s.slug)}>
            <IconServiceGlyph slug={s.slug} />
          </span>
        </span>

        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate">{s.title}</span>
          {!unlocked ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
              <IconLock /> {lockBadge?.label || "Locked"}
            </span>
          ) : null}
        </span>
      </PortalNavLink>
    );
  }

  function renderPeopleLink() {
    const active = pathname === `${basePath}/app/people` || pathname.startsWith(`${basePath}/app/people/`);
    return (
      <PortalNavLink
        key="__people"
        href={`${basePath}/app/people`}
        className={classNames(
          "group flex items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
          active ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
        )}
      >
        <span className={sidebarIconChipClass(active)} aria-hidden>
          <span className={sidebarIconToneClassForCategory("communication")}>
            <IconPeopleGlyph />
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate">People</span>
      </PortalNavLink>
    );
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

  const floatingToolsReserve = "6.5rem";

  if (isAutomationsEditor) {
    return (
      <div
        className="h-[calc(100dvh-var(--pa-portal-topbar-height,0px))] overflow-hidden bg-brand-mist text-brand-ink transition-[height] duration-250 ease-out"
        style={{
          ["--pa-modal-safe-bottom" as any]: isAutomationsEditor
            ? `calc(env(safe-area-inset-bottom) + ${floatingToolsReserve})`
            : "env(safe-area-inset-bottom)",
        }}
      >
        <main className="h-full overflow-y-auto overscroll-y-contain">
          {children}
          <div
            aria-hidden
            className="h-[calc(env(safe-area-inset-bottom)+5rem)] sm:h-[calc(env(safe-area-inset-bottom)+2rem)]"
          />
        </main>
        {isAutomationsEditor ? <PortalFloatingTools /> : null}
      </div>
    );
  }

  if (isFunnelBuilderFormEditor || isFunnelBuilderFunnelEditor) {
    return (
      <div className="h-[calc(100dvh-var(--pa-portal-topbar-height,0px))] overflow-hidden bg-brand-mist text-brand-ink transition-[height] duration-250 ease-out">
        <main className="h-full overflow-y-auto overscroll-y-contain">{children}</main>
      </div>
    );
  }

  if (embedded) {
    const settingsHref = variant === "portal" ? `${basePath}/app/settings` : `${basePath}/app`;

    const footerTabs = [
      { href: `${basePath}/app`, label: "Dashboard", key: "home" },
      { href: `${basePath}/app/services/inbox`, label: "Inbox", key: "inbox" },
      { href: `${basePath}/app/services/tasks`, label: "Tasks", key: "tasks" },
      { href: `${basePath}/app/people`, label: "People", key: "people" },
      { href: settingsHref, label: "Settings", key: "settings" },
    ] as const;

    const embeddedSidebarServiceGroups = sidebarServiceGroups
      .map((g) => ({
        ...g,
        services: g.services.filter((s) => s.slug !== "tasks"),
      }))
      .filter((g) => g.services.length);

    return (
      <>
        <style>{`
          /* Embedded portal mode owns its own chrome; hide the /portal layout topbar. */
          .pa-portal-topbar { display: none !important; }
          :root { --pa-portal-topbar-height: 0px !important; }
        `}</style>

        <div
          className="flex h-dvh flex-col overflow-hidden bg-brand-mist text-brand-ink"
          style={{
            ["--pa-portal-embed-footer-offset" as any]: "calc(env(safe-area-inset-bottom) + 5.5rem)",
            ["--pa-modal-safe-top" as any]: "calc(env(safe-area-inset-top) + 4rem)",
            ["--pa-modal-safe-bottom" as any]: `calc(env(safe-area-inset-bottom) + 5.5rem + ${floatingToolsReserve})`,
          }}
        >
          {/* Top header (single header in embedded mode) */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-90 flex items-start justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:hidden">
            <button
              type="button"
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white/95 text-zinc-900 shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <IconHamburger />
            </button>
            <div aria-hidden className="h-10 w-10" />
          </div>

          {/* Embedded drawer (secondary navigation only) */}
          <div
            className={classNames(
              "fixed inset-0 z-130040",
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
                "absolute left-0 top-0 z-130041 flex h-full w-72 flex-col overflow-hidden border-r border-zinc-200 bg-white shadow-xl transition-transform",
                mobileOpen ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 bg-white p-3">
                <PortalNavLink href={`${basePath}/app`} className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                  <Image
                    src={sidebarLogoSrc}
                    alt="Purely Automation"
                    width={120}
                    height={34}
                    className="h-6 w-auto max-w-32 object-contain"
                  />
                </PortalNavLink>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-transparent text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3">
                <div className="px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Services</div>
                <div className="mt-2 space-y-4">
                  {embeddedSidebarServiceGroups.map((group) => (
                    <div key={group.key}>
                      <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                      <div className="mt-1 space-y-1">
                        {group.services.map((s) => {
                          const lockBadge = serviceLockBadge(s.slug);
                          const unlocked = serviceUnlocked(s);
                          return (
                            <PortalNavLink
                              key={s.slug}
                              href={`${basePath}/app/services/${s.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className={classNames(
                                "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                                pathname.startsWith(`${basePath}/app/services/${s.slug}`)
                                  ? "bg-zinc-100 text-zinc-900"
                                  : `text-zinc-700 ${portalSecondaryActionClass}`,
                              )}
                            >
                              <span className={sidebarIconToneClassForSlug(s.slug)}>
                                <IconServiceGlyph slug={s.slug} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">{s.title}</span>
                              {!unlocked ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600">
                                  <IconLock />
                                  {lockBadge?.label || "Locked"}
                                </span>
                              ) : null}
                            </PortalNavLink>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-zinc-200 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
                  <div className="flex items-center justify-end gap-2">
                    <GlassSurface {...portalGlassIconSurfaceProps} className="rounded-2xl">
                      <Link
                        href={toPurelyHostedUrl("/book-a-call")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-700 backdrop-blur-[2px] transition-transform duration-150 hover:scale-105 hover:bg-[rgba(255,255,255,0.72)] hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
                        aria-label="Book a call"
                        title="Book a call"
                      >
                        <IconCalendar size={18} />
                      </Link>
                    </GlassSurface>
                    <GlassSurface {...portalGlassIconSurfaceProps} className="rounded-2xl">
                      <PortalNavLink
                        href={`${basePath}/tutorials/getting-started?embed=1`}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-700 backdrop-blur-[2px] transition-transform duration-150 hover:scale-105 hover:bg-[rgba(255,255,255,0.72)] hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
                        aria-label="Help"
                        title="Help"
                      >
                        <IconHelpCircle size={18} />
                      </PortalNavLink>
                    </GlassSurface>
                    <SignOutButton variant="sidebar" collapsed />
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Main content */}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <div className="mx-auto w-full max-w-md px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+3.75rem)] sm:pt-3">
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
                      return <IconInboxGlyph size={22} />;
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
                          <path d="M8 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M8 16h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      );
                    case "people":
                      return <IconPeopleGlyph size={22} />;
                    case "settings":
                      return <IconSettingsGlyph size={22} />;
                    default:
                      return null;
                  }
                }

                return (
                  <PortalNavLink
                    key={t.key}
                    href={t.href}
                    className={classNames(
                      "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold",
                      active ? "bg-zinc-100 text-zinc-900" : `text-zinc-600 ${portalSecondaryActionClass}`,
                    )}
                  >
                    <span className={classNames(tone)}>
                      <FooterIcon />
                    </span>
                    <span className="max-w-full truncate">{t.label}</span>
                  </PortalNavLink>
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
    <div
      className="h-dvh overflow-hidden bg-brand-mist text-brand-ink transition-[height] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        ["--pa-modal-safe-bottom" as any]: `calc(env(safe-area-inset-bottom) + ${floatingToolsReserve})`,
      }}
    >
      {isAiChat && !puraCanvasOpen ? (
        <div className="pointer-events-none fixed right-4 top-4 z-30 hidden lg:flex flex-col gap-2">
          <GlassSurface {...portalGlassIconSurfaceProps} width={44} height={44} borderRadius={18} className="pointer-events-auto rounded-2xl">
            <Link
              href={toPurelyHostedUrl("/book-a-call")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-700 backdrop-blur-[2px] transition-transform hover:scale-110 hover:bg-[rgba(255,255,255,0.72)] hover:text-zinc-900 focus-visible:outline-none"
              aria-label="Book a call"
              title="Book a call"
            >
              <IconCalendar size={22} />
            </Link>
          </GlassSurface>
          <GlassSurface {...portalGlassIconSurfaceProps} width={44} height={44} borderRadius={18} className="pointer-events-auto rounded-2xl">
            <PortalNavLink
              href={`${basePath}/tutorials/getting-started`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-700 backdrop-blur-[2px] transition-transform hover:scale-110 hover:bg-[rgba(255,255,255,0.72)] hover:text-zinc-900 focus-visible:outline-none"
              aria-label="Help"
              title="Help"
            >
              <IconHelpCircle size={22} />
            </PortalNavLink>
          </GlassSurface>
        </div>
      ) : null}

      {showGettingStartedHint ? (
        <div
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4 py-6"
          style={{
            paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
          }}
        >
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
              <PortalNavLink
                href={`${basePath}/tutorials/getting-started`}
                className={classNames(
                  "inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white",
                  portalPrimaryActionClass,
                )}
                onClick={dismissGettingStartedHint}
              >
                Open getting started
              </PortalNavLink>
              <button
                type="button"
                className={classNames(
                  "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800",
                  portalSecondaryActionClass,
                )}
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
            "fixed inset-0 z-130040 sm:hidden",
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
              "absolute left-0 top-0 z-130041 flex h-full w-72.5 flex-col overflow-hidden border-r border-zinc-200 bg-white shadow-xl transition-transform",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Portal navigation"
          >
            <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
              <div className="min-w-0 flex-1 px-1">
                <div className="truncate text-base font-semibold tracking-tight text-brand-ink">{mobileHeaderTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className={classNames(
                  "ml-auto inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700",
                  portalIconActionClass,
                )}
                aria-label="Close menu"
              >
                <span className="rotate-180">
                  <IconChevron />
                </span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3">
              <div className="shrink-0 grid grid-cols-4 gap-1 px-1">
                {navItems.map((item: any) => {
                  const key = item.key as "pura" | "dashboard" | "services" | "settings";
                  const active = activeTopKey === key;
                  const isSidebarOnly = key === "services" || key === "settings";
                  const iconClass = sidebarIconButtonClass(active, "h-10 w-10");
                  const onClick = () => {
                    if (isSidebarOnly) {
                      setSidebarModeOverride(key);
                      return;
                    }
                    dispatchTopbarIntent(key === "pura");
                    setSidebarModeOverride(null);
                    setMobileOpen(false);
                  };

                  return isSidebarOnly ? (
                    <button
                      key={item.href}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      onClick={onClick}
                      className="inline-flex items-center justify-center rounded-2xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
                    >
                      <span className={iconClass} aria-hidden>
                        {item.iconGlyph}
                      </span>
                    </button>
                  ) : (
                    <PortalNavLink
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      aria-label={item.label}
                      onClick={onClick as any}
                      className="inline-flex items-center justify-center rounded-2xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
                    >
                      <span className={iconClass} aria-hidden>
                        {item.iconGlyph}
                      </span>
                    </PortalNavLink>
                  );
                })}
              </div>

              <div
                className={classNames(
                  "mt-4 min-h-0 flex-1 pb-4",
                  activeTopKey === "pura" ? "overflow-hidden" : "overflow-y-auto overscroll-y-contain",
                )}
              >
                {showSidebarOverridePanel ? (
                  <div className="h-full min-h-0 overflow-hidden rounded-2xl bg-white">
                    {sidebarOverride?.mobileSidebarContent || sidebarOverride?.desktopSidebarContent || (
                      <div className="p-3 text-sm text-zinc-500">Loading chats…</div>
                    )}
                  </div>
                ) : null}

                {sidebarPanelTopKey === "dashboard" ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between px-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Shortcuts</div>
                      </div>

                      {dashboardEditMode ? (
                        <div className="mt-2 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              const cur = dashboardQuickAccessEffective;
                              const selected = cur.includes(DASHBOARD_SALES_SHORTCUT_SLUG);
                              if (selected) {
                                const next = cur.filter((x) => x !== DASHBOARD_SALES_SHORTCUT_SLUG);
                                setDashboardQuickAccess(next);
                                void saveDashboardQuickAccess(next);
                                return;
                              }

                              if (cur.length >= 6) {
                                toast?.push({ kind: "error", message: "Pick up to 6 shortcuts" });
                                return;
                              }
                              const next = [DASHBOARD_SALES_SHORTCUT_SLUG, ...cur.filter((x) => x !== DASHBOARD_SALES_SHORTCUT_SLUG)];
                              setDashboardQuickAccess(next);
                              void saveDashboardQuickAccess(next);
                            }}
                            className={classNames(
                              "group flex w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 hover:-translate-y-0.5",
                              dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG)
                                ? "bg-zinc-100 text-zinc-900"
                                : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            <span className={sidebarIconChipClass(dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG))} aria-hidden>
                              <span className={sidebarIconToneClassForSlug("reporting")}>
                                <IconSalesDashboardGlyph size={18} />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1 truncate">Sales dashboard</span>
                            <span
                              className={classNames(
                                "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px] font-semibold",
                                dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG)
                                  ? "border-brand-blue/25 bg-brand-blue/10 text-brand-blue"
                                  : "border-zinc-200 bg-white text-zinc-500",
                              )}
                              aria-hidden
                            >
                              {dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG) ? "✓" : "+"}
                            </span>
                          </button>

                          {dashboardShortcutCandidates.map((svc) => {
                            const selected = dashboardQuickAccessEffective.includes(svc.slug);
                            return (
                              <button
                                key={`mobile_shortcut_${svc.slug}`}
                                type="button"
                                onClick={() => {
                                  const cur = dashboardQuickAccessEffective;
                                  if (selected) {
                                    const next = cur.filter((x) => x !== svc.slug);
                                    setDashboardQuickAccess(next);
                                    void saveDashboardQuickAccess(next);
                                    return;
                                  }

                                  if (cur.length >= 6) {
                                    toast?.push({ kind: "error", message: "Pick up to 6 shortcuts" });
                                    return;
                                  }
                                  const next = [...cur, svc.slug];
                                  setDashboardQuickAccess(next);
                                  void saveDashboardQuickAccess(next);
                                }}
                                className={classNames(
                                  "group flex w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 hover:-translate-y-0.5",
                                  selected ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                                )}
                              >
                                <span className={sidebarIconChipClass(selected)}>
                                  <span className={sidebarIconToneClassForSlug(svc.slug)}>
                                    <IconServiceGlyph slug={svc.slug} />
                                  </span>
                                </span>
                                <span className="min-w-0 flex-1 truncate">{svc.title}</span>
                                <span
                                  className={classNames(
                                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px] font-semibold",
                                    selected
                                      ? "border-brand-blue/25 bg-brand-blue/10 text-brand-blue"
                                      : "border-zinc-200 bg-white text-zinc-500",
                                  )}
                                  aria-hidden
                                >
                                  {selected ? "✓" : "+"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2">
                          {dashboardQuickAccessEffective.length ? (
                            <div className="space-y-1">
                              {dashboardQuickAccessEffective.map((slug) => {
                                if (slug === DASHBOARD_SALES_SHORTCUT_SLUG) {
                                  return (
                                    <PortalNavLink
                                      key="mobile_shortcut_sales_dashboard"
                                      href={`${basePath}/app/services/reporting/sales`}
                                      className={classNames(
                                        "group flex items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 hover:-translate-y-0.5",
                                        pathname === `${basePath}/app/services/reporting/sales`
                                          ? "bg-zinc-100 text-zinc-900"
                                          : "text-zinc-700 hover:bg-zinc-50",
                                      )}
                                    >
                                      <span className={sidebarIconChipClass(pathname === `${basePath}/app/services/reporting/sales`)} aria-hidden>
                                        <span className={sidebarIconToneClassForSlug("reporting")}>
                                          <IconSalesDashboardGlyph size={18} />
                                        </span>
                                      </span>
                                      <span className="truncate">Sales dashboard</span>
                                    </PortalNavLink>
                                  );
                                }

                                const svc = PORTAL_SERVICE_BY_SLUG.get(slug) || null;
                                return svc ? renderSidebarServiceLink(svc as PortalService) : null;
                              })}
                            </div>
                          ) : (
                            <div className="px-1 py-2 text-sm text-zinc-500">No shortcuts yet.</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between px-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Analysis</div>
                        <button
                          type="button"
                          onClick={() => void refreshDashboardAnalysis("manual_refresh")}
                          className="rounded-xl px-2 py-1 text-[11px] font-semibold text-zinc-600 transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
                        >
                          {dashboardAnalysisLoading ? "Refreshing…" : "Refresh"}
                        </button>
                      </div>
                      <div className="mt-2 rounded-2xl bg-white p-3 text-xs leading-relaxed text-zinc-700">
                        <div className="prose prose-sm max-w-none prose-zinc">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a({ href, children }: { href?: string; children?: ReactNode }) {
                                const raw = String(href || "").trim();
                                const safe = /^https?:\/\//i.test(raw) || raw.startsWith("/") ? raw : "";
                                const external = /^https?:\/\//i.test(safe);
                                return safe ? (
                                  <a
                                    href={safe}
                                    target={external ? "_blank" : undefined}
                                    rel={external ? "noreferrer noopener" : undefined}
                                    className="font-semibold underline underline-offset-2 text-brand-blue"
                                  >
                                    {children}
                                  </a>
                                ) : (
                                  <span>{children}</span>
                                );
                              },
                              p({ children }: { children?: ReactNode }) {
                                return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
                              },
                              ul({ children }: { children?: ReactNode }) {
                                return <ul className="my-2 list-disc pl-5">{children}</ul>;
                              },
                              ol({ children }: { children?: ReactNode }) {
                                return <ol className="my-2 list-decimal pl-5">{children}</ol>;
                              },
                              li({ children }: { children?: ReactNode }) {
                                return <li className="my-1">{children}</li>;
                              },
                              h1({ children }: { children?: ReactNode }) {
                                return <h1 className="my-2 text-base font-semibold">{children}</h1>;
                              },
                              h2({ children }: { children?: ReactNode }) {
                                return <h2 className="my-2 text-sm font-semibold">{children}</h2>;
                              },
                              h3({ children }: { children?: ReactNode }) {
                                return <h3 className="my-2 text-sm font-semibold">{children}</h3>;
                              },
                              code({ children }: { children?: ReactNode }) {
                                return <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">{children}</code>;
                              },
                              pre({ children }: { children?: ReactNode }) {
                                return <pre className="my-2 overflow-x-auto rounded-2xl bg-zinc-100 p-3 text-[12px]">{children}</pre>;
                              },
                            }}
                          >
                            {dashboardAnalysis?.text
                              ? dashboardAnalysis.text
                              : dashboardAnalysisLoading
                                ? "Generating analysis…"
                                : "Generating analysis…"}
                          </ReactMarkdown>
                        </div>
                        {dashboardAnalysis?.generatedAtIso ? (
                          <div className="mt-2 text-[11px] text-zinc-500">Updated {new Date(dashboardAnalysis.generatedAtIso).toLocaleString()}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {sidebarPanelTopKey === "services" && !showSidebarOverrideInServices ? (
                  <div className="space-y-4">
                    {sidebarServiceGroups.map((group) => (
                      <div key={group.key}>
                        <div className="space-y-1">
                          {group.key === "communication"
                            ? group.services.flatMap((s) => {
                                if (s.slug === "inbox") {
                                  const items = [renderSidebarServiceLink(s)];
                                  if (canViewServiceKey("people")) items.push(renderPeopleLink());
                                  return items;
                                }
                                return [renderSidebarServiceLink(s)];
                              })
                            : group.services.map((s) => renderSidebarServiceLink(s))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {sidebarPanelTopKey === "settings" ? (
                  <div className="space-y-1">
                    <PortalNavLink
                      href={`${basePath}/app/settings`}
                      onClick={() => setMobileOpen(false)}
                      className={classNames(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150",
                        pathname === `${basePath}/app/settings` ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <span className={sidebarIconChipClass(pathname === `${basePath}/app/settings`)} aria-hidden>
                        <IconSettingsGlyph />
                      </span>
                      <span className="truncate">General</span>
                    </PortalNavLink>
                    {canViewServiceKey("profile") ? (
                      <PortalNavLink
                        href={`${basePath}/app/profile`}
                        onClick={() => setMobileOpen(false)}
                        className={classNames(
                          "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150",
                          pathname.startsWith(`${basePath}/app/profile`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/profile`))} aria-hidden>
                          <IconProfileGlyph />
                        </span>
                        <span className="truncate">Profile</span>
                      </PortalNavLink>
                    ) : null}
                    {canViewServiceKey("billing") ? (
                      <PortalNavLink
                        href={`${basePath}/app/billing`}
                        onClick={() => setMobileOpen(false)}
                        className={classNames(
                          "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150",
                          pathname.startsWith(`${basePath}/app/billing`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/billing`))} aria-hidden>
                          <IconBillingGlyph />
                        </span>
                        <span className="truncate">Billing</span>
                      </PortalNavLink>
                    ) : null}
                    <PortalNavLink
                      href={`${basePath}/app/settings/appearance`}
                      onClick={() => setMobileOpen(false)}
                      className={classNames(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150",
                        pathname.startsWith(`${basePath}/app/settings/appearance`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/settings/appearance`))} aria-hidden>
                        <IconEyeGlyph />
                      </span>
                      <span className="truncate">Appearance</span>
                    </PortalNavLink>
                    <PortalNavLink
                      href={`${basePath}/app/settings/integrations`}
                      onClick={() => setMobileOpen(false)}
                      className={classNames(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150",
                        pathname.startsWith(`${basePath}/app/settings/integrations`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/settings/integrations`))} aria-hidden>
                        <IconApiKeysGlyph />
                      </span>
                      <span className="truncate">Integrations</span>
                    </PortalNavLink>
                    <PortalNavLink
                      href={`${basePath}/app/settings/business`}
                      onClick={() => setMobileOpen(false)}
                      className={classNames(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors duration-150",
                        pathname.startsWith(`${basePath}/app/settings/business`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/settings/business`))} aria-hidden>
                        <IconBusinessGlyph />
                      </span>
                      <span className="truncate">Business</span>
                    </PortalNavLink>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-zinc-200 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
              <div className="flex items-center justify-end gap-2">
                <GlassSurface {...portalGlassIconSurfaceProps} className="rounded-2xl">
                  <Link
                    href={toPurelyHostedUrl("/book-a-call")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-700 backdrop-blur-[2px] transition-transform duration-150 hover:scale-105 hover:bg-[rgba(255,255,255,0.72)] hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
                    aria-label="Book a call"
                    title="Book a call"
                  >
                    <IconCalendar size={18} />
                  </Link>
                </GlassSurface>
                <GlassSurface {...portalGlassIconSurfaceProps} className="rounded-2xl">
                  <PortalNavLink
                    href={`${basePath}/tutorials/getting-started`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-700 backdrop-blur-[2px] transition-transform duration-150 hover:scale-105 hover:bg-[rgba(255,255,255,0.72)] hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
                    aria-label="Help"
                    title="Help"
                  >
                    <IconHelpCircle size={18} />
                  </PortalNavLink>
                </GlassSurface>
                <SignOutButton variant="sidebar" collapsed />
              </div>
            </div>
          </aside>
        </div>

        <aside
          className={classNames(
            "hidden shrink-0 overflow-hidden border-r border-zinc-200 bg-white transition-[width] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] sm:sticky sm:top-0 sm:flex sm:h-dvh sm:flex-col",
            collapsed ? "w-19" : "w-70",
            activeTopKey === "pura" && "shadow-[2px_0_12px_rgba(0,0,0,0.06)]",
          )}
        >
          <div className="shrink-0 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <div className="relative">
              <div className="flex items-center gap-2">
                {!collapsed ? (
                  <div className="min-w-0 flex-1 px-2">
                    <div className="truncate text-[22px] font-semibold tracking-tight text-brand-ink">{sidebarHeaderLabel}</div>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 px-2" aria-hidden>
                    <div className="h-7" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setCollapsed((v) => !v)}
                  className="group inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-transparent text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  title={collapsed ? "Expand" : "Collapse"}
                >
                  <span className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden" aria-hidden>
                    <span
                      className={classNames(
                        "absolute inset-0 flex items-center justify-center transition-all duration-200",
                        collapsed ? "translate-x-0 rotate-0 opacity-100" : "-translate-x-1 rotate-180 opacity-0",
                      )}
                    >
                      <IconChevron />
                    </span>
                    <span
                      className={classNames(
                        "absolute inset-0 flex items-center justify-center transition-all duration-200",
                        collapsed ? "translate-x-1 -rotate-180 opacity-0" : "translate-x-0 rotate-180 opacity-100",
                      )}
                    >
                      <IconChevron />
                    </span>
                  </span>
                </button>
              </div>

              <div className={classNames(collapsed ? "mt-1 flex flex-col items-center gap-1" : "mt-1 grid grid-cols-4 gap-1")}>
                {navItems.map((item: any) => {
                  const key = item.key as "pura" | "dashboard" | "services" | "settings";
                  const active = activeTopKey === key;
                  const isSidebarOnly = key === "services" || key === "settings";

                  const iconClass = sidebarIconButtonClass(active);

                  const onSidebarOnlyClick = () => {
                    if (key === "settings") {
                      setCollapsed(false);
                      setSidebarModeOverride("settings");
                      return;
                    }
                    // Services should respect the user's collapsed preference.
                    setSidebarModeOverride("services");
                  };

                  if (isSidebarOnly) {
                    return (
                      <button
                        key={item.href}
                        type="button"
                        title={item.label}
                        onClick={onSidebarOnlyClick}
                        className={classNames(
                          "inline-flex items-center justify-center rounded-2xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)",
                          collapsed && "p-0",
                        )}
                        aria-label={item.label}
                      >
                        <span className={iconClass} aria-hidden>
                          {item.iconGlyph}
                        </span>
                        <span className="sr-only">{item.label}</span>
                      </button>
                    );
                  }

                  const onNavigate = () => {
                    if (derivedTopKey === "pura" || key === "pura") {
                      dispatchTopbarIntent(key === "pura");
                    }
                    if (key === "pura" || key === "dashboard" || key === "settings") setCollapsed(false);
                    setSidebarModeOverride(null);
                  };

                  return (
                    <PortalNavLink
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      onClick={onNavigate as any}
                      className={classNames(
                        "inline-flex items-center justify-center rounded-2xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)",
                        collapsed && "p-0",
                      )}
                      aria-label={item.label}
                    >
                      <span className={iconClass} aria-hidden>
                        {item.iconGlyph}
                      </span>
                      <span className="sr-only">{item.label}</span>
                    </PortalNavLink>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            className={classNames(
              "min-h-0 flex-1 overscroll-y-contain",
              activeTopKey === "pura" ? "overflow-hidden p-0" : "overflow-y-auto p-2",
            )}
          >
            {showSidebarOverridePanel ? (
              <div className={classNames("h-full", collapsed && "hidden")}>
                {sidebarOverride?.desktopSidebarContent ? (
                  sidebarOverride.desktopSidebarContent
                ) : (
                  <div className="p-3 text-sm text-zinc-500">Loading chats…</div>
                )}
              </div>
            ) : null}

            {sidebarPanelTopKey === "dashboard" ? (
              <div className={classNames(collapsed && "hidden")}>
                <div className="mt-4">
                  <div className="flex items-center justify-between px-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Shortcuts</div>
                  </div>

                  {dashboardEditMode ? (
                    <div className="mt-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = dashboardQuickAccessEffective;
                          const selected = cur.includes(DASHBOARD_SALES_SHORTCUT_SLUG);
                          if (selected) {
                            const next = cur.filter((x) => x !== DASHBOARD_SALES_SHORTCUT_SLUG);
                            setDashboardQuickAccess(next);
                            void saveDashboardQuickAccess(next);
                            return;
                          }

                          if (cur.length >= 6) {
                            toast?.push({ kind: "error", message: "Pick up to 6 shortcuts" });
                            return;
                          }
                          const next = [DASHBOARD_SALES_SHORTCUT_SLUG, ...cur.filter((x) => x !== DASHBOARD_SALES_SHORTCUT_SLUG)];
                          setDashboardQuickAccess(next);
                          void saveDashboardQuickAccess(next);
                        }}
                        className={classNames(
                          "group flex w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 hover:-translate-y-0.5",
                          dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG)
                            ? "bg-zinc-100 text-zinc-900"
                            : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        <span className={sidebarIconChipClass(dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG))} aria-hidden>
                          <span className={sidebarIconToneClassForSlug("reporting")}>
                            <IconSalesDashboardGlyph size={18} />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1 truncate">Sales dashboard</span>
                        <span
                          className={classNames(
                            "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px] font-semibold",
                            dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG)
                              ? "border-brand-blue/25 bg-brand-blue/10 text-brand-blue"
                              : "border-zinc-200 bg-white text-zinc-500",
                          )}
                          aria-hidden
                        >
                          {dashboardQuickAccessEffective.includes(DASHBOARD_SALES_SHORTCUT_SLUG) ? "✓" : "+"}
                        </span>
                      </button>

                      {dashboardShortcutCandidates.map((svc) => {
                        const selected = dashboardQuickAccessEffective.includes(svc.slug);
                        return (
                          <button
                            key={`shortcut_${svc.slug}`}
                            type="button"
                            onClick={() => {
                              const cur = dashboardQuickAccessEffective;
                              if (selected) {
                                const next = cur.filter((x) => x !== svc.slug);
                                setDashboardQuickAccess(next);
                                void saveDashboardQuickAccess(next);
                                return;
                              }

                              if (cur.length >= 6) {
                                toast?.push({ kind: "error", message: "Pick up to 6 shortcuts" });
                                return;
                              }
                              const next = [...cur, svc.slug];
                              setDashboardQuickAccess(next);
                              void saveDashboardQuickAccess(next);
                            }}
                            className={classNames(
                              "group flex w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 hover:-translate-y-0.5",
                              selected ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            <span className={sidebarIconChipClass(selected)}>
                              <span className={sidebarIconToneClassForSlug(svc.slug)}>
                                <IconServiceGlyph slug={svc.slug} />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1 truncate">{svc.title}</span>
                            <span
                              className={classNames(
                                "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px] font-semibold",
                                selected
                                  ? "border-brand-blue/25 bg-brand-blue/10 text-brand-blue"
                                  : "border-zinc-200 bg-white text-zinc-500",
                              )}
                              aria-hidden
                            >
                              {selected ? "✓" : "+"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-2">
                      {dashboardQuickAccessEffective.length ? (
                        <div className="space-y-1">
                          {dashboardQuickAccessEffective.map((slug) => {
                            if (slug === DASHBOARD_SALES_SHORTCUT_SLUG) {
                              return (
                                  <PortalNavLink
                                  key="shortcut_sales_dashboard"
                                  href={`${basePath}/app/services/reporting/sales`}
                                  className={classNames(
                                    "group flex items-center gap-2 rounded-2xl px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 hover:-translate-y-0.5",
                                    pathname === `${basePath}/app/services/reporting/sales`
                                      ? "bg-zinc-100 text-zinc-900"
                                      : "text-zinc-700 hover:bg-zinc-50",
                                  )}
                                >
                                  <span className={sidebarIconChipClass(pathname === `${basePath}/app/services/reporting/sales`)} aria-hidden>
                                    <span className={sidebarIconToneClassForSlug("reporting")}>
                                      <IconSalesDashboardGlyph size={18} />
                                    </span>
                                  </span>
                                  <span className="truncate">Sales dashboard</span>
                                  </PortalNavLink>
                              );
                            }

                            const svc = PORTAL_SERVICE_BY_SLUG.get(slug) || null;
                            return svc ? renderSidebarServiceLink(svc as PortalService) : null;
                          })}
                        </div>
                      ) : (
                        <div className="px-3 py-2 text-sm text-zinc-500">No shortcuts yet.</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between px-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Analysis</div>
                    <button
                      type="button"
                      onClick={() => void refreshDashboardAnalysis("manual_refresh")}
                      className="rounded-xl px-2 py-1 text-[11px] font-semibold text-zinc-600 transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)"
                    >
                      {dashboardAnalysisLoading ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>
                  <div className="mt-2 rounded-2xl bg-white p-3 text-xs leading-relaxed text-zinc-700">
                    <div className="prose prose-sm max-w-none prose-zinc">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a({ href, children }: { href?: string; children?: ReactNode }) {
                            const raw = String(href || "").trim();
                            const safe = /^https?:\/\//i.test(raw) || raw.startsWith("/") ? raw : "";
                            const external = /^https?:\/\//i.test(safe);
                            return safe ? (
                              <a
                                href={safe}
                                target={external ? "_blank" : undefined}
                                rel={external ? "noreferrer noopener" : undefined}
                                className="font-semibold underline underline-offset-2 text-brand-blue"
                              >
                                {children}
                              </a>
                            ) : (
                              <span>{children}</span>
                            );
                          },
                          p({ children }: { children?: ReactNode }) {
                            return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
                          },
                          ul({ children }: { children?: ReactNode }) {
                            return <ul className="my-2 list-disc pl-5">{children}</ul>;
                          },
                          ol({ children }: { children?: ReactNode }) {
                            return <ol className="my-2 list-decimal pl-5">{children}</ol>;
                          },
                          li({ children }: { children?: ReactNode }) {
                            return <li className="my-1">{children}</li>;
                          },
                          h1({ children }: { children?: ReactNode }) {
                            return <h1 className="my-2 text-base font-semibold">{children}</h1>;
                          },
                          h2({ children }: { children?: ReactNode }) {
                            return <h2 className="my-2 text-sm font-semibold">{children}</h2>;
                          },
                          h3({ children }: { children?: ReactNode }) {
                            return <h3 className="my-2 text-sm font-semibold">{children}</h3>;
                          },
                          code({ children }: { children?: ReactNode }) {
                            return <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">{children}</code>;
                          },
                          pre({ children }: { children?: ReactNode }) {
                            return <pre className="my-2 overflow-x-auto rounded-2xl bg-zinc-100 p-3 text-[12px]">{children}</pre>;
                          },
                        }}
                      >
                        {dashboardAnalysis?.text
                          ? dashboardAnalysis.text
                          : dashboardAnalysisLoading
                            ? "Generating analysis…"
                            : "Generating analysis…"}
                      </ReactMarkdown>
                    </div>
                    {dashboardAnalysis?.generatedAtIso ? (
                      <div className="mt-2 text-[11px] text-zinc-500">Updated {new Date(dashboardAnalysis.generatedAtIso).toLocaleString()}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {sidebarPanelTopKey === "services" && !showSidebarOverrideInServices ? (
              collapsed ? (
                <div className="flex min-h-0 flex-1 flex-col items-center gap-1 py-1">
                  <PortalNavLink
                    href={`${basePath}/app/services`}
                    title="See all"
                    aria-label="See all"
                    className={sidebarIconButtonClass(pathname === `${basePath}/app/services`)}
                  >
                    <IconEyeGlyph />
                  </PortalNavLink>

                  <div className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto overscroll-y-contain px-1 pb-24">
                    {sidebarServiceGroups.flatMap((group) => {
                      return group.services.flatMap((svc) => {
                        const out: React.ReactNode[] = [];

                        if (group.key === "communication" && svc.slug === "inbox") {
                          out.push(
                            <PortalNavLink
                              key={`svc_${svc.slug}`}
                              href={`${basePath}/app/services/${svc.slug}`}
                              title={svc.title}
                              aria-label={svc.title}
                              className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/services/${svc.slug}`))}
                            >
                              <span className={sidebarIconToneClassForSlug(svc.slug)} aria-hidden>
                                <IconServiceGlyph slug={svc.slug} />
                              </span>
                            </PortalNavLink>,
                          );

                          if (canViewServiceKey("people")) {
                            out.push(
                              <PortalNavLink
                                key="svc_people"
                                href={`${basePath}/app/people`}
                                title="People"
                                aria-label="People"
                                className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/people`))}
                              >
                                <span className={sidebarIconToneClassForCategory("communication")} aria-hidden>
                                  <IconPeopleGlyph />
                                </span>
                              </PortalNavLink>,
                            );
                          }

                          return out;
                        }

                        out.push(
                          <PortalNavLink
                            key={`svc_${svc.slug}`}
                            href={`${basePath}/app/services/${svc.slug}`}
                            title={svc.title}
                            aria-label={svc.title}
                            className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/services/${svc.slug}`))}
                          >
                            <span className={sidebarIconToneClassForSlug(svc.slug)} aria-hidden>
                              <IconServiceGlyph slug={svc.slug} />
                            </span>
                          </PortalNavLink>,
                        );
                        return out;
                      });
                    })}
                  </div>
                </div>
              ) : (
              <div>
                <div className="space-y-1">
                  <PortalNavLink
                    href={`${basePath}/app/services`}
                    className={classNames(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors",
                      pathname === `${basePath}/app/services` ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    <span className={sidebarIconChipClass(pathname === `${basePath}/app/services`)} aria-hidden>
                      <IconEyeGlyph />
                    </span>
                    <span className="truncate">See all</span>
                  </PortalNavLink>
                </div>

                <div className="mt-4">
                  <div className="mt-2 space-y-2">
                    {sidebarServiceGroups.map((group) => (
                      <div key={group.key}>
                        <div className="px-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                        <div className="mt-1 space-y-1">
                          {group.key === "communication" ? (
                            <>
                              {group.services
                                .flatMap((s) => {
                                  if (s.slug === "inbox") {
                                    const items = [renderSidebarServiceLink(s)];
                                    if (canViewServiceKey("people")) items.push(renderPeopleLink());
                                    return items;
                                  }
                                  return [renderSidebarServiceLink(s)];
                                })}
                            </>
                          ) : (
                            <>
                              {group.services.map((s) => renderSidebarServiceLink(s))}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )
            ) : null}

            {sidebarPanelTopKey === "settings" ? (
              collapsed ? (
                <div className="flex flex-col items-center gap-1 py-1">
                  <PortalNavLink
                    href={`${basePath}/app/settings`}
                    title="General"
                    aria-label="General"
                    className={sidebarIconButtonClass(pathname === `${basePath}/app/settings` || pathname.startsWith(`${basePath}/app/settings/appearance`) || pathname.startsWith(`${basePath}/app/settings/integrations`) || pathname.startsWith(`${basePath}/app/settings/business`) ? pathname === `${basePath}/app/settings` : false)}
                  >
                    <IconSettingsGlyph />
                  </PortalNavLink>

                  {canViewServiceKey("profile") ? (
                    <PortalNavLink
                      href={`${basePath}/app/profile`}
                      title="Profile"
                      aria-label="Profile"
                      className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/profile`))}
                    >
                      <IconProfileGlyph />
                    </PortalNavLink>
                  ) : null}

                  {canViewServiceKey("billing") ? (
                    <PortalNavLink
                      href={`${basePath}/app/billing`}
                      title="Billing"
                      aria-label="Billing"
                      className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/billing`))}
                    >
                      <IconBillingGlyph />
                    </PortalNavLink>
                  ) : null}

                  <PortalNavLink
                    href={`${basePath}/app/settings/appearance`}
                    title="Appearance"
                    aria-label="Appearance"
                    className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/settings/appearance`))}
                  >
                    <IconEyeGlyph />
                  </PortalNavLink>

                  <PortalNavLink
                    href={`${basePath}/app/settings/integrations`}
                    title="Integrations"
                    aria-label="Integrations"
                    className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/settings/integrations`))}
                  >
                    <IconApiKeysGlyph />
                  </PortalNavLink>

                  <PortalNavLink
                    href={`${basePath}/app/settings/business`}
                    title="Business"
                    aria-label="Business"
                    className={sidebarIconButtonClass(pathname.startsWith(`${basePath}/app/settings/business`))}
                  >
                    <IconBusinessGlyph />
                  </PortalNavLink>
                </div>
              ) : (
              <div>
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Settings</div>
                <div className="mt-2 space-y-1">
                  <PortalNavLink
                    href={`${basePath}/app/settings`}
                    className={classNames(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                      pathname === `${basePath}/app/settings` ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    <span className={sidebarIconChipClass(pathname === `${basePath}/app/settings`)} aria-hidden>
                      <IconSettingsGlyph />
                    </span>
                    <span className="truncate">General</span>
                  </PortalNavLink>
                  {canViewServiceKey("profile") ? (
                    <PortalNavLink
                      href={`${basePath}/app/profile`}
                      className={classNames(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                        pathname.startsWith(`${basePath}/app/profile`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/profile`))} aria-hidden>
                        <IconProfileGlyph />
                      </span>
                      <span className="truncate">Profile</span>
                    </PortalNavLink>
                  ) : null}
                  {canViewServiceKey("billing") ? (
                    <PortalNavLink
                      href={`${basePath}/app/billing`}
                      className={classNames(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                        pathname.startsWith(`${basePath}/app/billing`) ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/billing`))} aria-hidden>
                        <IconBillingGlyph />
                      </span>
                      <span className="truncate">Billing</span>
                    </PortalNavLink>
                  ) : null}

                  <PortalNavLink
                    href={`${basePath}/app/settings/appearance`}
                    className={classNames(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                      pathname.startsWith(`${basePath}/app/settings/appearance`)
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/settings/appearance`))} aria-hidden>
                      <IconEyeGlyph />
                    </span>
                    <span className="truncate">Appearance</span>
                  </PortalNavLink>

                  <PortalNavLink
                    href={`${basePath}/app/settings/integrations`}
                    className={classNames(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                      pathname.startsWith(`${basePath}/app/settings/integrations`)
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/settings/integrations`))} aria-hidden>
                      <IconApiKeysGlyph />
                    </span>
                    <span className="truncate">Integrations</span>
                  </PortalNavLink>

                  <PortalNavLink
                    href={`${basePath}/app/settings/business`}
                    className={classNames(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                      pathname.startsWith(`${basePath}/app/settings/business`)
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    <span className={sidebarIconChipClass(pathname.startsWith(`${basePath}/app/settings/business`))} aria-hidden>
                      <IconBusinessGlyph />
                    </span>
                    <span className="truncate">Business</span>
                  </PortalNavLink>
                </div>
              </div>
              )
            ) : null}

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
              <div className="mt-1 truncate text-sm font-semibold text-brand-ink">{signedInLabel}</div>
            ) : null}
            <div className={classNames("mt-3", collapsed && "mt-0 flex justify-center")}>
              <SignOutButton variant="sidebar" collapsed={collapsed} />
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
          <div className="pointer-events-none fixed inset-x-0 top-0 z-90 flex items-start justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="pointer-events-auto inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white/95 p-2 text-zinc-700 shadow-sm backdrop-blur hover:bg-zinc-50"
              aria-label="Open menu"
            >
              <IconChevron />
            </button>
          </div>

          <main
            className={classNames(
              "min-h-0 min-w-0 flex-1 sm:transition-[padding] sm:duration-350 sm:ease-[cubic-bezier(0.22,1,0.36,1)]",
              isAiChat
                ? "pt-[calc(env(safe-area-inset-top)+3.75rem)] sm:p-0"
                : "p-4 pb-4 pt-[calc(env(safe-area-inset-top)+4.25rem)] sm:p-8 sm:pb-6 sm:pt-[calc(var(--pa-portal-topbar-height,0px)+2rem)]",
            )}
          >
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
            {!isAiChat ? (
              <div
                aria-hidden
                className="h-[calc(env(safe-area-inset-bottom)+5rem)] sm:h-[calc(env(safe-area-inset-bottom)+2rem)]"
              />
            ) : null}
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
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-white text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]"
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
