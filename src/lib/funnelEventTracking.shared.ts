export const CREDIT_FUNNEL_EVENT_TYPES = [
  "page_view",
  "cta_click",
  "form_started",
  "form_submitted",
  "validation_failed",
  "booking_created",
  "checkout_started",
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

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNullableText(value: unknown, max = 240) {
  const next = cleanText(value, max);
  return next || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeCreditFunnelMetaPixelId(raw: unknown) {
  const next = String(typeof raw === "string" ? raw : "")
    .trim()
    .replace(/[^0-9]/g, "")
    .slice(0, 32);
  return next || null;
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
    return `${url.pathname}${url.search}${url.hash}`;
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
