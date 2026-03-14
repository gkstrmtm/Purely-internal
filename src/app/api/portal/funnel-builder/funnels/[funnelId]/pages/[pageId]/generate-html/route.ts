import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n<!-- truncated -->";
}

function extractHtml(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```html\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence?.[1]) return anyFence[1].trim();

  return text;
}

function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : "";
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function extractAiQuestion(raw: string): string | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const q = typeof (parsed as any).question === "string" ? String((parsed as any).question).trim() : "";
  if (!q) return null;
  return q.slice(0, 800);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function escapeHtmlAttr(s: string) {
  return escapeHtml(String(s || "").replace(/'/g, "&#039;"));
}

function styleToCss(style: any): string {
  const s = style && typeof style === "object" ? (style as any) : null;
  if (!s) return "";

  const out: string[] = [];

  const push = (k: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined) return;
    const val = typeof v === "number" ? String(v) : String(v).trim();
    if (!val) return;
    out.push(`${k}:${val}`);
  };

  push("color", s.textColor);
  push("background-color", s.backgroundColor);
  if (typeof s.fontSizePx === "number" && Number.isFinite(s.fontSizePx) && s.fontSizePx > 0) {
    push("font-size", `${Math.round(s.fontSizePx)}px`);
  }
  if (typeof s.fontFamily === "string" && s.fontFamily.trim()) {
    push("font-family", s.fontFamily.trim());
  }
  if (typeof s.align === "string" && (s.align === "left" || s.align === "center" || s.align === "right")) {
    push("text-align", s.align);
  }
  if (typeof s.marginTopPx === "number" && Number.isFinite(s.marginTopPx)) push("margin-top", `${Math.round(s.marginTopPx)}px`);
  if (typeof s.marginBottomPx === "number" && Number.isFinite(s.marginBottomPx)) push("margin-bottom", `${Math.round(s.marginBottomPx)}px`);
  if (typeof s.paddingPx === "number" && Number.isFinite(s.paddingPx)) push("padding", `${Math.round(s.paddingPx)}px`);
  if (typeof s.borderRadiusPx === "number" && Number.isFinite(s.borderRadiusPx)) push("border-radius", `${Math.round(s.borderRadiusPx)}px`);

  const borderWidth =
    typeof s.borderWidthPx === "number" && Number.isFinite(s.borderWidthPx)
      ? s.borderWidthPx
      : s.borderColor
        ? 1
        : null;
  if (borderWidth !== null) {
    push("border", `${Math.max(0, Math.round(borderWidth))}px solid ${String(s.borderColor || "currentColor")}`);
  }

  if (typeof s.maxWidthPx === "number" && Number.isFinite(s.maxWidthPx) && s.maxWidthPx > 0) {
    push("max-width", `${Math.round(s.maxWidthPx)}px`);
    if (s.align === "center") {
      push("margin-left", "auto");
      push("margin-right", "auto");
    }
  }

  if (typeof s.backgroundImageUrl === "string" && s.backgroundImageUrl.trim()) {
    const url = s.backgroundImageUrl.trim().replace(/\"/g, "\\\"");
    push("background-image", `url(\"${url}\")`);
    push("background-size", "cover");
    push("background-position", "center");
    push("background-repeat", "no-repeat");
  }

  return out.join(";");
}

function coerceBlockChildren(raw: unknown): CreditFunnelBlock[] {
  return Array.isArray(raw) ? (raw as CreditFunnelBlock[]).filter(Boolean) : [];
}

