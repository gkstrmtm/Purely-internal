import React from "react";

import { ConvaiChatWidget } from "@/components/ConvaiChatWidget";
import { SafeClientBoundary } from "@/components/SafeClientBoundary";
import { AddToCartButton } from "@/components/funnel/AddToCartButton";
import { CartButton } from "@/components/funnel/CartButton";
import {
  FunnelHeaderNav,
  type FunnelHeaderDesktopMode,
  type FunnelHeaderMobileTrigger,
  type FunnelHeaderNavItem,
  type FunnelHeaderSize,
} from "@/components/funnel/FunnelHeaderNav";
import { SalesCheckoutButton } from "@/components/funnel/SalesCheckoutButton";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { coerceFontFamily, coerceGoogleFamily, googleFontImportCss } from "@/lib/fontPresets";

export type BlockStyle = {
  textColor?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  backgroundVideoPosterUrl?: string;
  fontSizePx?: number;
  fontFamily?: string;
  fontGoogleFamily?: string;
  align?: "left" | "center" | "right";
  marginTopPx?: number;
  marginBottomPx?: number;
  paddingPx?: number;
  borderRadiusPx?: number;
  borderColor?: string;
  borderWidthPx?: number;
  maxWidthPx?: number;
};

export type ColumnsColumn = {
  markdown: string;
  children?: CreditFunnelBlock[];
  style?: BlockStyle;
};

export type CreditFunnelBlock =
  | {
      id: string;
      type: "page";
      props: { style?: BlockStyle };
    }
  | {
      id: string;
      type: "headerNav";
      props: {
        isGlobal?: boolean;
        globalKey?: string;
        sticky?: boolean;
        transparent?: boolean;
        mobileMode?: "dropdown" | "slideover";
        desktopMode?: FunnelHeaderDesktopMode;
        size?: FunnelHeaderSize;
        sizeScale?: number;
        mobileTrigger?: FunnelHeaderMobileTrigger;
        mobileTriggerLabel?: string;
        logoUrl?: string;
        logoAlt?: string;
        logoHref?: string;
        items?: FunnelHeaderNavItem[];
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "anchor";
      props: {
        anchorId: string;
        label?: string;
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "salesCheckoutButton";
      props: {
        priceId: string;
        quantity?: number;
        productName?: string;
        productDescription?: string;
        text?: string;
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "addToCartButton";
      props: {
        priceId: string;
        quantity?: number;
        productName?: string;
        productDescription?: string;
        text?: string;
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "cartButton";
      props: {
        text?: string;
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "customCode";
      props: { html: string; css?: string; heightPx?: number; style?: BlockStyle };
    }
  | {
      id: string;
      type: "chatbot";
      props: {
        agentId?: string;
        primaryColor?: string;
        launcherStyle?: "bubble" | "dots" | "spark";
        launcherImageUrl?: string;
        placementX?: "left" | "center" | "right";
        placementY?: "top" | "middle" | "bottom";
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "heading";
      props: { text: string; html?: string; level?: 1 | 2 | 3; style?: BlockStyle };
    }
  | {
      id: string;
      type: "paragraph";
      props: { text: string; html?: string; style?: BlockStyle };
    }
  | {
      id: string;
      type: "button";
      props: {
        text: string;
        href: string;
        variant?: "primary" | "secondary";
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "image";
      props: { src: string; alt?: string; showFrame?: boolean; style?: BlockStyle };
    }
  | {
      id: string;
      type: "video";
      props: {
        src: string;
        name?: string;
        posterUrl?: string;
        controls?: boolean;
        showControls?: boolean;
        autoplay?: boolean;
        loop?: boolean;
        muted?: boolean;
        aspectRatio?: "auto" | "16:9" | "9:16" | "4:3" | "1:1";
        fit?: "contain" | "cover";
        showFrame?: boolean;
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "spacer";
      props: { height?: number; style?: BlockStyle };
    }
  | {
      id: string;
      type: "formLink";
      props: { formSlug: string; text?: string; style?: BlockStyle };
    }
  | {
      id: string;
      type: "formEmbed";
      props: { formSlug: string; height?: number; style?: BlockStyle };
    }
  | {
      id: string;
      type: "calendarEmbed";
      props: { calendarId: string; height?: number; style?: BlockStyle };
    }
  | {
      id: string;
      type: "columns";
      props: {
        columns: ColumnsColumn[];
        gapPx?: number;
        stackOnMobile?: boolean;
        style?: BlockStyle;
      };
    }
  | {
      id: string;
      type: "section";
      props: {
        anchorId?: string;
        anchorLabel?: string;
        layout?: "one" | "two";
        children?: CreditFunnelBlock[];
        leftChildren?: CreditFunnelBlock[];
        rightChildren?: CreditFunnelBlock[];
        markdown?: string;
        leftMarkdown?: string;
        rightMarkdown?: string;
        gapPx?: number;
        stackOnMobile?: boolean;
        style?: BlockStyle;
        leftStyle?: BlockStyle;
        rightStyle?: BlockStyle;
      };
    };

function clampNum(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function coerceCssColor(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  if (s.length > 40) return undefined;
  return s;
}

function coerceCssUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  if (s.length > 500) return undefined;
  const lower = s.toLowerCase();
  if (lower.startsWith("javascript:")) return undefined;
  if (lower.startsWith("data:")) return undefined;
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("/")) return s;
  return undefined;
}

function coerceMediaName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  if (s.length > 200) return undefined;
  return s;
}

function coerceVideoAspectRatio(v: unknown): "auto" | "16:9" | "9:16" | "4:3" | "1:1" | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s === "auto" || s === "16:9" || s === "9:16" || s === "4:3" || s === "1:1") return s;
  return undefined;
}

function coerceVideoFit(v: unknown): "contain" | "cover" | undefined {
  if (v === "contain" || v === "cover") return v;
  return undefined;
}

function escapeHtmlText(raw: string): string {
  // Preserve existing entities (&nbsp;, &amp;, etc). ContentEditable often emits them.
  return raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.length > 500) return undefined;
  const lower = s.toLowerCase();
  if (lower.startsWith("javascript:")) return undefined;
  if (lower.startsWith("data:")) return undefined;
  if (lower.startsWith("http://") || lower.startsWith("https://")) return s;
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) return s;
  if (s.startsWith("/") || s.startsWith("#")) return s;
  return undefined;
}

function coerceBool(v: unknown): boolean | undefined {
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

function coerceHeaderMobileMode(v: unknown): "dropdown" | "slideover" | undefined {
  if (v === "slideover") return "slideover";
  if (v === "dropdown") return "dropdown";
  return undefined;
}

function coerceHeaderDesktopMode(v: unknown): "inline" | "dropdown" | "slideover" | undefined {
  if (v === "inline") return "inline";
  if (v === "dropdown") return "dropdown";
  if (v === "slideover") return "slideover";
  return undefined;
}

function coerceHeaderSize(v: unknown): FunnelHeaderSize | undefined {
  if (v === "sm") return "sm";
  if (v === "md") return "md";
  if (v === "lg") return "lg";
  return undefined;
}

function coerceHeaderSizeScale(v: unknown): number | undefined {
  const n = typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.max(0.75, Math.min(1.5, n));
  return clamped;
}

function coerceHeaderMobileTrigger(v: unknown): FunnelHeaderMobileTrigger | undefined {
  if (v === "hamburger") return "hamburger";
  if (v === "directory") return "directory";
  return undefined;
}

function coerceAnchorId(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  const cleaned = s
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  return cleaned;
}

function coerceHeaderItems(v: unknown): FunnelHeaderNavItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: FunnelHeaderNavItem[] = [];

  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r: any = raw;
    const id = typeof r.id === "string" ? r.id.trim().slice(0, 80) : "";
    if (!id) continue;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
    const kind = r.kind === "url" || r.kind === "page" || r.kind === "anchor" ? (r.kind as any) : "url";
    const newTab = r.newTab === true;

    const url = kind === "url" ? sanitizeHref(typeof r.url === "string" ? r.url : undefined) : undefined;
    const pageSlug =
      kind === "page" && typeof r.pageSlug === "string"
        ? r.pageSlug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64)
        : undefined;
    const anchorId = kind === "anchor" ? coerceAnchorId(r.anchorId) : "";

    out.push({
      id,
      label: label || "Link",
      kind,
      ...(url ? { url } : {}),
      ...(pageSlug !== undefined ? { pageSlug } : {}),
      ...(anchorId ? { anchorId } : {}),
      ...(newTab ? { newTab: true } : {}),
    });
  }

  return out.length ? out.slice(0, 20) : undefined;
}

function extractAttr(tagBody: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tagBody);
  return (m?.[1] ?? m?.[2] ?? m?.[3]) as any;
}

export function sanitizeRichTextHtml(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let s = input.trim();
  if (!s) return undefined;
  if (s.length > 10000) s = s.slice(0, 10000);
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  const normalizeTag = (rawName: string): "strong" | "em" | "u" | "a" | "br" | null => {
    const n = rawName.toLowerCase();
    if (n === "strong" || n === "b") return "strong";
    if (n === "em" || n === "i") return "em";
    if (n === "u") return "u";
    if (n === "a") return "a";
    if (n === "br") return "br";
    return null;
  };

  const out: string[] = [];
  const stack: Array<"strong" | "em" | "u" | "a"> = [];

  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      out.push(escapeHtmlText(s.slice(i)));
      break;
    }

    if (lt > i) out.push(escapeHtmlText(s.slice(i, lt)));
    const gt = s.indexOf(">", lt + 1);
    if (gt === -1) {
      out.push(escapeHtmlText(s.slice(lt)));
      break;
    }

    const rawTag = s.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (!rawTag) continue;
    if (rawTag.startsWith("!")) continue;
    if (rawTag.startsWith("?")) continue;

    const isClosing = rawTag.startsWith("/");
    const isSelfClosing = /\/$/.test(rawTag);
    const tagBody = rawTag.replace(/^\//, "").replace(/\/$/, "").trim();
    const nameMatch = /^([a-zA-Z0-9]+)/.exec(tagBody);
    if (!nameMatch) continue;

    const name = normalizeTag(nameMatch[1]);
    if (!name) continue;

    if (name === "br") {
      out.push("<br />");
      continue;
    }

    if (isClosing) {
      const top = stack[stack.length - 1];
      if (top === name) {
        stack.pop();
        out.push(`</${name}>`);
      }
      continue;
    }

    if (name === "a") {
      const href = sanitizeHref(extractAttr(tagBody, "href"));
      if (!href) continue;
      out.push(`<a href=\"${escapeHtmlAttr(href)}\">`);
      stack.push("a");
      if (isSelfClosing) {
        stack.pop();
        out.push("</a>");
      }
      continue;
    }

    out.push(`<${name}>`);
    stack.push(name);
    if (isSelfClosing) {
      stack.pop();
      out.push(`</${name}>`);
    }
  }

  while (stack.length) {
    const name = stack.pop();
    if (name) out.push(`</${name}>`);
  }

  const result = out.join("").trim();
  return result ? result : undefined;
}

