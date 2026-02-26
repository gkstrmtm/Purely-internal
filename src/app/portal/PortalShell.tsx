"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SignOutButton } from "@/components/SignOutButton";
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
  const pathname = usePathname();
  const router = useRouter();
  const variant = typeof pathname === "string" && (pathname === "/credit" || pathname.startsWith("/credit/")) ? "credit" : "portal";
  const basePath = variant === "credit" ? "/credit" : "/portal";
  const logoSrc = variant === "credit" ? "/brand/purely%20credit.png" : "/brand/purity-5.png";

  type AdPlacement = "SIDEBAR_BANNER" | "TOP_BANNER" | "FULLSCREEN_REWARD" | "POPUP_CARD";

  const isFunnelBuilderEditor =
    typeof pathname === "string" &&
    pathname.includes("/app/services/funnel-builder/") &&
    (pathname.includes("/funnels/") || pathname.includes("/forms/")) &&
    pathname.includes("/edit");
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

      dismissEnabled?: boolean;
      dismissDelaySeconds?: number;
      dismissReshowAfterSeconds?: number;
    };
  }>(null);

  const [rewardStatus, setRewardStatus] = useState<null | { eligible: boolean; nextEligibleAtIso: string | null }>(null);

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
  const [popupVideoMuted, setPopupVideoMuted] = useState(false);
  const [popupVideoNeedsUserGesture, setPopupVideoNeedsUserGesture] = useState(false);

  const [nowMs, setNowMs] = useState(0);

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
        if (opts.placement === "POPUP_CARD") setPopupCampaign(null);
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
      if (opts.placement === "POPUP_CARD") setPopupCampaign(json.campaign ?? null);
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

  function serviceLockedByStatus(slug: string) {
    const st = serviceStatuses?.[slug];
    if (!st) return null;
    const state = String(st.state || "").toLowerCase();
    if (state === "locked") return { locked: true, label: "Locked" };
    if (state === "paused" && String(st.label || "").toLowerCase() === "activate") return { locked: true, label: "Activate" };
    return { locked: false, label: "" };
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
    .filter((s) => (variant === "portal" ? s.slug !== "funnel-builder" : true))
    .filter((s) => !s.variants || s.variants.includes(variant));
  const sidebarServiceGroups = groupPortalServices(visibleSidebarServices);

  if (isFunnelBuilderEditor) {
    return (
      <div className="min-h-screen bg-brand-mist text-brand-ink">
        <main className="min-h-screen">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
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

      <div className="flex min-h-screen">
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
              "absolute left-0 top-0 h-full w-[290px] overflow-y-auto border-r border-zinc-200 bg-white shadow-xl transition-transform",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-white/90 p-4 backdrop-blur">
              <Link href={`${basePath}/app`} className="flex items-center gap-3">
                <Image
                  src={logoSrc}
                  alt="Purely Automation"
                  width={190}
                  height={58}
                  className="h-9 w-auto object-contain"
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

            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={classNames(
                      "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold",
                      isActive(item.href)
                        ? "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]"
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
                          const statusLock = serviceLockedByStatus(s.slug);
                          const unlocked = statusLock ? !statusLock.locked : serviceUnlocked(s);
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
                                      ? "text-[color:var(--color-brand-blue)]"
                                      : s.accent === "coral"
                                        ? "text-[color:var(--color-brand-pink)]"
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
                                    <IconLock /> {statusLock?.label || "Locked"}
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
                <div className="mb-4 rounded-2xl border border-brand-ink/10 bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white p-3 text-sm text-zinc-800">
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
                    className="mt-2 inline-flex rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
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
            "sticky top-[72px] hidden h-[calc(100vh-72px)] shrink-0 border-r border-zinc-200 bg-white sm:flex sm:flex-col",
            collapsed ? "w-[76px]" : "w-[280px]",
          )}
        >
          <div className={classNames("flex items-center gap-3 border-b border-zinc-200 p-4", collapsed && "justify-center")}
          >
            {!collapsed ? (
              <Link href={`${basePath}/app`} className="flex items-center gap-3">
                <Image
                  src={logoSrc}
                  alt="Purely Automation"
                  width={190}
                  height={58}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </Link>
            ) : (
              <Link href={`${basePath}/app`} aria-label="Portal dashboard">
                <Image
                  src={logoSrc}
                  alt="Purely Automation"
                  width={56}
                  height={56}
                  className="h-9 w-9 object-contain"
                  priority
                />
              </Link>
            )}

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

          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classNames(
                    "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold",
                    isActive(item.href)
                      ? "bg-[color:rgba(29,78,216,0.10)] text-[color:var(--color-brand-blue)]"
                      : "text-zinc-700 hover:bg-zinc-50",
                    collapsed && "justify-center px-2",
                  )}
                >
                  {item.icon}
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              ))}
            </div>

            <div className={classNames("mt-6", collapsed && "px-1")}>
              {!collapsed ? (
                <div className="px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
                          "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                          pathname === `${basePath}/app/services/${s.slug}` || pathname.startsWith(`${basePath}/app/services/${s.slug}/`)
                            ? "bg-zinc-100 text-zinc-900"
                            : "text-zinc-700 hover:bg-zinc-50",
                          "justify-center px-2",
                        )}
                        title={s.title}
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                          <span
                            className={classNames(
                              s.accent === "blue"
                                ? "text-[color:var(--color-brand-blue)]"
                                : s.accent === "coral"
                                  ? "text-[color:var(--color-brand-pink)]"
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
                <div className="mt-2 space-y-4">
                  {sidebarServiceGroups.map((group) => (
                    <div key={group.key}>
                      <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
                      <div className="mt-1 space-y-1">
                        {group.services.map((s) => {
                          const statusLock = serviceLockedByStatus(s.slug);
                          const unlocked = statusLock ? !statusLock.locked : serviceUnlocked(s);
                          return (
                            <Link
                              key={s.slug}
                              href={`${basePath}/app/services/${s.slug}`}
                              className={classNames(
                                "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                                pathname === `${basePath}/app/services/${s.slug}` || pathname.startsWith(`${basePath}/app/services/${s.slug}/`)
                                  ? "bg-zinc-100 text-zinc-900"
                                  : "text-zinc-700 hover:bg-zinc-50",
                              )}
                            >
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                                <span
                                  className={classNames(
                                    s.accent === "blue"
                                      ? "text-[color:var(--color-brand-blue)]"
                                      : s.accent === "coral"
                                        ? "text-[color:var(--color-brand-pink)]"
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
                                    <IconLock /> {statusLock?.label || "Locked"}
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

          <div className={classNames("border-t border-zinc-200 p-4", collapsed && "px-2")}
          >
            {sidebarCampaign && !collapsed ? (
              <div className="mb-4 rounded-2xl border border-brand-ink/10 bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white p-3 text-sm text-zinc-800">
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
                    className="mb-2 max-h-[120px] w-full rounded-xl border border-zinc-200 object-cover"
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
                  className="mt-2 inline-flex rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
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

        <div className="flex min-w-0 flex-1 flex-col">
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
                  className="h-9 w-auto object-contain"
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

          <main className="min-w-0 flex-1 p-4 sm:p-8">
            {topBannerCampaign ? (
              <div className="mb-4 rounded-3xl border border-brand-ink/10 bg-gradient-to-r from-[color:var(--color-brand-blue)]/15 via-white to-white p-4 text-brand-ink">
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
                      className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
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
          </main>

          {rewardCampaign && (rewardStatus?.eligible ?? true) ? (
            <div className="fixed bottom-4 left-4 z-[9996] w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl ring-1 ring-[color:rgba(29,78,216,0.14)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2">
                    <span className="rounded-full bg-[color:var(--color-brand-blue)]/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--color-brand-blue)]">
                      Sponsored
                    </span>
                    <div className="truncate text-sm font-semibold text-zinc-900">
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
                    className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    onClick={() => {
                      router.push(`${basePath}/app/billing?openRewardAd=1`);
                    }}
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

          {popupCampaign ? (
            <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4">
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
                    className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
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
