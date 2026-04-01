import { prisma } from "@/lib/db";

const SERVICE_SLUG = "dashboard";

export type DashboardScope = "default" | "embedded";

export type DashboardWidgetId =
  | "hoursSaved"
  | "billing"
  | "stripeSales"
  | "services"
  | "mediaLibrary"
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
  | "aiOutboundCalls"
  | "missedCalls"
  | "bookingsCreated"
  | "reviewsCollected"
  | "avgReviewRating"
  | "newsletterSends"
  | "nurtureEnrollments"
  | "tasks"
  | "inboxMessagesIn"
  | "inboxMessagesOut"
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

export type PortalDashboardAnalysis = {
  text: string;
  generatedAtIso: string;
};

export type PortalDashboardMeta = {
  quickAccessSlugs?: string[];
  analysis?: PortalDashboardAnalysis;
};

export type DashboardVariant = "portal" | "credit";

type StoredDashboardJson =
  | {
      version: 1;
      scopes: Partial<Record<DashboardScope, unknown>>;
      variants?: Partial<Record<DashboardVariant, { scopes: Partial<Record<DashboardScope, unknown>> }>>;
      meta?: unknown;
    }
  | unknown;

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseMeta(raw: unknown): PortalDashboardMeta {
  const rec = asObjectOrNull(raw);
  if (!rec) return {};

  const quickAccessSlugs = Array.isArray(rec.quickAccessSlugs)
    ? (rec.quickAccessSlugs as unknown[])
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
        .slice(0, 12)
    : undefined;

  const analysisRec = asObjectOrNull(rec.analysis);
  const analysisText = typeof analysisRec?.text === "string" ? analysisRec.text.trim() : "";
  const generatedAtIso = typeof analysisRec?.generatedAtIso === "string" ? analysisRec.generatedAtIso.trim() : "";
  const analysis = analysisText && generatedAtIso ? ({ text: analysisText, generatedAtIso } satisfies PortalDashboardAnalysis) : undefined;

  return {
    ...(quickAccessSlugs && quickAccessSlugs.length ? { quickAccessSlugs } : {}),
    ...(analysis ? { analysis } : {}),
  };
}

async function upsertDashboardStored(ownerId: string, nextStored: Record<string, unknown>) {
  return await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: nextStored as any,
    },
    update: { status: "COMPLETE", dataJson: nextStored as any },
    select: { dataJson: true },
  });
}

function normalizeInt(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.floor(v);
}

const ALL_WIDGET_IDS: DashboardWidgetId[] = [
  "hoursSaved",
  "billing",
  "stripeSales",
  "services",
  "mediaLibrary",
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
  "aiOutboundCalls",
  "missedCalls",
  "bookingsCreated",
  "reviewsCollected",
  "avgReviewRating",
  "newsletterSends",
  "nurtureEnrollments",
  "tasks",
  "inboxMessagesIn",
  "inboxMessagesOut",
  "leadsCreated",
  "contactsCreated",
  "leadScrapeRuns",
  "dailyActivity",
  "perfAiReceptionist",
  "perfMissedCallTextBack",
  "perfLeadScraping",
  "perfReviews",
];

const REQUIRED_WIDGET_IDS: DashboardWidgetId[] = ["hoursSaved", "billing", "services"];

export function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && (ALL_WIDGET_IDS as string[]).includes(value);
}

