"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";

import { useToast } from "@/components/ToastProvider";
import { IconEdit } from "@/app/portal/PortalIcons";
import { formatSavedTime } from "@/lib/formatSavedTime";
import { portalWidgetUsesFilledSurface, toneForPortalWidget } from "@/lib/portalWidgetTones";
import {
  buildDashboardLayout,
  dashboardLayoutPresetForWidget,
  type DashboardLayoutItem as SharedDashboardLayoutItem,
  type DashboardWidgetId,
} from "@/lib/portalDashboardLayout";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayoutAny = ResponsiveGridLayout as unknown as ComponentType<any>;

const DASHBOARD_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
type DashboardBreakpointKey = keyof typeof DASHBOARD_BREAKPOINTS;

function activeDashboardBreakpoint(width: number): DashboardBreakpointKey {
  if (width >= DASHBOARD_BREAKPOINTS.lg) return "lg";
  if (width >= DASHBOARD_BREAKPOINTS.md) return "md";
  if (width >= DASHBOARD_BREAKPOINTS.sm) return "sm";
  if (width >= DASHBOARD_BREAKPOINTS.xs) return "xs";
  return "xxs";
}

const dashboardPrimaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-xs font-semibold text-brand-blue shadow-[0_8px_24px_rgba(29,78,216,0.14)] transition-colors duration-150 hover:bg-[rgba(29,78,216,0.18)]";

const dashboardSecondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[rgba(15,23,42,0.06)] px-4 py-2 text-xs font-semibold text-brand-ink shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-colors duration-150 hover:bg-[rgba(15,23,42,0.10)]";

const dashboardEditPrimaryButtonClass =
  "rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-brand-blue shadow-[0_8px_24px_rgba(29,78,216,0.14)] transition-colors duration-150 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60";

const dashboardEditSecondaryButtonClass =
  "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 disabled:opacity-60";

const dashboardEditCancelButtonClass =
  "rounded-2xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 shadow-[0_8px_24px_rgba(245,158,11,0.12)] transition-colors duration-150 hover:bg-amber-200 disabled:opacity-60";

const dashboardEditResetButtonClass =
  "rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 shadow-[0_8px_24px_rgba(244,63,94,0.12)] transition-colors duration-150 hover:bg-rose-100 disabled:opacity-60";

const dashboardSuggestionButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-slate-600 disabled:opacity-60";

type ModuleKey = "blog" | "booking" | "crm" | "leadOutbound";

type MeResponse = {
  user: { email: string; name: string; role: string };
  entitlements: Record<ModuleKey, boolean>;
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
  billing: { configured: boolean };
};

type DashboardPayload = {
  ok: boolean;
  isPersisted?: boolean;
  data: {
    version: 1;
    widgets: Array<{ id: DashboardWidgetId }>;
    layout: SharedDashboardLayoutItem[];
  };
  error?: string;
};

type ReportingPayload = {
  ok: boolean;
  startIso: string;
  endIso: string;
  creditsRemaining: number;
  kpis: {
    automationsRun: number;
    aiCalls: number;
    aiCompleted: number;
    aiFailed: number;
    missedCallAttempts: number;
    missedCalls: number;
    textsSent: number;
    textsFailed: number;
    leadScrapeRuns: number;
    leadScrapeChargedCredits: number;
    leadScrapeRefundedCredits: number;
    blogGenerations: number;
    blogCreditsUsed: number;
    creditsUsed: number;
    bookingsCreated: number;
    reviewsCollected: number;
    avgReviewRating: number | null;
    leadsCreated: number;
    contactsCreated: number;

    aiOutboundQueuedNow: number;
    aiOutboundCompleted: number;
    aiOutboundFailed: number;

    nurtureEnrollmentsCreated: number;
    nurtureEnrollmentsActiveNow: number;
    nurtureEnrollmentsCompleted: number;

    newsletterSendEvents: number;
    newsletterSentCount: number;
    newsletterFailedCount: number;

    tasksOpenNow: number;
    tasksCompleted: number;

    inboxMessagesIn: number;
    inboxMessagesOut: number;
  };
  daily: Array<{
    day: string;
    aiCalls: number;
    missedCalls: number;
    leadScrapeRuns: number;
    bookings: number;
    reviews: number;
    creditsUsed: number;
  }>;
};

type MediaStatsPayload =
  | { ok: true; itemsCount: number; foldersCount: number }
  | { ok: false; error?: string };

type SalesIntegrationStatusPayload =
  | {
      ok: true;
      encryptionConfigured: boolean;
      activeProvider: string | null;
      providers: Record<string, { configured: boolean; displayHint?: string | null; connectedAtIso?: string | null }>;
      stripe: {
        configured: boolean;
        prefix: string | null;
        accountId: string | null;
        connectedAtIso: string | null;
      };
      note?: string;
    }
  | { ok: false; error?: string };

type SalesReportPayload =
  | {
      ok: true;
      provider: string;
      providerLabel: string;
      range: "7d" | "30d";
      startIso: string;
      endIso: string;
      currency: string;
      totals: { chargeCount: number; grossCents: number; refundedCents: number; netCents: number };
      note?: string;
    }
  | { ok: false; error?: string };

