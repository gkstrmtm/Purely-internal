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
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { PortalFloatingTools } from "@/app/portal/PortalFloatingTools";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean; leadOutbound: boolean };
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("portalSidebarCollapsed");
    if (saved === "1") setCollapsed(true);
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
        headers: { "x-pa-app": "portal" },
      });
      if (!mounted) return;
      if (!res.ok) return;
      const json = (await res.json()) as Me;
      setMe(json);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isFullDemo = (me?.user.email ?? "").toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;

  const navItems = useMemo(() => {
    const base = [
      { href: "/portal/app", label: "Dashboard", icon: <IconDashboard /> },
      { href: "/portal/app/services", label: "Services", icon: <IconService /> },
      { href: "/portal/app/people", label: "People", icon: <IconPeople /> },
      { href: "/portal/app/billing", label: "Billing", icon: <IconBilling /> },
      { href: "/portal/app/profile", label: "Profile", icon: <IconProfile /> },
    ];
    return base;
  }, []);

  function isActive(href: string) {
    if (href === "/portal/app") return pathname === "/portal/app";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function serviceUnlocked(service: { entitlementKey?: "blog" | "booking" | "crm"; included?: boolean }) {
    if (isFullDemo) return true;
    if (service.included) return true;
    const entitlementKey = service.entitlementKey;
    if (!entitlementKey) return false;
    const ent = me?.entitlements;
    if (!ent) return false;
    return Boolean(ent[entitlementKey]);
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
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
              <Link href="/portal/app" className="flex items-center gap-3">
                <Image
                  src="/brand/purity-5.png"
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
                <div className="mt-2 space-y-1">
                  {PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => {
                    const unlocked = serviceUnlocked(s);
                    return (
                      <Link
                        key={s.slug}
                        href={`/portal/app/services/${s.slug}`}
                        className={classNames(
                          "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                          pathname.startsWith(`/portal/app/services/${s.slug}`)
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
                              <IconLock /> Locked
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
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
              <Link href="/portal/app" className="flex items-center gap-3">
                <Image
                  src="/brand/purity-5.png"
                  alt="Purely Automation"
                  width={190}
                  height={58}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </Link>
            ) : (
              <Link href="/portal/app" aria-label="Portal dashboard">
                <Image
                  src="/brand/purity-5.png"
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
              <div className="mt-2 space-y-1">
                {PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => {
                  const unlocked = serviceUnlocked(s);
                  return (
                    <Link
                      key={s.slug}
                      href={`/portal/app/services/${s.slug}`}
                      className={classNames(
                        "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium",
                        pathname === `/portal/app/services/${s.slug}` || pathname.startsWith(`/portal/app/services/${s.slug}/`)
                          ? "bg-zinc-100 text-zinc-900"
                          : "text-zinc-700 hover:bg-zinc-50",
                        collapsed && "justify-center px-2",
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

                      {!collapsed ? (
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="truncate">{s.title}</span>
                          {!unlocked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500">
                              <IconLock /> Locked
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
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

              <Link href="/portal/app" className="flex items-center gap-3">
                <Image
                  src="/brand/purity-5.png"
                  alt="Purely Automation"
                  width={150}
                  height={46}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </Link>
              <Link
                href="/portal/app/services"
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
