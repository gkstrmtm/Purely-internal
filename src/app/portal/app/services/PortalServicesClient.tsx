"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { IconBillingGlyph, IconLock, IconServiceGlyph } from "@/app/portal/PortalIcons";
import { PORTAL_SERVICES, type PortalService } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";
import { PORTAL_SERVICE_KEYS, type PortalServiceKey } from "@/lib/portalPermissions.shared";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

type PortalMe =
  | {
      ok: true;
      ownerId: string;
      memberId: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      permissions: Record<string, { view: boolean; edit: boolean }>;
    }
  | { ok: false; error?: string };

type StatusState = "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled";

type ServiceStatus = {
  state: StatusState;
  label: string;
};

type StatusResponse =
  | {
      ok: true;
      statuses: Record<string, ServiceStatus>;
    }
  | { ok: false; error?: string };

type AccessTone = "included" | "enabled" | "locked" | "paused" | "canceled" | "coming_soon" | "add_on" | "available";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function accessBadgeClasses(tone: AccessTone) {
  switch (tone) {
    case "included":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "enabled":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "canceled":
      return "border-red-200 bg-red-50 text-red-700";
    case "locked":
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
    case "coming_soon":
      return "border-zinc-200 bg-white text-zinc-500";
    case "add_on":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "available":
      return "border-zinc-200 bg-white text-zinc-600";
  }
}

function readinessTextClasses(state: StatusState | "loading" | "default") {
  switch (state) {
    case "active":
      return "text-emerald-700";
    case "needs_setup":
      return "text-amber-700";
    case "paused":
      return "text-amber-800";
    case "canceled":
      return "text-red-700";
    case "coming_soon":
      return "text-zinc-500";
    case "loading":
      return "text-zinc-500";
    case "default":
      return "text-zinc-600";
    case "locked":
      return "text-zinc-700";
  }
}

function getServiceCardSummary(
  service: PortalService,
  status: ServiceStatus | null,
  statusLoading: boolean,
): {
  accessLabel: string;
  accessTone: AccessTone;
  readinessLabel: string;
  readinessState: StatusState | "loading" | "default";
  showLock: boolean;
} {
  if (!status) {
    if (statusLoading) {
      return {
        accessLabel: service.included ? "Included in plan" : service.entitlementKey ? "Add-on service" : "Available",
        accessTone: service.included ? "included" : service.entitlementKey ? "add_on" : "available",
        readinessLabel: service.included ? "Checking readiness" : "Checking availability",
        readinessState: "loading" as const,
        showLock: false,
      };
    }

    return {
      accessLabel: service.included ? "Included in plan" : service.entitlementKey ? "Add-on service" : "Available",
      accessTone: service.included ? "included" : service.entitlementKey ? "add_on" : "available",
      readinessLabel: service.entitlementKey ? "Open details" : "Open service",
      readinessState: "default" as const,
      showLock: false,
    };
  }

  if (status.state === "locked") {
    return {
      accessLabel: status.label === "Activate" ? "Ready to activate" : "Locked",
      accessTone: "locked" as const,
      readinessLabel: status.label === "Activate" ? "Enable and set up" : "Review access and setup",
      readinessState: "locked" as const,
      showLock: true,
    };
  }

  if (status.state === "coming_soon") {
    return {
      accessLabel: "Rolling out",
      accessTone: "coming_soon" as const,
      readinessLabel: "Review rollout guide",
      readinessState: "coming_soon" as const,
      showLock: false,
    };
  }

  if (status.state === "paused" || status.state === "canceled") {
    return {
      accessLabel: status.label,
      accessTone: status.state,
      readinessLabel: "Resume service",
      readinessState: status.state,
      showLock: true,
    };
  }

  return {
    accessLabel: service.included ? "Included in plan" : "Enabled",
    accessTone: service.included ? "included" : "enabled",
    readinessLabel: status.label === "Active" ? "Ready" : status.label,
    readinessState: status.state,
    showLock: false,
  };
}

function canViewFromPermissions(portalMe: PortalMe | null, key: PortalServiceKey) {
  if (!portalMe || portalMe.ok !== true) return true;
  const p = (portalMe.permissions as any)?.[key];
  return Boolean(p?.view);
}

function hrefForServiceCard(basePath: "/portal" | "/credit", slug: string) {
  if (basePath === "/credit" && slug === "dispute-letters") return `${basePath}/app/disputes`;
  return `${basePath}/app/services/${slug}`;
}