function coerceAlign(v: unknown): BlockStyle["align"] {
  if (v === "center" || v === "right") return v;
  if (v === "left") return "left";
  return undefined;
}

function coerceStyle(raw: unknown): BlockStyle | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as any;
  const style: BlockStyle = {
    textColor: coerceCssColor(r.textColor),
    backgroundColor: coerceCssColor(r.backgroundColor),
    backgroundImageUrl: coerceCssUrl(r.backgroundImageUrl),
    backgroundVideoUrl: coerceCssUrl(r.backgroundVideoUrl),
    backgroundVideoPosterUrl: coerceCssUrl(r.backgroundVideoPosterUrl),
    fontSizePx: clampNum(r.fontSizePx, 8, 120),
    fontFamily: coerceFontFamily(r.fontFamily),
    fontGoogleFamily: coerceGoogleFamily(r.fontGoogleFamily),
    align: coerceAlign(r.align),
    marginTopPx: clampNum(r.marginTopPx, 0, 240),
    marginBottomPx: clampNum(r.marginBottomPx, 0, 240),
    paddingPx: clampNum(r.paddingPx, 0, 240),
    borderRadiusPx: clampNum(r.borderRadiusPx, 0, 80),
    borderColor: coerceCssColor(r.borderColor),
    borderWidthPx: clampNum(r.borderWidthPx, 0, 24),
    maxWidthPx: clampNum(r.maxWidthPx, 0, 1600),
  };

  const hasAny = Object.values(style).some((v) => v !== undefined && v !== "");
  return hasAny ? style : undefined;
}

function coerceBlocksJsonInternal(value: unknown, depth: number): CreditFunnelBlock[] {
  if (!Array.isArray(value)) return [];
  if (depth > 6) return [];
  const out: CreditFunnelBlock[] = [];

  for (const raw of value) {
    const r = raw as any;
    const id = typeof r?.id === "string" ? r.id.trim() : "";
    const type = typeof r?.type === "string" ? r.type : "";
    const props = r?.props ?? {};
    if (!id) continue;

    if (type === "page") {
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { style } });
      continue;
    }

    if (type === "headerNav") {
      const style = coerceStyle(props?.style);
      const isGlobal = coerceBool((props as any)?.isGlobal);
      const globalKey = typeof (props as any)?.globalKey === "string" ? String((props as any).globalKey).trim().slice(0, 80) : "";
      const sticky = coerceBool((props as any)?.sticky);
      const transparent = coerceBool((props as any)?.transparent);
      const mobileMode = coerceHeaderMobileMode((props as any)?.mobileMode);
      const desktopMode = coerceHeaderDesktopMode((props as any)?.desktopMode);
      const size = coerceHeaderSize((props as any)?.size);
      const sizeScale = coerceHeaderSizeScale((props as any)?.sizeScale);
      const mobileTrigger = coerceHeaderMobileTrigger((props as any)?.mobileTrigger);
      const mobileTriggerLabel =
        typeof (props as any)?.mobileTriggerLabel === "string" ? String((props as any).mobileTriggerLabel).trim().slice(0, 40) : "";
      const logoUrl = coerceCssUrl((props as any)?.logoUrl);
      const logoAlt = typeof (props as any)?.logoAlt === "string" ? String((props as any).logoAlt).trim().slice(0, 80) : "";
      const logoHref = sanitizeHref(typeof (props as any)?.logoHref === "string" ? (props as any).logoHref : undefined);
      const items = coerceHeaderItems((props as any)?.items);

      out.push({
        id,
        type,
        props: {
          desktopMode,
          ...(isGlobal !== undefined ? { isGlobal } : {}),
          ...(globalKey ? { globalKey } : {}),
          ...(sticky !== undefined ? { sticky } : {}),
          ...(transparent !== undefined ? { transparent } : {}),
          ...(mobileMode ? { mobileMode } : {}),
          ...(size ? { size } : {}),
          ...(sizeScale !== undefined ? { sizeScale } : {}),
          ...(mobileTrigger ? { mobileTrigger } : {}),
          ...(mobileTriggerLabel ? { mobileTriggerLabel } : {}),
          ...(logoUrl ? { logoUrl } : {}),
          ...(logoAlt ? { logoAlt } : {}),
          ...(logoHref ? { logoHref } : {}),
          ...(items ? { items } : {}),
          style,
        },
      });
      continue;
    }

    if (type === "anchor") {
      const anchorId = coerceAnchorId((props as any)?.anchorId);
      const label = typeof (props as any)?.label === "string" ? String((props as any).label).trim().slice(0, 80) : "";
      const style = coerceStyle((props as any)?.style);
      if (!anchorId) continue;
      out.push({
        id,
        type,
        props: {
          anchorId,
          ...(label ? { label } : {}),
          style,
        },
      });
      continue;
    }

    if (type === "salesCheckoutButton") {
      const priceId = typeof props?.priceId === "string" ? props.priceId.trim().slice(0, 128) : "";
      const quantity = clampNum((props as any)?.quantity, 1, 20);
      const productName = typeof props?.productName === "string" ? props.productName.trim().slice(0, 140) : "";
      const productDescription = typeof props?.productDescription === "string" ? props.productDescription.trim().slice(0, 320) : "";
      const text = typeof props?.text === "string" ? props.text.slice(0, 120) : "Buy now";
      const style = coerceStyle(props?.style);
      out.push({
        id,
        type,
        props: {
          priceId,
          ...(quantity ? { quantity } : {}),
          ...(productName ? { productName } : {}),
          ...(productDescription ? { productDescription } : {}),
          text,
          style,
        },
      });
      continue;
    }

    if (type === "addToCartButton") {
      const priceId = typeof props?.priceId === "string" ? props.priceId.trim().slice(0, 128) : "";
      const quantity = clampNum((props as any)?.quantity, 1, 20);
      const productName = typeof props?.productName === "string" ? props.productName.trim().slice(0, 140) : "";
      const productDescription = typeof props?.productDescription === "string" ? props.productDescription.trim().slice(0, 320) : "";
      const text = typeof props?.text === "string" ? props.text.slice(0, 120) : "Add to cart";
      const style = coerceStyle(props?.style);
      out.push({
        id,
        type,
        props: {
          priceId,
          ...(quantity ? { quantity } : {}),
          ...(productName ? { productName } : {}),
          ...(productDescription ? { productDescription } : {}),
          text,
          style,
        },
      });
      continue;
    }

    if (type === "cartButton") {
      const text = typeof props?.text === "string" ? props.text.slice(0, 120) : "Cart";
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { text, style } });
      continue;
    }

    if (type === "customCode") {
      const html = typeof props?.html === "string" ? props.html.slice(0, 50000) : "";
      const css = typeof props?.css === "string" ? props.css.slice(0, 50000) : "";
      const heightPx = clampNum((props as any)?.heightPx, 120, 2000);
      const chatJsonRaw = (props as any)?.chatJson;
      const chatJson = Array.isArray(chatJsonRaw)
        ? (chatJsonRaw
            .filter((m: any) => m && typeof m === "object")
            .map((m: any) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: typeof m.content === "string" ? m.content.slice(0, 24000) : "",
              at: typeof m.at === "string" ? m.at.slice(0, 64) : undefined,
            }))
            .filter((m: any) => typeof m.content === "string" && m.content.trim())
            .slice(-40))
        : undefined;
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { html, css: css || undefined, heightPx, style, ...(chatJson ? { chatJson } : {}) } as any });
      continue;
    }

    if (type === "chatbot") {
      const agentId = typeof props?.agentId === "string" ? props.agentId.trim().slice(0, 120) : "";
      const primaryColor = coerceCssColor((props as any)?.primaryColor);
      const launcherStyle = (props as any)?.launcherStyle === "dots" ? "dots" : (props as any)?.launcherStyle === "spark" ? "spark" : "bubble";
      const launcherImageUrl = coerceCssUrl((props as any)?.launcherImageUrl);
      const placementXRaw = typeof (props as any)?.placementX === "string" ? String((props as any).placementX).trim().toLowerCase() : "";
      const placementYRaw = typeof (props as any)?.placementY === "string" ? String((props as any).placementY).trim().toLowerCase() : "";
      const placementX = (placementXRaw === "left" || placementXRaw === "center" || placementXRaw === "right") ? (placementXRaw as any) : undefined;
      const placementY = (placementYRaw === "top" || placementYRaw === "middle" || placementYRaw === "bottom") ? (placementYRaw as any) : undefined;
      const style = coerceStyle(props?.style);
      out.push({
        id,
        type,
        props: {
          ...(agentId ? { agentId } : {}),
          ...(primaryColor ? { primaryColor } : {}),
          launcherStyle,
          ...(launcherImageUrl ? { launcherImageUrl } : {}),
          ...(placementX ? { placementX } : {}),
          ...(placementY ? { placementY } : {}),
          style,
        },
      });
      continue;
    }

    if (type === "heading") {
      const text = typeof props?.text === "string" ? props.text : "";
      const html = sanitizeRichTextHtml(props?.html);
      const levelNum = Number(props?.level);
      const level = [1, 2, 3].includes(levelNum)
        ? (levelNum as 1 | 2 | 3)
        : 2;
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { text, html, level, style } });
      continue;
    }

    if (type === "paragraph") {
      const text = typeof props?.text === "string" ? props.text : "";
      const html = sanitizeRichTextHtml(props?.html);
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { text, html, style } });
      continue;
    }

    if (type === "button") {
      const text =
        typeof props?.text === "string" ? props.text : "Click";
      const href =
        typeof props?.href === "string" ? props.href : "#";
      const variant =
        props?.variant === "secondary" ? "secondary" : "primary";
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { text, href, variant, style } });
      continue;
    }

    if (type === "image") {
      const src = typeof props?.src === "string" ? props.src : "";
      const alt = typeof props?.alt === "string" ? props.alt : "";
      const showFrame = coerceBool((props as any)?.showFrame);
      const style = coerceStyle(props?.style);
      out.push({
        id,
        type,
        props: {
          src,
          alt,
          ...(showFrame !== undefined ? { showFrame } : {}),
          style,
        },
      });
      continue;
    }

    if (type === "video") {
      const src = typeof props?.src === "string" ? props.src : "";
      const name = coerceMediaName((props as any)?.name);
      const posterUrl = coerceCssUrl((props as any)?.posterUrl);
      const controls = coerceBool((props as any)?.controls);
      const showControls = coerceBool((props as any)?.showControls);
      const autoplay = coerceBool((props as any)?.autoplay);
      const loop = coerceBool((props as any)?.loop);
      const muted = coerceBool((props as any)?.muted);
      const aspectRatio = coerceVideoAspectRatio((props as any)?.aspectRatio);
      const fit = coerceVideoFit((props as any)?.fit);
      const showFrame = coerceBool((props as any)?.showFrame);
      const style = coerceStyle(props?.style);
      out.push({
        id,
        type,
        props: {
          src,
          ...(name ? { name } : {}),
          ...(posterUrl ? { posterUrl } : {}),
          ...(controls !== undefined ? { controls } : {}),
          ...(showControls !== undefined ? { showControls } : {}),
          ...(autoplay !== undefined ? { autoplay } : {}),
          ...(loop !== undefined ? { loop } : {}),
          ...(muted !== undefined ? { muted } : {}),
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(fit ? { fit } : {}),
          ...(showFrame !== undefined ? { showFrame } : {}),
          style,
        },
      });
      continue;
    }

    if (type === "spacer") {
      const heightNum = Number(props?.height);
      const height = Number.isFinite(heightNum)
        ? Math.max(0, heightNum)
        : 24;
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { height, style } });
      continue;
    }

    if (type === "formLink") {
      const formSlug =
        typeof props?.formSlug === "string" ? props.formSlug : "";
      const text =
        typeof props?.text === "string" ? props.text : "Open form";
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { formSlug, text, style } });
      continue;
    }

    if (type === "formEmbed") {
      const formSlug = typeof props?.formSlug === "string" ? props.formSlug : "";
      const height = clampNum(props?.height, 120, 2000);
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { formSlug, height, style } });
      continue;
    }

    if (type === "calendarEmbed") {
      const calendarId = typeof props?.calendarId === "string" ? props.calendarId : "";
      const height = clampNum(props?.height, 120, 2000);
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { calendarId, height, style } });
      continue;
    }

    if (type === "columns") {
      const rawColumns = Array.isArray(props?.columns) ? (props.columns as any[]) : null;
      const legacyLeftMarkdown = typeof props?.leftMarkdown === "string" ? props.leftMarkdown : "";
      const legacyRightMarkdown = typeof props?.rightMarkdown === "string" ? props.rightMarkdown : "";
      const legacyLeftChildren = coerceBlocksJsonInternal(props?.leftChildren, depth + 1).filter((b) => b.type !== "page");
      const legacyRightChildren = coerceBlocksJsonInternal(props?.rightChildren, depth + 1).filter((b) => b.type !== "page");
      const gapPx = clampNum(props?.gapPx, 0, 120) ?? 24;
      const stackOnMobile = props?.stackOnMobile !== false;
      const style = coerceStyle(props?.style);
      const legacyLeftStyle = coerceStyle(props?.leftStyle);
      const legacyRightStyle = coerceStyle(props?.rightStyle);

      const nextColumns: ColumnsColumn[] = [];
      if (rawColumns && rawColumns.length) {
        for (const c of rawColumns.slice(0, 6)) {
          if (!c || typeof c !== "object") continue;
          const markdown = typeof (c as any).markdown === "string" ? String((c as any).markdown) : "";
          const children = coerceBlocksJsonInternal((c as any).children, depth + 1).filter((b) => b.type !== "page");
          const colStyle = coerceStyle((c as any).style);
          nextColumns.push({
            markdown,
            children: children.length ? children : undefined,
            style: colStyle,
          });
        }
      } else {
        nextColumns.push({
          markdown: legacyLeftMarkdown,
          children: legacyLeftChildren.length ? legacyLeftChildren : undefined,
          style: legacyLeftStyle,
        });
        nextColumns.push({
          markdown: legacyRightMarkdown,
          children: legacyRightChildren.length ? legacyRightChildren : undefined,
          style: legacyRightStyle,
        });
      }

      const cols = nextColumns.length ? nextColumns : [{ markdown: "" }, { markdown: "" }];
      out.push({
        id,
        type,
        props: {
          columns: cols,
          gapPx,
          stackOnMobile,
          style,
        },
      });
      continue;
    }

    if (type === "section") {
      const anchorId = coerceAnchorId((props as any)?.anchorId);
      const anchorLabel = typeof (props as any)?.anchorLabel === "string" ? String((props as any).anchorLabel).trim().slice(0, 80) : "";
      const layout = props?.layout === "two" ? "two" : "one";
      const children = coerceBlocksJsonInternal(props?.children, depth + 1).filter((b) => b.type !== "page");
      const leftChildren = coerceBlocksJsonInternal(props?.leftChildren, depth + 1).filter((b) => b.type !== "page");
      const rightChildren = coerceBlocksJsonInternal(props?.rightChildren, depth + 1).filter((b) => b.type !== "page");
      const markdown = typeof props?.markdown === "string" ? props.markdown : "";
      const leftMarkdown = typeof props?.leftMarkdown === "string" ? props.leftMarkdown : "";
      const rightMarkdown = typeof props?.rightMarkdown === "string" ? props.rightMarkdown : "";
      const gapPx = clampNum(props?.gapPx, 0, 120) ?? 24;
      const stackOnMobile = props?.stackOnMobile !== false;
      const style = coerceStyle(props?.style);
      const leftStyle = coerceStyle(props?.leftStyle);
      const rightStyle = coerceStyle(props?.rightStyle);
      out.push({
        id,
        type,
        props: {
          ...(anchorId ? { anchorId } : {}),
          ...(anchorLabel ? { anchorLabel } : {}),
          layout,
          children: children.length ? children : undefined,
          leftChildren: leftChildren.length ? leftChildren : undefined,
          rightChildren: rightChildren.length ? rightChildren : undefined,
          markdown,
          leftMarkdown,
          rightMarkdown,
          gapPx,
          stackOnMobile,
          style,
          leftStyle,
          rightStyle,
        },
      });
      continue;
    }
  }

  return out;
}

