import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";

export function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
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
    const width = Math.max(0, Math.round(borderWidth));
    const color = typeof s.borderColor === "string" && s.borderColor.trim() ? s.borderColor.trim() : "var(--pa-border)";
    push("border", `${width}px solid ${color}`);
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

export function blocksToCustomHtmlDocument(opts: {
  blocks: CreditFunnelBlock[];
  pageId: string;
  ownerId: string;
  bookingSiteSlug?: string;
  defaultBookingCalendarId?: string;
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

  const withBlockAnchor = (block: CreditFunnelBlock, html: string): string => {
    const markup = String(html || "").trim();
    if (!markup) return "";
    if (/^<[a-zA-Z0-9-]+\b[^>]*\bdata-pa-block-id=/.test(markup)) return markup;

    const attrs = `data-pa-block-id="${escapeHtmlAttr(block.id)}" data-pa-block-type="${escapeHtmlAttr(block.type)}"`;
    return markup.replace(/^<([a-zA-Z0-9-]+)\b/, `<$1 ${attrs}`);
  };

  const renderBlock = (b: CreditFunnelBlock): string => {
    if (!b || typeof b !== "object") return "";

    if (b.type === "page") {
      const cssInline = styleToCss((b.props as any)?.style);
      return cssInline ? withBlockAnchor(b, `<div style=\"${escapeHtmlAttr(cssInline)}\"></div>`) : "";
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

      return withBlockAnchor(b, `<div class=\"pa-header\"><div class=\"pa-header-inner\">${logo}<nav class=\"pa-nav\">${links}</nav></div></div>`);
    }

    if (b.type === "anchor") {
      const anchorId = typeof (b.props as any)?.anchorId === "string" ? String((b.props as any).anchorId).trim() : "";
      const cssInline = styleToCss((b.props as any)?.style);
      const attrs = [anchorId ? `id=\"${escapeHtmlAttr(anchorId)}\"` : "", cssInline ? `style=\"${escapeHtmlAttr(cssInline)}\"` : ""]
        .filter(Boolean)
        .join(" ");
      return withBlockAnchor(b, `<div ${attrs}></div>`);
    }

    if (b.type === "heading") {
      const level = (b.props as any)?.level === 1 || (b.props as any)?.level === 2 || (b.props as any)?.level === 3 ? (b.props as any).level : 2;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const cls = level === 1 ? "pa-h1" : level === 2 ? "pa-h2" : "pa-h3";
      const cssInline = styleToCss((b.props as any)?.style);
      const content = renderTextOrHtml(String((b.props as any)?.text || ""), (b.props as any)?.html);
      return withBlockAnchor(b, `<${tag} class=\"${cls}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${content}</${tag}>`);
    }

    if (b.type === "paragraph") {
      const cssInline = styleToCss((b.props as any)?.style);
      const content = renderTextOrHtml(String((b.props as any)?.text || ""), (b.props as any)?.html);
      return withBlockAnchor(b, `<p class=\"pa-p\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${content}</p>`);
    }

    if (b.type === "button") {
      const href = typeof (b.props as any)?.href === "string" ? String((b.props as any).href).trim() : "#";
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Click";
      const variant = (b.props as any)?.variant === "secondary" ? "secondary" : "primary";
      const cssInline = styleToCss((b.props as any)?.style);
      const cls = variant === "secondary" ? "pa-btn" : "pa-btn pa-btn-primary";
      return withBlockAnchor(b, `<a class=\"${cls}\" href=\"${escapeHtmlAttr(href)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</a>`);
    }

    if (b.type === "image") {
      const src = typeof (b.props as any)?.src === "string" ? String((b.props as any).src).trim() : "";
      const alt = typeof (b.props as any)?.alt === "string" ? String((b.props as any).alt) : "";
      if (!src) return "";
      const cssInline = styleToCss((b.props as any)?.style);
      const frame = (b.props as any)?.showFrame !== false;
      const cls = frame ? "pa-img" : "";
      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><img class=\"${cls}\" src=\"${escapeHtmlAttr(src)}\" alt=\"${escapeHtmlAttr(alt)}\" /></div>`);
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
      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><video src=\"${escapeHtmlAttr(src)}\" ${poster ? `poster=\"${escapeHtmlAttr(poster)}\"` : ""} ${controls ? "controls" : ""} ${autoplay ? "autoplay" : ""} ${loop ? "loop" : ""} ${muted ? "muted" : ""} playsinline style=\"width:100%;border-radius:16px;border:1px solid var(--pa-border);background:#fff\"></video></div>`);
    }

    if (b.type === "spacer") {
      const h = typeof (b.props as any)?.height === "number" && Number.isFinite((b.props as any).height) ? Math.max(0, Math.round((b.props as any).height)) : 24;
      const cssInline = styleToCss((b.props as any)?.style);
      return withBlockAnchor(b, `<div style=\"height:${h}px;${cssInline ? escapeHtmlAttr(cssInline) : ""}\"></div>`);
    }

    if (b.type === "formLink") {
      const formSlug = typeof (b.props as any)?.formSlug === "string" ? String((b.props as any).formSlug).trim() : "";
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text).trim() : "Open form";
      const cssInline = styleToCss((b.props as any)?.style);
      const href = `${opts.basePath}/forms/${encodeURIComponent(formSlug)}`;
      return withBlockAnchor(b, `<a class=\"pa-btn pa-btn-primary\" href=\"${escapeHtmlAttr(href)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</a>`);
    }

    if (b.type === "formEmbed") {
      const formSlug = typeof (b.props as any)?.formSlug === "string" ? String((b.props as any).formSlug).trim() : "";
      const height = typeof (b.props as any)?.height === "number" && Number.isFinite((b.props as any).height) ? Math.max(120, Math.min(2000, Math.round((b.props as any).height))) : 760;
      const cssInline = styleToCss((b.props as any)?.style);
      if (!formSlug) return "";
      const src = `${opts.basePath}/forms/${encodeURIComponent(formSlug)}?embed=1`;
      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><iframe title=\"Form\" src=\"${escapeHtmlAttr(src)}\" style=\"width:100%;height:${height}px;border:1px solid var(--pa-border);border-radius:16px;background:#fff\" sandbox=\"allow-forms allow-scripts allow-same-origin\"></iframe></div>`);
    }

    if (b.type === "calendarEmbed") {
      const calendarId = typeof (b.props as any)?.calendarId === "string" ? String((b.props as any).calendarId).trim() : "";
      const height = typeof (b.props as any)?.height === "number" && Number.isFinite((b.props as any).height) ? Math.max(120, Math.min(2000, Math.round((b.props as any).height))) : 760;
      const cssInline = styleToCss((b.props as any)?.style);
      if (!calendarId || !opts.ownerId) return "";
      const src = `/book/u/${encodeURIComponent(opts.ownerId)}/${encodeURIComponent(calendarId)}`;
      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><iframe title=\"Booking\" src=\"${escapeHtmlAttr(src)}\" style=\"width:100%;height:${height}px;border:1px solid var(--pa-border);border-radius:16px;background:#fff\" sandbox=\"allow-forms allow-scripts allow-same-origin\"></iframe></div>`);
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
      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><div class=\"pa-grid\" style=\"--cols:${count};gap:${gapPx}px\">${inner.join("\n")}</div></div>`);
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
        'class=\"pa-section\"',
        anchorId ? `id=\"${escapeHtmlAttr(anchorId)}\"` : "",
        cssInline ? `style=\"${escapeHtmlAttr(cssInline)}\"` : "",
      ]
        .filter(Boolean)
        .join(" ");

      return withBlockAnchor(b, `<section ${attrs}>${inner}</section>`);
    }

    if (b.type === "addToCartButton") {
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Add to cart";
      const priceId = typeof (b.props as any)?.priceId === "string" ? String((b.props as any).priceId).trim() : "";
      const quantity = typeof (b.props as any)?.quantity === "number" && Number.isFinite((b.props as any).quantity) ? Math.max(1, Math.min(20, Math.round((b.props as any).quantity))) : 1;
      const productName = typeof (b.props as any)?.productName === "string" ? String((b.props as any).productName).trim() : "";
      const productDescription = typeof (b.props as any)?.productDescription === "string" ? String((b.props as any).productDescription).trim() : "";
      const cssInline = styleToCss((b.props as any)?.style);
      if (!priceId) return "";
      return withBlockAnchor(b, `<button type=\"button\" class=\"pa-btn\" data-pa-action=\"add\" data-pa-price-id=\"${escapeHtmlAttr(priceId)}\" data-pa-qty=\"${quantity}\" data-pa-name=\"${escapeHtmlAttr(productName)}\" data-pa-desc=\"${escapeHtmlAttr(productDescription)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</button>`);
    }

    if (b.type === "salesCheckoutButton") {
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Buy now";
      const priceId = typeof (b.props as any)?.priceId === "string" ? String((b.props as any).priceId).trim() : "";
      const quantity = typeof (b.props as any)?.quantity === "number" && Number.isFinite((b.props as any).quantity) ? Math.max(1, Math.min(20, Math.round((b.props as any).quantity))) : 1;
      const productName = typeof (b.props as any)?.productName === "string" ? String((b.props as any).productName).trim() : "";
      const productDescription = typeof (b.props as any)?.productDescription === "string" ? String((b.props as any).productDescription).trim() : "";
      const cssInline = styleToCss((b.props as any)?.style);
      if (!priceId) return "";
      return withBlockAnchor(b, `<button type=\"button\" class=\"pa-btn pa-btn-primary\" data-pa-action=\"buy\" data-pa-price-id=\"${escapeHtmlAttr(priceId)}\" data-pa-qty=\"${quantity}\" data-pa-name=\"${escapeHtmlAttr(productName)}\" data-pa-desc=\"${escapeHtmlAttr(productDescription)}\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)}</button>`);
    }

    if (b.type === "cartButton") {
      const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Cart";
      const cssInline = styleToCss((b.props as any)?.style);
      return withBlockAnchor(b, `<button type=\"button\" class=\"pa-btn\" data-pa-action=\"cart\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${escapeHtml(text)} <span data-pa-cart-count style=\"opacity:.7;font-weight:800\"></span></button>`);
    }

    if (b.type === "chatbot") {
      const p: any = b.props as any;
      const agentId = typeof p?.agentId === "string" ? String(p.agentId).trim() : "";
      const cssInline = styleToCss(p?.style);
      if (!agentId) {
        return withBlockAnchor(b, `<div class=\"pa-card\"${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><div style=\"font-weight:800\">Chatbot</div><div style=\"margin-top:6px;color:var(--pa-muted);font-size:14px\">Select an agent for this chatbot block to enable the embed.</div></div>`);
      }

      const primaryColor = typeof p?.primaryColor === "string" ? String(p.primaryColor).trim() : "";
      const launcherStyle = p?.launcherStyle === "dots" ? "dots" : p?.launcherStyle === "spark" ? "spark" : "bubble";
      const launcherImageUrl = typeof p?.launcherImageUrl === "string" ? String(p.launcherImageUrl).trim() : "";
      const placementX = p?.placementX === "left" || p?.placementX === "center" || p?.placementX === "right" ? p.placementX : "right";
      const placementY = p?.placementY === "top" || p?.placementY === "middle" || p?.placementY === "bottom" ? p.placementY : "bottom";

      // Use an internal embed page (React) so the widget works in custom HTML mode.
      // NOTE: Keep this path public + domain-router friendly.
      const qs = new URLSearchParams({
        agentId,
        signedUrlEndpoint: "/api/public/elevenlabs/convai/signed-url",
        placementX,
        placementY,
        launcherStyle,
        ...(primaryColor ? { primaryColor } : {}),
        ...(launcherImageUrl ? { launcherImageUrl } : {}),
      }).toString();

      // Fixed-position iframe avoids breaking the parent page layout.
      // Tradeoff: the iframe blocks clicks in its rectangle.
      const iframeCss = "position:fixed;right:0;bottom:0;width:440px;height:740px;border:0;background:transparent;z-index:2147483647";

      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}><iframe title=\"Chatbot\" src=\"/embed/chatbot?${escapeHtmlAttr(qs)}\" style=\"${iframeCss}\" sandbox=\"allow-forms allow-scripts allow-same-origin\" allow=\"microphone\"></iframe></div>`);
    }

    if (b.type === "customCode") {
      const html = typeof (b.props as any)?.html === "string" ? String((b.props as any).html) : "";
      const css = typeof (b.props as any)?.css === "string" ? String((b.props as any).css) : "";
      const cssInline = styleToCss((b.props as any)?.style);
      if (!html.trim()) return "";
      // Inline custom code directly (best-effort).
      return withBlockAnchor(b, `<div${cssInline ? ` style=\"${escapeHtmlAttr(cssInline)}\"` : ""}>${css.trim() ? `<style>${css}</style>` : ""}${html}</div>`);
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
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) return parsed;
    return { items: [] };
  };
  const writeCart = (cart) => {
    sessionStorage.setItem(KEY, JSON.stringify(cart || { items: [] }));
  };

  const updateCount = () => {
    const cart = readCart();
    const count = cart.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    document.querySelectorAll('[data-pa-cart-count]').forEach((el) => {
      el.textContent = count ? '(' + count + ')' : '';
    });
  };

  const addItem = (item) => {
    const cart = readCart();
    const items = Array.isArray(cart.items) ? cart.items : [];
    const key = String(item.priceId || '');
    const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
    const idx = items.findIndex((x) => String(x.priceId || '') === key);
    if (idx >= 0) {
      items[idx] = { ...items[idx], qty: Math.max(1, Math.min(20, (Number(items[idx].qty) || 1) + qty)) };
    } else {
      items.push({
        priceId: key,
        qty,
        name: String(item.name || ''),
        desc: String(item.desc || ''),
      });
    }
    writeCart({ items });
    updateCount();
  };

  const setQty = (priceId, qty) => {
    const cart = readCart();
    const items = Array.isArray(cart.items) ? cart.items : [];
    const key = String(priceId || '');
    const q = Math.max(0, Math.min(20, Number(qty) || 0));
    const next = items
      .map((it) => (String(it.priceId || '') === key ? { ...it, qty: q } : it))
      .filter((it) => (Number(it.qty) || 0) > 0);
    writeCart({ items: next });
    updateCount();
  };

  const modalHtml = () => {
    return ''
      + '<div id="pa-modal" style="position:fixed;inset:0;z-index:9999;display:none">'
      + '  <div id="pa-backdrop" style="position:absolute;inset:0;background:rgba(15,23,42,.45)"></div>'
      + '  <div style="position:relative;max-width:720px;margin:10vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">'
      + '    <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">'
      + '      <div style="font-weight:900">Your cart</div>'
      + '      <button id="pa-close" aria-label="Close" title="Close" style="border:1px solid transparent;border-radius:999px;width:40px;height:40px;line-height:40px;padding:0;background:#fff;cursor:pointer;font-size:18px;font-weight:900;color:#334155">×</button>'
      + '    </div>'
      + '    <div id="pa-items" style="padding:16px;display:flex;flex-direction:column;gap:10px"></div>'
      + '    <div style="padding:16px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">'
      + '      <button id="pa-clear" style="border:1px solid #e2e8f0;border-radius:14px;padding:12px 16px;background:#fff;font-weight:800;cursor:pointer">Clear</button>'
      + '      <button id="pa-checkout" style="border:1px solid #2563eb;border-radius:14px;padding:12px 16px;background:#2563eb;color:#fff;font-weight:900;cursor:pointer">Checkout</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  };

  const ensureModal = () => {
    if (document.getElementById('pa-modal')) return;
    document.body.insertAdjacentHTML('beforeend', modalHtml());

    const modal = document.getElementById('pa-modal');
    const backdrop = document.getElementById('pa-backdrop');
    const closeBtn = document.getElementById('pa-close');
    const clearBtn = document.getElementById('pa-clear');
    const checkoutBtn = document.getElementById('pa-checkout');

    const hide = () => { if (modal) modal.style.display = 'none'; };
    const show = () => { if (modal) modal.style.display = 'block'; renderItems(); };

    if (backdrop) backdrop.addEventListener('click', hide);
    if (closeBtn) closeBtn.addEventListener('click', hide);
    if (clearBtn) clearBtn.addEventListener('click', () => { writeCart({ items: [] }); updateCount(); renderItems(); });
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => checkoutCart().catch((err) => alert(err?.message || 'Checkout failed')));

    (window).__paShowCart = show;
  };

  const renderItems = () => {
    const root = document.getElementById('pa-items');
    if (!root) return;
    const cart = readCart();
    const items = Array.isArray(cart.items) ? cart.items : [];

    if (!items.length) {
      root.innerHTML = '<div style="color:#475569">Your cart is empty.</div>';
      return;
    }

    root.innerHTML = items.map((it) => {
      const id = esc(it.priceId);
      const name = esc(it.name || '');
      const desc = esc(it.desc || '');
      const qty = Math.max(1, Math.min(20, Number(it.qty) || 1));

      return ''
        + '<div style="display:flex;gap:12px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:16px;padding:12px">'
        + '  <div style="flex:1">'
        + '    <div style="font-weight:900">' + name + '</div>'
        + '    ' + (desc ? '<div style="margin-top:4px;color:#475569;font-size:13px">' + desc + '</div>' : '')
        + '  </div>'
        + '  <div style="display:flex;gap:10px;align-items:center">'
        + '    <label style="font-size:12px;color:#475569">Qty</label>'
        + '    <input data-pa-qty-input="' + id + '" type="number" min="1" max="20" value="' + qty + '" style="width:72px;border:1px solid #e2e8f0;border-radius:12px;padding:8px" />'
        + '  </div>'
        + '</div>';
    }).join('');

    root.querySelectorAll('input[data-pa-qty-input]').forEach((inp) => {
      const id = inp.getAttribute('data-pa-qty-input');
      inp.addEventListener('change', () => {
        setQty(id, inp.value);
        renderItems();
      });
    });
  };

  const startCheckout = async (payload) => {
    const res = await fetch('/api/public/checkout/create', {
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
    await startCheckout({ pageId: PAGE_ID, items: cart.items.map((it) => ({ priceId: it.priceId, quantity: it.qty })) });
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !(t instanceof HTMLElement)) return;

    const btn = t.closest('[data-pa-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-pa-action');

    if (action === 'cart') {
      e.preventDefault();
      ensureModal();
      const modal = document.getElementById('pa-modal');
      if (modal) modal.style.display = 'block';
      renderItems();
      return;
    }

    const priceId = btn.getAttribute('data-pa-price-id') || '';
    const qty = Math.max(1, Math.min(20, Number(btn.getAttribute('data-pa-qty') || '1') || 1));

    if (action === 'add') {
      e.preventDefault();
      addItem({
        priceId,
        qty,
        name: btn.getAttribute('data-pa-name') || '',
        desc: btn.getAttribute('data-pa-desc') || '',
      });
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
