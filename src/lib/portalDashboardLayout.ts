export type DashboardWidgetId =
  | "hoursSaved"
  | "billing"
  | "puraAttention"
  | "activityPulse"
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

export type DashboardLayoutItem = {
  i: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

type DashboardLayoutPreset = Omit<DashboardLayoutItem, "i" | "x" | "y">;

function rectsOverlap(a: DashboardLayoutItem, b: Pick<DashboardLayoutItem, "x" | "y" | "w" | "h">) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rowSignature(item: DashboardLayoutItem) {
  return `${item.y}:${item.h}`;
}

function distributeRow(layout: DashboardLayoutItem[], cols: number): DashboardLayoutItem[] {
  const byRow = new Map<string, DashboardLayoutItem[]>();
  for (const item of layout) {
    const key = rowSignature(item);
    const bucket = byRow.get(key) ?? [];
    bucket.push(item);
    byRow.set(key, bucket);
  }

  const next = new Map<string, DashboardLayoutItem>();

  for (const rowItems of byRow.values()) {
    const sorted = rowItems.slice().sort((a, b) => a.x - b.x);
    const totalWidth = sorted.reduce((sum, item) => sum + item.w, 0);
    const canStretch = sorted.length > 0 && totalWidth < cols && !sorted.some((item) => item.w >= cols);
    if (!canStretch) {
      for (const item of sorted) next.set(item.i, item);
      continue;
    }

    const minWidths = sorted.map((item) => Math.min(item.minW ?? 1, cols));
    const minWidthSum = minWidths.reduce((sum, value) => sum + value, 0);
    if (minWidthSum > cols) {
      for (const item of sorted) next.set(item.i, item);
      continue;
    }

    const evenWidth = Math.floor(cols / sorted.length);
    const widths = sorted.map((_, index) => {
      if (index === sorted.length - 1) return cols - evenWidth * (sorted.length - 1);
      return evenWidth;
    });

    for (let index = 0; index < widths.length; index += 1) {
      widths[index] = Math.max(widths[index], minWidths[index]);
    }

    const used = widths.reduce((sum, value) => sum + value, 0);
    if (used > cols) {
      for (const item of sorted) next.set(item.i, item);
      continue;
    }

    let cursor = 0;
    for (let index = 0; index < sorted.length; index += 1) {
      const item = sorted[index];
      const width = index === sorted.length - 1 ? cols - cursor : widths[index];
      next.set(item.i, { ...item, x: cursor, w: width });
      cursor += width;
    }
  }

  return layout.map((item) => next.get(item.i) ?? item);
}

export function dashboardLayoutPresetForWidget(widgetId: DashboardWidgetId): DashboardLayoutPreset {
  switch (widgetId) {
    case "services":
      return { w: 12, h: 18, minW: 6, minH: 14 };
    case "dailyActivity":
      return { w: 12, h: 20, minW: 6, minH: 16 };
    case "puraAttention":
    case "activityPulse":
      return { w: 6, h: 12, minW: 4, minH: 10 };
    case "stripeSales":
    case "creditsRunway":
    case "successRate":
    case "failures":
    case "leadsCaptured":
    case "reliabilitySummary":
    case "perfAiReceptionist":
    case "perfMissedCallTextBack":
    case "perfLeadScraping":
    case "perfReviews":
      return { w: 6, h: 10, minW: 4, minH: 8 };
    default:
      return { w: 4, h: 8, minW: 4, minH: 6 };
  }
}

function firstAvailableSlot(layout: DashboardLayoutItem[], preset: DashboardLayoutPreset, cols: number) {
  const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const yLimit = Math.max(maxY + 48, preset.h);

  for (let y = 0; y <= yLimit; y += 1) {
    for (let x = 0; x <= cols - preset.w; x += 1) {
      const candidate = { x, y, w: preset.w, h: preset.h };
      if (!layout.some((item) => rectsOverlap(item, candidate))) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: maxY };
}

export function buildDashboardLayout(widgetIds: DashboardWidgetId[], cols = 12): DashboardLayoutItem[] {
  const layout: DashboardLayoutItem[] = [];
  const seen = new Set<DashboardWidgetId>();

  for (const widgetId of widgetIds) {
    if (seen.has(widgetId)) continue;
    seen.add(widgetId);
    const preset = dashboardLayoutPresetForWidget(widgetId);
    const { x, y } = firstAvailableSlot(layout, preset, cols);
    layout.push({ i: widgetId, x, y, ...preset });
  }

  return distributeRow(layout, cols);
}