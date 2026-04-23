import crypto from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hasPublicTable } from "@/lib/dbSchema";

export const CREDIT_FUNNEL_EVENT_TYPES = [
  "page_view",
  "cta_click",
  "form_submitted",
  "booking_created",
  "checkout_started",
  "add_to_cart",
] as const;

export type CreditFunnelEventType = (typeof CREDIT_FUNNEL_EVENT_TYPES)[number];

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

function normalizeMetaPixelId(raw: unknown) {
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
  const globalPixelId = normalizeMetaPixelId(rec.metaPixelId);
  const funnelPixelId = funnelId ? normalizeMetaPixelId(funnelPixelIds[funnelId]) : null;
  const pagePixelId = pageId ? normalizeMetaPixelId(funnelPagePixelIds[pageId]) : null;
  return {
    globalPixelId,
    funnelPixelId,
    pagePixelId,
    resolvedPixelId: pagePixelId || funnelPixelId || globalPixelId,
  };
}

export function writeGlobalCreditFunnelTrackingSettings(settingsJson: unknown, input: { metaPixelId?: unknown }) {
  const base = isRecord(settingsJson) ? { ...settingsJson } : {};
  const nextPixelId = normalizeMetaPixelId(input.metaPixelId);
  if (nextPixelId) base.metaPixelId = nextPixelId;
  else delete base.metaPixelId;
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
      const current = out.get(pageId) || {
        page_view: 0,
        cta_click: 0,
        form_submitted: 0,
        booking_created: 0,
        checkout_started: 0,
        add_to_cart: 0,
      };
      current[eventType] = Number(row.count || 0);
      out.set(pageId, current);
    }
    return out;
  } catch {
    return new Map<string, Record<CreditFunnelEventType, number>>();
  }
}