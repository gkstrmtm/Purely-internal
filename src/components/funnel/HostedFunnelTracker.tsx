"use client";

import { useEffect } from "react";

import { ensureMetaPixel, fireMetaPixelEvent, trackPublicCreditFunnelEvent } from "@/components/funnel/clientFunnelTracking";

const CTA_SELECTOR = "a[href],button,[role='button'],input[type='submit'],input[type='button'],[data-pa-track-cta]";

function getTrackedCtaElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const candidate = target.closest(CTA_SELECTOR);
  return candidate instanceof HTMLElement ? candidate : null;
}

function isDisabledCta(element: HTMLElement) {
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element.getAttribute("data-pa-track-cta") === "false") return true;
  return "disabled" in element && Boolean((element as HTMLButtonElement | HTMLInputElement).disabled);
}

function readCtaPayload(element: HTMLElement) {
  const label = [
    element.getAttribute("data-pa-cta-label"),
    element.getAttribute("aria-label"),
    "value" in element ? String((element as HTMLInputElement).value || "") : "",
    element.textContent || "",
  ]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .find(Boolean);

  const href = element instanceof HTMLAnchorElement ? String(element.getAttribute("href") || "").trim().slice(0, 500) : "";

  return {
    label: label ? label.slice(0, 160) : null,
    href: href || null,
    tagName: element.tagName.toLowerCase(),
  };
}

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
    if (!pageId) return;

    const onClick = (event: MouseEvent) => {
      const element = getTrackedCtaElement(event.target);
      if (!element || isDisabledCta(element)) return;

      const payload = readCtaPayload(element);
      void trackPublicCreditFunnelEvent({
        pageId,
        eventType: "cta_click",
        payload,
        baseContext: {
          pageId,
          pageSlug: pageSlug || null,
          funnelId,
          funnelSlug,
          source: "hosted_funnel",
        },
      });
      fireMetaPixelEvent(pixelId || null, "cta_click", payload);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
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