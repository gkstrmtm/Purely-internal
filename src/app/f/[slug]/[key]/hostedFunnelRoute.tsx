import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { resolveFunnelBookingCalendarId } from "@/lib/funnelBookingRouting";
import { readCreditFunnelTrackingSettings } from "@/lib/funnelEventTracking";
import { readFunnelOffers } from "@/lib/funnelOffers";
import { resolveFunnelBookingSurfaceContext } from "@/lib/funnelBookingSurface";
import { resolveFunnelPageRenderState } from "@/lib/funnelPageGraph";
import { publicKeyFromId } from "@/lib/publicHostedKeys";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { renderTextTemplate } from "@/lib/textTemplate";
import { getBusinessProfileTemplateVars } from "@/lib/businessProfileAiContext.server";
import { AiSparkIcon } from "@/components/AiSparkIcon";
import { FunnelCustomHtmlRuntimeSurface } from "@/components/funnel/FunnelCustomHtmlRuntimeSurface";
import { HostedFunnelTracker } from "@/components/funnel/HostedFunnelTracker";

type FunnelSeo = {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex?: boolean;
};

function readFunnelSeo(settingsJson: unknown, funnelId: string): FunnelSeo | null {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
  const raw = (settingsJson as any).funnelSeo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = (raw as any)[funnelId];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const title = typeof (row as any).title === "string" ? (row as any).title.trim().slice(0, 120) : "";
  const description = typeof (row as any).description === "string" ? (row as any).description.trim().slice(0, 300) : "";
  const imageUrl = typeof (row as any).imageUrl === "string" ? (row as any).imageUrl.trim().slice(0, 500) : "";
  const noIndex = (row as any).noIndex === true;
  const out: FunnelSeo = {};
  if (title) out.title = title;
  if (description) out.description = description;
  if (imageUrl) out.imageUrl = imageUrl;
  if (noIndex) out.noIndex = true;
  return Object.keys(out).length ? out : null;
}

function extractSeoFromCustomHtml(html: string): FunnelSeo {
  const h = String(html || "");
  const out: FunnelSeo = {};

  const titleMatch = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    const t = titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 120);
    if (t) out.title = t;
  }

  const meta = (nameOrProp: string) => {
    const re = new RegExp(
      `<meta\\s+[^>]*?(?:name|property)=["']${nameOrProp}["'][^>]*?content=["']([^"']+)["'][^>]*?>`,
      "i",
    );
    const m = h.match(re);
    return m?.[1] ? m[1].trim() : "";
  };

  const description = meta("description").slice(0, 300);
  if (description) out.description = description;

  const ogTitle = meta("og:title").slice(0, 120);
  if (ogTitle) out.title = ogTitle;

  const ogDescription = meta("og:description").slice(0, 300);
  if (ogDescription) out.description = ogDescription;

  const ogImage = meta("og:image").slice(0, 500);
  if (ogImage) out.imageUrl = ogImage;

  const robots = meta("robots");
  if (robots && /noindex/i.test(robots)) out.noIndex = true;

  return out;
}

function mergeSeo(base: FunnelSeo | null, override: FunnelSeo | null): FunnelSeo | null {
  const b = base || {};
  const o = override || {};
  const out: FunnelSeo = {
    ...(b.title ? { title: b.title } : {}),
    ...(b.description ? { description: b.description } : {}),
    ...(b.imageUrl ? { imageUrl: b.imageUrl } : {}),
    ...(b.noIndex ? { noIndex: true } : {}),
  };
  if (o.title) out.title = o.title;
  if (o.description) out.description = o.description;
  if (o.imageUrl) out.imageUrl = o.imageUrl;
  if (o.noIndex) out.noIndex = true;
  return Object.keys(out).length ? out : null;
}

function escapeInlineJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/<\/script/gi, "<\\/script");
}