export function coerceBlocksJson(value: unknown): CreditFunnelBlock[] {
  return coerceBlocksJsonInternal(value, 0);
}

function buttonClass(variant: "primary" | "secondary") {
  if (variant === "secondary") {
    return [
      "inline-flex items-center justify-center rounded-xl",
      "border border-zinc-200 bg-white",
      "px-5 py-3 text-sm font-semibold",
      "hover:bg-zinc-50",
    ].join(" ");
  }

  return [
    "inline-flex items-center justify-center rounded-xl",
    "bg-[color:var(--color-brand-blue)]",
    "px-5 py-3 text-sm font-semibold text-white",
    "hover:bg-blue-700",
  ].join(" ");
}

function wrapperStyle(style?: BlockStyle): React.CSSProperties {
  const s = style;
  const out: React.CSSProperties = {};
  if (!s) return out;
  if (s.fontFamily) out.fontFamily = s.fontFamily;
  if (s.textColor) out.color = s.textColor;
  if (s.backgroundColor) out.backgroundColor = s.backgroundColor;
  if (s.backgroundImageUrl) {
    const safeUrl = s.backgroundImageUrl.replace(/"/g, "\\\"");
    out.backgroundImage = `url(\"${safeUrl}\")`;
    out.backgroundSize = "cover";
    out.backgroundPosition = "center";
    out.backgroundRepeat = "no-repeat";
  }
  if (s.align) out.textAlign = s.align;
  if (typeof s.marginTopPx === "number") out.marginTop = s.marginTopPx;
  if (typeof s.marginBottomPx === "number") out.marginBottom = s.marginBottomPx;
  if (typeof s.paddingPx === "number") out.padding = s.paddingPx;
  if (typeof s.borderRadiusPx === "number") out.borderRadius = s.borderRadiusPx;
  if (typeof s.maxWidthPx === "number" && s.maxWidthPx > 0) {
    out.maxWidth = s.maxWidthPx;
    out.marginLeft = out.textAlign === "center" ? "auto" : undefined;
    out.marginRight = out.textAlign === "center" ? "auto" : undefined;
  }
  return out;
}

function backgroundVideoNode(style?: BlockStyle): React.ReactNode {
  const src = String(style?.backgroundVideoUrl || "").trim();
  if (!src) return null;
  const poster = String(style?.backgroundVideoPosterUrl || "").trim();

  return React.createElement("video", {
    className: "absolute inset-0 h-full w-full object-cover",
    src,
    ...(poster ? { poster } : null),
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    controls: false,
    preload: "metadata",
    "aria-hidden": true,
    tabIndex: -1,
  } as any);
}

function textStyle(style?: BlockStyle): React.CSSProperties {
  const s = style;
  const out: React.CSSProperties = {};
  if (!s) return out;
  if (typeof s.fontSizePx === "number" && s.fontSizePx > 0) out.fontSize = s.fontSizePx;
  return out;
}

