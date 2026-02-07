"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Responsive as ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

type ModuleKey = "blog" | "booking" | "crm" | "leadOutbound";

type MeResponse = {
  user: { email: string; name: string; role: string };
  entitlements: Record<ModuleKey, boolean>;
  metrics: { hoursSavedThisWeek: number; hoursSavedAllTime: number };
  billing: { configured: boolean };
};

type DashboardWidgetId =
  | "hoursSaved"
  | "billing"
  | "services"
  | "creditsRemaining"
  | "creditsUsed"
  | "automationsRun"
  | "aiCalls"
  | "missedCalls"
  | "bookingsCreated"
  | "reviewsCollected"
  | "avgReviewRating"
  | "leadsCreated"
  | "contactsCreated"
  | "leadScrapeRuns"
  | "dailyActivity";

type DashboardPayload = {
  ok: boolean;
  data: {
    version: 1;
    widgets: Array<{ id: DashboardWidgetId }>;
    layout: Array<{ i: DashboardWidgetId; x: number; y: number; w: number; h: number; minW?: number; minH?: number }>;
  };
  error?: string;
};

type ReportingPayload = {
  ok: boolean;
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
    creditsUsed: number;
    bookingsCreated: number;
    reviewsCollected: number;
    avgReviewRating: number | null;
    leadsCreated: number;
    contactsCreated: number;
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <div className="drag-handle cursor-grab select-none text-zinc-300">⋮⋮</div>
      </div>
      <div className="mt-3 text-sm text-zinc-700">{children}</div>
    </div>
  );
}

