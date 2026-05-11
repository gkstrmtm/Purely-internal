"use client";

import type { CreditFunnelEventType, CreditFunnelTrackingContext } from "@/lib/funnelEventTracking";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    __paMetaPixelBootstrapped?: boolean;
    __paMetaPixelIds?: string[];
  }
}

const SESSION_STORAGE_KEY = "pa_credit_funnel_session_id";

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getCreditFunnelSessionId() {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = randomId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

export function readTrackingContextFromWindow(base?: Partial<CreditFunnelTrackingContext>): CreditFunnelTrackingContext {
  if (typeof window === "undefined") return { ...(base || {}) };
  const params = new URLSearchParams(window.location.search || "");
  return {
    funnelId: (base?.funnelId || params.get("pa_funnel_id") || "").trim() || null,
    funnelSlug: (base?.funnelSlug || params.get("pa_funnel_slug") || "").trim() || null,
    pageId: (base?.pageId || params.get("pa_page_id") || "").trim() || null,
    pageSlug: (base?.pageSlug || params.get("pa_page_slug") || "").trim() || null,
    path: `${window.location.pathname || ""}${window.location.search || ""}` || base?.path || null,
    source: (base?.source || params.get("pa_source") || "").trim() || null,
    sessionId: getCreditFunnelSessionId(),
    referrer: (document.referrer || "").trim() || null,
    utmSource: (params.get("utm_source") || "").trim() || null,
    utmMedium: (params.get("utm_medium") || "").trim() || null,
    utmCampaign: (params.get("utm_campaign") || "").trim() || null,
    utmContent: (params.get("utm_content") || "").trim() || null,
    utmTerm: (params.get("utm_term") || "").trim() || null,
  };
}

export async function trackPublicCreditFunnelEvent(input: {
  pageId: string;
  eventType: CreditFunnelEventType;
  payload?: unknown;
  baseContext?: Partial<CreditFunnelTrackingContext>;
}) {
  if (typeof window === "undefined") return false;
  const pageId = String(input.pageId || "").trim();
  if (!pageId) return false;

  const body = JSON.stringify({
    pageId,
    eventType: input.eventType,
    payload: input.payload ?? null,
    trackingContext: readTrackingContextFromWindow({ ...(input.baseContext || {}), pageId }),
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/public/funnel-builder/events", blob)) return true;
    }
  } catch {
    // ignore
  }

  try {
    const res = await fetch("/api/public/funnel-builder/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function injectMetaPixelBootstrap() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__paMetaPixelBootstrapped) return;
  window.__paMetaPixelBootstrapped = true;

  if (!document.getElementById("pa-meta-pixel-script")) {
    const script = document.createElement("script");
    script.id = "pa-meta-pixel-script";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  if (typeof window.fbq !== "function") {
    const queue: any[] = [];
    const fbq = function (...args: any[]) {
      queue.push(args);
      (fbq as any).queue = queue;
    } as any;
    fbq.queue = queue;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
  }
}

export function ensureMetaPixel(pixelId: string | null | undefined) {
  const id = String(pixelId || "").trim();
  if (!id || typeof window === "undefined") return;
  injectMetaPixelBootstrap();
  const current = Array.isArray(window.__paMetaPixelIds) ? window.__paMetaPixelIds : [];
  if (!current.includes(id)) {
    window.__paMetaPixelIds = [...current, id];
    window.fbq?.("init", id);
  }
}

export function fireMetaPixelEvent(pixelId: string | null | undefined, eventType: CreditFunnelEventType, payload?: Record<string, unknown>) {
  const id = String(pixelId || "").trim();
  if (!id || typeof window === "undefined") return;
  ensureMetaPixel(id);
  if (typeof window.fbq !== "function") return;

  if (eventType === "page_view") {
    window.fbq("track", "PageView");
    return;
  }
  if (eventType === "form_submitted") {
    window.fbq("track", "Lead", payload || {});
    return;
  }
  if (eventType === "booking_created") {
    window.fbq("trackCustom", "Schedule", payload || {});
    return;
  }
  if (eventType === "checkout_started") {
    window.fbq("track", "InitiateCheckout", payload || {});
    return;
  }
  if (eventType === "add_to_cart") {
    window.fbq("track", "AddToCart", payload || {});
    return;
  }
  if (eventType === "cta_click") {
    window.fbq("trackCustom", "CTAInteraction", payload || {});
  }
}

export function notifyParentCreditFunnelEvent(input: {
  eventType: CreditFunnelEventType;
  pageId?: string | null;
  payload?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  try {
    window.parent.postMessage(
      {
        type: "pa_credit_funnel_event",
        eventType: input.eventType,
        pageId: input.pageId || null,
        payload: input.payload || null,
      },
      "*",
    );
  } catch {
    // ignore
  }
}