function injectHostedRuntimeScripts(
  html: string,
  payload: {
    pageId: string;
    pageSlug: string;
    funnelId: string;
    funnelSlug: string;
    pixelId: string | null;
  },
) {
  const runtimePayload = escapeInlineJson(payload);
  const script = `<script>(function(){var p=${runtimePayload};var safe=function(v){return typeof v==="string"&&v.trim()?v.trim():null;};var params=new URLSearchParams((function(){try{return (window.top&&window.top.location&&window.top.location.search)||window.location.search||"";}catch(_){return window.location.search||"";}})());var ctx={pageId:p.pageId,funnelId:p.funnelId,funnelSlug:p.funnelSlug,pageSlug:p.pageSlug,path:(function(){try{return ((window.top&&window.top.location&&window.top.location.pathname)||window.location.pathname||"")+((window.top&&window.top.location&&window.top.location.search)||window.location.search||"");}catch(_){return (window.location.pathname||"")+(window.location.search||"");}})(),source:"hosted_funnel_html",sessionId:(function(){try{var k="pa_credit_funnel_session_id";var existing=window.sessionStorage.getItem(k);if(existing)return existing;var next=(window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2,10));window.sessionStorage.setItem(k,next);return next;}catch(_){return String(Date.now())+"-"+Math.random().toString(36).slice(2,10);}})(),referrer:safe(document.referrer),utmSource:safe(params.get("utm_source")),utmMedium:safe(params.get("utm_medium")),utmCampaign:safe(params.get("utm_campaign")),utmContent:safe(params.get("utm_content")),utmTerm:safe(params.get("utm_term"))};var emit=function(eventType,payload){try{var body=JSON.stringify({pageId:p.pageId,eventType:eventType,payload:payload||null,trackingContext:ctx});if(navigator.sendBeacon){navigator.sendBeacon("/api/public/funnel-builder/events",new Blob([body],{type:"application/json"}));}else{fetch("/api/public/funnel-builder/events",{method:"POST",headers:{"content-type":"application/json"},body:body,keepalive:true}).catch(function(){});}}catch(_){}};var readText=function(el){var value=safe(el&&el.getAttribute&&el.getAttribute("data-pa-cta-label"))||safe(el&&el.getAttribute&&el.getAttribute("aria-label"))||safe(el&&typeof el.value==="string"?el.value:"")||safe(el&&el.textContent||"");return value?value.slice(0,160):null;};var readHref=function(el){if(!el||String(el.tagName||"").toLowerCase()!=="a")return null;var href=safe(el.getAttribute("href")||"");return href?href.slice(0,500):null;};emit("page_view",null);if(p.pixelId){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');try{window.fbq('init',p.pixelId);window.fbq('track','PageView');}catch(_){}}document.addEventListener("click",function(event){var target=event&&event.target&&event.target.closest?event.target.closest("a[href],button,[role='button'],input[type='submit'],input[type='button'],[data-pa-track-cta]"):null;if(!target)return;if(target.getAttribute("data-pa-track-cta")==="false")return;if(target.getAttribute("aria-disabled")==="true")return;if(typeof target.disabled!=="undefined"&&target.disabled)return;var payload={label:readText(target),href:readHref(target),tagName:String(target.tagName||"").toLowerCase()||null};emit("cta_click",payload);if(p.pixelId&&window.fbq){try{window.fbq('trackCustom','CTAInteraction',payload);}catch(_){}}},true);})();</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${script}</html>`);
  return `${html}${script}`;
}

