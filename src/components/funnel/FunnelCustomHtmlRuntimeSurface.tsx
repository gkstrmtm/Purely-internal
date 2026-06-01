"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { PublicBookingClient, type PublicBookingTarget } from "@/app/book/[slug]/PublicBookingClient";
import {
  buildBookingRuntimePlaceholderHtml,
  mergeBookingSurfaceContext,
  readBookingRuntimeSlotNameFromElement,
  readBookingSurfaceContextFromElement,
  type BookingSurfaceContext,
} from "@/lib/funnelBookingSurface";
const IMPLICIT_BOOKING_HEADING_PATTERN = /(<h([1-6])[^>]*>\s*(?:Book a time|Book time|Schedule a call|Schedule your call|Schedule a consultation|Schedule a discovery call)\s*<\/h\2>)/i;
const LEGACY_BOOKING_IFRAME_PATTERN = /<iframe\b[^>]*\bsrc=(['"])([^'"]*(?:\/book\/[^'"]+|\/book\/u\/[^'"]+))\1[^>]*>(?:\s*<\/iframe>)?/i;
const HTML_TAG_PATTERN = /<html\b[^>]*>[\s\S]*?<\/html>/i;
const HEAD_TAG_PATTERN = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const BODY_TAG_PATTERN = /<body\b([^>]*)>([\s\S]*?)<\/body>/i;
const STYLE_TAG_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const STYLESHEET_LINK_PATTERN = /<link\b(?=[^>]*\brel=(['"])stylesheet\1)[^>]*>/gi;

type SurfaceScript = {
  src?: string;
  type?: string;
  async?: boolean;
  defer?: boolean;
  noModule?: boolean;
  content?: string;
};

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readAttr(attrs: string, name: string) {
  const pattern = new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, "i");
  const match = String(attrs || "").match(pattern);
  return match?.[2] ? String(match[2]).trim() : "";
}

function toCamelCase(raw: string) {
  return raw.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

function parseInlineStyle(styleText: string) {
  const style = String(styleText || "").trim();
  if (!style) return undefined;

  const out: CSSProperties = {};
  for (const entry of style.split(";")) {
    const [rawKey, ...rawValueParts] = entry.split(":");
    const key = String(rawKey || "").trim();
    const value = rawValueParts.join(":").trim();
    if (!key || !value) continue;
    (out as Record<string, string>)[toCamelCase(key)] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function scopeDocumentCss(css: string) {
  return String(css || "")
    .replace(/(^|[^a-zA-Z0-9_-])html(?=\b)/g, "$1[data-pa-custom-html-surface]")
    .replace(/(^|[^a-zA-Z0-9_-])body(?=\b)/g, "$1[data-pa-custom-html-surface]")
    .replace(/overflow-wrap\s*:\s*anywhere/gi, "overflow-wrap:break-word")
    .replace(/word-break\s*:\s*break-all/gi, "word-break:normal");
}

function repairMalformedBookingHeroMarkup(html: string) {
  const source = String(html || "");
  if (!source.trim()) return source;

  return source.replace(
    /(<div class="hero-actions">\s*<div class="pa-booking-primary-stack">[\s\S]*?<\/div>)(\s*<aside class="proof-ledger">[\s\S]*?<\/aside>\s*<\/section>)/i,
    "$1</div></div>$2",
  );
}

function parseScripts(html: string) {
  const scripts: SurfaceScript[] = [];
  const stripped = String(html || "").replace(SCRIPT_TAG_PATTERN, (_match, attrs, content) => {
    scripts.push({
      src: readAttr(attrs, "src") || undefined,
      type: readAttr(attrs, "type") || undefined,
      async: /\basync\b/i.test(String(attrs || "")),
      defer: /\bdefer\b/i.test(String(attrs || "")),
      noModule: /\bnomodule\b/i.test(String(attrs || "")),
      content: String(content || "").trim() || undefined,
    });
    return "";
  });

  return { stripped, scripts };
}

function parseHtmlParts(rawHtml: string) {
  const html = String(rawHtml || "");
  const headHtml = html.match(HEAD_TAG_PATTERN)?.[1] || "";
  const bodyMatch = html.match(BODY_TAG_PATTERN);
  const bodyAttrs = bodyMatch?.[1] || "";
  const bodyRawHtml = bodyMatch?.[2] || (HTML_TAG_PATTERN.test(html) ? html.replace(/<!doctype[^>]*>/i, "").replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "") : html);

  const stylesheetLinks = Array.from(headHtml.matchAll(STYLESHEET_LINK_PATTERN))
    .map((match) => readAttr(match[0], "href"))
    .filter(Boolean);

  const styleBlocks = Array.from(headHtml.matchAll(STYLE_TAG_PATTERN))
    .map((match) => scopeDocumentCss(match[1] || ""))
    .filter(Boolean);

  const { stripped: headWithoutScripts, scripts: headScripts } = parseScripts(headHtml.replace(STYLE_TAG_PATTERN, "").replace(STYLESHEET_LINK_PATTERN, ""));
  const { stripped: bodyHtml, scripts: bodyScripts } = parseScripts(bodyRawHtml);

  return {
    bodyClassName: readAttr(bodyAttrs, "class") || undefined,
    bodyStyle: parseInlineStyle(readAttr(bodyAttrs, "style")),
    bodyHtml,
    headHtml: headWithoutScripts,
    scripts: [...headScripts, ...bodyScripts],
    styleBlocks,
    stylesheetLinks,
  };
}

function deriveBookingTargetFromHtml(html: string, fallbackTarget: PublicBookingTarget | null) {
  const ownerCalendarMatch = String(html || "").match(/\/book\/u\/([^"'?#/&\s]+)\/([^"'?#/&\s]+)/i);
  if (ownerCalendarMatch?.[1] && ownerCalendarMatch?.[2]) {
    const ownerId = decodeURIComponent(ownerCalendarMatch[1]);
    const calendarId = decodeURIComponent(ownerCalendarMatch[2]);
    return {
      kind: "calendar" as const,
      ownerId,
      calendarId,
      funnelId: fallbackTarget?.funnelId ?? null,
      pageId: fallbackTarget?.pageId ?? null,
      themeStage: fallbackTarget?.themeStage ?? null,
    };
  }

  const prettyCalendarMatch = String(html || "").match(/\/book\/([^"'?#/&\s]+)\/c\/([^"'?#/&\s]+)/i);
  if (prettyCalendarMatch?.[1]) {
    const slug = decodeURIComponent(prettyCalendarMatch[1]);
    if (fallbackTarget?.kind === "calendar") return fallbackTarget;
    return {
      kind: "slug" as const,
      slug,
      funnelId: fallbackTarget?.funnelId ?? null,
      pageId: fallbackTarget?.pageId ?? null,
      themeStage: fallbackTarget?.themeStage ?? null,
    };
  }

  return fallbackTarget;
}

function deriveBookingTargetFromHost(host: HTMLElement | null, fallbackTarget: PublicBookingTarget | null) {
  if (!host) return fallbackTarget;
  const ownerId = String(host.getAttribute("data-pa-booking-owner-id") || "").trim();
  const calendarId = String(host.getAttribute("data-pa-booking-calendar-id") || "").trim();
  const slug = String(host.getAttribute("data-pa-booking-slug") || "").trim();

  if (ownerId && calendarId) {
    return {
      kind: "calendar" as const,
      ownerId,
      calendarId,
      funnelId: fallbackTarget?.funnelId ?? null,
      pageId: fallbackTarget?.pageId ?? null,
      themeStage: fallbackTarget?.themeStage ?? null,
    };
  }

  if (slug) {
    return {
      kind: "slug" as const,
      slug,
      funnelId: fallbackTarget?.funnelId ?? null,
      pageId: fallbackTarget?.pageId ?? null,
      themeStage: fallbackTarget?.themeStage ?? null,
    };
  }

  return fallbackTarget;
}

function withBookingRuntimePlaceholder(input: {
  html: string;
  bookingTarget: PublicBookingTarget | null;
  injectImplicitBooking: boolean;
  bookingLabel?: string | null;
  surfaceContext?: BookingSurfaceContext | null;
}) {
  let html = String(input.html || "");
  if (!html.trim()) return html;

  const buildPlaceholderHtml = (slotName?: string | null) =>
    buildBookingRuntimePlaceholderHtml({
      ownerId: input.bookingTarget?.kind === "calendar" ? input.bookingTarget.ownerId : null,
      calendarId: input.bookingTarget?.kind === "calendar" ? input.bookingTarget.calendarId : null,
      slug: input.bookingTarget?.kind === "slug" ? input.bookingTarget.slug : null,
      slotName,
      surfaceContext: input.surfaceContext || null,
    });

  const placeholderHtml = buildPlaceholderHtml("primary");

  html = html.replace(/\{\{\s*(?:PURE_)?BOOKING_APP(?:\:([a-z0-9_-]+))?\s*\}\}/gi, (_match, slotName: string | undefined) => buildPlaceholderHtml(slotName || "primary"));
  if (html.includes("data-pa-booking-runtime=")) return html;

  if (input.bookingTarget && LEGACY_BOOKING_IFRAME_PATTERN.test(html)) {
    return html.replace(LEGACY_BOOKING_IFRAME_PATTERN, placeholderHtml);
  }

  if (!input.injectImplicitBooking || !input.bookingTarget) return html;

  const badgeHtml = input.bookingLabel
    ? `<div style="display:inline-flex;align-self:flex-start;max-width:100%;border:1px solid #bbf7d0;border-radius:999px;background:#f0fdf4;padding:6px 10px;font:600 11px/1.2 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#15803d;">Linked funnel calendar · ${escapeHtml(input.bookingLabel)}</div>`
    : "";
  const runtimeHtml = `${badgeHtml}${placeholderHtml}`;

  if (IMPLICIT_BOOKING_HEADING_PATTERN.test(html)) {
    return html.replace(IMPLICIT_BOOKING_HEADING_PATTERN, `$1${runtimeHtml}`);
  }

  const sectionHtml = [
    `<section data-pa-implicit-booking-runtime="1" style="margin:48px auto 0;max-width:960px;padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;">`,
    `<h2 style="margin:0;font:700 42px/1.1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">Book a time</h2>`,
    runtimeHtml,
    `</section>`,
  ].join("");

  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${sectionHtml}</main>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${sectionHtml}</body>`);
  return `${html}${sectionHtml}`;
}

const StaticHtmlSurface = memo(function StaticHtmlSurface({
  bodyClassName,
  bodyHtml,
  bodyStyle,
  containerRef,
}: {
  bodyClassName?: string;
  bodyHtml: string;
  bodyStyle?: CSSProperties;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={containerRef}
      data-pa-custom-html-surface="1"
      className={bodyClassName}
      style={bodyStyle}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
});

export function FunnelCustomHtmlRuntimeSurface({
  html,
  bookingTarget = null,
  surfaceContext = null,
  injectImplicitBooking = false,
  bookingLabel = null,
  className,
}: {
  html: string;
  bookingTarget?: PublicBookingTarget | null;
  surfaceContext?: BookingSurfaceContext | null;
  injectImplicitBooking?: boolean;
  bookingLabel?: string | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [portalHosts, setPortalHosts] = useState<HTMLElement[]>([]);

  const derivedBookingTarget = useMemo(
    () => deriveBookingTargetFromHtml(html, bookingTarget),
    [bookingTarget, html],
  );

  const normalizedHtml = useMemo(
    () =>
      repairMalformedBookingHeroMarkup(
        withBookingRuntimePlaceholder({
          html,
          bookingTarget: derivedBookingTarget,
          surfaceContext,
          injectImplicitBooking,
          bookingLabel,
        }),
      ),
    [bookingLabel, html, injectImplicitBooking, derivedBookingTarget, surfaceContext],
  );

  const parts = useMemo(() => parseHtmlParts(normalizedHtml), [normalizedHtml]);

  const resolvedPortalHosts = useMemo(
    () =>
      portalHosts
        .map((host, index) => ({
          host,
          index,
          slotName: readBookingRuntimeSlotNameFromElement(host),
          target: deriveBookingTargetFromHost(host, derivedBookingTarget),
          surfaceContext: mergeBookingSurfaceContext(surfaceContext, readBookingSurfaceContextFromElement(host)),
        }))
        .filter((entry) => Boolean(entry.target)),
    [derivedBookingTarget, portalHosts, surfaceContext],
  );

  useEffect(() => {
    const nextHosts = Array.from(containerRef.current?.querySelectorAll("[data-pa-booking-runtime]") || []).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    setPortalHosts(nextHosts);
  }, [parts.bodyHtml]);

  return (
    <div className={className}>
      {parts.stylesheetLinks.map((href, index) => (
        <link key={`booking_runtime_stylesheet_${index}`} rel="stylesheet" href={href} />
      ))}
      {parts.styleBlocks.map((css, index) => (
        <style key={`booking_runtime_style_${index}`} dangerouslySetInnerHTML={{ __html: css }} />
      ))}
      {parts.headHtml.trim() ? <div className="hidden" dangerouslySetInnerHTML={{ __html: parts.headHtml }} /> : null}
      <StaticHtmlSurface
        containerRef={containerRef}
        bodyClassName={parts.bodyClassName}
        bodyStyle={parts.bodyStyle}
        bodyHtml={parts.bodyHtml}
      />
      {resolvedPortalHosts.map(({ host, index, slotName, surfaceContext: hostSurfaceContext, target }) =>
        target
          ? createPortal(
              <PublicBookingClient
                target={target}
                showBranding={false}
                presentation="inline"
                surfaceContext={hostSurfaceContext}
              />,
              host,
              `booking_runtime_${slotName}_${index}`,
            )
          : null,
      )}
      {parts.scripts.map((script, index) =>
        script.src ? (
          <script
            key={`booking_runtime_script_${index}`}
            src={script.src}
            type={script.type}
            async={script.async}
            defer={script.defer}
            noModule={script.noModule}
          />
        ) : script.content ? (
          <script
            key={`booking_runtime_script_${index}`}
            type={script.type}
            async={script.async}
            defer={script.defer}
            noModule={script.noModule}
            dangerouslySetInnerHTML={{ __html: script.content }}
          />
        ) : null,
      )}
    </div>
  );
}