export function PortalServicesClient() {
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [statusRes, setStatusRes] = useState<StatusResponse | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);

  const pathname = usePathname();
  const basePath = pathname === "/credit" || pathname.startsWith("/credit/") ? "/credit" : "/portal";
  const variant = basePath === "/credit" ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: variant }), [variant]);
  const servicesSubtitle =
    variant === "credit" ? "Everything available in your credit workspace." : "Everything available in your portal.";

  useEffect(() => {
    let mounted = true;
    (async () => {
      setPermissionsLoading(true);
      try {
        const res = await fetch("/api/portal/me", { cache: "no-store", headers: variantHeaders });
        if (!mounted) return;
        const json = (await res.json().catch(() => null)) as PortalMe | null;
        setPortalMe(json);
      } finally {
        if (mounted) setPermissionsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [variantHeaders]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setStatusLoading(true);
      try {
        const res = await fetch("/api/portal/services/status", { cache: "no-store", headers: variantHeaders });
        if (!mounted) return;
        if (!res.ok) {
          setStatusRes({ ok: false, error: res.status === 401 ? "Unauthorized" : "Forbidden" });
          return;
        }
        const json = (await res.json().catch(() => null)) as StatusResponse | null;
        setStatusRes(json);
      } finally {
        if (mounted) setStatusLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [variantHeaders]);

  const knownServiceKeys = useMemo(() => new Set<string>(PORTAL_SERVICE_KEYS as unknown as string[]), []);

  const canViewServiceSlug = useCallback((slug: string) => {
    switch (slug) {
      case "inbox":
        return canViewFromPermissions(portalMe, "inbox") || canViewFromPermissions(portalMe, "outbox");
      case "nurture-campaigns":
        return canViewFromPermissions(portalMe, "nurtureCampaigns");
      case "media-library":
        return canViewFromPermissions(portalMe, "media");
      case "ai-receptionist":
        return canViewFromPermissions(portalMe, "aiReceptionist");
      case "ai-outbound-calls":
        return canViewFromPermissions(portalMe, "aiOutboundCalls");
      case "lead-scraping":
        return canViewFromPermissions(portalMe, "leadScraping");
      case "missed-call-textback":
        return canViewFromPermissions(portalMe, "missedCallTextback");
      case "follow-up":
        return canViewFromPermissions(portalMe, "followUp");
      default:
        if (!knownServiceKeys.has(slug)) return true;
        return canViewFromPermissions(portalMe, slug as any);
    }
  }, [knownServiceKeys, portalMe]);

  const services = useMemo(() => {
    return PORTAL_SERVICES
      .filter((s) => !s.hidden)
      .filter((s) => !s.variants || s.variants.includes(variant))
      .filter((s) => canViewServiceSlug(s.slug));
  }, [canViewServiceSlug, variant]);

  const serviceGroups = useMemo(() => groupPortalServices(services), [services]);

  const canViewBilling = canViewFromPermissions(portalMe, "billing");

  const statuses = statusRes && statusRes.ok === true ? statusRes.statuses : null;
  const showLoadingNotice = permissionsLoading && portalMe === null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Services</h1>
          <p className="mt-1 text-sm text-zinc-600">{servicesSubtitle}</p>
        </div>
        {canViewBilling ? (
          <Link
            href={`${basePath}/app/billing`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            <span aria-hidden="true" className="text-current">
              <IconBillingGlyph size={16} />
            </span>
            Billing
          </Link>
        ) : null}
      </div>

      <div className="mt-6 space-y-8">
        {showLoadingNotice ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            <div className="font-semibold text-zinc-900">Loading your services</div>
            <div className="mt-1">Checking which services are included, enabled, or need Billing before the catalog appears.</div>
          </div>
        ) : null}

        {!showLoadingNotice ? serviceGroups.map((group) => (
          <section key={group.key}>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.services.map((s) => {
                const status = statuses?.[s.slug] ?? null;
                const summary = getServiceCardSummary(s, status, statusLoading);

                return (
                  <Link
                    key={s.slug}
                    href={hrefForServiceCard(basePath, s.slug)}
                    data-service-card={s.slug}
                    className="group rounded-3xl border border-zinc-200 bg-white p-6 hover:bg-zinc-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                        <span
                          className={
                            s.accent === "blue"
                              ? "text-(--color-brand-blue)"
                              : s.accent === "coral"
                                ? "text-(--color-brand-pink)"
                                : "text-zinc-700"
                          }
                        >
                          <IconServiceGlyph slug={s.slug} />
                        </span>
                      </div>

                      <span
                        className={classNames(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                          accessBadgeClasses(summary.accessTone),
                        )}
                        data-service-access={summary.accessLabel}
                      >
                        {summary.showLock ? (
                          <IconLock />
                        ) : null}
                        <span className={statusLoading && !status ? "animate-pulse" : undefined}>{summary.accessLabel}</span>
                      </span>
                    </div>

                    <div className="text-base font-semibold text-brand-ink group-hover:text-zinc-900">{s.title}</div>
                    <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
                    <div
                      className={classNames(
                        "mt-4 text-xs font-medium",
                        readinessTextClasses(summary.readinessState),
                        summary.readinessState === "loading" ? "animate-pulse" : undefined,
                      )}
                      data-service-readiness={summary.readinessLabel}
                    >
                      {summary.readinessLabel}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )) : null}
      </div>
    </div>
  );
}
