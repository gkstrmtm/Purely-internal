import crypto from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hasPublicTable } from "@/lib/dbSchema";

export const CREDIT_FUNNEL_EVENT_TYPES = [
  "page_view",
  "cta_click",
  "form_started",
  "form_submitted",
  "validation_failed",
  "booking_created",
  "checkout_started",
  "checkout_completed",
  "checkout_failed",
  "add_to_cart",
  "save_failed",
  "publish_failed",
] as const;

export type CreditFunnelEventType = (typeof CREDIT_FUNNEL_EVENT_TYPES)[number];
export type CreditFunnelEventMetrics = Record<CreditFunnelEventType, number>;

export type CreditFunnelTrackingContext = {
  funnelId?: string | null;
  funnelSlug?: string | null;
  pageId?: string | null;
  pageSlug?: string | null;
  path?: string | null;
  source?: string | null;
  sessionId?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

export type CreditFunnelTrackingSettings = {
  globalPixelId: string | null;
  funnelPixelId: string | null;
  pagePixelId: string | null;
  resolvedPixelId: string | null;
};

type CreditFunnelEventInsert = {
  ownerId: string;
  funnelId: string;
  pageId?: string | null;
  eventType: CreditFunnelEventType;
  eventPath?: string | null;
  source?: string | null;
  sessionId?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  contactId?: string | null;
  bookingId?: string | null;
  checkoutSessionId?: string | null;
  payloadJson?: unknown;
};

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNullableText(value: unknown, max = 240) {
  const next = cleanText(value, max);
  return next || null;
}

export function normalizeCreditFunnelMetaPixelId(raw: unknown) {
  const next = String(typeof raw === "string" ? raw : "")
    .trim()
    .replace(/[^0-9]/g, "")
    .slice(0, 32);
  return next || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

let hasCreditFunnelEventTablePromise: Promise<boolean> | null = null;

export async function dbHasCreditFunnelEventTable() {
  if (!hasCreditFunnelEventTablePromise) {
    hasCreditFunnelEventTablePromise = hasPublicTable("CreditFunnelEvent").catch(() => false);
  }
  return hasCreditFunnelEventTablePromise;
}

export function invalidateCreditFunnelEventTableCache() {
  hasCreditFunnelEventTablePromise = null;
}

export function createEmptyCreditFunnelEventMetrics(): CreditFunnelEventMetrics {
  return {
    page_view: 0,
    cta_click: 0,
    form_started: 0,
    form_submitted: 0,
    validation_failed: 0,
    booking_created: 0,
    checkout_started: 0,
    checkout_completed: 0,
    checkout_failed: 0,
    add_to_cart: 0,
    save_failed: 0,
    publish_failed: 0,
  };
}

function countValue(value: bigint | number | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value || 0);
}

export function parseCreditFunnelTrackingContext(raw: unknown): CreditFunnelTrackingContext | null {
  if (!isRecord(raw)) return null;
  const context: CreditFunnelTrackingContext = {
    funnelId: cleanNullableText(raw.funnelId, 120),
    funnelSlug: cleanNullableText(raw.funnelSlug, 120),
    pageId: cleanNullableText(raw.pageId, 120),
    pageSlug: cleanNullableText(raw.pageSlug, 120),
    path: cleanNullableText(raw.path, 400),
    source: cleanNullableText(raw.source, 80),
    sessionId: cleanNullableText(raw.sessionId, 120),
    referrer: cleanNullableText(raw.referrer, 1000),
    utmSource: cleanNullableText(raw.utmSource, 200),
    utmMedium: cleanNullableText(raw.utmMedium, 200),
    utmCampaign: cleanNullableText(raw.utmCampaign, 200),
    utmContent: cleanNullableText(raw.utmContent, 200),
    utmTerm: cleanNullableText(raw.utmTerm, 200),
  };
  return Object.values(context).some(Boolean) ? context : null;
}

export function creditFunnelTrackingContextFromUrl(urlLike: string | URL) {
  let url: URL;
  try {
    url = typeof urlLike === "string" ? new URL(urlLike, "https://example.invalid") : urlLike;
  } catch {
    return null;
  }
  const params = url.searchParams;
  return parseCreditFunnelTrackingContext({
    funnelId: params.get("pa_funnel_id"),
    funnelSlug: params.get("pa_funnel_slug"),
    pageId: params.get("pa_page_id"),
    pageSlug: params.get("pa_page_slug"),
    path: params.get("pa_path") || url.pathname,
    source: params.get("pa_source"),
    sessionId: params.get("pa_session_id"),
    referrer: params.get("pa_referrer"),
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
  });
}

export function appendCreditFunnelTrackingParams(input: {
  url: string;
  context?: CreditFunnelTrackingContext | null;
}) {
  const context = input.context ?? null;
  if (!context) return input.url;
  try {
    const url = new URL(input.url, "https://example.invalid");
    const assign = (key: string, value: string | null | undefined) => {
      if (!value) return;
      url.searchParams.set(key, value);
    };
    assign("pa_funnel_id", context.funnelId || null);
    assign("pa_funnel_slug", context.funnelSlug || null);
    assign("pa_page_id", context.pageId || null);
    assign("pa_page_slug", context.pageSlug || null);
    assign("pa_path", context.path || null);
    assign("pa_source", context.source || null);
    assign("pa_session_id", context.sessionId || null);
    assign("pa_referrer", context.referrer || null);
    assign("utm_source", context.utmSource || null);
    assign("utm_medium", context.utmMedium || null);
    assign("utm_campaign", context.utmCampaign || null);
    assign("utm_content", context.utmContent || null);
    assign("utm_term", context.utmTerm || null);
    const out = `${url.pathname}${url.search}${url.hash}`;
    return out;
  } catch {
    return input.url;
  }
}

export function buildHostedFunnelTrackingContext(input: {
  funnelId: string;
  funnelSlug: string;
  pageId?: string | null;
  pageSlug?: string | null;
  path?: string | null;
  source?: string | null;
}) {
  return {
    funnelId: cleanNullableText(input.funnelId, 120),
    funnelSlug: cleanNullableText(input.funnelSlug, 120),
    pageId: cleanNullableText(input.pageId, 120),
    pageSlug: cleanNullableText(input.pageSlug, 120),
    path: cleanNullableText(input.path, 400),
    source: cleanNullableText(input.source, 80) || "hosted_funnel",
  } satisfies CreditFunnelTrackingContext;
}

export function readCreditFunnelTrackingSettings(settingsJson: unknown, funnelId?: string | null, pageId?: string | null): CreditFunnelTrackingSettings {
  const rec = isRecord(settingsJson) ? settingsJson : {};
  const funnelPixelIds = isRecord(rec.funnelPixelIds) ? rec.funnelPixelIds : {};
  const funnelPagePixelIds = isRecord(rec.funnelPagePixelIds) ? rec.funnelPagePixelIds : {};
  const globalPixelId = normalizeCreditFunnelMetaPixelId(rec.metaPixelId);
  const funnelPixelId = funnelId ? normalizeCreditFunnelMetaPixelId(funnelPixelIds[funnelId]) : null;
  const pagePixelId = pageId ? normalizeCreditFunnelMetaPixelId(funnelPagePixelIds[pageId]) : null;
  return {
    globalPixelId,
    funnelPixelId,
    pagePixelId,
    resolvedPixelId: pagePixelId || funnelPixelId || globalPixelId,
  };
}

export function writeGlobalCreditFunnelTrackingSettings(settingsJson: unknown, input: { metaPixelId?: unknown }) {
  const base = isRecord(settingsJson) ? { ...settingsJson } : {};
  const nextPixelId = normalizeCreditFunnelMetaPixelId(input.metaPixelId);
  if (nextPixelId) base.metaPixelId = nextPixelId;
  else delete base.metaPixelId;
  return base;
}

export function writeFunnelCreditFunnelTrackingSettings(
  settingsJson: unknown,
  funnelId: string,
  input: { metaPixelId?: unknown },
) {
  const base = isRecord(settingsJson) ? { ...settingsJson } : {};
  const nextPixelId = normalizeCreditFunnelMetaPixelId(input.metaPixelId);
  const funnelPixelIds = isRecord(base.funnelPixelIds) ? { ...base.funnelPixelIds } : {};

  if (nextPixelId) funnelPixelIds[funnelId] = nextPixelId;
  else delete funnelPixelIds[funnelId];

  if (Object.keys(funnelPixelIds).length > 0) base.funnelPixelIds = funnelPixelIds;
  else delete base.funnelPixelIds;

  return base;
}

export function writeFunnelPageCreditFunnelTrackingSettings(
  settingsJson: unknown,
  pageId: string,
  input: { metaPixelId?: unknown },
) {
  const base = isRecord(settingsJson) ? { ...settingsJson } : {};
  const nextPixelId = normalizeCreditFunnelMetaPixelId(input.metaPixelId);
  const funnelPagePixelIds = isRecord(base.funnelPagePixelIds) ? { ...base.funnelPagePixelIds } : {};

  if (nextPixelId) funnelPagePixelIds[pageId] = nextPixelId;
  else delete funnelPagePixelIds[pageId];

  if (Object.keys(funnelPagePixelIds).length > 0) base.funnelPagePixelIds = funnelPagePixelIds;
  else delete base.funnelPagePixelIds;

  return base;
}

export async function trackCreditFunnelEvent(input: CreditFunnelEventInsert) {
  if (!(await dbHasCreditFunnelEventTable())) return null;

  const id = crypto.randomUUID();
  const payloadJson = input.payloadJson && typeof input.payloadJson === "object" ? input.payloadJson : input.payloadJson ?? null;

  try {
    await prisma.$executeRaw`
      INSERT INTO "CreditFunnelEvent" (
        "id", "ownerId", "funnelId", "pageId", "eventType", "eventPath", "source", "sessionId", "referrer",
        "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "contactId", "bookingId", "checkoutSessionId", "payloadJson"
      ) VALUES (
        ${id}, ${input.ownerId}, ${input.funnelId}, ${input.pageId ?? null}, ${input.eventType}, ${input.eventPath ?? null}, ${input.source ?? null}, ${input.sessionId ?? null}, ${input.referrer ?? null},
        ${input.utmSource ?? null}, ${input.utmMedium ?? null}, ${input.utmCampaign ?? null}, ${input.utmContent ?? null}, ${input.utmTerm ?? null}, ${input.contactId ?? null}, ${input.bookingId ?? null}, ${input.checkoutSessionId ?? null}, ${payloadJson as any}
      )
    `;
    return { id };
  } catch {
    return null;
  }
}

export async function getCreditFunnelPageMetrics(pageIds: string[]) {
  const ids = Array.from(new Set(pageIds.map((value) => cleanText(value, 120)).filter(Boolean)));
  if (!ids.length) return new Map<string, Record<CreditFunnelEventType, number>>();
  if (!(await dbHasCreditFunnelEventTable())) return new Map<string, Record<CreditFunnelEventType, number>>();

  try {
    const rows = await prisma.$queryRaw<Array<{ pageId: string; eventType: string; count: bigint | number }>>`
      SELECT "pageId" as "pageId", "eventType" as "eventType", COUNT(*) as "count"
      FROM "CreditFunnelEvent"
      WHERE "pageId" IN (${Prisma.join(ids)})
      GROUP BY "pageId", "eventType"
    `;
    const out = new Map<string, Record<CreditFunnelEventType, number>>();
    for (const row of rows) {
      const pageId = cleanText(row.pageId, 120);
      const eventType = cleanText(row.eventType, 80) as CreditFunnelEventType;
      if (!pageId || !CREDIT_FUNNEL_EVENT_TYPES.includes(eventType)) continue;
      const current = out.get(pageId) || createEmptyCreditFunnelEventMetrics();
      current[eventType] = countValue(row.count);
      out.set(pageId, current);
    }
    return out;
  } catch {
    return new Map<string, Record<CreditFunnelEventType, number>>();
  }
}

export async function getCreditFunnelWindowAnalytics(input: { funnelId: string; since?: Date }) {
  const funnelId = cleanText(input.funnelId, 120);
  const since = input.since instanceof Date && Number.isFinite(input.since.getTime()) ? input.since : new Date(0);
  const trackingReady = await dbHasCreditFunnelEventTable();

  const totals = createEmptyCreditFunnelEventMetrics();
  const pageMetrics = new Map<string, CreditFunnelEventMetrics>();
  const pageSessions = new Map<string, number>();

  if (!funnelId || !trackingReady) {
    return {
      trackingReady,
      since: since.toISOString(),
      totalEvents: 0,
      totalSessions: 0,
      totals,
      pageMetrics,
      pageSessions,
    };
  }

  try {
    const [eventRows, pageSessionRows, totalSessionRows] = await Promise.all([
      prisma.$queryRaw<Array<{ pageId: string | null; eventType: string; count: bigint | number }>>`
        SELECT "pageId" as "pageId", "eventType" as "eventType", COUNT(*) as "count"
        FROM "CreditFunnelEvent"
        WHERE "funnelId" = ${funnelId}
          AND "createdAt" >= ${since}
        GROUP BY "pageId", "eventType"
      `,
      prisma.$queryRaw<Array<{ pageId: string | null; count: bigint | number }>>`
        SELECT "pageId" as "pageId", COUNT(DISTINCT "sessionId") as "count"
        FROM "CreditFunnelEvent"
        WHERE "funnelId" = ${funnelId}
          AND "createdAt" >= ${since}
          AND "sessionId" IS NOT NULL
        GROUP BY "pageId"
      `,
      prisma.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT COUNT(DISTINCT "sessionId") as "count"
        FROM "CreditFunnelEvent"
        WHERE "funnelId" = ${funnelId}
          AND "createdAt" >= ${since}
          AND "sessionId" IS NOT NULL
      `,
    ]);

    for (const row of eventRows) {
      const eventType = cleanText(row.eventType, 80) as CreditFunnelEventType;
      if (!CREDIT_FUNNEL_EVENT_TYPES.includes(eventType)) continue;

      const count = countValue(row.count);
      totals[eventType] += count;

      const pageId = cleanText(row.pageId, 120);
      if (!pageId) continue;

      const current = pageMetrics.get(pageId) || createEmptyCreditFunnelEventMetrics();
      current[eventType] += count;
      pageMetrics.set(pageId, current);
    }

    for (const row of pageSessionRows) {
      const pageId = cleanText(row.pageId, 120);
      if (!pageId) continue;
      pageSessions.set(pageId, countValue(row.count));
    }

    const totalEvents = CREDIT_FUNNEL_EVENT_TYPES.reduce((sum, key) => sum + totals[key], 0);
    const totalSessions = countValue(totalSessionRows[0]?.count ?? 0);

    return {
      trackingReady,
      since: since.toISOString(),
      totalEvents,
      totalSessions,
      totals,
      pageMetrics,
      pageSessions,
    };
  } catch {
    return {
      trackingReady,
      since: since.toISOString(),
      totalEvents: 0,
      totalSessions: 0,
      totals,
      pageMetrics,
      pageSessions,
    };
  }
}