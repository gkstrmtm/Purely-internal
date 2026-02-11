"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { IconServiceGlyph } from "@/app/portal/PortalIcons";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { PORTAL_SERVICE_KEYS, type PortalServiceKey } from "@/lib/portalPermissions.shared";

type PortalMe =
  | {
      ok: true;
      ownerId: string;
      memberId: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      permissions: Record<string, { view: boolean; edit: boolean }>;
    }
  | { ok: false; error?: string };

type StatusState = "active" | "needs_setup" | "locked" | "coming_soon";

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

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function badgeClasses(state: StatusState) {
  switch (state) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_setup":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "locked":
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
    case "coming_soon":
      return "border-zinc-200 bg-white text-zinc-500";
  }
}

function canViewFromPermissions(portalMe: PortalMe | null, key: PortalServiceKey) {
  if (!portalMe || portalMe.ok !== true) return true;
  const p = (portalMe.permissions as any)?.[key];
  return Boolean(p?.view);
}

export function PortalServicesClient() {
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [statusRes, setStatusRes] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/me", { cache: "no-store" });
      if (!mounted) return;
      const json = (await res.json().catch(() => null)) as PortalMe | null;
      setPortalMe(json);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/services/status", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        setStatusRes({ ok: false, error: res.status === 401 ? "Unauthorized" : "Forbidden" });
        return;
      }
      const json = (await res.json().catch(() => null)) as StatusResponse | null;
      setStatusRes(json);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const knownServiceKeys = useMemo(() => new Set<string>(PORTAL_SERVICE_KEYS as unknown as string[]), []);

  function canViewServiceSlug(slug: string) {
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
  }

  const services = useMemo(() => {
    return PORTAL_SERVICES.filter((s) => !s.hidden).filter((s) => canViewServiceSlug(s.slug));
  }, [portalMe, knownServiceKeys]);

  const canViewBilling = canViewFromPermissions(portalMe, "billing");

  const statuses = statusRes && statusRes.ok === true ? statusRes.statuses : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Services</h1>
          <p className="mt-1 text-sm text-zinc-600">Everything available in your portal.</p>
        </div>
        {canViewBilling ? (
          <Link
            href="/portal/app/billing"
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Billing
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const status = statuses?.[s.slug] ?? null;

          return (
            <Link
              key={s.slug}
              href={`/portal/app/services/${s.slug}`}
              className="group rounded-3xl border border-zinc-200 bg-white p-6 hover:bg-zinc-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                  <span
                    className={
                      s.accent === "blue"
                        ? "text-[color:var(--color-brand-blue)]"
                        : s.accent === "coral"
                          ? "text-[color:var(--color-brand-pink)]"
                          : "text-zinc-700"
                    }
                  >
                    <IconServiceGlyph slug={s.slug} />
                  </span>
                </div>

                <span
                  className={classNames(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                    status ? badgeClasses(status.state) : "border-zinc-200 bg-zinc-50 text-zinc-500",
                  )}
                >
                  {status ? status.label : "…"}
                </span>
              </div>

              <div className="text-base font-semibold text-brand-ink group-hover:text-zinc-900">{s.title}</div>
              <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
