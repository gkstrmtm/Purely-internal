"use client";

import { useEffect } from "react";

import { ensureMetaPixel, fireMetaPixelEvent, trackPublicCreditFunnelEvent } from "@/components/funnel/clientFunnelTracking";

export function HostedFunnelTracker({
  pageId,
  pageSlug,
  funnelId,
  funnelSlug,
  pixelId,
}: {
  pageId: string;
  pageSlug?: string | null;
  funnelId: string;
  funnelSlug: string;
  pixelId?: string | null;
}) {
  useEffect(() => {
    if (!pageId) return;
    ensureMetaPixel(pixelId || null);
    void trackPublicCreditFunnelEvent({
      pageId,
      eventType: "page_view",
      baseContext: {
        pageId,
        pageSlug: pageSlug || null,
        funnelId,
        funnelSlug,
        source: "hosted_funnel",
      },
    });
    fireMetaPixelEvent(pixelId || null, "page_view");
  }, [funnelId, funnelSlug, pageId, pageSlug, pixelId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if ((data as any).type !== "pa_credit_funnel_event") return;
      const eventType = String((data as any).eventType || "").trim();
      if (!eventType) return;
      fireMetaPixelEvent(pixelId || null, eventType as any, (data as any).payload && typeof (data as any).payload === "object" ? (data as any).payload : undefined);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pixelId]);

  return null;
}