function formatMoneyFromCents(cents: number, currency: string) {
  const amount = (typeof cents === "number" && Number.isFinite(cents) ? cents : 0) / 100;
  try {
    const c = (currency || "usd").toUpperCase();
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type DashboardPendingLink = {
  label: string;
  href: string;
};

function DashboardPendingState({
  title,
  body,
  links,
}: {
  title: string;
  body: string;
  links: DashboardPendingLink[];
}) {
  return (
    <div className="rounded-[28px] border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold text-brand-ink">{title}</div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={dashboardSecondaryButtonClass}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid min-w-55 gap-3 rounded-3xl bg-zinc-50 p-4 text-xs text-zinc-500">
          <div>
            <div className="font-semibold uppercase tracking-[0.18em] text-zinc-400">What belongs here</div>
            <div className="mt-2 text-sm text-zinc-600">Your daily widgets, shortcuts, reporting summaries, and Pura attention items load here once the dashboard finishes hydrating.</div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.18em] text-zinc-400">Best next step</div>
            <div className="mt-2 text-sm text-zinc-600">If you are just getting started, open services or billing first, then come back here when you want the at-a-glance control center.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function accentForWidget(id: string) {
  if (id === "perfAiReceptionist") {
    return {
      card: "bg-white",
      ring: "shadow-[0_18px_40px_rgba(29,78,216,0.10)] ring-1 ring-[color:rgba(29,78,216,0.14)]",
    };
  }
  if (id === "perfLeadScraping") {
    return {
      card: "bg-white",
      ring: "shadow-[0_18px_40px_rgba(34,197,94,0.10)] ring-1 ring-[color:rgba(34,197,94,0.14)]",
    };
  }
  if (id === "perfReviews") {
    return {
      card: "bg-white",
      ring: "shadow-[0_18px_40px_rgba(147,51,234,0.10)] ring-1 ring-[color:rgba(147,51,234,0.14)]",
    };
  }
  if (id === "perfMissedCallTextBack") {
    return {
      card: "bg-white",
      ring: "shadow-[0_18px_40px_rgba(244,63,94,0.10)] ring-1 ring-[color:rgba(244,63,94,0.14)]",
    };
  }
  if (id === "failures") {
    return {
      card: "bg-[linear-gradient(180deg,rgba(255,241,242,0.98),rgba(255,228,230,0.94))]",
      ring: "shadow-[0_20px_50px_rgba(244,63,94,0.12)] ring-1 ring-[color:rgba(244,63,94,0.14)]",
    };
  }

  const tone = toneForPortalWidget(id);
  const filled = portalWidgetUsesFilledSurface(tone);

  if (filled) {
    switch (tone) {
      case "blue":
        return {
          card: "bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(219,234,254,0.94))]",
          ring: "shadow-[0_20px_50px_rgba(29,78,216,0.12)] ring-1 ring-[color:rgba(29,78,216,0.14)]",
        };
      case "emerald":
        return {
          card: "bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(220,252,231,0.94))]",
          ring: "shadow-[0_20px_50px_rgba(34,197,94,0.12)] ring-1 ring-[color:rgba(34,197,94,0.14)]",
        };
      case "violet":
        return {
          card: "bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(243,232,255,0.94))]",
          ring: "shadow-[0_20px_50px_rgba(147,51,234,0.13)] ring-1 ring-[color:rgba(147,51,234,0.14)]",
        };
      case "amber":
        return {
          card: "bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.94))]",
          ring: "shadow-[0_20px_50px_rgba(245,158,11,0.14)] ring-1 ring-[color:rgba(245,158,11,0.16)]",
        };
    }
  }

  switch (id) {
    case "billing":
      return {
        card: "bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(224,242,254,0.94))]",
        ring: "shadow-[0_20px_50px_rgba(14,165,233,0.12)] ring-1 ring-[color:rgba(14,165,233,0.14)]",
      };
    case "services":
      return {
        card: "bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))]",
        ring: "shadow-[0_18px_40px_rgba(15,23,42,0.06)] ring-1 ring-[color:rgba(34,197,94,0.10)]",
      };
    case "puraAttention":
      return {
        card: "bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))]",
        ring: "shadow-[0_18px_40px_rgba(15,23,42,0.06)] ring-1 ring-[color:rgba(51,65,85,0.1)]",
      };
    case "activityPulse":
      return {
        card: "bg-white",
        ring: "shadow-[0_18px_40px_rgba(29,78,216,0.08)] ring-1 ring-[color:rgba(29,78,216,0.12)]",
      };
    default:
      return {
        card: "bg-white",
        ring: "shadow-sm ring-1 ring-[color:rgba(148,163,184,0.22)]",
      };
  }
}

function defaultDashboardDataForVariant(variant: "portal" | "credit"): DashboardPayload["data"] {
  const widgetIds: DashboardWidgetId[] =
    variant === "credit"
      ? ["hoursSaved", "creditsRemaining", "puraAttention", "activityPulse", "billing", "services"]
      : [
          "hoursSaved",
          "puraAttention",
          "activityPulse",
          "billing",
          "stripeSales",
          "creditsRunway",
          "successRate",
          "reliabilitySummary",
          "dailyActivity",
          "services",
        ];

  return {
    version: 1,
    widgets: widgetIds.map((id) => ({ id })),
    layout: buildDashboardLayout(widgetIds),
  };
}

function defaultMeResponseForVariant(variant: "portal" | "credit"): MeResponse {
  return {
    user: {
      email: "",
      name: variant === "credit" ? "Credit client" : "Portal client",
      role: "CLIENT",
    },
    entitlements: {
      blog: false,
      booking: false,
      crm: false,
      leadOutbound: false,
    },
    metrics: {
      hoursSavedThisWeek: 0,
      hoursSavedAllTime: 0,
    },
    billing: {
      configured: false,
    },
  };
}

function normalizeDashboardBaseLayout(items: SharedDashboardLayoutItem[]): LayoutItem[] {
  return items.map((item) => {
    const preset = dashboardLayoutPresetForWidget(item.i);
    const minW = Math.max(typeof item.minW === "number" ? item.minW : 1, preset.minW ?? 1);
    const minH = Math.max(typeof item.minH === "number" ? item.minH : 1, preset.minH ?? 1);

    return {
      i: item.i,
      x: item.x,
      y: item.y,
      w: Math.max(item.w, minW),
      h: Math.max(item.h, minH),
      minW,
      minH,
    };
  });
}

function AccentCard({
  title,
  widgetId,
  children,
  showHandle,
}: {
  title: string;
  widgetId: string;
  children: React.ReactNode;
  showHandle: boolean;
}) {
  const a = accentForWidget(widgetId);
  return (
    <div
      className={classNames(
        "flex h-full min-w-0 flex-col overflow-visible rounded-3xl border border-zinc-200 p-6",
        a.card,
        a.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {showHandle ? <div className="drag-handle cursor-grab select-none text-zinc-400">⋮⋮</div> : null}
      </div>
      <div className="mt-3 flex-1 text-sm text-zinc-700">{children}</div>
    </div>
  );
}

function compactNum(n: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString();
}

function formatPct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function daysBetweenIso(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  const days = Math.round((end - start) / 86_400_000);
  return clampInt(days || 1, 1, 3650);
}

function clampLayoutToCols(items: LayoutItem[], cols: number): LayoutItem[] {
  return items.map((it) => {
    const w = clampInt(it.w ?? 1, 1, cols);
    const x = clampInt(it.x ?? 0, 0, Math.max(0, cols - w));
    const minW = typeof it.minW === "number" ? clampInt(it.minW, 1, cols) : undefined;
    const minH = typeof it.minH === "number" ? clampInt(it.minH, 1, 40) : undefined;
    return {
      ...it,
      x,
      w,
      ...(typeof minW === "number" ? { minW } : {}),
      ...(typeof minH === "number" ? { minH } : {}),
    };
  });
}

function stackLayoutToCols(items: LayoutItem[], cols: number): LayoutItem[] {
  const sorted = items
    .slice()
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

  let y = 0;
  return sorted.map((it) => {
    const h = clampInt(it.h ?? 6, 2, 40);
    const minW = typeof it.minW === "number" ? clampInt(it.minW, 1, cols) : undefined;
    const minH = typeof it.minH === "number" ? clampInt(it.minH, 1, 40) : undefined;
    const next: LayoutItem = {
      ...it,
      x: 0,
      y,
      w: cols,
      h,
      ...(typeof minW === "number" ? { minW } : {}),
      ...(typeof minH === "number" ? { minH } : {}),
    };
    y += h;
    return next;
  });
}

function makeResponsiveLayouts(base12Col: LayoutItem[]): ResponsiveLayouts {
  const lg = clampLayoutToCols(base12Col, 12);
  return {
    lg,
    md: lg,
    sm: stackLayoutToCols(lg, 6),
    xs: stackLayoutToCols(lg, 4),
    xxs: stackLayoutToCols(lg, 2),
  } as ResponsiveLayouts;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-zinc-600">{label}</div>
      <div className="font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function dashboardPerfPanelClass(tone: "blue" | "pink" | "emerald" | "violet") {
  switch (tone) {
    case "blue":
      return "bg-[rgba(219,234,254,0.76)]";
    case "pink":
      return "bg-[rgba(255,228,230,0.72)]";
    case "emerald":
      return "bg-[rgba(220,252,231,0.78)]";
    case "violet":
      return "bg-[rgba(243,232,255,0.8)]";
  }
}

function PerfMetricTile({ label, value, tone }: { label: string; value: string; tone: "blue" | "pink" | "emerald" | "violet" }) {
  return (
    <div className={classNames("rounded-2xl p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]", dashboardPerfPanelClass(tone))}>
      <div className="text-[11px] font-semibold text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-bold text-brand-ink">{value}</div>
    </div>
  );
}

export function PortalDashboardClient() {
  const pathname = usePathname() || "";
  const toast = useToast();
  const portalBase = useMemo(() => (pathname.startsWith("/credit") ? "/credit" : "/portal"), [pathname]);
  const portalVariant = portalBase === "/credit" ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
  const [data, setData] = useState<MeResponse | null>(null);
  const [reporting, setReporting] = useState<ReportingPayload | null>(null);
  const [mediaStats, setMediaStats] = useState<MediaStatsPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload["data"] | null>(null);
  const [salesStatus, setSalesStatus] = useState<SalesIntegrationStatusPayload | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReportPayload | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dashboardPendingLinks = useMemo(
    () => [
      { label: "Open services", href: `${portalBase}/app/services` },
      { label: "Review billing", href: `${portalBase}/app/billing` },
      { label: "Open sales dashboard", href: `${portalBase}/app/services/reporting/sales` },
      { label: "Check inbox", href: `${portalBase}/app/services/inbox` },
    ],
    [portalBase],
  );

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [editMode, setEditMode] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const [editSnapshot, setEditSnapshot] = useState<ResponsiveLayouts | null>(null);

  const [layouts, setLayouts] = useState<ResponsiveLayouts>({} as ResponsiveLayouts);

  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const applyDashboardData = (nextData: DashboardPayload["data"]) => {
    setDashboard(nextData);
    setLayouts(makeResponsiveLayouts(normalizeDashboardBaseLayout(nextData.layout ?? [])));
  };

  useEffect(() => {
    const el = containerEl;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width;
      const fallback = typeof window !== "undefined" ? Math.max(320, window.innerWidth - 32) : 1200;
      setWidth(w > 0 ? Math.round(w) : fallback);
    };

    measure();

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    } catch {
      // ignore
    }

    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [containerEl]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      const dashboardScope = (() => {
        if (typeof window === "undefined") return "default" as const;
        try {
          const sp = new URLSearchParams(window.location.search);
          if (sp.get("embed") === "1" || sp.get("pa_embed") === "1") return "embedded" as const;
        } catch {
          // ignore
        }
        try {
          if (window.sessionStorage.getItem("pa.portal.embed") === "1") return "embedded" as const;
        } catch {
          // ignore
        }
        return "default" as const;
      })();

      const meController = new AbortController();
      const dashController = new AbortController();
      const meTimeout = window.setTimeout(() => meController.abort(), 45000);
      const dashTimeout = window.setTimeout(() => dashController.abort(), 18000);

      const refreshDashboardLayout = async () => {
        const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
          cache: "no-store",
          headers: variantHeaders,
        }).catch(() => null as any);

        if (!mounted || !res?.ok) return;

        const body = (await res.json().catch(() => null)) as DashboardPayload | null;
        if (body?.ok && body.data) applyDashboardData(body.data);
      };

      const refreshMeData = async () => {
        const res = await fetch("/api/customer/me", {
          cache: "no-store",
          headers: { "x-pa-app": "portal", ...variantHeaders },
        }).catch(() => null as any);

        if (!mounted || !res?.ok) return;

        const body = (await res.json().catch(() => null)) as MeResponse | null;
        if (body) setData(body);
      };

      const loadOptionalData = async () => {
        const optionalController = new AbortController();
        const optionalTimeout = window.setTimeout(() => optionalController.abort(), 15000);
        try {
          const [repRes, statsRes] = await Promise.all([
            fetch("/api/portal/reporting?range=30d", { cache: "no-store", signal: optionalController.signal, headers: variantHeaders }).catch(() => null as any),
            fetch("/api/portal/media/stats", { cache: "no-store", signal: optionalController.signal, headers: variantHeaders }).catch(() => null as any),
          ]);

          if (!mounted) return;

          if (repRes?.ok) {
            const rep = (await repRes.json().catch(() => null)) as ReportingPayload | null;
            if (rep?.ok) setReporting(rep);
          }

          if (statsRes?.ok) {
            const stats = (await statsRes.json().catch(() => null)) as MediaStatsPayload | null;
            if (stats) setMediaStats(stats);
          }
        } finally {
          window.clearTimeout(optionalTimeout);
        }
      };

      try {
        const [meRes, dashRes] = await Promise.all([
          fetch("/api/customer/me", {
            cache: "no-store",
            signal: meController.signal,
            headers: { "x-pa-app": "portal", ...variantHeaders },
          }).catch(() => null as any),
          fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
            cache: "no-store",
            signal: dashController.signal,
            headers: variantHeaders,
          }).catch(() => null as any),
        ]);

        if (!mounted) return;

        if (!meRes?.ok) {
          if (meRes?.status === 401 || meRes?.status === 403) {
            const body = await meRes.json().catch(() => ({}));
            setError(body?.error ?? "Unable to load dashboard");
            return;
          }

          setData(defaultMeResponseForVariant(portalVariant));
          void refreshMeData();
        } else {
          setData((await meRes.json()) as MeResponse);
        }

        if (!dashRes?.ok) {
          applyDashboardData(defaultDashboardDataForVariant(portalVariant));
          void refreshDashboardLayout();
        } else {
          const body = (await dashRes.json().catch(() => null)) as DashboardPayload | null;
          if (body?.ok && body.data) {
            applyDashboardData(body.data);
          } else {
            applyDashboardData(defaultDashboardDataForVariant(portalVariant));
            void refreshDashboardLayout();
          }
        }

        void loadOptionalData();
      } catch (errorCaught) {
        if (!mounted) return;
        if (errorCaught instanceof DOMException && errorCaught.name === "AbortError") {
          setData(defaultMeResponseForVariant(portalVariant));
          applyDashboardData(defaultDashboardDataForVariant(portalVariant));
          void refreshDashboardLayout();
          void refreshMeData();
        } else {
          setData(defaultMeResponseForVariant(portalVariant));
          applyDashboardData(defaultDashboardDataForVariant(portalVariant));
          void refreshDashboardLayout();
          void refreshMeData();
        }
      } finally {
        window.clearTimeout(meTimeout);
        window.clearTimeout(dashTimeout);
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pathname, portalVariant, variantHeaders]);

  const modules = useMemo(
    () =>
      [
        { key: "blog" as const, name: "Blog Automation" },
        { key: "booking" as const, name: "Booking Automation" },
        { key: "crm" as const, name: "CRM / Follow-up" },
        { key: "leadOutbound" as const, name: "AI Outbound" },
      ].map((m) => ({ ...m, enabled: !!data?.entitlements?.[m.key] })),
    [data],
  );

  const dashboardSuggestionIds = useMemo(() => {
    const current = new Set((dashboard?.widgets ?? []).map((widget) => widget.id));
    return (["puraAttention", "activityPulse", "successRate", "dailyActivity"] as DashboardWidgetId[]).filter((id) => !current.has(id));
  }, [dashboard]);

  const hasStripeSalesWidget = useMemo(
    () => Boolean(dashboard?.widgets?.some((w) => w.id === "stripeSales")),
    [dashboard],
  );

  useEffect(() => {
    if (!hasStripeSalesWidget) return;

    let mounted = true;
    (async () => {
      setSalesError(null);

      const statusRes = await fetch("/api/portal/integrations/sales-reporting", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!mounted) return;

      if (!statusRes?.ok) {
        setSalesError("Unable to load sales status");
        return;
      }

      const statusBody = (await statusRes.json().catch(() => null)) as SalesIntegrationStatusPayload | null;
      if (!mounted) return;

      if (!statusBody?.ok) {
        setSalesStatus(null);
        setSalesReport(null);
        setSalesError(statusBody?.error ?? "Unable to load sales status");
        return;
      }

      setSalesStatus(statusBody);
      const anyConnected = Boolean(
        statusBody?.providers &&
          Object.values(statusBody.providers).some((p) => Boolean(p?.configured)),
      );
      if (!anyConnected) {
        setSalesReport(null);
        return;
      }

      const salesRes = await fetch("/api/portal/reporting/sales?range=30d", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!mounted) return;

      if (!salesRes?.ok) {
        const errBody = (await salesRes?.json().catch(() => ({}))) as { error?: string };
        setSalesReport(null);
        setSalesError(errBody?.error ?? "Unable to load sales");
        return;
      }

      const salesBody = (await salesRes.json().catch(() => null)) as SalesReportPayload | null;
      if (!mounted) return;

      if (!salesBody?.ok) {
        setSalesReport(null);
        setSalesError(salesBody?.error ?? "Unable to load sales");
        return;
      }

      setSalesReport(salesBody);
    })();

    return () => {
      mounted = false;
    };
  }, [hasStripeSalesWidget, pathname, variantHeaders]);

  async function manageBilling() {
    if (!data?.billing?.configured) {
      window.location.href = `${portalBase}/app/billing`;
      return;
    }
    setError(null);
    const res = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: `${portalBase}/app` }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to open billing portal");
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
  }

  async function upgrade(module: ModuleKey) {
    if (!data?.billing?.configured) {
      window.location.href = `${portalBase}/app/billing`;
      return;
    }
    setError(null);
    const res = await fetch("/api/billing/checkout-module", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module, successPath: `${portalBase}/app`, cancelPath: `${portalBase}/app` }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to start checkout");
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
  }

  if (loading) {
    return (
      <DashboardPendingState
        title="Loading your dashboard"
        body="We are pulling together your shortcuts, reporting summaries, and recent activity. You do not need to wait on an empty card to keep working."
        links={dashboardPendingLinks}
      />
    );
  }

  if (error) {
    return (
      <DashboardPendingState
        title="Dashboard is not ready yet"
        body={`${error} You can still move through services, billing, sales reporting, or inbox while the dashboard catches up.`}
        links={dashboardPendingLinks}
      />
    );
  }

  if (!data) return null;

  const me = data;

  const widgetIds: DashboardWidgetId[] = (dashboard?.widgets ?? []).map((w) => w.id);
  const k = reporting?.kpis;
  const derived = (() => {
    if (!reporting?.kpis || !reporting) {
      return {
        overallSuccessRate: null as number | null,
        totalFailures: 0,
        aiSuccessRate: null as number | null,
        textSuccessRate: null as number | null,
        missedCaptureRate: null as number | null,
        creditsPerDay: null as number | null,
        creditRunwayDays: null as number | null,
      };
    }

    const successes = (reporting.kpis.aiCompleted ?? 0) + (reporting.kpis.textsSent ?? 0);
    const failures = (reporting.kpis.aiFailed ?? 0) + (reporting.kpis.textsFailed ?? 0);
    const overall = successes + failures > 0 ? successes / (successes + failures) : null;

    const aiDen = (reporting.kpis.aiCompleted ?? 0) + (reporting.kpis.aiFailed ?? 0);
    const aiRate = aiDen > 0 ? (reporting.kpis.aiCompleted ?? 0) / aiDen : null;

    const txtDen = (reporting.kpis.textsSent ?? 0) + (reporting.kpis.textsFailed ?? 0);
    const txtRate = txtDen > 0 ? (reporting.kpis.textsSent ?? 0) / txtDen : null;

    const attempts = (reporting.kpis.missedCallAttempts ?? 0) as number;
    const missed = (reporting.kpis.missedCalls ?? 0) as number;
    const missedRate = attempts > 0 ? missed / attempts : null;

    const days = daysBetweenIso(reporting.startIso, reporting.endIso);
    const creditsPerDay = days > 0 ? (reporting.kpis.creditsUsed ?? 0) / days : null;
    const runwayDays = creditsPerDay && creditsPerDay > 0 ? (reporting.creditsRemaining ?? 0) / creditsPerDay : null;

    return {
      overallSuccessRate: overall,
      totalFailures: failures,
      aiSuccessRate: aiRate,
      textSuccessRate: txtRate,
      missedCaptureRate: missedRate,
      creditsPerDay,
      creditRunwayDays: runwayDays,
    };
  })();

  const dashboardAttentionItems = (() => {
    const items: Array<{ label: string; value: string; href: string; tone: "danger" | "warning" | "neutral" }> = [];

    if (derived.totalFailures > 0) {
      items.push({
        label: "Failures to review",
        value: `${derived.totalFailures.toLocaleString()} flagged`,
        href: `${portalBase}/app/services/reporting`,
        tone: "danger",
      });
    }

    if ((k?.tasksOpenNow ?? 0) > 0) {
      items.push({
        label: "Open tasks",
        value: `${compactNum(k?.tasksOpenNow ?? 0)} waiting`,
        href: `${portalBase}/app/services/tasks`,
        tone: "warning",
      });
    }

    if ((k?.aiOutboundQueuedNow ?? 0) > 0) {
      items.push({
        label: "Outbound queue",
        value: `${compactNum(k?.aiOutboundQueuedNow ?? 0)} queued now`,
        href: `${portalBase}/app/services/ai-outbound-calls/calls`,
        tone: "neutral",
      });
    }

    if (typeof derived.creditRunwayDays === "number" && Number.isFinite(derived.creditRunwayDays) && derived.creditRunwayDays < 14) {
      items.push({
        label: "Credits runway",
        value: `~${Math.max(0, Math.round(derived.creditRunwayDays))} days left`,
        href: `${portalBase}/app/billing`,
        tone: "warning",
      });
    }

    if (items.length === 0) {
      items.push({
        label: "Everything looks stable",
        value: "Open Pura for a deeper review",
        href: `${portalBase}/app/ai-chat`,
        tone: "neutral",
      });
    }

    return items.slice(0, 3);
  })();

  const activityPulseRows = (() => {
    const rows = (reporting?.daily ?? []).slice(-10);
    const totals = rows.map((row) => row.aiCalls + row.missedCalls + row.leadScrapeRuns + row.bookings + row.reviews);
    const maxTotal = totals.reduce((max, value) => Math.max(max, value), 0);
    return rows.map((row, index) => ({
      day: row.day,
      label: row.day.slice(5),
      total: totals[index] ?? 0,
      heightPct: maxTotal > 0 ? Math.max(16, Math.round(((totals[index] ?? 0) / maxTotal) * 100)) : 16,
      aiCalls: row.aiCalls,
      bookings: row.bookings,
      reviews: row.reviews,
    }));
  })();

  function widgetTitle(id: DashboardWidgetId): string {
    switch (id) {
      case "hoursSaved":
        return "Hours saved";
      case "billing":
        return "Billing";
      case "puraAttention":
        return "Pura attention";
      case "activityPulse":
        return "Activity pulse";
      case "stripeSales":
        return "Sales";
      case "services":
        return "Your services";
      case "mediaLibrary":
        return "Media library";
      case "creditsRemaining":
        return "Credits remaining";
      case "creditsUsed":
        return "Credits used";
      case "blogGenerations":
        return "Blogs generated";
      case "blogCreditsUsed":
        return "Blog credits used";
      case "automationsRun":
        return "Automations run";
      case "successRate":
        return "Success rate";
      case "failures":
        return "Failures";
      case "creditsRunway":
        return "Credits runway";
      case "leadsCaptured":
        return "Leads captured";
      case "reliabilitySummary":
        return "Reliability";
      case "aiCalls":
        return "AI calls";
      case "aiOutboundCalls":
        return "AI outbound";
      case "missedCalls":
        return "Missed calls";
      case "bookingsCreated":
        return "Bookings created";
      case "reviewsCollected":
        return "Reviews collected";
      case "avgReviewRating":
        return "Average rating";
      case "newsletterSends":
        return "Newsletter sends";
      case "nurtureEnrollments":
        return "Nurture enrollments";
      case "tasks":
        return "Tasks";
      case "inboxMessagesIn":
        return "Inbox messages";
      case "inboxMessagesOut":
        return "Outbox messages";
      case "leadsCreated":
        return "Leads created";
      case "contactsCreated":
        return "Contacts created";
      case "leadScrapeRuns":
        return "Lead scraping runs";
      case "dailyActivity":
        return "Daily activity";
      case "perfAiReceptionist":
        return "AI Receptionist performance";
      case "perfMissedCallTextBack":
        return "Missed-call Text Back performance";
      case "perfLeadScraping":
        return "Lead Scraping performance";
      case "perfReviews":
        return "Reviews performance";
      default:
        return "Widget";
    }
  }

  async function saveDashboard(nextLayouts: ResponsiveLayouts) {
    if (!dashboard) return;
    setSavingLayout(true);

    const dashboardScope = (() => {
      if (typeof window === "undefined") return "default" as const;
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("embed") === "1" || sp.get("pa_embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      try {
        if (window.sessionStorage.getItem("pa.portal.embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      return "default" as const;
    })();

    const bp = activeDashboardBreakpoint(width);
    const chosen: Layout = Array.isArray((nextLayouts as any)?.[bp])
      ? (((nextLayouts as any)[bp]) as Layout)
      : Array.isArray((nextLayouts as any)?.lg)
        ? (((nextLayouts as any).lg) as Layout)
        : [];
    const next = {
      version: 1 as const,
      widgets: dashboard.widgets,
      layout: chosen.map((l: LayoutItem) => ({
        i: l.i as DashboardWidgetId,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
        ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
      })),
    };

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", data: next }),
    });
    const body = (await res.json().catch(() => ({}))) as DashboardPayload;
    if (res.ok && body?.ok && body.data) {
      applyDashboardData(body.data);
      setSavingLayout(false);
      return true;
    }
    setSavingLayout(false);
    return false;
  }

  function beginEdit() {
    setEditSnapshot(layouts);
    setEditMode(true);
    try {
      window.dispatchEvent(new CustomEvent("pa.portal.dashboard.edit", { detail: { editing: true } }));
    } catch {
      // ignore
    }
  }

  function cancelEdit() {
    if (editSnapshot) setLayouts(editSnapshot);
    setEditSnapshot(null);
    setEditMode(false);
    try {
      window.dispatchEvent(new CustomEvent("pa.portal.dashboard.edit", { detail: { editing: false } }));
    } catch {
      // ignore
    }
  }

  async function doneEdit() {
    const ok = await saveDashboard(layouts);
    if (ok) {
      setEditSnapshot(null);
      setEditMode(false);

      try {
        window.dispatchEvent(new CustomEvent("pa.portal.dashboard.edit", { detail: { editing: false } }));
        window.dispatchEvent(new CustomEvent("pa.portal.dashboard.saved"));
      } catch {
        // ignore
      }

      // Kick the weekly analysis refresh immediately after dashboard edits.
      void fetch("/api/portal/dashboard/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "dashboard_saved" }),
      }).catch(() => null);
    } else {
      setError("Unable to save dashboard");
      window.setTimeout(() => setError(null), 2500);
    }
  }

  async function removeWidget(id: DashboardWidgetId) {
    const dashboardScope = (() => {
      if (typeof window === "undefined") return "default" as const;
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("embed") === "1" || sp.get("pa_embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      try {
        if (window.sessionStorage.getItem("pa.portal.embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      return "default" as const;
    })();

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", widgetId: id }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      applyDashboardData(body.data);
    }
  }

  async function resetDashboard() {
    const dashboardScope = (() => {
      if (typeof window === "undefined") return "default" as const;
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("embed") === "1" || sp.get("pa_embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      try {
        if (window.sessionStorage.getItem("pa.portal.embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      return "default" as const;
    })();

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      applyDashboardData(body.data);
    }
  }

  async function addWidget(id: DashboardWidgetId) {
    const dashboardScope = (() => {
      if (typeof window === "undefined") return "default" as const;
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("embed") === "1" || sp.get("pa_embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      try {
        if (window.sessionStorage.getItem("pa.portal.embed") === "1") return "embedded" as const;
      } catch {
        // ignore
      }
      return "default" as const;
    })();

    const res = await fetch(`/api/portal/dashboard?scope=${dashboardScope}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", widgetId: id }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      applyDashboardData(body.data);
    }
  }

  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case "hoursSaved":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-2xl font-bold text-brand-ink">{formatSavedTime(me.metrics.hoursSavedThisWeek)}</div>
            <div className="mt-1 text-xs text-zinc-500">This week</div>
            <div className="mt-3 text-sm text-zinc-700">
              All-time: <span className="font-semibold">{formatSavedTime(me.metrics.hoursSavedAllTime)}</span>
            </div>
          </AccentCard>
        );

      case "billing":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-700">
                {me.billing.configured ? "Manage your plan and payment method." : "View billing, credits, and top-ups."}
              </div>
              <button
                className={dashboardPrimaryButtonClass}
                onClick={manageBilling}
              >
                {me.billing.configured ? "Manage" : "Billing"}
              </button>
            </div>
          </AccentCard>
        );

      case "puraAttention":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
              <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.98),rgba(219,234,254,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <div className="text-sm font-semibold text-zinc-900">Pura can help you work the next move</div>
                <div className="mt-1 text-sm text-zinc-600">Use Pura when you want the system to explain what changed, what needs attention, or where to focus next.</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`${portalBase}/app/ai-chat`} className={dashboardPrimaryButtonClass}>Open Pura</Link>
                  <Link href={`${portalBase}/app/services/reporting`} className={dashboardSecondaryButtonClass}>Open reporting</Link>
                </div>
              </div>
              <div className="space-y-2">
                {dashboardAttentionItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={classNames(
                      "block rounded-2xl p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-transform duration-150 hover:-translate-y-0.5",
                      item.tone === "danger"
                        ? "bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,228,230,0.9))]"
                        : item.tone === "warning"
                          ? "bg-[linear-gradient(135deg,rgba(254,252,232,0.98),rgba(254,243,199,0.96))]"
                          : "bg-white",
                    )}
                  >
                    <div className="inline-flex rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{item.value}</div>
                  </Link>
                ))}
              </div>
            </div>
          </AccentCard>
        );

      case "activityPulse":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Last 10 days</div>
                  <div className="mt-1 text-xs text-zinc-500">AI calls, missed calls, lead runs, bookings, and reviews combined.</div>
                </div>
                <Link href={`${portalBase}/app/services/reporting`} className="text-xs font-semibold text-brand-ink hover:underline">
                  Open reporting
                </Link>
              </div>

              <div className="mt-5 flex h-32 items-end gap-2">
                {activityPulseRows.length ? (
                  activityPulseRows.map((row) => (
                    <div key={row.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-24 w-full items-end rounded-2xl bg-white px-1.5 pb-1.5 pt-2 ring-1 ring-black/5">
                        <div
                          className="w-full rounded-xl bg-[linear-gradient(180deg,rgba(29,78,216,0.92),rgba(251,113,133,0.55))]"
                          style={{ height: `${row.heightPct}%` }}
                          title={`${row.day}: ${row.total} actions`}
                        />
                      </div>
                      <div className="text-[11px] font-semibold text-zinc-500">{row.label}</div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center text-sm text-zinc-600">No reporting activity yet.</div>
                )}
              </div>

              {activityPulseRows.length ? (
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-zinc-600">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="font-semibold text-zinc-900">AI calls</div>
                    <div className="mt-1">{compactNum(activityPulseRows.reduce((sum, row) => sum + row.aiCalls, 0))}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="font-semibold text-zinc-900">Bookings</div>
                    <div className="mt-1">{compactNum(activityPulseRows.reduce((sum, row) => sum + row.bookings, 0))}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="font-semibold text-zinc-900">Reviews</div>
                    <div className="mt-1">{compactNum(activityPulseRows.reduce((sum, row) => sum + row.reviews, 0))}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </AccentCard>
        );

      case "stripeSales": {
        const connected = Boolean(
          salesStatus &&
            salesStatus.ok &&
            salesStatus.providers &&
            Object.values(salesStatus.providers).some((p) => Boolean(p?.configured)),
        );
        const net = salesReport && salesReport.ok ? salesReport.totals.netCents : 0;
        const gross = salesReport && salesReport.ok ? salesReport.totals.grossCents : 0;
        const refunded = salesReport && salesReport.ok ? salesReport.totals.refundedCents : 0;
        const currency = salesReport && salesReport.ok ? salesReport.currency : "usd";
        const count = salesReport && salesReport.ok ? salesReport.totals.chargeCount : 0;
        const providerLabel = salesReport && salesReport.ok ? salesReport.providerLabel : null;

        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            {!connected ? (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-zinc-700">Connect a payment processor to see sales right on your dashboard.</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`${portalBase}/app/profile`}
                    className={dashboardPrimaryButtonClass}
                  >
                    Connect
                  </Link>
                  <Link
                    href={`${portalBase}/app/services/reporting/sales?from=dashboard`}
                    className={dashboardSecondaryButtonClass}
                  >
                    Open sales dashboard
                  </Link>
                </div>
              </div>
            ) : salesReport && salesReport.ok ? (
              <div>
                <div className="text-2xl font-bold text-brand-ink">{formatMoneyFromCents(net, currency)}</div>
                <div className="mt-1 text-xs text-zinc-500">{providerLabel ? `${providerLabel} • ` : ""}Net sales • last 30 days</div>

                <div className="mt-4 space-y-2">
                  <StatLine label="Charges" value={compactNum(count)} />
                  <StatLine label="Gross" value={formatMoneyFromCents(gross, currency)} />
                  <StatLine label="Refunded" value={formatMoneyFromCents(refunded, currency)} />
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`${portalBase}/app/services/reporting/sales?from=dashboard`}
                    className={dashboardPrimaryButtonClass}
                  >
                    View details
                  </Link>
                </div>

                {salesReport.note ? <div className="mt-3 text-xs text-zinc-500">{salesReport.note}</div> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-zinc-700">Loading sales…</div>
                {salesError ? <div className="text-xs text-zinc-500">{salesError}</div> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`${portalBase}/app/services/reporting/sales?from=dashboard`}
                    className={dashboardSecondaryButtonClass}
                  >
                    Open sales dashboard
                  </Link>
                </div>
              </div>
            )}
          </AccentCard>
        );
      }

      case "services":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {modules.map((m) => (
                <div
                  key={m.key}
                  className={
                    "rounded-2xl border p-4 " +
                    (m.enabled ? "border-[rgba(34,197,94,0.14)] bg-white" : "border-zinc-200 bg-zinc-50")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                      <div className="mt-1 text-xs text-zinc-600">{m.enabled ? "Included in your plan" : "Not active"}</div>
                    </div>
                    {!m.enabled ? (
                      <button
                        className="shrink-0 rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white transition-opacity duration-100 hover:opacity-95 disabled:opacity-60"
                        onClick={() => upgrade(m.key)}
                      >
                        Upgrade
                      </button>
                    ) : null}
                  </div>

                  {!m.enabled ? (
                    <div className="mt-3 text-xs text-zinc-600">
                      {me.billing.configured ? "Upgrade to unlock this service." : "Upgrade from the Billing page."}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/70 p-4 text-sm text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:flex-row sm:items-center sm:justify-between">
              <div>Quick links for setup, billing, reporting, and day-to-day work.</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`${portalBase}/app/onboarding`}
                  className={dashboardPrimaryButtonClass}
                >
                  Open onboarding
                </Link>
                {me.entitlements.blog ? (
                  <Link
                    href={`${portalBase}/app/services/blogs`}
                    className={dashboardSecondaryButtonClass}
                  >
                    Open blogs
                  </Link>
                ) : null}
                <Link
                  href={`${portalBase}/app/billing`}
                  className={dashboardSecondaryButtonClass}
                >
                  Billing
                </Link>
                <Link
                  href={`${portalBase}/app/services/reporting`}
                  className={dashboardSecondaryButtonClass}
                >
                  Reporting
                </Link>
                <Link
                  href={`${portalBase}/app/ai-chat`}
                  className={dashboardSecondaryButtonClass}
                >
                  Pura
                </Link>
                <Link
                  href={`${portalBase}/app/services/inbox/email`}
                  className={dashboardSecondaryButtonClass}
                >
                  Inbox
                </Link>
                <Link
                  href={`${portalBase}/app/services/media-library`}
                  className={dashboardSecondaryButtonClass}
                >
                  Media library
                </Link>
              </div>
            </div>
          </AccentCard>
        );

      case "mediaLibrary": {
        const ok = mediaStats && (mediaStats as any).ok === true;
        const items = ok ? (mediaStats as any).itemsCount : 0;
        const folders = ok ? (mediaStats as any).foldersCount : 0;
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(items)}</div>
            <div className="mt-1 text-xs text-zinc-500">Items · {compactNum(folders)} folders</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/media-library`} className="text-sm font-semibold text-brand-ink hover:underline">
                Open media library
              </Link>
            </div>
          </AccentCard>
        );
      }

      case "creditsRemaining":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(reporting?.creditsRemaining ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Usage-based services pull from credits.</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/billing`} className="text-sm font-semibold text-brand-ink hover:underline">
                Top up in Billing
              </Link>
            </div>
          </AccentCard>
        );

      case "blogGenerations":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(k?.blogGenerations ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Generated blog posts (last 30 days)</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/blogs`} className="text-sm font-semibold text-brand-ink hover:underline">
                Open blogs
              </Link>
            </div>
          </AccentCard>
        );

      case "blogCreditsUsed":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(k?.blogCreditsUsed ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Credits used by blog generation (last 30 days)</div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/reporting`} className="text-sm font-semibold text-brand-ink hover:underline">
                View reporting
              </Link>
            </div>
          </AccentCard>
        );

      case "successRate":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{formatPct(derived.overallSuccessRate)}</div>
            <div className="mt-2 text-xs text-zinc-500">AI completed + texts sent vs failures (last 30 days)</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[rgba(255,255,255,0.72)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div className="text-xs font-semibold text-zinc-600">AI success</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.aiSuccessRate)}</div>
              </div>
              <div className="rounded-2xl bg-[rgba(255,255,255,0.72)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div className="text-xs font-semibold text-zinc-600">Text success</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.textSuccessRate)}</div>
              </div>
            </div>
          </AccentCard>
        );

      case "failures":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{derived.totalFailures.toLocaleString()}</div>
            <div className="mt-2 text-xs text-zinc-500">AI failed + texts failed (last 30 days)</div>
            <div className="mt-3 space-y-2">
              <StatLine label="AI failed" value={compactNum(k?.aiFailed ?? 0)} />
              <StatLine label="Text failures" value={compactNum(k?.textsFailed ?? 0)} />
            </div>
          </AccentCard>
        );

      case "creditsRunway":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">
              {typeof derived.creditRunwayDays === "number" && Number.isFinite(derived.creditRunwayDays)
                ? `~${Math.max(0, Math.round(derived.creditRunwayDays))} days`
                : "N/A"}
            </div>
            <div className="mt-2 text-xs text-zinc-500">Estimated based on your current spend rate</div>
            <div className="mt-3 space-y-2">
              <StatLine label="Credits remaining" value={compactNum(reporting?.creditsRemaining ?? 0)} />
              <StatLine
                label="Spend rate"
                value={
                  typeof derived.creditsPerDay === "number" && Number.isFinite(derived.creditsPerDay)
                    ? `~${Math.max(0, derived.creditsPerDay).toFixed(1)} / day`
                    : "N/A"
                }
              />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/billing`} className="text-sm font-semibold text-brand-ink hover:underline">
                Top up in Billing
              </Link>
            </div>
          </AccentCard>
        );

      case "leadsCaptured":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(k?.leadsCreated ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Leads created (last 30 days)</div>
            <div className="mt-3 space-y-2">
              <StatLine label="Contacts created" value={compactNum(k?.contactsCreated ?? 0)} />
              <StatLine label="Appointments booked" value={compactNum(k?.bookingsCreated ?? 0)} />
            </div>
          </AccentCard>
        );

      case "reliabilitySummary":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[rgba(219,234,254,0.86)] p-3">
                <div className="text-xs font-semibold text-zinc-600">AI success rate</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.aiSuccessRate)}</div>
              </div>
              <div className="rounded-2xl bg-[rgba(243,232,255,0.88)] p-3">
                <div className="text-xs font-semibold text-zinc-600">Text success rate</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.textSuccessRate)}</div>
              </div>
              <div className="rounded-2xl bg-[rgba(254,240,138,0.48)] p-3">
                <div className="text-xs font-semibold text-zinc-600">Missed call capture</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{formatPct(derived.missedCaptureRate)}</div>
              </div>
              <div className="rounded-2xl bg-[rgba(220,252,231,0.9)] p-3">
                <div className="text-xs font-semibold text-zinc-600">Failures</div>
                <div className="mt-1 text-sm font-bold text-brand-ink">{derived.totalFailures.toLocaleString()}</div>
              </div>
            </div>
          </AccentCard>
        );

      case "creditsUsed":
      case "automationsRun":
      case "aiCalls":
      case "aiOutboundCalls":
      case "missedCalls":
      case "bookingsCreated":
      case "reviewsCollected":
      case "avgReviewRating":
      case "newsletterSends":
      case "nurtureEnrollments":
      case "tasks":
      case "inboxMessagesIn":
      case "inboxMessagesOut":
      case "leadsCreated":
      case "contactsCreated":
      case "leadScrapeRuns": {
        const value = (() => {
          if (!k) return "0";
          switch (id) {
            case "creditsUsed":
              return compactNum(k.creditsUsed);
            case "automationsRun":
              return compactNum(k.automationsRun);
            case "aiCalls":
              return compactNum(k.aiCalls);
            case "aiOutboundCalls":
              return compactNum(k.aiOutboundCompleted);
            case "missedCalls":
              return compactNum(k.missedCalls);
            case "bookingsCreated":
              return compactNum(k.bookingsCreated);
            case "reviewsCollected":
              return compactNum(k.reviewsCollected);
            case "avgReviewRating":
              return typeof k.avgReviewRating === "number" ? k.avgReviewRating.toFixed(1) : "N/A";
            case "newsletterSends":
              return compactNum(k.newsletterSentCount);
            case "nurtureEnrollments":
              return compactNum(k.nurtureEnrollmentsCreated);
            case "tasks":
              return compactNum(k.tasksOpenNow);
            case "inboxMessagesIn":
              return compactNum(k.inboxMessagesIn);
            case "inboxMessagesOut":
              return compactNum(k.inboxMessagesOut);
            case "leadsCreated":
              return compactNum(k.leadsCreated);
            case "contactsCreated":
              return compactNum(k.contactsCreated);
            case "leadScrapeRuns":
              return compactNum(k.leadScrapeRuns);
            default:
              return "0";
          }
        })();

        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="text-3xl font-bold text-brand-ink">{value}</div>
            {id === "aiCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Completed" value={compactNum(k.aiCompleted)} />
                <StatLine label="Failed" value={compactNum(k.aiFailed)} />
              </div>
            ) : null}
            {id === "aiOutboundCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Queued now" value={compactNum(k.aiOutboundQueuedNow)} />
                <StatLine label="Failed" value={compactNum(k.aiOutboundFailed)} />
              </div>
            ) : null}
            {id === "missedCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Texts sent" value={compactNum(k.textsSent)} />
                <StatLine label="Texts failed" value={compactNum(k.textsFailed)} />
              </div>
            ) : null}
            {id === "newsletterSends" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Send events" value={compactNum(k.newsletterSendEvents)} />
                <StatLine label="Failed" value={compactNum(k.newsletterFailedCount)} />
              </div>
            ) : null}
            {id === "nurtureEnrollments" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Active now" value={compactNum(k.nurtureEnrollmentsActiveNow)} />
                <StatLine label="Completed" value={compactNum(k.nurtureEnrollmentsCompleted)} />
              </div>
            ) : null}
            {id === "tasks" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Completed" value={compactNum(k.tasksCompleted)} />
              </div>
            ) : null}
            {id === "creditsUsed" ? <div className="mt-2 text-xs text-zinc-500">Last 30 days</div> : null}
            {id === "tasks" ? <div className="mt-2 text-xs text-zinc-500">Open now · completed in range</div> : null}
            {id === "aiOutboundCalls" ? <div className="mt-2 text-xs text-zinc-500">Completed in range</div> : null}
            {id === "newsletterSends" ? <div className="mt-2 text-xs text-zinc-500">Sent in range</div> : null}
            {id === "nurtureEnrollments" ? <div className="mt-2 text-xs text-zinc-500">Created in range</div> : null}
            {id === "inboxMessagesIn" ? <div className="mt-2 text-xs text-zinc-500">Inbound in range</div> : null}
            {id === "inboxMessagesOut" ? <div className="mt-2 text-xs text-zinc-500">Outbound in range</div> : null}
          </AccentCard>
        );
      }

      case "dailyActivity": {
        const rows = (reporting?.daily ?? []).slice().reverse().slice(0, 7);
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="mt-1 text-xs text-zinc-500">Last 7 days (UTC)</div>
            <div className="mt-3 space-y-2">
              {rows.length ? (
                rows.map((r) => (
                  <div key={r.day} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-700">{r.day}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-700">
                      <div>AI: {r.aiCalls}</div>
                      <div>Missed: {r.missedCalls}</div>
                      <div>Credits: {r.creditsUsed}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No recent activity yet.</div>
              )}
            </div>
          </AccentCard>
        );
      }

      case "perfAiReceptionist":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-2 gap-3">
              <PerfMetricTile label="Calls" value={compactNum(k?.aiCalls ?? 0)} tone="blue" />
              <PerfMetricTile label="Completed" value={compactNum(k?.aiCompleted ?? 0)} tone="blue" />
              <PerfMetricTile label="Failed" value={compactNum(k?.aiFailed ?? 0)} tone="blue" />
              <PerfMetricTile label="Success rate" value={formatPct(derived.aiSuccessRate)} tone="blue" />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/ai-receptionist`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to AI Receptionist
              </Link>
            </div>
          </AccentCard>
        );

      case "perfMissedCallTextBack":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-2 gap-3">
              <PerfMetricTile label="Missed calls" value={compactNum(k?.missedCalls ?? 0)} tone="pink" />
              <PerfMetricTile label="Texts sent" value={compactNum(k?.textsSent ?? 0)} tone="pink" />
              <PerfMetricTile label="Text failures" value={compactNum(k?.textsFailed ?? 0)} tone="pink" />
              <PerfMetricTile label="Text success" value={formatPct(derived.textSuccessRate)} tone="pink" />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/missed-call-textback`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to Missed-Call Text Back
              </Link>
            </div>
          </AccentCard>
        );

      case "perfLeadScraping":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-2 gap-3">
              <PerfMetricTile label="Runs" value={compactNum(k?.leadScrapeRuns ?? 0)} tone="emerald" />
              <PerfMetricTile label="Leads created" value={compactNum(k?.leadsCreated ?? 0)} tone="emerald" />
              <PerfMetricTile label="Contacts" value={compactNum(k?.contactsCreated ?? 0)} tone="emerald" />
              <PerfMetricTile label="Credits used" value={compactNum(k?.leadScrapeChargedCredits ?? 0)} tone="emerald" />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/lead-scraping`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to Lead Scraping
              </Link>
            </div>
          </AccentCard>
        );

      case "perfReviews":
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            <div className="grid grid-cols-2 gap-3">
              <PerfMetricTile label="Reviews collected" value={compactNum(k?.reviewsCollected ?? 0)} tone="violet" />
              <PerfMetricTile
                label="Avg rating"
                value={typeof k?.avgReviewRating === "number" ? k.avgReviewRating.toFixed(1) : "N/A"}
                tone="violet"
              />
              <PerfMetricTile label="Bookings" value={compactNum(k?.bookingsCreated ?? 0)} tone="violet" />
            </div>
            <div className="mt-3">
              <Link href={`${portalBase}/app/services/reviews`} className="text-sm font-semibold text-brand-ink hover:underline">
                Go to Reviews
              </Link>
            </div>
          </AccentCard>
        );


      default:
        return (
          <AccentCard title={widgetTitle(id)} widgetId={id} showHandle={editMode}>
            Widget
          </AccentCard>
        );
    }
  }

  const showEditControls = Boolean(dashboard);

  return (
    <div className="-mt-3">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 text-xs text-zinc-500">{editMode ? "Edit mode: drag cards and resize from the corner." : null}</div>
        {showEditControls ? (
          <div className="ml-auto flex items-center justify-end gap-2">
            {editMode ? (
              <>
                <button
                  type="button"
                  className={dashboardEditResetButtonClass}
                  onClick={() => void resetDashboard()}
                  disabled={savingLayout}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className={dashboardEditCancelButtonClass}
                  onClick={cancelEdit}
                  disabled={savingLayout}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={dashboardEditPrimaryButtonClass}
                  onClick={() => void doneEdit()}
                  disabled={savingLayout}
                >
                  {savingLayout ? "Saving…" : "Done"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={dashboardEditSecondaryButtonClass}
                onClick={beginEdit}
                aria-label="Edit"
                title="Edit"
              >
                <IconEdit size={18} />
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div ref={setContainerEl}>
        {width > 0 ? (
          <>
            <ResponsiveGridLayoutAny
              width={width}
              className="layout"
              layouts={layouts as any}
              breakpoints={DASHBOARD_BREAKPOINTS as any}
              cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={12}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              compactType={null}
              preventCollision={true}
              dragConfig={{ enabled: editMode, handle: ".drag-handle" }}
              resizeConfig={{ enabled: editMode, handles: ["se"] }}
              onLayoutChange={(_current: Layout, all: ResponsiveLayouts) => setLayouts(all)}
            >
              {widgetIds.map((id) => (
                <div key={id} className="relative min-h-0 min-w-0">
                  {editMode && id !== "hoursSaved" && id !== "billing" && id !== "services" ? (
                    <button
                      type="button"
                      className="absolute right-14 top-3 z-10 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-[0_8px_20px_rgba(244,63,94,0.12)] transition-colors duration-150 hover:bg-rose-200"
                      onClick={() => void removeWidget(id)}
                    >
                      Remove
                    </button>
                  ) : null}
                  {renderWidget(id)}
                </div>
              ))}
            </ResponsiveGridLayoutAny>

            {!editMode && widgetIds.length <= 3 && dashboardSuggestionIds.length ? (
              <div className="mt-8 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-black/4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">Keep building this dashboard</div>
                    <div className="mt-1 text-sm text-zinc-600">This layout is still sparse. Add a few higher-signal reporting and Pura widgets so the stage feels complete.</div>
                  </div>
                  <Link href={`${portalBase}/app/services/reporting`} className="text-sm font-semibold text-brand-ink hover:underline">
                    Browse reporting
                  </Link>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  {dashboardSuggestionIds.map((id) => (
                    <div key={id} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-semibold text-zinc-900">{widgetTitle(id)}</div>
                      <div className="mt-2 text-sm text-zinc-600">
                        {id === "puraAttention"
                          ? "Shows what needs attention now and gives you a direct path into Pura or the right service."
                          : id === "activityPulse"
                            ? "Adds a visual read on recent system activity so the dashboard feels alive instead of purely numeric."
                            : id === "dailyActivity"
                              ? "Brings the richer reporting table onto the dashboard for recent day-by-day breakdowns."
                              : "Adds a strong reporting summary so the top of the dashboard carries more signal."}
                      </div>
                      <div className="mt-4">
                        <button type="button" className={dashboardSuggestionButtonClass} onClick={() => void addWidget(id)}>
                          Add widget
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <DashboardPendingState
            title="Preparing your dashboard layout"
            body="The dashboard container is still measuring itself for widgets. Use these quick links if you want to keep moving while the layout settles."
            links={dashboardPendingLinks}
          />
        )}
      </div>
    </div>
  );
}
