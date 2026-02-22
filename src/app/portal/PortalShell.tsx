"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  const variant = typeof pathname === "string" && (pathname === "/credit" || pathname.startsWith("/credit/")) ? "credit" : "portal";
  const basePath = variant === "credit" ? "/credit" : "/portal";
  const logoSrc = variant === "credit" ? "/brand/purely%20credit.png" : "/brand/purity-5.png";

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

  function serviceUnlocked(service: Pick<PortalService, "entitlementKey" | "included">) {
    if (isFullDemo) return true;
    if (service.included) return true;

    // While loading portal/me context, avoid showing incorrect paywall-style locks.
    if (portalMe === null) return true;

    const entitlementKey = service.entitlementKey;
    if (!entitlementKey) return false;
    const ent = me?.entitlements;
    if (!ent) return true;
    return Boolean(ent[entitlementKey]);
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

          <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
          <PortalFloatingTools />
        </div>
      </div>
    </div>
  );
}