function compactNum(n: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString();
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-zinc-600">{label}</div>
      <div className="font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

export function PortalDashboardClient() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [reporting, setReporting] = useState<ReportingPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const [layouts, setLayouts] = useState<ResponsiveLayouts>({} as ResponsiveLayouts);

  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      const [meRes, dashRes, repRes] = await Promise.all([
        fetch("/api/customer/me", { cache: "no-store" }),
        fetch("/api/portal/dashboard", { cache: "no-store" }),
        fetch("/api/portal/reporting?range=30d", { cache: "no-store" }).catch(() => null as any),
      ]);

      if (!mounted) return;

      if (!meRes.ok) {
        const body = await meRes.json().catch(() => ({}));
        setError(body?.error ?? "Unable to load portal");
        setLoading(false);
        return;
      }

      setData((await meRes.json()) as MeResponse);

      if (dashRes.ok) {
        const body = (await dashRes.json().catch(() => null)) as DashboardPayload | null;
        if (body?.ok && body.data) {
          setDashboard(body.data);

          const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({
            i: l.i,
            x: l.x,
            y: l.y,
            w: l.w,
            h: l.h,
            ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
            ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
          }));

          setLayouts({ lg: base, md: base, sm: base, xs: base, xxs: base });
        }
      }

      if (repRes?.ok) {
        const rep = (await repRes.json().catch(() => null)) as ReportingPayload | null;
        if (rep?.ok) setReporting(rep);
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const modules = useMemo(
    () =>
      [
        { key: "blog" as const, name: "Blog Automation" },
        { key: "booking" as const, name: "Booking Automation" },
        { key: "crm" as const, name: "CRM / Follow-up" },
      ].map((m) => ({ ...m, enabled: !!data?.entitlements?.[m.key] })),
    [data],
  );

  async function manageBilling() {
    if (!data?.billing?.configured) {
      window.location.href = "/portal/app/billing";
      return;
    }
    setError(null);
    const res = await fetch("/api/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: "/portal/app" }),
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
      window.location.href = "/portal/app/billing";
      return;
    }
    setError(null);
    const res = await fetch("/api/billing/checkout-module", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module, successPath: "/portal/app", cancelPath: "/portal/app" }),
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
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const me = data;

  const widgetIds: DashboardWidgetId[] = (dashboard?.widgets ?? []).map((w) => w.id);

  function widgetTitle(id: DashboardWidgetId): string {
    switch (id) {
      case "hoursSaved":
        return "Hours saved";
      case "billing":
        return "Billing";
      case "services":
        return "Your services";
      case "creditsRemaining":
        return "Credits remaining";
      case "creditsUsed":
        return "Credits used";
      case "automationsRun":
        return "Automations run";
      case "aiCalls":
        return "AI calls";
      case "missedCalls":
        return "Missed calls";
      case "bookingsCreated":
        return "Bookings created";
      case "reviewsCollected":
        return "Reviews collected";
      case "avgReviewRating":
        return "Average rating";
      case "leadsCreated":
        return "Leads created";
      case "contactsCreated":
        return "Contacts created";
      case "leadScrapeRuns":
        return "Lead scraping runs";
      case "dailyActivity":
        return "Daily activity";
      default:
        return "Widget";
    }
  }

  async function saveDashboard(nextLayouts: ResponsiveLayouts) {
    if (!dashboard) return;
    setSavingLayout(true);

    const lgLayout: Layout = Array.isArray(nextLayouts?.lg) ? (nextLayouts.lg as Layout) : [];
    const next = {
      version: 1 as const,
      widgets: dashboard.widgets,
      layout: lgLayout.map((l: LayoutItem) => ({
        i: l.i as DashboardWidgetId,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        ...(typeof l.minW === "number" ? { minW: l.minW } : {}),
        ...(typeof l.minH === "number" ? { minH: l.minH } : {}),
      })),
    };

    const res = await fetch("/api/portal/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", data: next }),
    });
    const body = (await res.json().catch(() => ({}))) as DashboardPayload;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
    }
    setSavingLayout(false);
  }

  async function removeWidget(id: DashboardWidgetId) {
    const res = await fetch("/api/portal/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", widgetId: id }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
      const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
      setLayouts({ lg: base, md: base, sm: base, xs: base, xxs: base });
    }
  }

  async function resetDashboard() {
    const res = await fetch("/api/portal/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const body = (await res.json().catch(() => null)) as DashboardPayload | null;
    if (res.ok && body?.ok && body.data) {
      setDashboard(body.data);
      const base: LayoutItem[] = (body.data.layout ?? []).map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
      setLayouts({ lg: base, md: base, sm: base, xs: base, xxs: base });
    }
  }

  function renderWidget(id: DashboardWidgetId) {
    const k = reporting?.kpis;
    switch (id) {
      case "hoursSaved":
        return (
          <Card title={widgetTitle(id)}>
            <div className="text-2xl font-bold text-brand-ink">{Math.round(me.metrics.hoursSavedThisWeek)}h</div>
            <div className="mt-1 text-xs text-zinc-500">This week</div>
            <div className="mt-3 text-sm text-zinc-700">
              All-time: <span className="font-semibold">{Math.round(me.metrics.hoursSavedAllTime)}h</span>
            </div>
          </Card>
        );

      case "billing":
        return (
          <Card title={widgetTitle(id)}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-700">
                {me.billing.configured ? "Manage your plan and payment method." : "View billing, credits, and top-ups."}
              </div>
              <button
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={manageBilling}
              >
                {me.billing.configured ? "Manage" : "Billing"}
              </button>
            </div>
          </Card>
        );

      case "services":
        return (
          <Card title={widgetTitle(id)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {modules.map((m) => (
                <div
                  key={m.key}
                  className={
                    "rounded-2xl border p-4 " +
                    (m.enabled ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-zinc-50")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                      <div className="mt-1 text-xs text-zinc-600">{m.enabled ? "Included in your plan" : "Not active"}</div>
                    </div>
                    {!m.enabled ? (
                      <button
                        className="shrink-0 rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
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

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
              <div>Next step: complete onboarding so services can personalize outputs.</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/portal/app/onboarding"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:opacity-95"
                >
                  Open onboarding
                </Link>
                {me.entitlements.blog ? (
                  <Link
                    href="/portal/app/services/blogs"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                  >
                    Open blogs
                  </Link>
                ) : null}
                <Link
                  href="/portal/app/billing"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Billing
                </Link>
                <Link
                  href="/portal/app/services/reporting"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Reporting
                </Link>
              </div>
            </div>
          </Card>
        );

      case "creditsRemaining":
        return (
          <Card title={widgetTitle(id)}>
            <div className="text-3xl font-bold text-brand-ink">{compactNum(reporting?.creditsRemaining ?? 0)}</div>
            <div className="mt-2 text-xs text-zinc-500">Usage-based services pull from credits.</div>
            <div className="mt-3">
              <Link href="/portal/app/billing" className="text-sm font-semibold text-brand-ink hover:underline">
                Top up in Billing
              </Link>
            </div>
          </Card>
        );

      case "creditsUsed":
      case "automationsRun":
      case "aiCalls":
      case "missedCalls":
      case "bookingsCreated":
      case "reviewsCollected":
      case "avgReviewRating":
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
            case "missedCalls":
              return compactNum(k.missedCalls);
            case "bookingsCreated":
              return compactNum(k.bookingsCreated);
            case "reviewsCollected":
              return compactNum(k.reviewsCollected);
            case "avgReviewRating":
              return typeof k.avgReviewRating === "number" ? k.avgReviewRating.toFixed(1) : "—";
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
          <Card title={widgetTitle(id)}>
            <div className="text-3xl font-bold text-brand-ink">{value}</div>
            {id === "aiCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Completed" value={compactNum(k.aiCompleted)} />
                <StatLine label="Failed" value={compactNum(k.aiFailed)} />
              </div>
            ) : null}
            {id === "missedCalls" && k ? (
              <div className="mt-3 space-y-2">
                <StatLine label="Texts sent" value={compactNum(k.textsSent)} />
                <StatLine label="Texts failed" value={compactNum(k.textsFailed)} />
              </div>
            ) : null}
            {id === "creditsUsed" ? <div className="mt-2 text-xs text-zinc-500">Last 30 days</div> : null}
          </Card>
        );
      }

      case "dailyActivity": {
        const rows = (reporting?.daily ?? []).slice().reverse().slice(0, 7);
        return (
          <Card title={widgetTitle(id)}>
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
          </Card>
        );
      }

      default:
        return <Card title={widgetTitle(id)}>Widget</Card>;
    }
  }

  const showEditControls = Boolean(dashboard);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">
          {editMode ? "Edit mode: drag cards and resize from the corner." : "Tip: add widgets from Reporting (⋯ → Add to dashboard)."}
        </div>
        {showEditControls ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => void resetDashboard()}
              disabled={savingLayout}
            >
              Reset
            </button>
            {editMode ? (
              <button
                type="button"
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void saveDashboard(layouts)}
                disabled={savingLayout}
              >
                {savingLayout ? "Saving…" : "Save"}
              </button>
            ) : null}
            <button
              type="button"
              className={
                editMode
                  ? "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  : "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              }
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "Done" : "Edit"}
            </button>
          </div>
        ) : null}
      </div>

      <div ref={containerRef}>
        {mounted && width > 0 ? (
          <ResponsiveGridLayout
            width={width}
            className="layout"
            layouts={layouts as any}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={12}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            dragConfig={{ enabled: editMode, handle: ".drag-handle" }}
            resizeConfig={{ enabled: editMode, handles: ["se"] }}
            onLayoutChange={(_current: Layout, all: ResponsiveLayouts) => setLayouts(all)}
          >
            {widgetIds.map((id) => (
              <div key={id} className="group relative">
                {editMode && id !== "hoursSaved" && id !== "billing" && id !== "services" ? (
                  <button
                    type="button"
                    className="absolute right-3 top-3 z-10 rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                    onClick={() => void removeWidget(id)}
                  >
                    Remove
                  </button>
                ) : null}
                {renderWidget(id)}
              </div>
            ))}
          </ResponsiveGridLayout>
        ) : (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading dashboard…</div>
        )}
      </div>
    </div>
  );
}