export async function fetchHostedFunnelRoute(slug: string, key: string, pageSlug?: string | null) {
  const s = String(slug || "").trim().toLowerCase();
  const k = String(key || "").trim();
  const requestedPageSlug = String(pageSlug || "").trim().toLowerCase();
  if (!s || !k) return null;

  const funnel = await prisma.creditFunnel
    .findFirst({
      where: { slug: s, id: { endsWith: k } },
      select: {
        id: true,
        ownerId: true,
        slug: true,
        pages: requestedPageSlug
          ? {
              where: { slug: { equals: requestedPageSlug, mode: "insensitive" } },
              take: 1,
              select: { id: true, slug: true, title: true, contentMarkdown: true, editorMode: true, blocksJson: true, customHtml: true },
            }
          : {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              take: 1,
              select: { id: true, slug: true, title: true, contentMarkdown: true, editorMode: true, blocksJson: true, customHtml: true },
            },
      },
    })
    .catch(() => null);

  if (!funnel) return null;
  if (publicKeyFromId(funnel.id, k.length) !== k) return null;

  const page = funnel.pages[0] || null;
  if (requestedPageSlug && !page) return null;

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: funnel.ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const seoSettings = readFunnelSeo(settings?.dataJson ?? null, funnel.id);
  const renderState = resolveFunnelPageRenderState(page, "published");
  const templateVars = funnel.ownerId ? await getBusinessProfileTemplateVars(funnel.ownerId).catch(() => ({})) : {};
  const renderedCustomHtml =
    renderState.kind === "html" && renderState.html
      ? renderTextTemplate(renderState.html, templateVars)
      : "";

  const seoFromCustomHtml = renderState.kind === "html" ? extractSeoFromCustomHtml(renderedCustomHtml || "") : null;
  const seo = mergeSeo(seoSettings, seoFromCustomHtml);
  const tracking = readCreditFunnelTrackingSettings(settings?.dataJson ?? null, funnel.id, page?.id ?? null);
  const bookingCalendars = funnel.ownerId
    ? await getBookingCalendarsConfig(funnel.ownerId).catch(() => ({ version: 1 as const, calendars: [] }))
    : { version: 1 as const, calendars: [] };
  const defaultBookingCalendarId = resolveFunnelBookingCalendarId(settings?.dataJson ?? null, funnel.id, bookingCalendars.calendars) || null;
  const offers = readFunnelOffers(settings?.dataJson ?? null, funnel.id);
  const renderedHtmlWithRuntime =
    renderState.kind === "html" && renderedCustomHtml
      ? injectHostedRuntimeScripts(renderedCustomHtml, {
          pageId: page?.id || "",
          pageSlug: page?.slug || "",
          funnelId: funnel.id,
          funnelSlug: funnel.slug,
          pixelId: tracking.resolvedPixelId,
        })
      : renderedCustomHtml;

  return { funnel, page, seo, renderedCustomHtml: renderedHtmlWithRuntime, renderState, tracking, defaultBookingCalendarId, offers };
}

export function buildHostedFunnelMetadata(
  loaded: NonNullable<Awaited<ReturnType<typeof fetchHostedFunnelRoute>>>,
  opts?: { key?: string | null; pageSlug?: string | null },
): Metadata {
  const { page, seo } = loaded;
  const title = seo?.title || page?.title || "";
  const description = seo?.description || "";
  const canonicalKey = String(opts?.key || publicKeyFromId(loaded.funnel.id) || "").trim();
  const canonicalPageSlug = String(opts?.pageSlug || "").trim();
  const canonicalPath = canonicalKey
    ? `/f/${encodeURIComponent(loaded.funnel.slug)}/${encodeURIComponent(canonicalKey)}${canonicalPageSlug ? `/${encodeURIComponent(canonicalPageSlug)}` : ""}`
    : null;
  const canonicalUrl = canonicalPath ? toPurelyHostedUrl(canonicalPath) : null;

  return {
    title: title || undefined,
    description: description || undefined,
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph:
      seo?.imageUrl || canonicalUrl
        ? {
            title: title || undefined,
            description: description || undefined,
            ...(canonicalUrl ? { url: canonicalUrl } : {}),
            ...(seo?.imageUrl ? { images: [{ url: seo.imageUrl }] } : {}),
          }
        : undefined,
    robots: seo?.noIndex ? { index: false, follow: true } : undefined,
  };
}