function portalDefaultDashboard(): PortalDashboardData {
  // 12-column grid. h is arbitrary “row units”.
  return {
    version: 1,
    widgets: [
      { id: "hoursSaved" },
      { id: "billing" },
      { id: "stripeSales" },
      { id: "creditsRemaining" },
      { id: "creditsRunway" },
      { id: "successRate" },
      { id: "failures" },
      { id: "dailyActivity" },
      { id: "services" },
    ],
    layout: [
      { i: "hoursSaved", x: 0, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
      { i: "billing", x: 3, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
      { i: "stripeSales", x: 6, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
      { i: "creditsRemaining", x: 9, y: 0, w: 3, h: 8, minW: 3, minH: 6 },

      { i: "creditsRunway", x: 0, y: 8, w: 4, h: 10, minW: 3, minH: 8 },
      { i: "successRate", x: 4, y: 8, w: 4, h: 10, minW: 3, minH: 8 },
      { i: "failures", x: 8, y: 8, w: 4, h: 10, minW: 3, minH: 8 },

      { i: "dailyActivity", x: 0, y: 18, w: 12, h: 22, minW: 6, minH: 16 },
      { i: "services", x: 0, y: 40, w: 12, h: 14, minW: 6, minH: 10 },
    ],
  };
}

function creditDefaultDashboard(): PortalDashboardData {
  return {
    version: 1,
    widgets: [
      { id: "hoursSaved" },
      { id: "creditsRemaining" },
      { id: "services" },
      { id: "billing" },
      { id: "dailyActivity" },
    ],
    layout: [
      { i: "hoursSaved", x: 0, y: 0, w: 4, h: 8, minW: 3, minH: 6 },
      { i: "creditsRemaining", x: 4, y: 0, w: 4, h: 8, minW: 3, minH: 6 },
      { i: "billing", x: 8, y: 0, w: 4, h: 8, minW: 3, minH: 6 },
      { i: "services", x: 0, y: 8, w: 5, h: 14, minW: 4, minH: 8 },
      { i: "dailyActivity", x: 5, y: 8, w: 7, h: 14, minW: 6, minH: 10 },
    ],
  };
}

function defaultDashboard(variant: DashboardVariant = "portal"): PortalDashboardData {
  return variant === "credit" ? creditDefaultDashboard() : portalDefaultDashboard();
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

  // Ensure at least the required widgets exist.
  const widgetIds = new Set(widgets.map((w) => w.id));
  for (const id of REQUIRED_WIDGET_IDS) widgetIds.add(id);

  const normalizedWidgets = ALL_WIDGET_IDS.filter((id) => widgetIds.has(id)).map((id) => ({ id }));

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

function dashboardsByScopeFromStored(
  raw: StoredDashboardJson | null | undefined,
  variant: DashboardVariant = "portal",
): Record<DashboardScope, PortalDashboardData> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    const variants = asObjectOrNull(rec.variants);
    const variantRec = asObjectOrNull(variants?.[variant]);
    const variantScopes = asObjectOrNull(variantRec?.scopes);
    if (variantScopes) {
      const defaultRaw = variantScopes.default ?? null;
      const embeddedRaw = variantScopes.embedded ?? defaultRaw ?? null;
      const fallback = defaultDashboard(variant);
      const d = defaultRaw ? parseDashboardJson(defaultRaw) : fallback;
      const e = embeddedRaw ? parseDashboardJson(embeddedRaw) : d;
      return { default: d, embedded: e };
    }

    const scopes = rec.scopes;
    if (scopes && typeof scopes === "object" && !Array.isArray(scopes)) {
      const scoped = scopes as Record<string, unknown>;
      const defaultRaw = scoped.default ?? null;
      const embeddedRaw = scoped.embedded ?? defaultRaw ?? null;
      const fallback = defaultDashboard(variant);
      const d = defaultRaw ? parseDashboardJson(defaultRaw) : fallback;
      const e = embeddedRaw ? parseDashboardJson(embeddedRaw) : d;
      return { default: d, embedded: e };
    }
  }

  const fallback = defaultDashboard(variant);
  const d = raw ? parseDashboardJson(raw ?? null) : fallback;
  return { default: d, embedded: d };
}

function normalizeScope(scope: string | null | undefined): DashboardScope {
  return scope === "embedded" ? "embedded" : "default";
}
export async function getPortalDashboardData(ownerId: string, scope?: DashboardScope | string | null): Promise<PortalDashboardData> {
  const state = await getPortalDashboardState(ownerId, scope, "portal");
  return state.data;
}

export async function getPortalDashboardState(
  ownerId: string,
  scope?: DashboardScope | string | null,
  variant: DashboardVariant = "portal",
): Promise<{ data: PortalDashboardData; isPersisted: boolean }> {
  const s = normalizeScope(scope);
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  if (!row) {
    return { data: defaultDashboard(variant), isPersisted: false };
  }
  const byScope = dashboardsByScopeFromStored((row?.dataJson ?? null) as any, variant);
  return { data: byScope[s], isPersisted: true };
}

export async function savePortalDashboardData(
  ownerId: string,
  scope: DashboardScope | string | null | undefined,
  data: PortalDashboardData,
  variant: DashboardVariant = "portal",
): Promise<PortalDashboardData> {
  const s = normalizeScope(scope);
  const next = parseDashboardJson(data);

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const existingObj = asObjectOrNull((existing?.dataJson ?? null) as any) ?? {};
  const byScope = dashboardsByScopeFromStored((existing?.dataJson ?? null) as any, variant);
  const merged: Record<DashboardScope, PortalDashboardData> = {
    default: s === "default" ? next : byScope.default,
    embedded: s === "embedded" ? next : byScope.embedded,
  };
  const existingVariants = asObjectOrNull(existingObj.variants) ?? {};

  // Preserve any other keys stored under this serviceSlug (meta, etc.) while updating layouts.
  const nextStored: Record<string, unknown> = {
    ...existingObj,
    version: 1,
    ...(variant === "portal" ? { scopes: merged } : {}),
    variants: {
      ...existingVariants,
      [variant]: { scopes: merged },
    },
  };

  const row = await upsertDashboardStored(ownerId, nextStored);
  const out = dashboardsByScopeFromStored(row.dataJson as any, variant);
  return out[s];
}

export async function getPortalDashboardMeta(ownerId: string): Promise<PortalDashboardMeta> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const obj = asObjectOrNull((row?.dataJson ?? null) as any);
  if (!obj) return {};
  return parseMeta(obj.meta);
}

export async function setPortalDashboardQuickAccess(ownerId: string, slugs: string[]): Promise<PortalDashboardMeta> {
  const safeSlugs = (Array.isArray(slugs) ? slugs : [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const existingObj = asObjectOrNull((existing?.dataJson ?? null) as any) ?? {};
  const existingMeta = parseMeta(existingObj.meta);

  const nextMeta: PortalDashboardMeta = {
    ...existingMeta,
    quickAccessSlugs: safeSlugs,
  };

  const nextStored: Record<string, unknown> = {
    ...existingObj,
    version: 1,
    meta: nextMeta as any,
  };

  await upsertDashboardStored(ownerId, nextStored);
  return nextMeta;
}

export async function setPortalDashboardAnalysis(ownerId: string, analysis: PortalDashboardAnalysis | null): Promise<PortalDashboardMeta> {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const existingObj = asObjectOrNull((existing?.dataJson ?? null) as any) ?? {};
  const existingMeta = parseMeta(existingObj.meta);

  const nextMeta: PortalDashboardMeta = {
    ...existingMeta,
    ...(analysis ? { analysis } : {}),
  };

  const nextStored: Record<string, unknown> = {
    ...existingObj,
    version: 1,
    meta: nextMeta as any,
  };

  await upsertDashboardStored(ownerId, nextStored);
  return nextMeta;
}

export async function addPortalDashboardWidget(
  ownerId: string,
  scope: DashboardScope | string | null | undefined,
  widgetId: DashboardWidgetId,
  variant: DashboardVariant = "portal",
): Promise<PortalDashboardData> {
  const current = await getPortalDashboardState(ownerId, scope, variant).then((state) => state.data);
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

  return await savePortalDashboardData(ownerId, scope, next, variant);
}

export async function removePortalDashboardWidget(
  ownerId: string,
  scope: DashboardScope | string | null | undefined,
  widgetId: DashboardWidgetId,
  variant: DashboardVariant = "portal",
): Promise<PortalDashboardData> {
  const current = await getPortalDashboardState(ownerId, scope, variant).then((state) => state.data);

  // Don’t allow removing the base widgets; keeps dashboard usable.
  const protectedIds: DashboardWidgetId[] = ["hoursSaved", "billing", "services"];
  if (protectedIds.includes(widgetId)) return current;

  const next: PortalDashboardData = {
    version: 1,
    widgets: current.widgets.filter((w) => w.id !== widgetId),
    layout: current.layout.filter((l) => l.i !== widgetId),
  };

  return await savePortalDashboardData(ownerId, scope, next, variant);
}

export async function resetPortalDashboard(
  ownerId: string,
  scope: DashboardScope | string | null | undefined,
  variant: DashboardVariant = "portal",
): Promise<PortalDashboardData> {
  return await savePortalDashboardData(ownerId, scope, defaultDashboard(variant), variant);
}