function renderMarkdown(content: string): React.ReactNode {
  const blocks = parseBlogContent(content);
  return React.createElement(
    React.Fragment,
    null,
    blocks.map((b, idx) => {
      if (b.type === "h2") {
        return React.createElement(
          "h2",
          { key: idx, className: "pt-4 text-xl font-bold" },
          React.createElement("span", { dangerouslySetInnerHTML: { __html: inlineMarkdownToHtmlSafe(b.text) } }),
        );
      }
      if (b.type === "h3") {
        return React.createElement(
          "h3",
          { key: idx, className: "pt-2 text-lg font-bold" },
          React.createElement("span", { dangerouslySetInnerHTML: { __html: inlineMarkdownToHtmlSafe(b.text) } }),
        );
      }
      if (b.type === "p") {
        return React.createElement(
          "p",
          { key: idx, className: "text-base leading-relaxed" },
          React.createElement("span", { dangerouslySetInnerHTML: { __html: inlineMarkdownToHtmlSafe(b.text) } }),
        );
      }
      if (b.type === "ul") {
        return React.createElement(
          "ul",
          { key: idx, className: "list-disc space-y-1 pl-6" },
          b.items.map((item, j) =>
            React.createElement(
              "li",
              { key: j },
              React.createElement("span", { dangerouslySetInnerHTML: { __html: inlineMarkdownToHtmlSafe(item) } }),
            ),
          ),
        );
      }
      if (b.type === "img") {
        return React.createElement(
          "div",
          { key: idx, className: "overflow-hidden rounded-2xl border border-zinc-200" },
          React.createElement("img", { src: b.src, alt: b.alt, className: "h-auto w-full" }),
        );
      }
      return null;
    }),
  );
}