export async function renderHostedFunnelRoute(opts: {
  loaded: NonNullable<Awaited<ReturnType<typeof fetchHostedFunnelRoute>>>;
  slug: string;
  key: string;
}) {
  const { loaded, slug, key } = opts;
  const s = String(slug || "").trim().toLowerCase();
  const k = String(key || "").trim();
  const { funnel, page, renderedCustomHtml, renderState, tracking, defaultBookingCalendarId, offers } = loaded;
  const markdownBlocks = renderState.kind === "markdown" ? parseBlogContent(renderState.markdown) : [];

  const billingModel = funnel.ownerId
    ? await getPortalBillingModelForOwner({ ownerId: funnel.ownerId, portalVariant: "portal" }).catch(() => "subscription" as const)
    : "subscription";
  const showWatermark = isCreditsOnlyBilling(billingModel);

  return (
    <main className="w-full min-h-screen">
      {page && renderState.kind !== "html" ? (
        <HostedFunnelTracker
          pageId={page.id}
          pageSlug={page.slug}
          funnelId={funnel.id}
          funnelSlug={funnel.slug}
          pixelId={tracking.resolvedPixelId}
        />
      ) : null}
      {page ? (
        <>
          {renderState.kind === "html" ? (
            <FunnelCustomHtmlRuntimeSurface
              html={renderedCustomHtml || ""}
              bookingTarget={defaultBookingCalendarId
                ? {
                    kind: "calendar",
                    ownerId: funnel.ownerId,
                    calendarId: defaultBookingCalendarId,
                    funnelId: funnel.id,
                    pageId: page.id,
                    themeStage: "published",
                  }
                : null}
              surfaceContext={resolveFunnelBookingSurfaceContext({
                posture: "published",
                routeKind: defaultBookingCalendarId ? "funnel-default" : "placeholder",
                pageTitle: page.title,
                calendarTitle: defaultBookingCalendarId || null,
                pageIntent: "brief" in page ? page.brief || null : null,
              })}
              injectImplicitBooking={Boolean(defaultBookingCalendarId)}
              className="min-h-screen w-full bg-white"
            />
          ) : renderState.kind === "blocks" ? (
            <div>
              {renderCreditFunnelBlocks({
                blocks: renderState.blocks,
                basePath: "",
                context: {
                  bookingOwnerId: funnel.ownerId,
                  defaultBookingCalendarId: defaultBookingCalendarId || undefined,
                  funnelId: funnel.id,
                  funnelPageId: page.id,
                  bookingThemeStage: "published",
                  funnelSlug: s,
                  funnelPathBase: `/f/${encodeURIComponent(s)}/${encodeURIComponent(k)}`,
                  funnelPageSlug: page.slug,
                  bookingSurfacePageTitle: page.title,
                  bookingSurfacePageIntent: "brief" in page ? page.brief || null : null,
                  metaPixelId: tracking.resolvedPixelId,
                  offers,
                },
              })}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl p-8">
              <div className="prose prose-zinc max-w-none">
                {markdownBlocks.map((b, idx) => {
                  if (b.type === "h2") {
                    return (
                      <h2 key={idx} className="pt-4 text-xl font-bold text-zinc-900">
                        <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
                      </h2>
                    );
                  }
                  if (b.type === "h3") {
                    return (
                      <h3 key={idx} className="pt-2 text-lg font-bold text-zinc-900">
                        <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
                      </h3>
                    );
                  }
                  if (b.type === "p") {
                    return (
                      <p key={idx} className="text-base leading-relaxed text-zinc-700">
                        <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
                      </p>
                    );
                  }
                  if (b.type === "ul") {
                    return (
                      <ul key={idx} className="list-disc space-y-1 pl-6 text-zinc-700">
                        {b.items.map((item, j) => (
                          <li key={j}>
                            <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(item) }} />
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  if (b.type === "img") {
                    return (
                      <div key={idx} className="overflow-hidden rounded-2xl border border-zinc-200">
                        <img src={b.src} alt={b.alt} className="h-auto w-full" />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mx-auto w-full max-w-3xl p-8">
          <p className="text-sm text-zinc-700">No pages yet for this funnel.</p>
        </div>
      )}

      {showWatermark ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4">
          <a
            href="https://purelyautomation.com"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/75 px-3 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm backdrop-blur hover:bg-white hover:text-zinc-900"
          >
            <AiSparkIcon className="h-3.5 w-3.5 text-(--color-brand-blue)" />
            Powered by Purely Automation
          </a>
        </div>
      ) : null}
    </main>
  );
}