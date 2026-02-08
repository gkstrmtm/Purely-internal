import { prisma } from "@/lib/db";

const SERVICE_SLUG = "dashboard";

export type DashboardWidgetId =
  | "hoursSaved"
  | "billing"
  | "services"
  | "creditsRemaining"
  | "creditsUsed"
  | "blogGenerations"
  | "blogCreditsUsed"
  | "automationsRun"
  | "successRate"
  | "failures"
  | "creditsRunway"
  | "leadsCaptured"
  | "reliabilitySummary"
  | "aiCalls"
  | "missedCalls"
  | "bookingsCreated"
  | "reviewsCollected"
  | "avgReviewRating"
  | "leadsCreated"
  | "contactsCreated"
  | "leadScrapeRuns"
  | "dailyActivity"
  | "perfAiReceptionist"
  | "perfMissedCallTextBack"
  | "perfLeadScraping"
  | "perfReviews";

export type DashboardWidget = {
  id: DashboardWidgetId;
};

export type DashboardLayoutItem = {
  i: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type PortalDashboardData = {
  version: 1;
  widgets: DashboardWidget[];
  layout: DashboardLayoutItem[];
};

function normalizeInt(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.floor(v);
}

const ALL_WIDGET_IDS: DashboardWidgetId[] = [
  "hoursSaved",
  "billing",
  "services",
  "creditsRemaining",
  "creditsUsed",
  "blogGenerations",
  "blogCreditsUsed",
  "automationsRun",
  "successRate",
  "failures",
  "creditsRunway",
  "leadsCaptured",
  "reliabilitySummary",
  "aiCalls",
  "missedCalls",
  "bookingsCreated",
  "reviewsCollected",
  "avgReviewRating",
  "leadsCreated",
  "contactsCreated",
  "leadScrapeRuns",
  "dailyActivity",
  "perfAiReceptionist",
  "perfMissedCallTextBack",
  "perfLeadScraping",
  "perfReviews",
];

export function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && (ALL_WIDGET_IDS as string[]).includes(value);
}

function defaultDashboard(): PortalDashboardData {
  // 12-column grid. h is arbitrary “row units”.
  return {
    version: 1,
    widgets: [{ id: "hoursSaved" }, { id: "billing" }, { id: "services" }],
    layout: [
      { i: "hoursSaved", x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 4 },
      { i: "billing", x: 6, y: 0, w: 6, h: 6, minW: 3, minH: 4 },
      { i: "services", x: 0, y: 6, w: 12, h: 10, minW: 6, minH: 6 },
    ],
  };
}

function parseDashboardJson(raw: unknown): PortalDashboardData {
  const base = defaultDashboard();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const widgetsRaw = Array.isArray(rec.widgets) ? (rec.widgets as unknown[]) : [];
  const widgets: DashboardWidget[] = widgetsRaw
    .flatMap((w) => {
      if (!w || typeof w !== "object" || Array.isArray(w)) return [] as DashboardWidget[];
      const r = w as Record<string, unknown>;
      if (!isDashboardWidgetId(r.id)) return [] as DashboardWidget[];
      return [{ id: r.id }];
    })
    .slice(0, 60);

  const layoutRaw = Array.isArray(rec.layout) ? (rec.layout as unknown[]) : [];
  const layout: DashboardLayoutItem[] = layoutRaw
    .flatMap((l) => {
      if (!l || typeof l !== "object" || Array.isArray(l)) return [] as DashboardLayoutItem[];
      const r = l as Record<string, unknown>;
      if (!isDashboardWidgetId(r.i)) return [] as DashboardLayoutItem[];
      const x = Math.max(0, Math.min(11, normalizeInt(r.x, 0)));
      const y = Math.max(0, normalizeInt(r.y, 0));
      const w = Math.max(1, Math.min(12, normalizeInt(r.w, 4)));
      const h = Math.max(2, Math.min(40, normalizeInt(r.h, 6)));
      const minW = typeof r.minW === "number" || typeof r.minW === "string" ? Math.max(1, Math.min(12, normalizeInt(r.minW, 1))) : undefined;
      const minH = typeof r.minH === "number" || typeof r.minH === "string" ? Math.max(1, Math.min(40, normalizeInt(r.minH, 2))) : undefined;
      return [{ i: r.i, x, y, w, h, ...(typeof minW === "number" ? { minW } : {}), ...(typeof minH === "number" ? { minH } : {}) }];
    })
    .slice(0, 120);

  // Ensure at least the default widgets exist.
  const widgetIds = new Set(widgets.map((w) => w.id));
  for (const w of base.widgets) widgetIds.add(w.id);

  const normalizedWidgets = Array.from(widgetIds).map((id) => ({ id }));

  const layoutIds = new Set(layout.map((l) => l.i));
  const nextLayout = layout.slice();
  for (const w of normalizedWidgets) {
    if (!layoutIds.has(w.id)) {
      nextLayout.push({ i: w.id, x: 0, y: 9999, w: 6, h: 6, minW: 3, minH: 4 });
    }
  }

  return {
    version: 1,
    widgets: normalizedWidgets,
    layout: nextLayout,
  };
}

export async function getPortalDashboardData(ownerId: string): Promise<PortalDashboardData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  return parseDashboardJson(row?.dataJson ?? null);
}

export async function savePortalDashboardData(ownerId: string, data: PortalDashboardData): Promise<PortalDashboardData> {
  const next = parseDashboardJson(data);
  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next as any },
    update: { status: "COMPLETE", dataJson: next as any },
    select: { dataJson: true },
  });
  return parseDashboardJson(row.dataJson);
}

export async function addPortalDashboardWidget(ownerId: string, widgetId: DashboardWidgetId): Promise<PortalDashboardData> {
  const current = await getPortalDashboardData(ownerId);
  if (current.widgets.some((w) => w.id === widgetId)) return current;

  const next: PortalDashboardData = {
    version: 1,
    widgets: [...current.widgets, { id: widgetId }],
    layout: [
      ...current.layout,
      {
        i: widgetId,
        x: 0,
        y: 9999,
        w:
          widgetId === "services" || widgetId === "dailyActivity"
            ? 12
            : 6,
        h:
          widgetId === "services"
            ? 10
            : widgetId === "dailyActivity"
              ? 12
                : widgetId.startsWith("perf")
                  ? 10
                  : 6,
        minW:
          widgetId === "services" || widgetId === "dailyActivity"
            ? 6
            : 3,
        minH:
          widgetId === "dailyActivity" || widgetId.startsWith("perf")
            ? 8
            : 4,
      },
    ],
  };

  return await savePortalDashboardData(ownerId, next);
}

export async function removePortalDashboardWidget(ownerId: string, widgetId: DashboardWidgetId): Promise<PortalDashboardData> {
  const current = await getPortalDashboardData(ownerId);

  // Don’t allow removing the base widgets; keeps dashboard usable.
  const protectedIds: DashboardWidgetId[] = ["hoursSaved", "billing", "services"];
  if (protectedIds.includes(widgetId)) return current;

  const next: PortalDashboardData = {
    version: 1,
    widgets: current.widgets.filter((w) => w.id !== widgetId),
    layout: current.layout.filter((l) => l.i !== widgetId),
  };

  return await savePortalDashboardData(ownerId, next);
}

export async function resetPortalDashboard(ownerId: string): Promise<PortalDashboardData> {
  return await savePortalDashboardData(ownerId, defaultDashboard());
}