export function renderCreditFunnelBlocks({
  blocks,
  basePath,
  context,
  editor,
}: {
  blocks: CreditFunnelBlock[];
  basePath: string;
  context?: {
    bookingSiteSlug?: string;
    bookingOwnerId?: string;
    funnelPageId?: string;
    funnelSlug?: string;
    funnelPathBase?: string;
    funnelPageSlug?: string;
    previewDevice?: "desktop" | "mobile";
    previewEmbedMode?: "live" | "placeholder";
  };
  editor?: {
    enabled?: boolean;
    selectedBlockId?: string | null;
    hoveredBlockId?: string | null;
    aiFocusedBlockId?: string | null;
    aiFocusedPhase?: "pending" | "settled" | null;
    onSelectBlockId?: (id: string) => void;
    onHoverBlockId?: (id: string | null) => void;
    onUpsertBlock?: (next: CreditFunnelBlock) => void;
    onReorder?: (dragId: string, dropId: string) => void;
    onMove?: (id: string, dir: "up" | "down") => void;
    canMove?: (id: string, dir: "up" | "down") => boolean;
  };
}): React.ReactNode {
  const first = blocks[0];
  const pageStyleBlock = first && first.type === "page" ? first : null;
  const renderBlocks = pageStyleBlock ? blocks.slice(1) : blocks;
  const googleCss = (() => {
    const families = new Set<string>();

    const addFromStyle = (style: unknown) => {
      if (!style || typeof style !== "object") return;
      const fam = typeof (style as any).fontGoogleFamily === "string" ? String((style as any).fontGoogleFamily).trim() : "";
      if (!fam) return;
      if (!googleFontImportCss(fam)) return;
      families.add(fam);
    };

    addFromStyle(pageStyleBlock?.props?.style);

    const walk = (arr: CreditFunnelBlock[]) => {
      for (const b of arr) {
        if (!b || typeof b !== "object") continue;
        addFromStyle((b.props as any)?.style);

        if (b.type === "section") {
          addFromStyle((b.props as any)?.leftStyle);
          addFromStyle((b.props as any)?.rightStyle);
          if (Array.isArray((b.props as any)?.children)) walk((b.props as any).children);
          if (Array.isArray((b.props as any)?.leftChildren)) walk((b.props as any).leftChildren);
          if (Array.isArray((b.props as any)?.rightChildren)) walk((b.props as any).rightChildren);
          continue;
        }

        if (b.type === "columns") {
          const cols = Array.isArray((b.props as any)?.columns) ? ((b.props as any).columns as any[]) : [];
          for (const c of cols) {
            addFromStyle(c?.style);
            if (c && Array.isArray((c as any).children)) walk((c as any).children);
          }
          continue;
        }
      }
    };

    walk(renderBlocks);

    const css = Array.from(families)
      .map((f) => googleFontImportCss(f))
      .filter(Boolean)
      .join("\n");

    return css || null;
  })();

  const isEditor = Boolean(editor?.enabled);
  const isPreviewRender = Boolean(context?.previewDevice);
  const previewEmbedMode = context?.previewEmbedMode === "placeholder" ? "placeholder" : "live";
  const previewUsesEmbedPlaceholders = isPreviewRender && previewEmbedMode === "placeholder";
  const isMobilePreview = context?.previewDevice === "mobile";

  const previewEmbedHeight = (raw: number | undefined, desktopFallback: number, mobileMax: number) => {
    const base = typeof raw === "number" && Number.isFinite(raw) ? raw : desktopFallback;
    if (!previewUsesEmbedPlaceholders) return base;
    return Math.min(base, isMobilePreview ? mobileMax : desktopFallback);
  };

  const renderEmbedPlaceholder = (opts: {
    key: string;
    style?: BlockStyle;
    blockId: string;
    title: string;
    subtitle: string;
    detail?: string;
    height: number;
  }) =>
    React.createElement(
      "div",
      {
        key: opts.key,
        style: { ...wrapperStyle(opts.style), ...(blockWrapStyle(opts.blockId) || {}) },
        ...wrapProps(opts.blockId),
      },
      renderMoveControls(opts.blockId),
      React.createElement(
        "div",
        {
          className: "overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm",
          style: { minHeight: opts.height },
        },
        React.createElement(
          "div",
          {
            className: "flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3",
          },
          React.createElement(
            "div",
            null,
            React.createElement("div", { className: "text-sm font-semibold text-zinc-900" }, opts.title),
            React.createElement("div", { className: "mt-1 text-xs text-zinc-500" }, opts.subtitle),
          ),
          React.createElement(
            "div",
            { className: "rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500" },
            "Preview paused",
          ),
        ),
        React.createElement(
          "div",
          {
            className: "flex h-full min-h-[inherit] items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-8 text-center",
          },
          React.createElement(
            "div",
            { className: "max-w-sm" },
            React.createElement("div", { className: "text-sm font-semibold text-zinc-900" }, opts.title),
            React.createElement(
              "div",
              { className: "mt-2 text-sm text-zinc-600" },
              opts.detail || "Live embeds are simplified inside the editor preview so the canvas stays fast and the phone viewport remains realistic.",
            ),
          ),
        ),
      ),
    );

  const renderCornerResizeHandle = (block: CreditFunnelBlock): React.ReactNode => {
    if (!isEditor) return null;
    if (!editor?.onUpsertBlock) return null;
    if (block.type !== "image" && block.type !== "video") return null;

    const selected = editor?.selectedBlockId === block.id;
    const hovered = editor?.hoveredBlockId === block.id;
    if (!selected && !hovered) return null;

    const MIN_W = 80;
    const MAX_W = 1600;

    return React.createElement("div", {
      key: `${block.id}_resize_handle`,
      "data-funnel-editor-interactive": "true",
      className:
        "absolute bottom-2 right-2 z-10 h-5 w-5 cursor-se-resize rounded-md border border-zinc-200 bg-white shadow-sm hover:bg-zinc-50",
      title: "Drag to resize",
      onPointerDown: (e: any) => {
        e.preventDefault?.();
        e.stopPropagation?.();

        const target = e.currentTarget as HTMLElement | null;
        const wrapper = (target?.parentElement || target) as HTMLElement | null;
        const rect = wrapper?.getBoundingClientRect?.();
        const startWidth = rect && Number.isFinite(rect.width) ? rect.width : 0;
        const startX = typeof e.clientX === "number" ? e.clientX : 0;

        const startMaxWidthPxRaw = (block.props as any)?.style?.maxWidthPx;
        const startMaxWidthPx =
          typeof startMaxWidthPxRaw === "number" && Number.isFinite(startMaxWidthPxRaw) && startMaxWidthPxRaw > 0
            ? startMaxWidthPxRaw
            : startWidth;

        const upsert = editor.onUpsertBlock!;
        let raf = 0;
        let lastWidth = startMaxWidthPx;

        const clampWidth = (w: number) => Math.max(MIN_W, Math.min(MAX_W, w));
        const commit = (nextW: number) => {
          const nextWidth = clampWidth(nextW);
          if (Math.abs(nextWidth - lastWidth) < 1) return;
          lastWidth = nextWidth;
          const prevStyle = ((block.props as any)?.style || {}) as any;
          upsert({
            ...block,
            props: {
              ...(block.props as any),
              style: {
                ...prevStyle,
                maxWidthPx: Math.round(nextWidth),
              },
            },
          } as any);
        };

        const onMove = (ev: any) => {
          const x = typeof ev.clientX === "number" ? ev.clientX : startX;
          const dx = x - startX;
          const next = startMaxWidthPx + dx;
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => commit(next));
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (raf) cancelAnimationFrame(raf);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      },
    });
  };

  const collectChatbotBlocks = (xs: CreditFunnelBlock[]): CreditFunnelBlock[] => {
    const out: CreditFunnelBlock[] = [];
    const walk = (arr: CreditFunnelBlock[]) => {
      for (const b of arr) {
        if (!b || typeof b !== "object") continue;
        if (b.type === "chatbot") {
          out.push(b);
          continue;
        }
        if (b.type === "section") {
          if (Array.isArray((b.props as any)?.children)) walk((b.props as any).children);
          if (Array.isArray((b.props as any)?.leftChildren)) walk((b.props as any).leftChildren);
          if (Array.isArray((b.props as any)?.rightChildren)) walk((b.props as any).rightChildren);
          continue;
        }
        if (b.type === "columns") {
          const cols = Array.isArray((b.props as any)?.columns) ? ((b.props as any).columns as any[]) : [];
          for (const c of cols) {
            if (c && Array.isArray((c as any).children)) walk((c as any).children);
          }
          continue;
        }
      }
    };
    walk(xs);
    return out;
  };

  const chatbotBlocks = isEditor ? collectChatbotBlocks(renderBlocks) : [];

  const leadingHeader = renderBlocks[0]?.type === "headerNav" ? (renderBlocks[0] as CreditFunnelBlock) : null;
  const bodyBlocks = leadingHeader ? renderBlocks.slice(1) : renderBlocks;

  const pageCss = [
    // Tailwind's `space-y-4` adds margin-top between siblings; remove the default gap directly after a header block.
    ".funnel-blocks > .funnel-header-block + :not([hidden]){margin-top:0!important;}",
    ".space-y-4 > .funnel-header-block + :not([hidden]){margin-top:0!important;}",
    "@keyframes funnel-editor-ai-pulse{0%,100%{transform:translateY(0) scale(1);opacity:1}50%{transform:translateY(-1px) scale(1.003);opacity:1}}",
    "@keyframes funnel-editor-ai-settle{0%{transform:translateY(-1px) scale(1.006)}100%{transform:translateY(0) scale(1)}}",
  ].join("\n");

  const renderMoveControls = (id: string): React.ReactNode => {
    if (!isEditor) return null;
    if (!editor?.onMove) return null;
    const selected = editor?.selectedBlockId === id;
    const hovered = editor?.hoveredBlockId === id;
    if (!selected && !hovered) return null;

    const canUp = editor?.canMove ? editor.canMove(id, "up") : true;
    const canDown = editor?.canMove ? editor.canMove(id, "down") : true;

    return React.createElement(
      "div",
      {
        key: `${id}_move_controls`,
        className: "absolute right-2 top-2 z-[45] flex flex-col gap-1",
      },
      React.createElement(
        "button",
        {
          type: "button",
          disabled: !canUp,
          onMouseDown: (e: any) => {
            e.preventDefault?.();
            e.stopPropagation?.();
          },
          onClick: (e: any) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            editor.onMove?.(id, "up");
          },
          className:
            "h-7 w-7 rounded-lg border border-zinc-200 bg-white text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40",
          title: "Move up",
          "aria-label": "Move up",
        },
        "↑",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          disabled: !canDown,
          onMouseDown: (e: any) => {
            e.preventDefault?.();
            e.stopPropagation?.();
          },
          onClick: (e: any) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            editor.onMove?.(id, "down");
          },
          className:
            "h-7 w-7 rounded-lg border border-zinc-200 bg-white text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40",
          title: "Move down",
          "aria-label": "Move down",
        },
        "↓",
      ),
    );
  };

  const blockWrapStyle = (id: string): React.CSSProperties | undefined => {
    if (!isEditor) return undefined;
    const selected = editor?.selectedBlockId === id;
    const hovered = editor?.hoveredBlockId === id;
    const aiFocused = editor?.aiFocusedBlockId === id;
    const aiPhase = editor?.aiFocusedPhase || null;
    if (!selected && !hovered && !aiFocused) return undefined;
    const color = selected
      ? "var(--color-brand-blue)"
      : aiFocused
        ? "rgba(24, 24, 27, 0.42)"
        : "rgba(15, 23, 42, 0.25)";
    return {
      boxShadow: aiFocused
        ? `0 0 0 ${selected ? 2 : 1.5}px ${color}, 0 16px 32px rgba(15, 23, 42, 0.08)`
        : `0 0 0 ${selected ? 2 : 1}px ${color}`,
      borderRadius: 12,
      transition: "box-shadow 180ms ease, transform 180ms ease",
      animation: aiFocused
        ? aiPhase === "pending"
          ? "funnel-editor-ai-pulse 1.15s ease-in-out infinite"
          : aiPhase === "settled"
            ? "funnel-editor-ai-settle 700ms cubic-bezier(0.22, 1, 0.36, 1) 1"
            : undefined
        : undefined,
    };
  };

  const wrapProps = (id: string): Record<string, any> => {
    if (!isEditor) return {};
    const isInteractiveTarget = (evtTarget: any): boolean => {
      try {
        const el: any = evtTarget && evtTarget.nodeType === 1 ? evtTarget : evtTarget?.parentElement;
        return Boolean(el?.closest?.('[data-funnel-editor-interactive="true"]'));
      } catch {
        return false;
      }
    };
    return {
      "data-block-id": id,
      className: "relative",
      onMouseDownCapture: (e: any) => {
        // Always select on click/tap, even if the target is an interactive widget.
        // Don't preventDefault/stopPropagation so the widget remains usable.
        if (typeof e?.button === "number" && e.button !== 0) return;
        editor?.onSelectBlockId?.(id);
      },
      onClick: (e: any) => {
        if (isInteractiveTarget(e?.target)) return;
        e.preventDefault?.();
        e.stopPropagation?.();
        editor?.onSelectBlockId?.(id);
      },
      onMouseEnter: () => editor?.onHoverBlockId?.(id),
      onMouseLeave: () => editor?.onHoverBlockId?.(null),
      draggable: Boolean(editor?.onReorder),
      onDragStart: (e: any) => {
        if (!editor?.onReorder) return;
        if (isInteractiveTarget(e?.target)) {
          e.preventDefault?.();
          return;
        }
        e.dataTransfer.setData("text/x-block-id", id);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: any) => {
        if (!editor?.onReorder) return;
        e.preventDefault?.();
        e.dataTransfer.dropEffect = "move";
      },
      onDrop: (e: any) => {
        if (!editor?.onReorder) return;
        e.preventDefault?.();
        const dragId = e.dataTransfer.getData("text/x-block-id");
        if (dragId) editor.onReorder(dragId, id);
      },
    };
  };

  const editableTextProps = (
    block: CreditFunnelBlock,
    currentText: string,
  ): Record<string, any> => {
    if (!isEditor) return {};
    if (editor?.selectedBlockId !== block.id) return {};
    const upsert = editor?.onUpsertBlock;
    if (!upsert) return {};
    const nextTextFromEl = (el: any) => (typeof el?.textContent === "string" ? el.textContent : "");
    const nextHtmlFromEl = (el: any) => (typeof el?.innerHTML === "string" ? el.innerHTML : "");
    return {
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: true,
      onKeyDown: (e: any) => {
        if (e.key === "Enter") {
          e.preventDefault?.();
          e.currentTarget?.blur?.();
        }
        if (e.key === "Escape") {
          e.preventDefault?.();
          e.currentTarget?.blur?.();
        }
      },
      onBlur: (e: any) => {
        if (block.type === "heading") {
          const nextText = nextTextFromEl(e.currentTarget).replace(/\s+/g, " ").trim();
          const nextHtml = sanitizeRichTextHtml(nextHtmlFromEl(e.currentTarget));
          if (nextText === currentText && nextHtml === (block.props.html || undefined)) return;
          upsert({ ...block, props: { ...block.props, text: nextText, html: nextHtml } } as CreditFunnelBlock);
          return;
        }
        if (block.type === "paragraph") {
          const nextText = nextTextFromEl(e.currentTarget);
          const nextHtml = sanitizeRichTextHtml(nextHtmlFromEl(e.currentTarget));
          if (nextText === currentText && nextHtml === (block.props.html || undefined)) return;
          upsert({ ...block, props: { ...block.props, text: nextText, html: nextHtml } } as CreditFunnelBlock);
          return;
        }
        if (block.type === "button") {
          const nextText = nextTextFromEl(e.currentTarget);
          if (nextText === currentText) return;
          upsert({ ...block, props: { ...block.props, text: nextText } } as CreditFunnelBlock);
          return;
        }
        if (block.type === "formLink") {
          const nextText = nextTextFromEl(e.currentTarget);
          if (nextText === currentText) return;
          upsert({ ...block, props: { ...block.props, text: nextText } } as CreditFunnelBlock);
          return;
        }
      },
    };
  };

  const renderBlocksInner: (inner: CreditFunnelBlock[]) => React.ReactNode[] = (inner) =>
    inner.map((b) => {
      if (b.type === "page") return null;

      if (b.type === "salesCheckoutButton") {
        const pageId = typeof context?.funnelPageId === "string" ? context.funnelPageId : "";
        const priceId = String((b.props as any)?.priceId || "").trim();
        const quantityRaw = (b.props as any)?.quantity;
        const quantity = typeof quantityRaw === "number" && Number.isFinite(quantityRaw) ? Math.max(1, Math.min(20, quantityRaw)) : undefined;
        const productName = typeof (b.props as any)?.productName === "string" ? String((b.props as any).productName).trim() : "";
        const productDescription =
          typeof (b.props as any)?.productDescription === "string" ? String((b.props as any).productDescription).trim() : "";
        const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Buy now";

        if (!isEditor && (!pageId || !priceId)) return null;

        const s = (b.props as any)?.style as BlockStyle | undefined;
        const wrapper: React.CSSProperties = wrapperStyle({
          align: s?.align,
          marginTopPx: s?.marginTopPx,
          marginBottomPx: s?.marginBottomPx,
          maxWidthPx: s?.maxWidthPx,
        });

        const borderWidth =
          typeof s?.borderWidthPx === "number"
            ? s.borderWidthPx
            : s?.borderColor
              ? 1
              : undefined;

        const btnStyle: React.CSSProperties = {
          ...textStyle(s),
          fontFamily: s?.fontFamily,
          color: s?.textColor,
          backgroundColor: s?.backgroundColor,
          borderRadius: typeof s?.borderRadiusPx === "number" ? s.borderRadiusPx : undefined,
          padding: typeof s?.paddingPx === "number" ? s.paddingPx : undefined,
          borderWidth: borderWidth,
          borderStyle: borderWidth !== undefined ? "solid" : undefined,
          borderColor: borderWidth !== undefined ? (s?.borderColor || "currentColor") : undefined,
        };

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          productName || productDescription
            ? React.createElement(
                "div",
                { className: "mb-3" },
                productName
                  ? React.createElement(
                      "div",
                      {
                        className: "text-base font-semibold text-zinc-900",
                        style: { ...(s?.fontFamily ? { fontFamily: s.fontFamily } : {}) },
                      },
                      productName,
                    )
                  : null,
                productDescription
                  ? React.createElement(
                      "div",
                      {
                        className: "mt-1 text-sm text-zinc-600",
                        style: { ...(s?.fontFamily ? { fontFamily: s.fontFamily } : {}) },
                      },
                      productDescription,
                    )
                  : null,
              )
            : null,
          React.createElement(
            SafeClientBoundary,
            { name: "Sales checkout button" },
            React.createElement(SalesCheckoutButton, {
              pageId,
              priceId,
              quantity,
              text,
              disabled: isEditor,
              style: Object.keys(btnStyle).some((k) => (btnStyle as any)[k] !== undefined) ? btnStyle : undefined,
            }),
          ),
        );
      }

      if (b.type === "headerNav") {
        const s = (b.props as any)?.style as BlockStyle | undefined;
        const items = Array.isArray((b.props as any)?.items) ? ((b.props as any).items as FunnelHeaderNavItem[]) : [];
        const logoUrl = typeof (b.props as any)?.logoUrl === "string" ? String((b.props as any).logoUrl).trim() : "";
        const logoAlt = typeof (b.props as any)?.logoAlt === "string" ? String((b.props as any).logoAlt).trim() : "";
        const logoHref = typeof (b.props as any)?.logoHref === "string" ? String((b.props as any).logoHref).trim() : "";
        const sticky = (b.props as any)?.sticky === true;
        const transparent = (b.props as any)?.transparent === true;
        const mobileMode = (b.props as any)?.mobileMode === "slideover" ? "slideover" : "dropdown";
        const desktopMode =
          (b.props as any)?.desktopMode === "slideover"
            ? "slideover"
            : (b.props as any)?.desktopMode === "dropdown"
              ? "dropdown"
              : "inline";
        const size = (b.props as any)?.size === "lg" ? "lg" : (b.props as any)?.size === "sm" ? "sm" : "md";
        const sizeScaleRaw = (b.props as any)?.sizeScale;
        const sizeScale = typeof sizeScaleRaw === "number" && Number.isFinite(sizeScaleRaw) ? sizeScaleRaw : undefined;
        const mobileTrigger = (b.props as any)?.mobileTrigger === "directory" ? "directory" : "hamburger";
        const mobileTriggerLabel =
          typeof (b.props as any)?.mobileTriggerLabel === "string" ? String((b.props as any).mobileTriggerLabel).trim() : "";

        const wrapper: React.CSSProperties = {
          ...wrapperStyle({
            align: s?.align,
            marginTopPx: s?.marginTopPx,
            marginBottomPx: s?.marginBottomPx,
            maxWidthPx: s?.maxWidthPx,
          }),
        };

        // Sticky headers are more reliable when the *block wrapper* is sticky.
        // Also force sticky headers to be full-width (the header component already constrains inner content).
        if (sticky) {
          wrapper.marginTop = 0;
          wrapper.maxWidth = undefined;
          wrapper.marginLeft = undefined;
          wrapper.marginRight = undefined;
          wrapper.padding = undefined;
          wrapper.borderRadius = undefined;
        }

        const headerStyle: React.CSSProperties = {
          fontFamily: s?.fontFamily,
          color: s?.textColor,
          backgroundColor: transparent ? "transparent" : s?.backgroundColor,
        };

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) },
            ...(() => {
              const wp = wrapProps(b.id);
              return {
                ...wp,
                className: [
                  wp.className,
                  "funnel-header-block",
                  sticky ? "sticky top-0 z-[60]" : null,
                ]
                  .filter(Boolean)
                  .join(" "),
              };
            })(),
          },
          renderMoveControls(b.id),
          React.createElement(
            SafeClientBoundary,
            { name: "Header nav" },
            React.createElement(FunnelHeaderNav, {
              logoUrl: logoUrl || undefined,
              logoAlt: logoAlt || undefined,
              logoHref: logoHref || undefined,
              items,
              // Sticky positioning is applied on the wrapper (more reliable across containers).
              sticky: false,
              transparent,
              mobileMode,
              desktopMode,
              size,
              sizeScale,
              mobileTrigger,
              mobileTriggerLabel: mobileTriggerLabel || undefined,
              disabled: isEditor,
              funnelPathBase: typeof context?.funnelPathBase === "string" ? context.funnelPathBase : undefined,
              style: Object.keys(headerStyle).some((k) => (headerStyle as any)[k] !== undefined) ? headerStyle : undefined,
            }),
          ),
        );
      }

      if (b.type === "anchor") {
        const anchorId = String((b.props as any)?.anchorId || "").trim();
        const s = (b.props as any)?.style as BlockStyle | undefined;
        const wrapper: React.CSSProperties = wrapperStyle({
          align: s?.align,
          marginTopPx: s?.marginTopPx,
          marginBottomPx: s?.marginBottomPx,
          maxWidthPx: s?.maxWidthPx,
        });

        return React.createElement(
          "div",
          {
            key: b.id,
            id: anchorId || undefined,
            style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement("div", { style: { height: 1 } }),
        );
      }

      if (b.type === "addToCartButton") {
        const pageId = typeof context?.funnelPageId === "string" ? context.funnelPageId : "";
        const priceId = String((b.props as any)?.priceId || "").trim();
        const quantityRaw = (b.props as any)?.quantity;
        const quantity = typeof quantityRaw === "number" && Number.isFinite(quantityRaw) ? Math.max(1, Math.min(20, quantityRaw)) : undefined;
        const productName = typeof (b.props as any)?.productName === "string" ? String((b.props as any).productName).trim() : "";
        const productDescription =
          typeof (b.props as any)?.productDescription === "string" ? String((b.props as any).productDescription).trim() : "";
        const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Add to cart";

        if (!isEditor && (!pageId || !priceId)) return null;

        const s = (b.props as any)?.style as BlockStyle | undefined;
        const wrapper: React.CSSProperties = wrapperStyle({
          align: s?.align,
          marginTopPx: s?.marginTopPx,
          marginBottomPx: s?.marginBottomPx,
          maxWidthPx: s?.maxWidthPx,
        });

        const borderWidth =
          typeof s?.borderWidthPx === "number"
            ? s.borderWidthPx
            : s?.borderColor
              ? 1
              : undefined;

        const btnStyle: React.CSSProperties = {
          ...textStyle(s),
          fontFamily: s?.fontFamily,
          color: s?.textColor,
          backgroundColor: s?.backgroundColor,
          borderRadius: typeof s?.borderRadiusPx === "number" ? s.borderRadiusPx : undefined,
          padding: typeof s?.paddingPx === "number" ? s.paddingPx : undefined,
          borderWidth: borderWidth,
          borderStyle: borderWidth !== undefined ? "solid" : undefined,
          borderColor: borderWidth !== undefined ? (s?.borderColor || "currentColor") : undefined,
        };

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          productName || productDescription
            ? React.createElement(
                "div",
                { className: "mb-3" },
                productName
                  ? React.createElement(
                      "div",
                      {
                        className: "text-base font-semibold text-zinc-900",
                        style: { ...(s?.fontFamily ? { fontFamily: s.fontFamily } : {}) },
                      },
                      productName,
                    )
                  : null,
                productDescription
                  ? React.createElement(
                      "div",
                      {
                        className: "mt-1 text-sm text-zinc-600",
                        style: { ...(s?.fontFamily ? { fontFamily: s.fontFamily } : {}) },
                      },
                      productDescription,
                    )
                  : null,
              )
            : null,
          React.createElement(
            SafeClientBoundary,
            { name: "Add to cart button" },
            React.createElement(AddToCartButton, {
              pageId,
              priceId,
              quantity,
              productName,
              productDescription,
              text,
              disabled: isEditor,
              style: Object.keys(btnStyle).some((k) => (btnStyle as any)[k] !== undefined) ? btnStyle : undefined,
            }),
          ),
        );
      }

      if (b.type === "cartButton") {
        const pageId = typeof context?.funnelPageId === "string" ? context.funnelPageId : "";
        const text = typeof (b.props as any)?.text === "string" ? String((b.props as any).text) : "Cart";

        if (!isEditor && !pageId) return null;

        const s = (b.props as any)?.style as BlockStyle | undefined;
        const wrapper: React.CSSProperties = wrapperStyle({
          align: s?.align,
          marginTopPx: s?.marginTopPx,
          marginBottomPx: s?.marginBottomPx,
          maxWidthPx: s?.maxWidthPx,
        });

        const borderWidth =
          typeof s?.borderWidthPx === "number"
            ? s.borderWidthPx
            : s?.borderColor
              ? 1
              : undefined;

        const btnStyle: React.CSSProperties = {
          ...textStyle(s),
          fontFamily: s?.fontFamily,
          color: s?.textColor,
          backgroundColor: s?.backgroundColor,
          borderRadius: typeof s?.borderRadiusPx === "number" ? s.borderRadiusPx : undefined,
          padding: typeof s?.paddingPx === "number" ? s.paddingPx : undefined,
          borderWidth: borderWidth,
          borderStyle: borderWidth !== undefined ? "solid" : undefined,
          borderColor: borderWidth !== undefined ? (s?.borderColor || "currentColor") : undefined,
        };

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement(
            SafeClientBoundary,
            { name: "Cart button" },
            React.createElement(CartButton, {
              pageId,
              text,
              disabled: isEditor,
              style: Object.keys(btnStyle).some((k) => (btnStyle as any)[k] !== undefined) ? btnStyle : undefined,
            }),
          ),
        );
      }

      if (b.type === "customCode") {
        const html = String(b.props.html || "");
        const css = String(b.props.css || "");
        const height = typeof b.props.heightPx === "number" ? b.props.heightPx : 360;
        const srcDoc = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${css.trim() ? `<style>${css}</style>` : ""}</head><body>${html}</body></html>`;

        if (!html.trim() && !isEditor) return null;

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), position: "relative" },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          !html.trim() && isEditor
            ? React.createElement(
                "div",
                {
                  className:
                    "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600",
                },
                "Custom code block: select it to add HTML and CSS.",
              )
            : isEditor
              ? React.createElement(
                  "div",
                  { style: { position: "relative" } },
                  React.createElement("iframe", {
                    title: "Custom code",
                    srcDoc,
                    className: "w-full rounded-2xl border border-zinc-200 bg-white",
                    style: { height },
                    sandbox: "allow-forms allow-popups allow-scripts",
                  }),
                  React.createElement("div", {
                    style: {
                      position: "absolute",
                      inset: 0,
                      cursor: "pointer",
                      background: "transparent",
                    },
                  }),
                )
              : React.createElement(
                  "div",
                  {
                    className: "w-full",
                  },
                  css.trim()
                    ? React.createElement("style", {
                        dangerouslySetInnerHTML: { __html: css },
                      })
                    : null,
                  React.createElement("div", {
                    dangerouslySetInnerHTML: { __html: html },
                  }),
                ),
        );
      }

      if (b.type === "chatbot") {
        const agentId = typeof b.props.agentId === "string" ? b.props.agentId.trim() : "";

        const placementX = (b.props as any)?.placementX || "right";
        const placementY = (b.props as any)?.placementY || "bottom";

        if (!agentId && !isEditor) return null;

        if (isEditor) {
          return React.createElement(
            "div",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), position: "relative" },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            React.createElement(
              "div",
              {
                className:
                  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700",
              },
              React.createElement("div", { className: "font-semibold text-zinc-900" }, "Chatbot widget"),
              React.createElement(
                "div",
                { className: "mt-1 text-xs text-zinc-600" },
                agentId
                  ? "Floating widget preview is shown on the page. Click the launcher to select."
                  : "Set an Agent ID in the sidebar to enable live chat.",
              ),
            ),
          );
        }

        // In runtime (public funnel), render our custom widget, positioned fixed.
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          React.createElement(
            SafeClientBoundary,
            { name: "Chatbot widget" },
            React.createElement(ConvaiChatWidget, {
              agentId,
              signedUrlEndpoint: "/api/public/elevenlabs/convai/signed-url",
              positioning: "fixed",
              placementX,
              placementY,
              primaryColor: (b.props as any)?.primaryColor,
              launcherStyle: (b.props as any)?.launcherStyle,
              launcherImageUrl: (b.props as any)?.launcherImageUrl,
              panelTitle: "Chat",
              panelSubtitle: "Message us",
            }),
          ),
        );
      }

      if (b.type === "heading") {
        const Tag =
          b.props.level === 1
            ? "h1"
            : b.props.level === 3
              ? "h3"
              : "h2";

        const cls =
          b.props.level === 1
            ? "text-3xl font-bold"
            : b.props.level === 3
              ? "text-lg font-bold"
              : "text-xl font-bold";

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement(
            Tag,
            {
              className: cls,
              style: {
                ...textStyle(b.props.style),
              },
              ...editableTextProps(b, b.props.text),
              ...(b.props.html
                ? { dangerouslySetInnerHTML: { __html: b.props.html } }
                : null),
            },
            b.props.html ? undefined : b.props.text,
          ),
        );
      }

      if (b.type === "paragraph") {
        const cls = "text-base leading-relaxed";
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement(
            "p",
            {
              className: cls,
              style: {
                ...textStyle(b.props.style),
              },
              ...editableTextProps(b, b.props.text),
              ...(b.props.html
                ? { dangerouslySetInnerHTML: { __html: b.props.html } }
                : null),
            },
            b.props.html ? undefined : b.props.text,
          ),
        );
      }

      if (b.type === "button") {
        const s = b.props.style;
        const wrapper: React.CSSProperties = wrapperStyle({
          align: s?.align,
          marginTopPx: s?.marginTopPx,
          marginBottomPx: s?.marginBottomPx,
          maxWidthPx: s?.maxWidthPx,
        });

        const borderWidth =
          typeof s?.borderWidthPx === "number"
            ? s.borderWidthPx
            : s?.borderColor
              ? 1
              : undefined;

        const linkStyle: React.CSSProperties = {
          ...textStyle(s),
          fontFamily: s?.fontFamily,
          color: s?.textColor,
          backgroundColor: s?.backgroundColor,
          borderRadius: typeof s?.borderRadiusPx === "number" ? s.borderRadiusPx : undefined,
          padding: typeof s?.paddingPx === "number" ? s.paddingPx : undefined,
          borderWidth: borderWidth,
          borderStyle: borderWidth !== undefined ? "solid" : undefined,
          borderColor: borderWidth !== undefined ? (s?.borderColor || "currentColor") : undefined,
        };
        return React.createElement(
          "div",
          { key: b.id, style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) }, ...wrapProps(b.id) },
          renderMoveControls(b.id),
          React.createElement(
            "a",
            {
              href: b.props.href,
              className: buttonClass(b.props.variant ?? "primary"),
              style: Object.keys(linkStyle).some((k) => (linkStyle as any)[k] !== undefined) ? linkStyle : undefined,
              onClick: isEditor
                ? (e: any) => {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    editor?.onSelectBlockId?.(b.id);
                  }
                : undefined,
              ...editableTextProps(b, b.props.text),
            },
            b.props.text,
          ),
        );
      }

      if (b.type === "image") {
        if (!b.props.src) {
          if (!isEditor) return null;
          return React.createElement(
            "div",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            React.createElement(
              "div",
              {
                className:
                  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600",
              },
              "Image block: select it to choose an image.",
            ),
          );
        }
        const showFrame = (b.props as any)?.showFrame !== false;
        const cls = [
          "w-full overflow-hidden rounded-2xl",
          showFrame ? "border border-zinc-200 bg-zinc-50" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          renderCornerResizeHandle(b),
          React.createElement(
            "div",
            { className: cls },
            React.createElement("img", {
              src: b.props.src,
              alt: b.props.alt || "",
              className: "h-auto w-full",
            }),
          ),
        );
      }

      if (b.type === "video") {
        if (!b.props.src) {
          if (!isEditor) return null;
          return React.createElement(
            "div",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            React.createElement(
              "div",
              {
                className:
                  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600",
              },
              "Video block: select it to choose a video.",
            ),
          );
        }

        const controlsRaw = (b.props as any)?.controls;
        const showControlsRaw = (b.props as any)?.showControls;
        const controls =
          typeof controlsRaw === "boolean"
            ? controlsRaw
            : typeof showControlsRaw === "boolean"
              ? showControlsRaw
              : true;
        const autoplay = Boolean((b.props as any)?.autoplay);
        const loop = Boolean((b.props as any)?.loop);
        const muted = Boolean((b.props as any)?.muted);
        const posterUrl = String((b.props as any)?.posterUrl || "").trim();

        const aspectRatioPreset = String((b.props as any)?.aspectRatio || "").trim();
        const aspectRatioCss = (() => {
          if (!aspectRatioPreset || aspectRatioPreset === "auto") return undefined;
          const m = aspectRatioPreset.match(/^(\d+)\s*:\s*(\d+)$/);
          if (!m) return undefined;
          const a = Number(m[1]);
          const b = Number(m[2]);
          if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return undefined;
          return `${a} / ${b}`;
        })();

        const fit = (b.props as any)?.fit === "cover" ? "cover" : "contain";
        const showFrame = (b.props as any)?.showFrame !== false;
        const frameClassName = [
          "w-full overflow-hidden rounded-2xl",
          showFrame ? "border border-zinc-200 bg-zinc-50" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const videoClassName = [
          aspectRatioCss ? "h-full w-full" : "h-auto w-full",
          fit === "cover" ? "object-cover" : "object-contain",
        ].join(" ");

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          renderCornerResizeHandle(b),
          React.createElement(
            "div",
            {
              className: frameClassName,
              style: aspectRatioCss ? ({ aspectRatio: aspectRatioCss } as any) : undefined,
            },
            React.createElement("video", {
              src: b.props.src,
              ...(posterUrl ? { poster: posterUrl } : null),
              ...(String((b.props as any)?.name || "").trim() ? { title: String((b.props as any).name).trim() } : null),
              controls,
              autoPlay: autoplay,
              loop,
              muted,
              playsInline: true,
              preload: "metadata",
              className: videoClassName,
            } as any),
          ),
        );
      }

      if (b.type === "spacer") {
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), height: b.props.height ?? 24 },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
        );
      }

      if (b.type === "formLink") {
        const href =
          basePath + "/forms/" + encodeURIComponent(b.props.formSlug || "");

        const s = b.props.style;
        const wrapper: React.CSSProperties = wrapperStyle({
          align: s?.align,
          marginTopPx: s?.marginTopPx,
          marginBottomPx: s?.marginBottomPx,
          maxWidthPx: s?.maxWidthPx,
        });

        const borderWidth =
          typeof s?.borderWidthPx === "number"
            ? s.borderWidthPx
            : s?.borderColor
              ? 1
              : undefined;

        const linkStyle: React.CSSProperties = {
          ...textStyle(s),
          color: s?.textColor,
          backgroundColor: s?.backgroundColor,
          borderRadius: typeof s?.borderRadiusPx === "number" ? s.borderRadiusPx : undefined,
          padding: typeof s?.paddingPx === "number" ? s.paddingPx : undefined,
          borderWidth: borderWidth,
          borderStyle: borderWidth !== undefined ? "solid" : undefined,
          borderColor: borderWidth !== undefined ? (s?.borderColor || "currentColor") : undefined,
        };
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement(
            "a",
            {
              href,
              className: buttonClass("primary"),
              style: Object.keys(linkStyle).some((k) => (linkStyle as any)[k] !== undefined) ? linkStyle : undefined,
              onClick: isEditor
                ? (e: any) => {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    editor?.onSelectBlockId?.(b.id);
                  }
                : undefined,
            },
            React.createElement(
              "span",
              {
                ...editableTextProps(b, b.props.text || "Open form"),
              },
              b.props.text || "Open form",
            ),
          ),
        );
      }

      if (b.type === "formEmbed") {
        const formSlug = String(b.props.formSlug || "").trim();
        if (!formSlug) {
          if (!isEditor) return null;
          return React.createElement(
            "div",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            React.createElement(
              "div",
              {
                className:
                  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600",
              },
              "Form embed: select this block and pick a form.",
            ),
          );
        }
        const src = `${basePath}/forms/${encodeURIComponent(formSlug)}?embed=1`;
        const height = typeof b.props.height === "number" ? b.props.height : 760;
        const effectiveHeight = previewEmbedHeight(height, 760, 560);

        if (previewUsesEmbedPlaceholders) {
          return renderEmbedPlaceholder({
            key: b.id,
            style: b.props.style,
            blockId: b.id,
            title: "Form embed",
            subtitle: `/forms/${formSlug}?embed=1`,
            detail: "Open the hosted funnel or form page to verify real submission behavior. The editor uses a lightweight stand-in here to keep preview responsive.",
            height: effectiveHeight,
          });
        }

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), position: "relative" },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          isEditor
            ? React.createElement(
                "div",
                { style: { position: "relative" } },
                React.createElement("iframe", {
                  title: `Form ${formSlug}`,
                  src,
                  className: "w-full rounded-2xl border border-zinc-200 bg-white",
                  style: { height: effectiveHeight },
                  sandbox: "allow-forms allow-scripts allow-same-origin",
                }),
                React.createElement("div", {
                  style: {
                    position: "absolute",
                    inset: 0,
                    cursor: "pointer",
                    background: "transparent",
                  },
                }),
              )
            : React.createElement("iframe", {
                title: `Form ${formSlug}`,
                src,
                className: "w-full rounded-2xl border border-zinc-200 bg-white",
                style: { height: effectiveHeight },
                sandbox: "allow-forms allow-scripts allow-same-origin",
              }),
        );
      }

      if (b.type === "calendarEmbed") {
        const calendarId = String((b.props as any).calendarId || "").trim();
        if (!calendarId) {
          if (!isEditor) return null;
          return React.createElement(
            "div",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            React.createElement(
              "div",
              {
                className:
                  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600",
              },
              "Calendar embed: select this block and pick a calendar.",
            ),
          );
        }

        const height = typeof (b.props as any).height === "number" ? (b.props as any).height : 760;
        const effectiveHeight = previewEmbedHeight(height, 760, 620);
        const slug = context?.bookingSiteSlug ? String(context.bookingSiteSlug).trim() : "";
        const ownerId = context?.bookingOwnerId ? String(context.bookingOwnerId).trim() : "";
        const src = slug
          ? `/book/${encodeURIComponent(slug)}/c/${encodeURIComponent(calendarId)}`
          : ownerId
            ? `/book/u/${encodeURIComponent(ownerId)}/${encodeURIComponent(calendarId)}`
            : "";

        if (!src) {
          if (!isEditor) return null;
          return React.createElement(
            "div",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            React.createElement(
              "div",
              {
                className:
                  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600",
              },
              "Calendar embed: missing booking context.",
            ),
          );
        }

        if (previewUsesEmbedPlaceholders) {
          return renderEmbedPlaceholder({
            key: b.id,
            style: (b.props as any).style,
            blockId: b.id,
            title: "Calendar embed",
            subtitle: `Calendar ${calendarId}`,
            detail: "The booking calendar is paused in editor preview so mobile framing stays accurate and the builder remains usable on slower connections.",
            height: effectiveHeight,
          });
        }

        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), position: "relative" },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          isEditor
            ? React.createElement(
                "div",
                { style: { position: "relative" } },
                React.createElement("iframe", {
                  title: `Calendar ${calendarId}`,
                  src,
                  className: "w-full rounded-2xl border border-zinc-200 bg-white",
                  style: { height: effectiveHeight },
                  sandbox: "allow-forms allow-scripts allow-same-origin",
                }),
                React.createElement("div", {
                  style: {
                    position: "absolute",
                    inset: 0,
                    cursor: "pointer",
                    background: "transparent",
                  },
                }),
              )
            : React.createElement("iframe", {
                title: `Calendar ${calendarId}`,
                src,
                className: "w-full rounded-2xl border border-zinc-200 bg-white",
                style: { height: effectiveHeight },
                sandbox: "allow-forms allow-scripts allow-same-origin",
              }),
        );
      }

      if (b.type === "columns") {
        const gapPx = typeof b.props.gapPx === "number" ? b.props.gapPx : 24;
        const stack = b.props.stackOnMobile !== false;
        const rawColumns = Array.isArray((b.props as any).columns) ? ((b.props as any).columns as ColumnsColumn[]) : null;
        const legacyColumns: ColumnsColumn[] = [
          {
            markdown: String((b.props as any).leftMarkdown || ""),
            children: Array.isArray((b.props as any).leftChildren) ? ((b.props as any).leftChildren as CreditFunnelBlock[]) : undefined,
            style: (b.props as any).leftStyle as any,
          },
          {
            markdown: String((b.props as any).rightMarkdown || ""),
            children: Array.isArray((b.props as any).rightChildren) ? ((b.props as any).rightChildren as CreditFunnelBlock[]) : undefined,
            style: (b.props as any).rightStyle as any,
          },
        ];
        const cols = (rawColumns && rawColumns.length ? rawColumns : legacyColumns).filter(Boolean);
        const count = Math.max(1, Math.min(6, cols.length || 2));
        const cssCols = `repeat(${count}, minmax(0, 1fr))`;
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement(
            "div",
            {
              className: stack ? "grid grid-cols-1 md:[grid-template-columns:var(--cols)]" : "grid [grid-template-columns:var(--cols)]",
              style: {
                gap: gapPx,
                ...(count ? ({ "--cols": cssCols } as any) : null),
              },
            },
            ...cols.slice(0, count).map((c, idx) => {
              const children = c?.children;
              const content: React.ReactNode = Array.isArray(children) && children.length
                ? React.createElement("div", { className: "space-y-4" }, renderBlocksInner(children))
                : renderMarkdown(String(c?.markdown || ""));
              return React.createElement(
                "div",
                { key: `${b.id}_col_${idx}`, style: wrapperStyle(c?.style) },
                content,
              );
            }),
          ),
        );
      }

      if (b.type === "section") {
        const sectionAnchorIdRaw = typeof (b.props as any)?.anchorId === "string" ? String((b.props as any).anchorId).trim() : "";
        const sectionAnchorId = sectionAnchorIdRaw || `section-${b.id}`;
        const layout = b.props.layout === "two" ? "two" : "one";
        const gapPx = typeof b.props.gapPx === "number" ? b.props.gapPx : 24;
        const stack = b.props.stackOnMobile !== false;
        const hasBgVideo = Boolean(String((b.props.style as any)?.backgroundVideoUrl || "").trim());
        if (layout === "two") {
          const leftEmpty = !b.props.leftChildren?.length && !String(b.props.leftMarkdown || "").trim();
          const rightEmpty = !b.props.rightChildren?.length && !String(b.props.rightMarkdown || "").trim();
          const placeholder = (side: "Left" | "Right") =>
            isEditor
              ? React.createElement(
                  "div",
                  {
                    className:
                      "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs font-semibold text-zinc-600",
                  },
                  `${side} column: drop blocks here`,
                )
              : null;

          const leftContent: React.ReactNode = b.props.leftChildren?.length
            ? React.createElement(
                "div",
                { className: "space-y-4" },
                renderBlocksInner(b.props.leftChildren),
              )
            : leftEmpty
              ? placeholder("Left")
              : renderMarkdown(b.props.leftMarkdown || "");

          const rightContent: React.ReactNode = b.props.rightChildren?.length
            ? React.createElement(
                "div",
                { className: "space-y-4" },
                renderBlocksInner(b.props.rightChildren),
              )
            : rightEmpty
              ? placeholder("Right")
              : renderMarkdown(b.props.rightMarkdown || "");
          return React.createElement(
            "section",
            {
              key: b.id,
              id: sectionAnchorId,
              style: {
                ...wrapperStyle(b.props.style),
                ...(blockWrapStyle(b.id) || {}),
                ...(hasBgVideo ? { position: "relative", overflow: "hidden" } : null),
              },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
            hasBgVideo ? backgroundVideoNode(b.props.style) : null,
            React.createElement(
              "div",
              {
                className: hasBgVideo ? "relative z-10" : undefined,
              },
              React.createElement(
                "div",
                {
                className: stack ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-2",
                style: { gap: gapPx },
              },
              React.createElement(
                "div",
                { style: wrapperStyle(b.props.leftStyle) },
                leftContent,
              ),
              React.createElement(
                "div",
                { style: wrapperStyle(b.props.rightStyle) },
                rightContent,
              ),
                ),
              ),
          );
        }

        return React.createElement(
          "section",
          {
            key: b.id,
            id: sectionAnchorId,
            style: {
              ...wrapperStyle(b.props.style),
              ...(blockWrapStyle(b.id) || {}),
              ...(hasBgVideo ? { position: "relative", overflow: "hidden" } : null),
            },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          hasBgVideo ? backgroundVideoNode(b.props.style) : null,
          React.createElement(
            "div",
            { className: hasBgVideo ? "relative z-10" : undefined },
            b.props.children?.length
              ? React.createElement(
                  "div",
                  { className: "space-y-4" },
                  renderBlocksInner(b.props.children),
                )
              : String(b.props.markdown || "").trim()
                ? renderMarkdown(b.props.markdown || "")
                : isEditor
                  ? React.createElement(
                      "div",
                      {
                        className:
                          "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs font-semibold text-zinc-600",
                      },
                      "Empty section: drop blocks here",
                    )
                  : null,
          ),
        );
      }

      return null;
    });

  return React.createElement(
    React.Fragment,
    null,
    googleCss || pageCss ? React.createElement("style", null, [googleCss, pageCss].filter(Boolean).join("\n")) : null,
    React.createElement(
      "div",
      {
        className:
          pageStyleBlock?.props?.style?.textColor
            ? "relative funnel-page"
            : "relative text-zinc-900 funnel-page",
        style: {
          ...wrapperStyle(pageStyleBlock?.props.style),
          width: "100%",
          ...(isPreviewRender ? null : { minHeight: "100vh" }),
          ...(pageStyleBlock?.props?.style?.backgroundVideoUrl ? { position: "relative" } : null),
        },
      },
      pageStyleBlock?.props?.style?.backgroundVideoUrl ? backgroundVideoNode(pageStyleBlock?.props.style) : null,
      React.createElement(
        "div",
        {
          className: pageStyleBlock?.props?.style?.backgroundVideoUrl ? "relative z-10" : undefined,
        },
        leadingHeader ? renderBlocksInner([leadingHeader]) : null,
        React.createElement(
          "div",
          {
            className: pageStyleBlock?.props?.style?.backgroundVideoUrl ? "space-y-4 funnel-blocks" : "space-y-4 funnel-blocks",
          },
          renderBlocksInner(bodyBlocks),
        ),
      ),
      isEditor && chatbotBlocks.length && !previewUsesEmbedPlaceholders
        ? React.createElement(
            "div",
            {
              key: "__chatbot_overlay__",
              className: "pointer-events-none absolute inset-0",
            },
            ...chatbotBlocks.map((b) => {
              const placementX = (b.props as any)?.placementX || "right";
              const placementY = (b.props as any)?.placementY || "bottom";
              const agentId = typeof (b.props as any)?.agentId === "string" ? String((b.props as any).agentId).trim() : "";

              return React.createElement(
                "div",
                {
                  key: `chatbot_${b.id}`,
                  className: "pointer-events-auto",
                  onMouseDownCapture: (e: any) => {
                    if (typeof e?.button === "number" && e.button !== 0) return;
                    editor?.onSelectBlockId?.(b.id);
                  },
                },
                React.createElement(ConvaiChatWidget, {
                  agentId: agentId || undefined,
                  signedUrlEndpoint: "/api/portal/elevenlabs/convai/signed-url",
                  positioning: "absolute",
                  placementX,
                  placementY,
                  primaryColor: (b.props as any)?.primaryColor,
                  launcherStyle: (b.props as any)?.launcherStyle,
                  launcherImageUrl: (b.props as any)?.launcherImageUrl,
                  panelTitle: "Chat",
                  panelSubtitle: "Message us",
                }),
              );
            }),
          )
        : null,
    ),
  );
}
