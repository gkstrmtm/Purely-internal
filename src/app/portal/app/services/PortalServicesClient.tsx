"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { IconBillingGlyph, IconLock, IconServiceGlyph } from "@/app/portal/PortalIcons";
import { getPortalServiceCopy, PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { groupPortalServices } from "@/app/portal/services/categories";
import { growthReadinessLevelLabel, type GrowthReadinessLevel, type GrowthReadinessPayload } from "@/lib/portalGrowthReadiness";
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

type AccessState = "included" | "enabled" | "locked" | "coming_soon" | "paused" | "canceled";
type ReadinessState = "ready" | "needs_setup" | "needs_connection" | "empty" | "blocked";

type ServiceStatus = {
  state: StatusState;
  label: string;
  access: {
    state: AccessState;
    label: string;
  };
  readiness: {
    state: ReadinessState;
    label: string;
    helper: string;
    ctaLabel: string;
    href: string | null;
  };
};

type StatusResponse =
  | {
      ok: true;
      statuses: Record<string, ServiceStatus>;
    }
  | { ok: false; error?: string };

type GrowthReadinessResponse =
  | ({ ok: true } & GrowthReadinessPayload)
  | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function badgeClasses(state: StatusState) {
  switch (state) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_setup":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "canceled":
      return "border-red-200 bg-red-50 text-red-700";
    case "locked":
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
    case "coming_soon":
      return "border-zinc-200 bg-white text-zinc-500";
  }
}

function accessBadgeClasses(state: AccessState) {
  switch (state) {
    case "included":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "enabled":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "canceled":
      return "border-red-200 bg-red-50 text-red-700";
    case "locked":
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
    case "coming_soon":
      return "border-zinc-200 bg-white text-zinc-500";
  }
}

function readinessBadgeClasses(state: ReadinessState) {
  switch (state) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_connection":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "needs_setup":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "empty":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "blocked":
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function growthLevelBadgeClasses(level: GrowthReadinessLevel) {
  switch (level) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "ready":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "partially_ready":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "needs_setup":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "missing":
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function canViewFromPermissions(portalMe: PortalMe | null, key: PortalServiceKey) {
  if (!portalMe || portalMe.ok !== true) return true;
  const p = (portalMe.permissions as any)?.[key];
  return Boolean(p?.view);
}

async function fetchWithRetry(input: string, init?: RequestInit, attempts = 2) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(input, init).catch(() => null as any);
    if (res && (res.ok || res.status < 500)) return res;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  }

  return null as any;
}