function blocksToCustomHtmlDocument(opts: {
  blocks: CreditFunnelBlock[];
  pageId: string;
  ownerId: string;
  basePath: string;
  title: string;
}): string {
  const blocks = Array.isArray(opts.blocks) ? opts.blocks : [];

  const hasCartFeatures = (() => {
    const walk = (arr: CreditFunnelBlock[]): boolean => {
      for (const b of arr) {
        if (!b || typeof b !== "object") continue;
        if (b.type === "addToCartButton" || b.type === "salesCheckoutButton" || b.type === "cartButton") return true;
        if (b.type === "section") {
          const p: any = b.props as any;
          if (walk(coerceBlockChildren(p?.children))) return true;
          if (walk(coerceBlockChildren(p?.leftChildren))) return true;
          if (walk(coerceBlockChildren(p?.rightChildren))) return true;
        }
        if (b.type === "columns") {
          const cols: any[] = Array.isArray((b.props as any)?.columns) ? ((b.props as any).columns as any[]) : [];
          for (const c of cols) {
            if (c && walk(coerceBlockChildren((c as any).children))) return true;
          }
        }
      }
      return false;
    };
    return walk(blocks);
  })();

  const css = [
    ":root{--pa-blue:#2563eb;--pa-ink:#0f172a;--pa-muted:#475569;--pa-border:#e2e8f0;--pa-bg:#ffffff;}",
    "*{box-sizing:border-box;}",
    "html,body{height:100%;}",
    "body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.5;color:var(--pa-ink);background:var(--pa-bg);}",
    "a{color:inherit;}",
    ".pa-container{max-width:1040px;margin:0 auto;padding:40px 20px;}",
    ".pa-header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--pa-border);}",
    ".pa-header-inner{max-width:1040px;margin:0 auto;padding:14px 20px;display:flex;gap:14px;align-items:center;justify-content:space-between;}",
    ".pa-nav{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-weight:600;font-size:14px;}",
    ".pa-section{padding:40px 0;border-bottom:1px solid rgba(226,232,240,.6);}",
    ".pa-h1{font-size:40px;line-height:1.1;margin:0 0 12px 0;letter-spacing:-0.02em;}",
    ".pa-h2{font-size:28px;line-height:1.2;margin:0 0 10px 0;letter-spacing:-0.01em;}",
    ".pa-h3{font-size:20px;line-height:1.25;margin:0 0 8px 0;}",
    ".pa-p{margin:0 0 14px 0;color:var(--pa-muted);}",
    ".pa-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:14px;padding:12px 16px;font-weight:700;font-size:14px;text-decoration:none;border:1px solid var(--pa-border);background:#fff;color:var(--pa-ink);cursor:pointer;}",
    ".pa-btn-primary{background:var(--pa-blue);border-color:var(--pa-blue);color:#fff;}",
    ".pa-btn-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}",
    ".pa-img{width:100%;height:auto;border-radius:16px;border:1px solid var(--pa-border);background:#fff;}",
    ".pa-card{border:1px solid var(--pa-border);border-radius:18px;padding:18px;background:#fff;}",
    ".pa-grid{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:18px;}",
    "@media (max-width: 760px){.pa-grid{grid-template-columns:1fr !important;}.pa-h1{font-size:32px;}}",
  ].join("\n");

  const renderTextOrHtml = (text: string, html?: string): string => {
    const safeHtml = typeof html === "string" ? html.trim() : "";
    if (safeHtml) return safeHtml;
    return escapeHtml(String(text || ""));
  };

  const renderBlock = (b: CreditFunnelBlock): string => {
    if (!b || typeof b !== "object") return "";

    if (b.type === "page") {
      const cssInline = styleToCss((b.props as any)?.style);
      return cssInline ? `<div style=\"${escapeHtmlAttr(cssInline)}\"></div>` : "";
    }

    if (b.type === "headerNav") {
      const items: any[] = Array.isArray((b.props as any)?.items) ? ((b.props as any).items as any[]) : [];
      const logoUrl = typeof (b.props as any)?.logoUrl === "string" ? String((b.props as any).logoUrl).trim() : "";
      const logoAlt = typeof (b.props as any)?.logoAlt === "string" ? String((b.props as any).logoAlt).trim() : "";
      const logoHref = typeof (b.props as any)?.logoHref === "string" ? String((b.props as any).logoHref).trim() : "";
      const links = items
        .map((it) => {
          if (!it || typeof it !== "object") return "";
          const label = typeof (it as any).label === "string" ? String((it as any).label).trim() : "";
          const href = typeof (it as any).url === "string" ? String((it as any).url).trim() : "";
          if (!label || !href) return "";
          return `<a href=\"${escapeHtmlAttr(href)}\">${escapeHtml(label)}</a>`;
        })
        .filter(Boolean)
        .join("\n");

      const logo = logoUrl
        ? `<a href=\"${escapeHtmlAttr(logoHref || "/")}\" style=\"display:inline-flex;align-items:center;gap:10px;text-decoration:none\"><img src=\"${escapeHtmlAttr(logoUrl)}\" alt=\"${escapeHtmlAttr(logoAlt || "Logo")}\" style=\"height:28px;width:auto\" /></a>`
        : `<a href=\"${escapeHtmlAttr(logoHref || "/")}\" style=\"font-weight:900;text-decoration:none\">${escapeHtml(opts.title || "")}</a>`;

      return `<div class=\"pa-header\"><div class=\"pa-header-inner\">${logo}<nav class=\"pa-nav\">${links}</nav></div></div>`;
    }

    if (b.type === "anchor") {
      const anchorId = typeof (b.props as any)?.anchorId === "string" ? String((b.props as any).anchorId).trim() : "";
      const cssInline = styleToCss((b.props as any)?.style);
      const attrs = [anchorId ? `id=\"${escapeHtmlAttr(anchorId)}\"` : "", cssInline ? `style=\"${escapeHtmlAttr(cssInline)}\"` : ""]
        .filter(Boolean)
        .join(" ");
      return `<div ${attrs}></div>`;
    }

    if (b.type === "heading") {
      const level = (b.props as any)?.level === 1 || (b.props as any)?.level === 2 || (b.props as any)?.level === 3 ? (b.props as any).level : 2;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const cls = level === 1 ? "pa-h1" : level === 2 ? "pa-h2" : "pa-h3";
      const cssInline = styleToCss((b.props as any)?.style);
      const content = renderTextOrHtml(String((b.props as any)?.text || ""), (b.props as any)?.html);
      return `<${tag} class=\"${cls}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${content}</${tag}>`;
    }

    if (b.type === "paragraph") {
      const cssInline = styleToCss((b.props as any)?.style);
      const content = renderTextOrHtml(String((b.props as any)?.text || ""), (b.props as any)?.html);
      return `<p class=\"pa-p\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${content}</p>`;
    }

    if (b.type === "button") {
      const href = typeof (b.props as any)?.href === "string" ? String((b.props as any).href).trim() : "#";
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Click";
      const variant = (b.props as any)?.variant === "secondary" ? "secondary" : "primary";
      const cssInline = styleToCss((b.props as any)?.style);
      const cls = variant === "secondary" ? "pa-btn" : "pa-btn pa-btn-primary";
      return `<a class=\"${cls}\" href=\"${escapeHtmlAttr(href)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</a>`;
    }

    if (b.type === "image") {
      const src = typeof (b.props as any)?.src === "string" ? String((b.props as any).src).trim() : "";
      const alt = typeof (b.props as any)?.alt === "string" ? String((b.props as any).alt) : "";
      if (!src) return "";
      const cssInline = styleToCss((b.props as any)?.style);
      const frame = (b.props as any)?.showFrame !== false;
      const cls = frame ? "pa-img" : "";
      return `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><img class=\"${cls}\" src=\"${escapeHtmlAttr(src)}\" alt=\"${escapeHtmlAttr(alt)}\" /></div>`;
    }

    if (b.type === "video") {
      const src = typeof (b.props as any)?.src === "string" ? String((b.props as any).src).trim() : "";
      if (!src) return "";
      const poster = typeof (b.props as any)?.posterUrl === "string" ? String((b.props as any).posterUrl).trim() : "";
      const controls = (b.props as any)?.controls !== false;
      const autoplay = Boolean((b.props as any)?.autoplay);
      const loop = Boolean((b.props as any)?.loop);
      const muted = Boolean((b.props as any)?.muted);
      const cssInline = styleToCss((b.props as any)?.style);
      return `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><video src=\"${escapeHtmlAttr(src)}\" ${poster ? `poster=\"${escapeHtmlAttr(poster)}\"` : ""} ${controls ? "controls" : ""} ${autoplay ? "autoplay" : ""} ${loop ? "loop" : ""} ${muted ? "muted" : ""} playsinline style=\"width:100%;border-radius:16px;border:1px solid var(--pa-border);background:#fff\"></video></div>`;
    }

    if (b.type === "spacer") {
      const h = typeof (b.props as any)?.height === "number" && Number.isFinite((b.props as any).height) ? Math.max(0, Math.round((b.props as any).height)) : 24;
      const cssInline = styleToCss((b.props as any)?.style);
      return `<div style=\"height:${h}px;${cssInline ? escapeHtmlAttr(cssInline) : ""}\"></div>`;
    }

    if (b.type === "formLink") {
      const formSlug = typeof (b.props as any)?.formSlug === "string" ? String((b.props as any).formSlug).trim() : "";
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text).trim() : "Open form";
      const cssInline = styleToCss((b.props as any)?.style);
      const href = `${opts.basePath}/forms/${encodeURIComponent(formSlug)}`;
      return `<a class=\"pa-btn pa-btn-primary\" href=\"${escapeHtmlAttr(href)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</a>`;
    }

    if (b.type === "formEmbed") {
      const formSlug = typeof (b.props as any)?.formSlug === "string" ? String((b.props as any).formSlug).trim() : "";
      const height = typeof (b.props as any)?.height === "number" && Number.isFinite((b.props as any).height) ? Math.max(120, Math.min(2000, Math.round((b.props as any).height))) : 760;
      const cssInline = styleToCss((b.props as any)?.style);
      if (!formSlug) return "";
      const src = `${opts.basePath}/forms/${encodeURIComponent(formSlug)}?embed=1`;
      return `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><iframe title=\"Form\" src=\"${escapeHtmlAttr(src)}\" style=\"width:100%;height:${height}px;border:1px solid var(--pa-border);border-radius:16px;background:#fff\" sandbox=\"allow-forms allow-scripts allow-same-origin\"></iframe></div>`;
    }

    if (b.type === "calendarEmbed") {
      const calendarId = typeof (b.props as any)?.calendarId === "string" ? String((b.props as any).calendarId).trim() : "";
      const height = typeof (b.props as any)?.height === "number" && Number.isFinite((b.props as any).height) ? Math.max(120, Math.min(2000, Math.round((b.props as any).height))) : 760;
      const cssInline = styleToCss((b.props as any)?.style);
      if (!calendarId || !opts.ownerId) return "";
      const src = `/book/u/${encodeURIComponent(opts.ownerId)}/${encodeURIComponent(calendarId)}`;
      return `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><iframe title=\"Booking\" src=\"${escapeHtmlAttr(src)}\" style=\"width:100%;height:${height}px;border:1px solid var(--pa-border);border-radius:16px;background:#fff\" sandbox=\"allow-forms allow-scripts allow-same-origin\"></iframe></div>`;
    }

    if (b.type === "columns") {
      const cols: any[] = Array.isArray((b.props as any)?.columns) ? ((b.props as any).columns as any[]) : [];
      const gapPx = typeof (b.props as any)?.gapPx === "number" && Number.isFinite((b.props as any).gapPx) ? Math.max(0, Math.min(120, Math.round((b.props as any).gapPx))) : 24;
      const count = Math.max(1, Math.min(6, cols.length || 2));
      const cssInline = styleToCss((b.props as any)?.style);
      const inner = cols.slice(0, count).map((c) => {
        const colStyle = styleToCss((c as any)?.style);
        const children = coerceBlockChildren((c as any)?.children);
        const html = children.length ? children.map(renderBlock).join("\n") : "";
        return `<div${colStyle ? ` style=\"${escapeHtmlAttr(colStyle)}\"` : ""}>${html}</div>`;
      });
      return `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><div class=\"pa-grid\" style=\"--cols:${count};gap:${gapPx}px\">${inner.join("\n")}</div></div>`;
    }

    if (b.type === "section") {
      const p: any = b.props as any;
      const anchorId = typeof p?.anchorId === "string" ? String(p.anchorId).trim() : "";
      const cssInline = styleToCss(p?.style);
      const children = coerceBlockChildren(p?.children);
      const leftChildren = coerceBlockChildren(p?.leftChildren);
      const rightChildren = coerceBlockChildren(p?.rightChildren);
      const layout = p?.layout === "two" ? "two" : "one";

      const inner = (() => {
        if (layout === "two") {
          const gapPx = typeof p?.gapPx === "number" && Number.isFinite(p.gapPx) ? Math.max(0, Math.min(120, Math.round(p.gapPx))) : 24;
          const leftHtml = leftChildren.map(renderBlock).join("\n");
          const rightHtml = rightChildren.map(renderBlock).join("\n");
          return `<div class=\"pa-grid\" style=\"--cols:2;gap:${gapPx}px\"><div>${leftHtml}</div><div>${rightHtml}</div></div>`;
        }
        return children.map(renderBlock).join("\n");
      })();

      const attrs = [
        "class=\"pa-section\"",
        anchorId ? `id=\"${escapeHtmlAttr(anchorId)}\"` : "",
        cssInline ? `style=\"${escapeHtmlAttr(cssInline)}\"` : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `<section ${attrs}>${inner}</section>`;
    }

    if (b.type === "addToCartButton") {
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Add to cart";
      const priceId = typeof (b.props as any)?.priceId === "string" ? String((b.props as any).priceId).trim() : "";
      const quantity = typeof (b.props as any)?.quantity === "number" && Number.isFinite((b.props as any).quantity) ? Math.max(1, Math.min(20, Math.round((b.props as any).quantity))) : 1;
      const productName = typeof (b.props as any)?.productName === "string" ? String((b.props as any).productName).trim() : "";
      const productDescription = typeof (b.props as any)?.productDescription === "string" ? String((b.props as any).productDescription).trim() : "";
      const cssInline = styleToCss((b.props as any)?.style);
      if (!priceId) return "";
      return `<button type=\"button\" class=\"pa-btn\" data-pa-action=\"add\" data-pa-price-id=\"${escapeHtmlAttr(priceId)}\" data-pa-qty=\"${quantity}\" data-pa-name=\"${escapeHtmlAttr(productName)}\" data-pa-desc=\"${escapeHtmlAttr(productDescription)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</button>`;
    }

    if (b.type === "salesCheckoutButton") {
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Buy now";
      const priceId = typeof (b.props as any)?.priceId === "string" ? String((b.props as any).priceId).trim() : "";
      const quantity = typeof (b.props as any)?.quantity === "number" && Number.isFinite((b.props as any).quantity) ? Math.max(1, Math.min(20, Math.round((b.props as any).quantity))) : 1;
      const productName = typeof (b.props as any)?.productName === "string" ? String((b.props as any).productName).trim() : "";
      const productDescription = typeof (b.props as any)?.productDescription === "string" ? String((b.props as any).productDescription).trim() : "";
      const cssInline = styleToCss((b.props as any)?.style);
      if (!priceId) return "";
      return `<button type=\"button\" class=\"pa-btn pa-btn-primary\" data-pa-action=\"buy\" data-pa-price-id=\"${escapeHtmlAttr(priceId)}\" data-pa-qty=\"${quantity}\" data-pa-name=\"${escapeHtmlAttr(productName)}\" data-pa-desc=\"${escapeHtmlAttr(productDescription)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</button>`;
    }

    if (b.type === "cartButton") {
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Cart";
      const cssInline = styleToCss((b.props as any)?.style);
      return `<button type=\"button\" class=\"pa-btn\" data-pa-action=\"cart\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)} <span data-pa-cart-count style=\"opacity:.7;font-weight:800\"></span></button>`;
    }

    if (b.type === "chatbot") {
      // Custom HTML export cannot reliably embed the full widget without React.
      const cssInline = styleToCss((b.props as any)?.style);
      return `<div class=\"pa-card\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><div style=\"font-weight:800\">Chatbot</div><div style=\"margin-top:6px;color:var(--pa-muted);font-size:14px\">This page was generated from blocks. The chatbot runs in blocks mode; you can replace this with your own embed in custom code.</div></div>`;
    }

    if (b.type === "customCode") {
      const html = typeof (b.props as any)?.html === "string" ? String((b.props as any).html) : "";
      const cssInline = styleToCss((b.props as any)?.style);
      if (!html.trim()) return "";
      // Inline custom code directly (best-effort).
      return `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${html}</div>`;
    }

    return "";
  };

  const bodyInner = blocks
    .filter((b) => b && typeof b === "object" && (b as any).type !== "page")
    .map(renderBlock)
    .filter(Boolean)
    .join("\n");

  const cartScript = hasCartFeatures
    ? `
<script>
(() => {
  const PAGE_ID = ${JSON.stringify(String(opts.pageId || "").slice(0, 64))};
  const KEY = "pa_cart_" + PAGE_ID;

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const parse = (s) => {
    try { return JSON.parse(String(s || "")) } catch { return null }
  };
  const readCart = () => {
    const raw = sessionStorage.getItem(KEY);
    const parsed = parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return { items: items.filter(Boolean).slice(0, 25) };
  };
  const writeCart = (cart) => {
    sessionStorage.setItem(KEY, JSON.stringify({ items: Array.isArray(cart?.items) ? cart.items.slice(0, 25) : [] }));
  };
  const countCart = (cart) => (cart.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const updateCount = () => {
    const cart = readCart();
    const count = countCart(cart);
    document.querySelectorAll('[data-pa-cart-count]').forEach((el) => {
      el.textContent = count ? "(" + count + ")" : "";
    });
  };

  const ensureModal = () => {
    let root = document.getElementById('pa-cart-modal');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'pa-cart-modal';
    root.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.55);z-index:9999;padding:18px;';
    root.innerHTML =
      '<div style="width:min(720px,100%);background:#fff;border-radius:18px;border:1px solid rgba(226,232,240,.8);box-shadow:0 20px 60px rgba(2,6,23,.25);overflow:hidden">' +
        '<div style="padding:14px 16px;border-bottom:1px solid rgba(226,232,240,.8);display:flex;justify-content:space-between;align-items:center;gap:10px">' +
          '<div style="font-weight:900">Cart</div>' +
          '<button type="button" data-pa-close class="pa-btn" style="padding:8px 12px;border-radius:12px">Close</button>' +
        '</div>' +
        '<div style="padding:16px" data-pa-cart-body></div>' +
        '<div style="padding:16px;border-top:1px solid rgba(226,232,240,.8);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">' +
          '<button type="button" class="pa-btn" data-pa-clear>Clear</button>' +
          '<button type="button" class="pa-btn pa-btn-primary" data-pa-checkout>Checkout</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener('click', (e) => {
      if (e.target === root) root.style.display = 'none';
    });
    root.querySelector('[data-pa-close]')?.addEventListener('click', () => (root.style.display = 'none'));
    root.querySelector('[data-pa-clear]')?.addEventListener('click', () => {
      writeCart({ items: [] });
      renderModal();
      updateCount();
    });
    root.querySelector('[data-pa-checkout]')?.addEventListener('click', () => void checkoutCart());

    return root;
  };

  const renderModal = () => {
    const root = ensureModal();
    const body = root.querySelector('[data-pa-cart-body]');
    if (!body) return;
    const cart = readCart();
    if (!cart.items.length) {
      body.innerHTML = '<div style="color:var(--pa-muted)">Your cart is empty.</div>';
      return;
    }
    body.innerHTML = cart.items.map((it, idx) => {
      const name = esc(it && it.name ? it.name : 'Item');
      const desc = esc(it && it.desc ? it.desc : '');
      const qty = Math.max(1, Math.min(20, Number(it && it.quantity ? it.quantity : 1) || 1));
      const border = idx ? 'border-top:1px solid rgba(226,232,240,.7);' : '';
      return (
        '<div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:12px 0;' + border + '">' +
          '<div style="min-width:0">' +
            '<div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + name + '</div>' +
            (desc ? '<div style="margin-top:4px;color:var(--pa-muted);font-size:13px">' + desc + '</div>' : '') +
          '</div>' +
          '<div style="font-weight:800">x' + qty + '</div>' +
        '</div>'
      );
    }).join('');
  };

  const openCart = () => {
    const root = ensureModal();
    renderModal();
    root.style.display = 'flex';
  };

  const startCheckout = async (payload) => {
    const res = await fetch('/api/public/funnel-builder/checkout-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (!res || !json || json.ok !== true || !json.url) {
      const msg = json && json.error ? String(json.error) : 'Unable to start checkout';
      throw new Error(msg);
    }
    const url = String(json.url);
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) window.location.href = url;
  };

  const checkoutCart = async () => {
    const cart = readCart();
    if (!cart.items.length) return;
    await startCheckout({ pageId: PAGE_ID, items: cart.items.map((it) => ({ priceId: it.priceId, quantity: it.quantity })) });
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !(t instanceof HTMLElement)) return;
    const btn = t.closest('[data-pa-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-pa-action') || '';

    if (action === 'cart') {
      e.preventDefault();
      openCart();
      return;
    }

    const priceId = btn.getAttribute('data-pa-price-id') || '';
    const qty = Math.max(1, Math.min(20, Number(btn.getAttribute('data-pa-qty') || '1') || 1));
    const name = btn.getAttribute('data-pa-name') || '';
    const desc = btn.getAttribute('data-pa-desc') || '';
    if (!priceId) return;

    if (action === 'add') {
      e.preventDefault();
      const cart = readCart();
      const existing = cart.items.find((it) => String(it.priceId) === priceId);
      if (existing) existing.quantity = Math.max(1, Math.min(20, Number(existing.quantity || 1) + qty));
      else cart.items.push({ priceId, quantity: qty, name, desc });
      writeCart(cart);
      updateCount();
      return;
    }

    if (action === 'buy') {
      e.preventDefault();
      startCheckout({ pageId: PAGE_ID, priceId, quantity: qty }).catch((err) => alert(err?.message || 'Unable to start checkout'));
      return;
    }
  });

  updateCount();
})();
</script>
`
    : "";

  const title = String(opts.title || "Funnel page").trim().slice(0, 80) || "Funnel page";
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${css}</style></head><body><div class="pa-container">${bodyInner}</div>${cartScript}</body></html>`;
}

function pickRandom<T>(items: T[]): T {
  if (!Array.isArray(items) || items.length === 0) throw new Error("pickRandom called with empty array");
  return items[Math.floor(Math.random() * items.length)]!;
}

function normalizePortalHostedPaths(html: string): string {
  let out = String(html || "");
  if (!out) return out;

  // Public funnels/forms/booking should never be under /portal on hosted pages.
  out = out
    .replace(/\b\/portal\/forms\//gi, "/forms/")
    .replace(/\b\/portal\/f\//gi, "/f/")
    .replace(/\b\/portal\/book\//gi, "/book/")
    .replace(/\b\/api\/public\/portal\//gi, "/api/public/");

  return out;
}

function newBlockId(prefix = "b"): string {
  const g: any = globalThis as any;
  const uuid = typeof g.crypto?.randomUUID === "function" ? String(g.crypto.randomUUID()) : "";
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function detectInteractiveIntent(text: string): {
  wantsShop: boolean;
  wantsCart: boolean;
  wantsCheckout: boolean;
  wantsCalendar: boolean;
  wantsChatbot: boolean;
  any: boolean;
} {
  const s = String(text || "").toLowerCase();
  const wantsShop = /\b(shop|store|product|products|pricing|buy now|buy\b)/.test(s);
  const wantsCart = /\b(cart|add to cart)\b/.test(s);
  const wantsCheckout = /\b(checkout|purchase|pay now)\b/.test(s);
  const wantsCalendar = /\b(calendar|schedule|booking|book a call|book a meeting|appointment)\b/.test(s);
  const wantsChatbot = /\b(chatbot|chat bot|live chat|website chat)\b/.test(s);
  const any = wantsShop || wantsCart || wantsCheckout || wantsCalendar || wantsChatbot;
  return { wantsShop, wantsCart, wantsCheckout, wantsCalendar, wantsChatbot, any };
}

function normalizeAgentId(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  const cleaned = s.slice(0, 120);
  if (!cleaned.startsWith("agent_")) return "";
  return cleaned;
}

async function getOwnerChatAgentIds(ownerId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    const clean = normalizeAgentId(id);
    if (!clean) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const receptionist = await getAiReceptionistServiceData(ownerId).catch(() => null);
  if (receptionist) {
    push(receptionist.settings.chatAgentId);
  }

  const campaigns = await prisma.portalAiOutboundCallCampaign
    .findMany({
      where: { ownerId },
      select: { chatAgentId: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    })
    .catch(() => [] as Array<{ chatAgentId: string | null }>);

  for (const c of campaigns) {
    if (c?.chatAgentId) push(c.chatAgentId);
  }

  return out.slice(0, 50);
}

function buildInteractiveBlocks(opts: {
  funnelName: string;
  pageTitle: string;
  ownerId: string;
  stripeProducts: Array<{
    id: string;
    name: string;
    description: string | null;
    images: string[];
    defaultPriceId: string;
    unitAmount: number | null;
    currency: string;
  }>;
  calendarId?: string;
  chatAgentId?: string;
  intent: ReturnType<typeof detectInteractiveIntent>;
}): CreditFunnelBlock[] {
  const blocks: CreditFunnelBlock[] = [];

  blocks.push({ id: newBlockId("page"), type: "page", props: {} });

  blocks.push({
    id: newBlockId("header"),
    type: "headerNav",
    props: {
      sticky: true,
      transparent: false,
      items: [],
    },
  });

  blocks.push({
    id: newBlockId("hero"),
    type: "section",
    props: {
      children: [
        {
          id: newBlockId("h1"),
          type: "heading",
          props: { text: opts.pageTitle || opts.funnelName || "Welcome", level: 1 },
        },
        {
          id: newBlockId("p"),
          type: "paragraph",
          props: {
            text:
              "Explore what we offer below. Add items to your cart, checkout securely, or book a time to talk — all on this page.",
          },
        },
        {
          id: newBlockId("cart"),
          type: "cartButton",
          props: { text: "Cart" },
        },
      ],
    },
  });

  if (opts.intent.wantsShop || opts.intent.wantsCart || opts.intent.wantsCheckout) {
    const purchasable = opts.stripeProducts
      .filter((p) => p && p.defaultPriceId)
      .slice(0, 6);

    if (purchasable.length) {
      blocks.push({
        id: newBlockId("shopSection"),
        type: "section",
        props: {
          children: [
            {
              id: newBlockId("shopH"),
              type: "heading",
              props: { text: "Shop", level: 2 },
            },
            {
              id: newBlockId("shopCols"),
              type: "columns",
              props: {
                gapPx: 18,
                stackOnMobile: true,
                columns: purchasable.slice(0, 3).map((p) => {
                  const children: CreditFunnelBlock[] = [];
                  const img = p.images?.[0] ? String(p.images[0]).trim() : "";
                  if (img) {
                    children.push({
                      id: newBlockId("img"),
                      type: "image",
                      props: { src: img, alt: p.name || "Product" },
                    });
                  }

                  children.push({
                    id: newBlockId("name"),
                    type: "heading",
                    props: { text: p.name, level: 3 },
                  });

                  if (p.description) {
                    children.push({
                      id: newBlockId("desc"),
                      type: "paragraph",
                      props: { text: String(p.description).slice(0, 320) },
                    });
                  }

                  children.push({
                    id: newBlockId("add"),
                    type: "addToCartButton",
                    props: {
                      priceId: p.defaultPriceId,
                      quantity: 1,
                      productName: p.name,
                      ...(p.description ? { productDescription: String(p.description).slice(0, 320) } : {}),
                      text: "Add to cart",
                    },
                  });

                  children.push({
                    id: newBlockId("buy"),
                    type: "salesCheckoutButton",
                    props: {
                      priceId: p.defaultPriceId,
                      quantity: 1,
                      productName: p.name,
                      ...(p.description ? { productDescription: String(p.description).slice(0, 320) } : {}),
                      text: "Buy now",
                    },
                  });

                  return { markdown: "", children };
                }),
              },
            },
          ],
        },
      });
    }
  }

  if (opts.intent.wantsCalendar && opts.calendarId) {
    blocks.push({
      id: newBlockId("calSection"),
      type: "section",
      props: {
        children: [
          { id: newBlockId("calH"), type: "heading", props: { text: "Book a time", level: 2 } },
          {
            id: newBlockId("calEmbed"),
            type: "calendarEmbed",
            props: { calendarId: opts.calendarId, height: 760 },
          },
        ],
      },
    });
  }

  if (opts.intent.wantsChatbot && opts.chatAgentId) {
    blocks.push({
      id: newBlockId("chatbot"),
      type: "chatbot",
      props: {
        agentId: opts.chatAgentId,
        launcherStyle: "bubble",
        placementX: "right",
        placementY: "bottom",
      },
    });
  }

  return blocks;
}

const PAGE_UPDATED_VARIANTS = [
  "OK — I updated your page. Check the preview and tell me what you want changed.",
  "Done — page updated. Take a look in preview and tell me what to tweak.",
  "Updated. Open the preview and tell me what you want different.",
  "All set — changes applied. Preview it and tell me what you want adjusted.",
  "Page updated. If anything feels off, tell me what to change next.",
  "Update complete. Check the preview and call out what to refine.",
  "Applied the changes. Preview it and tell me what you want changed next.",
  "Done — I made the update. Tell me what you want improved after you preview.",
  "Updated the page. Preview it and tell me what to adjust (copy, layout, colors, etc.).",
  "Change applied. Check preview and tell me what you want changed.",
];

type AiAttachment = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

type ContextMedia = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

function coerceAttachments(raw: unknown): AiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AiAttachment[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 12) break;
  }
  return out;
}

function coerceContextMedia(raw: unknown): ContextMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextMedia[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 24) break;
  }
  return out;
}

type StripePrice = {
  id: string;
  unit_amount: number | null;
  currency: string;
  type?: string;
  recurring?: unknown;
};

type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  active: boolean;
  default_price?: StripePrice | string | null;
};

type StripeList<T> = { data: T[] };

async function getStripeProductsForOwner(ownerId: string) {
  const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
  if (!secretKey) return { ok: false as const, products: [] as Array<{ id: string; name: string; description: string | null; images: string[]; defaultPriceId: string; unitAmount: number | null; currency: string }> };

  const list = await stripeGetWithKey<StripeList<StripeProduct>>(secretKey, "/v1/products", {
    limit: 100,
    active: true,
    "expand[]": ["data.default_price"],
  }).catch(() => null);

  const products = Array.isArray(list?.data)
    ? list!.data
        .filter((p) => p && typeof p === "object" && (p as any).active)
        .map((p) => {
          const dp = p.default_price && typeof p.default_price === "object" ? (p.default_price as StripePrice) : null;
          return {
            id: String(p.id || "").trim(),
            name: String(p.name || "").trim(),
            description: p.description ? String(p.description) : null,
            images: Array.isArray(p.images) ? p.images.map((s) => String(s)).filter(Boolean).slice(0, 4) : [],
            defaultPriceId: dp?.id ? String(dp.id).trim() : "",
            unitAmount: typeof dp?.unit_amount === "number" ? dp.unit_amount : null,
            currency: String(dp?.currency || "usd").toLowerCase() || "usd",
          };
        })
        .filter((p) => p.id && p.name)
    : [];

  return { ok: true as const, products };
}

function toAbsoluteUrl(req: Request, url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = new URL(req.url).origin;
  return new URL(u, origin).toString();
}

function coerceContextKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    out.push(s.slice(0, 80));
    if (out.length >= 30) break;
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const basePath = auth.variant === "credit" ? "/credit" : "";

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });

  const currentHtmlFromClient = typeof body?.currentHtml === "string" ? body.currentHtml : null;
  const attachments = coerceAttachments(body?.attachments);
  const contextKeys = coerceContextKeys(body?.contextKeys);
  const contextMedia = coerceContextMedia(body?.contextMedia);

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: {
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      blocksJson: true,
      customChatJson: true,
      customHtml: true,
      funnel: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = auth.session.user.id;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const stripeProducts = await getStripeProductsForOwner(ownerId).catch(() => ({ ok: false as const, products: [] as any[] }));

  const intent = detectInteractiveIntent(prompt);
  if (intent.any) {
    const bookingCalendars = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] as any[] }));
    const enabledCalendars = Array.isArray((bookingCalendars as any).calendars)
      ? (bookingCalendars as any).calendars.filter((c: any) => c && typeof c === "object" && (c as any).enabled !== false)
      : [];
    const calendarId = enabledCalendars[0]?.id ? String(enabledCalendars[0].id).trim().slice(0, 50) : "";

    const agentIds = await getOwnerChatAgentIds(ownerId).catch(() => [] as string[]);
    const chatAgentId = agentIds[0] ? String(agentIds[0]).trim() : "";

    const purchasable = stripeProducts.ok
      ? (stripeProducts.products as any[]).filter((p) => p && typeof p === "object" && String((p as any).defaultPriceId || "").trim())
      : [];

    const missingShop = (intent.wantsShop || intent.wantsCart || intent.wantsCheckout) && purchasable.length === 0;
    const missingCalendar = intent.wantsCalendar && !calendarId;
    const missingChatbot = intent.wantsChatbot && !chatAgentId;

    if (missingShop || missingCalendar || missingChatbot) {
      const parts: string[] = [];
      if (missingShop) parts.push("I can add a working Shop/Cart/Checkout, but I don't see any Stripe products with default prices yet. Do you want to connect Stripe and add products first?");
      if (missingCalendar) parts.push("I can embed a working booking calendar, but you don't have any booking calendars configured yet. Which calendar should I use (or should I create one in Booking settings first)?");
      if (missingChatbot) parts.push("I can add a working chatbot widget, but I don't see an ElevenLabs chat agent ID for this account yet. What agent ID should I use?");
      const question = parts[0] ? parts[0].slice(0, 800) : "Which interactive block should I add (shop, calendar, or chatbot)?";

      const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
      const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };
      const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
      const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

      const updated = await prisma.creditFunnelPage.update({
        where: { id: page.id },
        data: {
          customChatJson: nextChat,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ ok: true, question, page: updated });
    }

    const blocks = buildInteractiveBlocks({
      funnelName: page.funnel.name,
      pageTitle: page.title,
      ownerId,
      stripeProducts: stripeProducts.ok ? (stripeProducts.products as any) : [],
      ...(calendarId ? { calendarId } : {}),
      ...(chatAgentId ? { chatAgentId } : {}),
      intent,
    });

    const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
    const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };
    const assistantMsg = {
      role: "assistant",
      content:
        "Done — I inserted real Funnel Builder blocks for the interactive parts (shop/cart/checkout/calendar/chatbot) so everything works in preview and on the hosted page. I also generated a full Custom code HTML snapshot of the page so you can switch to Custom code and keep the preview.",
      at: new Date().toISOString(),
    };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const htmlSnapshot = blocksToCustomHtmlDocument({
      blocks,
      pageId: page.id,
      ownerId,
      basePath,
      title: page.title || page.funnel.name || "Funnel page",
    });

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        editorMode: "BLOCKS",
        blocksJson: blocks as any,
        customHtml: htmlSnapshot,
        customChatJson: nextChat,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, page: updated });
  }

  const forms = await prisma.creditForm.findMany({
    where: { ownerId: auth.session.user.id },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: { slug: true, name: true, status: true },
  });

  const baseSystem = [
    "You generate a single self-contained HTML document for a marketing funnel page for the user's business.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "Return EITHER:",
    "- A single ```html fenced block containing the full HTML document, OR",
    "- A single ```json fenced block: { \"question\": \"...\" }",
    "Do NOT output anything else.",
    "Constraints:",
    "- Use plain HTML + inline <style>. No external JS/CSS, no frameworks.",
    "- Mobile-first, modern, clean styling.",
    "- Use relative links (no /portal/* links).",
    "Integration:",
    `- This page will be hosted at: ${basePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${basePath}/forms/{formSlug}`,
    `- Form submissions happen via POST /api/public${basePath}/forms/{formSlug}/submit (handled by our hosted form pages)`,
    `- If you need a form, link to ${basePath}/forms/{formSlug} with a clear CTA button.`,
    "Rules:",
    "- Do not invent form slugs. Only reference a form if the user explicitly asks to embed/link a form, or if they clearly asked for a lead-capture form.",
    "- If the user asks for a shop/store, use STRIPE_PRODUCTS if available.",
    "- If STRIPE_PRODUCTS is present, do NOT ask what products they sell.",
    "- If STRIPE_PRODUCTS is empty and the user asks for a shop/store, ask ONE question: whether they want to connect Stripe or describe their products.",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Output rules:",
    "- Include <meta name=\"viewport\"> and a <title>.",
    "- Avoid placeholder braces like {{var}} unless asked.",
  ];

  const effectiveCurrentHtml =
    (currentHtmlFromClient && currentHtmlFromClient.trim() ? currentHtmlFromClient : page.customHtml || "").trim();
  const hasCurrentHtml = Boolean(effectiveCurrentHtml);

  const system = [
    ...baseSystem,
    hasCurrentHtml
      ? "Editing mode: You will be given CURRENT_HTML. Apply the user's instruction as a minimal change to CURRENT_HTML. Return the FULL updated HTML document."
      : "Generation mode: Create a new HTML document from the user's instruction.",
  ].join("\n");

  const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
  const attachmentsBlock = attachments.length
    ? [
        "",
        "ATTACHMENTS:",
        ...attachments.map((a) => {
          const name = a.fileName ? ` ${a.fileName}` : "";
          const mime = a.mimeType ? ` (${a.mimeType})` : "";
          const url = toAbsoluteUrl(req, a.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const contextBlock = contextKeys.length
    ? [
        "",
        "SELECTED_CONTEXT (use these elements if relevant):",
        ...contextKeys.map((k) => `- ${k}`),
        "",
      ].join("\n")
    : "";

  const contextMediaBlock = contextMedia.length
    ? [
        "",
        "SELECTED_MEDIA (use these assets if relevant):",
        ...contextMedia.map((m) => {
          const name = m.fileName ? ` ${m.fileName}` : "";
          const mime = m.mimeType ? ` (${m.mimeType})` : "";
          const url = toAbsoluteUrl(req, m.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const stripeProductsBlock = stripeProducts.ok && stripeProducts.products.length
    ? [
        "",
        "STRIPE_PRODUCTS (already connected; do not ask what they sell):",
        ...stripeProducts.products.slice(0, 60).map((p: any) => {
          const price = p.defaultPriceId ? ` default_price=${p.defaultPriceId}` : "";
          const amt = typeof p.unitAmount === "number" ? ` ${p.unitAmount} ${p.currency}` : "";
          return `- ${p.name} (product=${p.id}${price}${amt})`;
        }),
        "",
      ].join("\n")
    : "\n\nSTRIPE_PRODUCTS: (none found or Stripe not connected)\n";

  const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };

  let html = "";
  let question: string | null = null;
  try {
    const currentHtmlBlock = hasCurrentHtml
      ? [
          "CURRENT_HTML:",
          "```html",
          clampText(effectiveCurrentHtml, 24000),
          "```",
          "",
        ].join("\n")
      : "";

    const imageUrls = [
      ...attachments
        .filter((a) => String(a.mimeType || "").toLowerCase().startsWith("image/"))
        .map((a) => toAbsoluteUrl(req, a.url)),
      ...contextMedia
        .filter((m) => String(m.mimeType || "").toLowerCase().startsWith("image/"))
        .map((m) => toAbsoluteUrl(req, m.url)),
    ]
      .filter(Boolean)
      .slice(0, 8);

    const userText = [
      businessContext ? businessContext : "",
      stripeProductsBlock,
      `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
      `Page: ${page.title} (slug: ${page.slug})`,
      "",
      currentHtmlBlock,
      prompt,
      contextBlock,
      contextMediaBlock,
      attachmentsBlock,
    ].join("\n");

    const aiRaw = imageUrls.length
      ? await generateTextWithImages({ system, user: userText, imageUrls })
      : await generateText({ system, user: userText });

    question = extractAiQuestion(aiRaw);
    if (!question) {
      html = extractHtml(aiRaw);
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  if (question) {
    const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        editorMode: "CUSTOM_HTML",
        customChatJson: nextChat,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, question, page: updated });
  }

  if (!html) return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });

  html = normalizePortalHostedPaths(html);

  if (!/<!doctype\s+html|<html\b/i.test(html)) {
    html = [
      "<!doctype html>",
      "<html>",
      "<head>",
      "  <meta charset=\"utf-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "  <title>AI Output</title>",
      "  <style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; padding:24px} pre{white-space:pre-wrap; word-break:break-word}</style>",
      "</head>",
      "<body>",
      `  <pre>${escapeHtml(html)}</pre>`,
      "</body>",
      "</html>",
    ].join("\n");
  }

  const assistantMsg = {
    role: "assistant",
    content: pickRandom(PAGE_UPDATED_VARIANTS),
    at: new Date().toISOString(),
  };
  const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

  const updated = await prisma.creditFunnelPage.update({
    where: { id: page.id },
    data: {
      editorMode: "CUSTOM_HTML",
      customHtml: normalizePortalHostedPaths(html),
      customChatJson: nextChat,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      customHtml: true,
      customChatJson: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, html: updated.customHtml, page: updated });
}