export function PortalServicesClient() {
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [statusRes, setStatusRes] = useState<StatusResponse | null>(null);
  const [growthRes, setGrowthRes] = useState<GrowthReadinessResponse | null>(null);
  const [growthLoading, setGrowthLoading] = useState(true);
  const [growthError, setGrowthError] = useState<string | null>(null);

  const pathname = usePathname();
  const basePath = pathname === "/credit" || pathname.startsWith("/credit/") ? "/credit" : "/portal";
  const variant = basePath === "/credit" ? "credit" : "portal";
  const servicesSubtitle =
    variant === "credit" ? "Everything available in your credit workspace." : "Everything available in your portal.";

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetchWithRetry("/api/portal/me", {
        cache: "no-store",
        headers: { [PORTAL_VARIANT_HEADER]: variant },
      });
      if (!mounted) return;
      if (!res) return;
      const json = (await res.json().catch(() => null)) as PortalMe | null;
      setPortalMe(json);
    })();
    return () => {
      mounted = false;
    };
  }, [variant]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const headers = { [PORTAL_VARIANT_HEADER]: variant };
      setGrowthLoading(true);
      setGrowthError(null);
      const [statusFetch, growthFetch] = await Promise.all([
        fetchWithRetry("/api/portal/services/status", {
          cache: "no-store",
          headers,
        }),
        fetchWithRetry("/api/portal/growth/readiness", {
          cache: "no-store",
          headers,
        }),
      ]);
      if (!mounted) return;
      if (!statusFetch?.ok) {
        setGrowthLoading(false);
        setStatusRes({ ok: false, error: statusFetch?.status === 401 ? "Unauthorized" : "Forbidden" });
        return;
      }
      const json = (await statusFetch.json().catch(() => null)) as StatusResponse | null;
      setStatusRes(json);
      if (growthFetch?.ok) {
        const growthJson = (await growthFetch.json().catch(() => null)) as GrowthReadinessResponse | null;
        setGrowthRes(growthJson);
        setGrowthError(null);
      } else {
        setGrowthRes(null);
        const growthJson = growthFetch
          ? ((await growthFetch.json().catch(() => null)) as { error?: string } | null)
          : null;
        setGrowthError(growthJson?.error ?? "Unable to load growth readiness");
      }
      setGrowthLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [variant]);

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
  const growthPayload = growthRes && growthRes.ok ? growthRes : null;
  const servicesSummary = useMemo(() => {
    const visibleStatuses = services
      .map((service) => ({ service, status: statuses?.[service.slug] ?? null }))
      .filter((entry): entry is { service: (typeof services)[number]; status: ServiceStatus } => Boolean(entry.status));

    const needsAttention = visibleStatuses.filter((entry) => {
      const readinessState = entry.status.readiness.state;
      return readinessState === "needs_setup" || readinessState === "needs_connection" || readinessState === "empty";
    });
    const unavailable = visibleStatuses.filter((entry) => {
      const state = entry.status.state;
      return state === "locked" || state === "paused" || state === "canceled" || state === "coming_soon";
    });
    const ready = visibleStatuses.filter((entry) => entry.status.readiness.state === "ready");
    const primaryAction = needsAttention[0] ?? unavailable.find((entry) => Boolean(entry.status.readiness.href)) ?? null;

    return {
      readyCount: ready.length,
      needsAttentionCount: needsAttention.length,
      unavailableCount: unavailable.length,
      primaryAction,
      hasLoadedStatuses: visibleStatuses.length > 0,
    };
  }, [services, statuses]);

  const starterActions = growthPayload?.starterPath ?? [];
  const featuredPlaybooks = growthPayload?.playbooks.slice(0, 6) ?? [];

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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_0.8fr_0.8fr_1.4fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ready now</div>
          <div className="mt-2 text-3xl font-bold text-brand-ink">{servicesSummary.readyCount}</div>
          <div className="mt-1 text-sm text-zinc-600">
            {variant === "credit" ? "Credit tools operators can work in immediately." : "Services the workspace can open immediately."}
          </div>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs setup</div>
          <div className="mt-2 text-3xl font-bold text-amber-900">{servicesSummary.needsAttentionCount}</div>
          <div className="mt-1 text-sm text-amber-900/80">
            {variant === "credit"
              ? "Unlocked tools that still need reports, intake, or live workflow setup."
              : "Unlocked services that still need setup before they are truly live."}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Unavailable</div>
          <div className="mt-2 text-3xl font-bold text-brand-ink">{servicesSummary.unavailableCount}</div>
          <div className="mt-1 text-sm text-zinc-600">Locked, paused, canceled, or still waiting for release.</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next move</div>
          {servicesSummary.primaryAction ? (
            <>
              <div className="mt-2 text-lg font-semibold text-zinc-900">{servicesSummary.primaryAction.service.title}</div>
              <div className="mt-1 text-sm text-zinc-600">{servicesSummary.primaryAction.status.readiness.helper}</div>
              {servicesSummary.primaryAction.status.readiness.href ? (
                <Link
                  href={servicesSummary.primaryAction.status.readiness.href}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  {servicesSummary.primaryAction.status.readiness.ctaLabel}
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <div className="mt-2 text-lg font-semibold text-zinc-900">
                {servicesSummary.hasLoadedStatuses ? "Workspace looks clear" : `${services.length} service${services.length !== 1 ? "s" : ""} available`}
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                {servicesSummary.hasLoadedStatuses
                  ? variant === "credit"
                    ? "Use the cards below to open live credit workflows or review anything that still needs setup."
                    : "Use the cards below to open live services or review anything that still needs setup."
                  : variant === "credit"
                    ? "Status is loading — each card below opens the full credit workflow immediately. Ready, locked, and setup-needed states will appear shortly."
                    : "Status is loading — each card below opens the full service immediately. Ready, locked, and setup-needed states will appear shortly."}
              </div>
            </>
          )}
        </div>
      </div>

      {growthPayload ? (
        <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Readiness map</div>
              <div className="mt-2 max-w-3xl text-sm text-zinc-600">
                {variant === "credit"
                  ? "These categories translate stored credit workspace state into operational readiness levels and next steps."
                  : "These categories translate stored portal state into operational readiness levels and next steps."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold">Ready or active: {growthPayload.summary.readyOrActiveCategories}</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">Setup gaps: {growthPayload.summary.setupGaps}</span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700">Provider blockers: {growthPayload.summary.providerBlockers}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {growthPayload.categories.map((category) => (
              <div key={category.key} className="rounded-3xl border border-zinc-200 bg-zinc-50/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{category.title}</div>
                  <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold", growthLevelBadgeClasses(category.level))}>
                    {growthReadinessLevelLabel(category.level)}
                  </span>
                </div>
                <div className="mt-3 text-sm text-zinc-700">{category.summary}</div>
                {category.blockers[0] ? <div className="mt-3 text-xs font-semibold text-amber-700">{category.blockers[0]}</div> : null}
                <div className="mt-4 text-xs text-zinc-500">{category.whyItMatters}</div>
                <Link
                  href={category.nextAction.href}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  {category.nextAction.ctaLabel}
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Readiness map</div>
              <div className="mt-2 max-w-3xl text-sm text-zinc-600">
                {growthLoading
                  ? "Checking the current workspace state so Services can surface the next best route without inventing outcomes."
                  : "Growth readiness is temporarily unavailable. Use the service states below to keep moving through the routes Purely can verify right now."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold">
                {growthLoading ? "Loading readiness" : "Fail-soft guidance"}
              </span>
              {growthError ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">{growthError}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: variant === "credit" ? "Open live credit workflows" : "Open live services first",
                detail:
                  variant === "credit"
                    ? "Use the cards below to find active report review, dispute, follow-up, and provider setup surfaces."
                    : "Use the cards below to find the services that are already live versus the ones still waiting for setup.",
              },
              {
                title: variant === "credit" ? "Check provider setup" : "Check provider blockers",
                detail:
                  variant === "credit"
                    ? "If calling, texting, or payment proof is missing, open Profile and Sales reporting before assuming those workflows are ready."
                    : "If booking proof or revenue proof matters next, open Booking settings and Sales reporting to confirm the real connections.",
              },
              {
                title: variant === "credit" ? "Use reporting for shared activity only" : "Use reporting for stored activity only",
                detail:
                  variant === "credit"
                    ? "Reporting remains useful for shared activity counts, but credit reports, dispute letters, and tasks still carry the operational workflow."
                    : "Reporting becomes more useful after bookings, reviews, inbox activity, or connected payment events are actually stored.",
              },
              {
                title: variant === "credit" ? "Move one step at a time" : "Pick the next stored signal",
                detail:
                  variant === "credit"
                    ? "Finish one truthful next step such as report review, dispute prep, or provider setup before expanding scope."
                    : "Turn on one real path such as booking, reviews, or follow-up so the workspace starts producing useful reporting signals.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-zinc-200 bg-zinc-50/60 p-5">
                <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
                <div className="mt-3 text-sm text-zinc-700">{item.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {growthPayload ? (
        <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                {growthPayload.isLowActivityWorkspace ? "Starter path" : "Growth playbooks"}
              </div>
              <div className="mt-2 max-w-3xl text-sm text-zinc-600">
                {growthPayload.isLowActivityWorkspace
                  ? "Use this order when the workspace has little or no activity. It is deterministic and only points to routes Purely can back up today."
                  : "These playbooks turn current readiness into specific next moves, routes, and business reasons."}
              </div>
            </div>
          </div>

          {growthPayload.isLowActivityWorkspace ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-5">
              {starterActions.map((action, index) => (
                <Link key={action.id} href={action.href} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5 hover:bg-zinc-50">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Step {index + 1}</div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{action.title}</div>
                  <div className="mt-2 text-sm text-zinc-600">{action.detail}</div>
                  <div className="mt-4 text-sm font-semibold text-brand-ink">{action.ctaLabel} →</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {featuredPlaybooks.map((playbook) => (
                <div key={playbook.key} className="rounded-3xl border border-zinc-200 bg-zinc-50/60 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900">{playbook.title}</div>
                    <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold", growthLevelBadgeClasses(playbook.level))}>
                      {growthReadinessLevelLabel(playbook.level)}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-zinc-700">{playbook.summary}</div>
                  {playbook.blocker ? <div className="mt-3 text-xs font-semibold text-amber-700">{playbook.blocker}</div> : null}
                  {playbook.missingSetup[0] ? <div className="mt-3 text-xs text-zinc-500">{playbook.missingSetup[0]}</div> : null}
                  <div className="mt-4 text-xs text-zinc-500">{playbook.whyItMatters}</div>
                  <Link
                    href={playbook.nextAction.href}
                    className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  >
                    {playbook.nextAction.ctaLabel}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{growthLoading ? "Starter path" : "Safe next routes"}</div>
              <div className="mt-2 max-w-3xl text-sm text-zinc-600">
                {growthLoading
                  ? "The next-route guidance is loading. The service cards below still open the right workspace routes immediately."
                  : "Growth guidance is temporarily unavailable, so this view falls back to stable routes you can open without guessing at outcomes."}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {[
              {
                title: variant === "credit" ? "Credit reports" : "Booking settings",
                href: variant === "credit" ? `${basePath}/app/services/credit-reports` : `${basePath}/app/services/booking/settings`,
                detail:
                  variant === "credit"
                    ? "Review imported reports and pending items before moving into disputes or follow-up."
                    : "Confirm the real booking path before treating appointments as a reliable growth signal.",
              },
              {
                title: variant === "credit" ? "Tasks" : "Reporting",
                href: variant === "credit" ? `${basePath}/app/services/tasks` : `${basePath}/app/services/reporting`,
                detail:
                  variant === "credit"
                    ? "Use tasks for the operational work that sits between reports, disputes, and follow-up."
                    : "Use reporting to see which stored activity exists already and which proof is still missing.",
              },
              {
                title: variant === "credit" ? "Profile and providers" : "All services",
                href: variant === "credit" ? `${basePath}/app/profile` : `${basePath}/app/services`,
                detail:
                  variant === "credit"
                    ? "Provider setup controls whether Twilio-backed calling, texting, and payment-proof workflows can be trusted."
                    : "Open the full service list to find the next service that is ready, blocked, or still needs setup.",
              },
            ].map((item) => (
              <Link key={item.title} href={item.href} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5 hover:bg-zinc-50">
                <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
                <div className="mt-2 text-sm text-zinc-600">{item.detail}</div>
                <div className="mt-4 text-sm font-semibold text-brand-ink">Open route →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 space-y-8">
        {serviceGroups.map((group) => (
          <section key={group.key}>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{group.title}</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.services.map((s) => {
                const serviceCopy = getPortalServiceCopy(s, variant);
                const status = statuses?.[s.slug] ?? null;
                const access = status?.access ?? null;
                const readiness = status?.readiness ?? null;
                const cardHref = (() => {
                  if (readiness?.href) return readiness.href;
                  return `${basePath}/app/services/${s.slug}`;
                })();
                const cardBadgeClass = status ? badgeClasses(status.state) : "border-zinc-200 bg-zinc-50 text-zinc-500";

                return (
                  <Link
                    key={s.slug}
                    href={cardHref}
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

                      <span className={classNames("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", cardBadgeClass)}>
                        {status && (status.state === "locked" || status.state === "paused" || status.state === "canceled") ? <IconLock /> : null}
                        {status ? status.label : "…"}
                      </span>
                    </div>

                    <div className="text-base font-semibold text-brand-ink group-hover:text-zinc-900">{s.title}</div>
                    <div className="mt-2 text-sm text-zinc-600">{serviceCopy.description}</div>

                    <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4">
                      <div className="flex flex-wrap gap-2">
                        <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", access ? accessBadgeClasses(access.state) : "border-zinc-200 bg-zinc-50 text-zinc-500")}>
                          {access?.label || "Access"}
                        </span>
                        <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", readiness ? readinessBadgeClasses(readiness.state) : "border-zinc-200 bg-zinc-50 text-zinc-500")}>
                          {readiness?.label || "Loading"}
                        </span>
                      </div>
                      <div className="text-sm text-zinc-600">{readiness?.helper || "Open this service to see full setup details."}</div>
                      <div className="text-sm font-semibold text-brand-ink">{readiness?.ctaLabel || "Open service"}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
