import { coerceBlocksJson, type BlockStyle, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import type { FunnelHeaderMobileTrigger, FunnelHeaderNavItem } from "@/components/funnel/FunnelHeaderNav";

export type FunnelPageContainerSlot = "children" | "leftChildren" | "rightChildren" | "columnChildren";

export type FunnelPageInsertPosition =
  | {
      placement: "before" | "after";
      anchorBlockId: string;
    }
  | {
      placement: "start" | "end";
      parentBlockId?: string | null;
      slot?: FunnelPageContainerSlot;
      columnIndex?: number;
    };

export type FunnelPageMutation =
  | {
      type: "setText";
      blockId: string;
      text: string;
      html?: string;
    }
  | {
      type: "setStyle";
      blockId: string;
      style: Partial<BlockStyle>;
    }
  | {
      type: "setSectionLayout";
      blockId: string;
      layout: "one" | "two";
      gapPx?: number;
      stackOnMobile?: boolean;
    }
  | {
      type: "setColumnsLayout";
      blockId: string;
      gapPx?: number;
      stackOnMobile?: boolean;
    }
  | {
      type: "setButton";
      blockId: string;
      text?: string;
      href?: string;
      variant?: "primary" | "secondary";
    }
  | {
      type: "setImage";
      blockId: string;
      src?: string;
      alt?: string;
      showFrame?: boolean;
    }
  | {
      type: "setVideo";
      blockId: string;
      src?: string;
      name?: string;
      posterUrl?: string;
      controls?: boolean;
      autoplay?: boolean;
      loop?: boolean;
      muted?: boolean;
      aspectRatio?: "auto" | "16:9" | "9:16" | "4:3" | "1:1";
      fit?: "contain" | "cover";
      showFrame?: boolean;
    }
  | {
      type: "setForm";
      blockId: string;
      formSlug?: string;
      text?: string;
      height?: number;
    }
  | {
      type: "setCalendar";
      blockId: string;
      calendarId?: string;
      height?: number;
    }
  | {
      type: "setCommerce";
      blockId: string;
      priceId?: string;
      quantity?: number;
      productName?: string;
      productDescription?: string;
      text?: string;
    }
  | {
      type: "setHeader";
      blockId: string;
      logoUrl?: string;
      logoAlt?: string;
      logoHref?: string;
      items?: FunnelHeaderNavItem[];
      sticky?: boolean;
      transparent?: boolean;
      mobileMode?: Extract<CreditFunnelBlock, { type: "headerNav" }>["props"]["mobileMode"];
      desktopMode?: Extract<CreditFunnelBlock, { type: "headerNav" }>["props"]["desktopMode"];
      size?: Extract<CreditFunnelBlock, { type: "headerNav" }>["props"]["size"];
      sizeScale?: number;
      mobileTrigger?: FunnelHeaderMobileTrigger;
      mobileTriggerLabel?: string;
    }
  | {
      type: "setCustomCode";
      blockId: string;
      html?: string;
      css?: string;
      heightPx?: number;
    }
  | {
      type: "insertBlock";
      block: CreditFunnelBlock;
      position: FunnelPageInsertPosition;
    }
  | {
      type: "deleteBlock";
      blockId: string;
    }
  | {
      type: "moveBlock";
      blockId: string;
      position: FunnelPageInsertPosition;
    };

function cleanString(value: unknown, max = 5000): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next) return undefined;
  return next.slice(0, max);
}

function cleanOptionalString(value: unknown, max = 5000): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

function cleanNumber(value: unknown, min: number, max: number): number | undefined {
  const next = Number(value);
  if (!Number.isFinite(next)) return undefined;
  return Math.max(min, Math.min(max, next));
}

function cleanBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  return undefined;
}

function cleanStylePatch(raw: unknown): Partial<BlockStyle> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const style: Partial<BlockStyle> = {};
  const source = raw as Record<string, unknown>;

  const textColor = cleanOptionalString(source.textColor, 40);
  const backgroundColor = cleanOptionalString(source.backgroundColor, 40);
  const backgroundImageUrl = cleanOptionalString(source.backgroundImageUrl, 500);
  const backgroundVideoUrl = cleanOptionalString(source.backgroundVideoUrl, 500);
  const backgroundVideoPosterUrl = cleanOptionalString(source.backgroundVideoPosterUrl, 500);
  const fontFamily = cleanOptionalString(source.fontFamily, 120);
  const fontGoogleFamily = cleanOptionalString(source.fontGoogleFamily, 120);
  const align = source.align === "left" || source.align === "center" || source.align === "right" ? source.align : undefined;
  const fontSizePx = cleanNumber(source.fontSizePx, 8, 96);
  const marginTopPx = cleanNumber(source.marginTopPx, 0, 240);
  const marginBottomPx = cleanNumber(source.marginBottomPx, 0, 240);
  const paddingPx = cleanNumber(source.paddingPx, 0, 240);
  const borderRadiusPx = cleanNumber(source.borderRadiusPx, 0, 160);
  const borderColor = cleanOptionalString(source.borderColor, 40);
  const borderWidthPx = cleanNumber(source.borderWidthPx, 0, 24);
  const maxWidthPx = cleanNumber(source.maxWidthPx, 120, 1400);

  if (textColor !== undefined) style.textColor = textColor || undefined;
  if (backgroundColor !== undefined) style.backgroundColor = backgroundColor || undefined;
  if (backgroundImageUrl !== undefined) style.backgroundImageUrl = backgroundImageUrl || undefined;
  if (backgroundVideoUrl !== undefined) style.backgroundVideoUrl = backgroundVideoUrl || undefined;
  if (backgroundVideoPosterUrl !== undefined) style.backgroundVideoPosterUrl = backgroundVideoPosterUrl || undefined;
  if (fontFamily !== undefined) style.fontFamily = fontFamily || undefined;
  if (fontGoogleFamily !== undefined) style.fontGoogleFamily = fontGoogleFamily || undefined;
  if (align) style.align = align;
  if (fontSizePx !== undefined) style.fontSizePx = fontSizePx;
  if (marginTopPx !== undefined) style.marginTopPx = marginTopPx;
  if (marginBottomPx !== undefined) style.marginBottomPx = marginBottomPx;
  if (paddingPx !== undefined) style.paddingPx = paddingPx;
  if (borderRadiusPx !== undefined) style.borderRadiusPx = borderRadiusPx;
  if (borderColor !== undefined) style.borderColor = borderColor || undefined;
  if (borderWidthPx !== undefined) style.borderWidthPx = borderWidthPx;
  if (maxWidthPx !== undefined) style.maxWidthPx = maxWidthPx;

  return Object.keys(style).length ? style : null;
}

function cleanHeaderItems(raw: unknown): FunnelHeaderNavItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const label = cleanString(row.label, 120);
      if (!label) return null;
      const kind = row.kind === "page" || row.kind === "anchor" ? row.kind : "url";
      const newTab = cleanBoolean(row.newTab);

      if (kind === "page") {
        const pageSlug = cleanString(row.pageSlug, 160);
        if (!pageSlug) return null;
        return { id: `nav_${index}_${pageSlug}`, label, kind, pageSlug, ...(newTab !== undefined ? { newTab } : null) } satisfies FunnelHeaderNavItem;
      }

      if (kind === "anchor") {
        const anchorId = cleanString(row.anchorId, 160);
        if (!anchorId) return null;
        return { id: `nav_${index}_${anchorId}`, label, kind, anchorId, ...(newTab !== undefined ? { newTab } : null) } satisfies FunnelHeaderNavItem;
      }

      const url = cleanString(row.url, 600);
      if (!url) return null;
      return { id: `nav_${index}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "link"}`, label, kind: "url", url, ...(newTab !== undefined ? { newTab } : null) } satisfies FunnelHeaderNavItem;
    })
    .filter(Boolean) as FunnelHeaderNavItem[];
  return items.length ? items : undefined;
}

function cleanInsertPosition(raw: unknown): FunnelPageInsertPosition | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (input.placement === "before" || input.placement === "after") {
    const anchorBlockId = cleanString(input.anchorBlockId, 160);
    if (!anchorBlockId) return null;
    return { placement: input.placement, anchorBlockId };
  }

  if (input.placement === "start" || input.placement === "end") {
    const parentBlockId = cleanString(input.parentBlockId, 160) || null;
    const slot =
      input.slot === "children" ||
      input.slot === "leftChildren" ||
      input.slot === "rightChildren" ||
      input.slot === "columnChildren"
        ? input.slot
        : undefined;
    const columnIndex = cleanNumber(input.columnIndex, 0, 24);
    return {
      placement: input.placement,
      parentBlockId,
      ...(slot ? { slot } : null),
      ...(columnIndex !== undefined ? { columnIndex } : null),
    };
  }

  return null;
}

function cleanMutation(raw: unknown): FunnelPageMutation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const type = cleanString(input.type, 80);
  const blockId = cleanString(input.blockId, 160);

  switch (type) {
    case "setText": {
      if (!blockId) return null;
      const text = cleanOptionalString(input.text, 12000) ?? "";
      const html = cleanOptionalString(input.html, 24000);
      return { type, blockId, text, ...(html !== undefined ? { html } : null) };
    }
    case "setStyle": {
      if (!blockId) return null;
      const style = cleanStylePatch(input.style);
      if (!style) return null;
      return { type, blockId, style };
    }
    case "setSectionLayout": {
      if (!blockId) return null;
      const layout = input.layout === "two" ? "two" : input.layout === "one" ? "one" : null;
      if (!layout) return null;
      const gapPx = cleanNumber(input.gapPx, 0, 120);
      const stackOnMobile = cleanBoolean(input.stackOnMobile);
      return { type, blockId, layout, ...(gapPx !== undefined ? { gapPx } : null), ...(stackOnMobile !== undefined ? { stackOnMobile } : null) };
    }
    case "setColumnsLayout": {
      if (!blockId) return null;
      const gapPx = cleanNumber(input.gapPx, 0, 120);
      const stackOnMobile = cleanBoolean(input.stackOnMobile);
      if (gapPx === undefined && stackOnMobile === undefined) return null;
      return { type, blockId, ...(gapPx !== undefined ? { gapPx } : null), ...(stackOnMobile !== undefined ? { stackOnMobile } : null) };
    }
    case "setButton": {
      if (!blockId) return null;
      const text = cleanOptionalString(input.text, 120);
      const href = cleanOptionalString(input.href, 800);
      const variant = input.variant === "secondary" ? "secondary" : input.variant === "primary" ? "primary" : undefined;
      if (text === undefined && href === undefined && variant === undefined) return null;
      return { type, blockId, ...(text !== undefined ? { text } : null), ...(href !== undefined ? { href } : null), ...(variant ? { variant } : null) };
    }
    case "setImage": {
      if (!blockId) return null;
      const src = cleanOptionalString(input.src, 1200);
      const alt = cleanOptionalString(input.alt, 200);
      const showFrame = cleanBoolean(input.showFrame);
      if (src === undefined && alt === undefined && showFrame === undefined) return null;
      return { type, blockId, ...(src !== undefined ? { src } : null), ...(alt !== undefined ? { alt } : null), ...(showFrame !== undefined ? { showFrame } : null) };
    }
    case "setVideo": {
      if (!blockId) return null;
      const src = cleanOptionalString(input.src, 1200);
      const name = cleanOptionalString(input.name, 200);
      const posterUrl = cleanOptionalString(input.posterUrl, 1200);
      const controls = cleanBoolean(input.controls);
      const autoplay = cleanBoolean(input.autoplay);
      const loop = cleanBoolean(input.loop);
      const muted = cleanBoolean(input.muted);
      const aspectRatio =
        input.aspectRatio === "auto" || input.aspectRatio === "16:9" || input.aspectRatio === "9:16" || input.aspectRatio === "4:3" || input.aspectRatio === "1:1"
          ? input.aspectRatio
          : undefined;
      const fit = input.fit === "contain" || input.fit === "cover" ? input.fit : undefined;
      const showFrame = cleanBoolean(input.showFrame);
      if ([src, name, posterUrl, controls, autoplay, loop, muted, aspectRatio, fit, showFrame].every((value) => value === undefined)) return null;
      return {
        type,
        blockId,
        ...(src !== undefined ? { src } : null),
        ...(name !== undefined ? { name } : null),
        ...(posterUrl !== undefined ? { posterUrl } : null),
        ...(controls !== undefined ? { controls } : null),
        ...(autoplay !== undefined ? { autoplay } : null),
        ...(loop !== undefined ? { loop } : null),
        ...(muted !== undefined ? { muted } : null),
        ...(aspectRatio ? { aspectRatio } : null),
        ...(fit ? { fit } : null),
        ...(showFrame !== undefined ? { showFrame } : null),
      };
    }
    case "setForm": {
      if (!blockId) return null;
      const formSlug = cleanOptionalString(input.formSlug, 120);
      const text = cleanOptionalString(input.text, 120);
      const height = cleanNumber(input.height, 120, 2000);
      if (formSlug === undefined && text === undefined && height === undefined) return null;
      return { type, blockId, ...(formSlug !== undefined ? { formSlug } : null), ...(text !== undefined ? { text } : null), ...(height !== undefined ? { height } : null) };
    }
    case "setCalendar": {
      if (!blockId) return null;
      const calendarId = cleanOptionalString(input.calendarId, 120);
      const height = cleanNumber(input.height, 120, 2000);
      if (calendarId === undefined && height === undefined) return null;
      return { type, blockId, ...(calendarId !== undefined ? { calendarId } : null), ...(height !== undefined ? { height } : null) };
    }
    case "setCommerce": {
      if (!blockId) return null;
      const priceId = cleanOptionalString(input.priceId, 140);
      const quantity = cleanNumber(input.quantity, 1, 20);
      const productName = cleanOptionalString(input.productName, 200);
      const productDescription = cleanOptionalString(input.productDescription, 500);
      const text = cleanOptionalString(input.text, 120);
      if ([priceId, quantity, productName, productDescription, text].every((value) => value === undefined)) return null;
      return {
        type,
        blockId,
        ...(priceId !== undefined ? { priceId } : null),
        ...(quantity !== undefined ? { quantity } : null),
        ...(productName !== undefined ? { productName } : null),
        ...(productDescription !== undefined ? { productDescription } : null),
        ...(text !== undefined ? { text } : null),
      };
    }
    case "setHeader": {
      if (!blockId) return null;
      const logoUrl = cleanOptionalString(input.logoUrl, 1200);
      const logoAlt = cleanOptionalString(input.logoAlt, 200);
      const logoHref = cleanOptionalString(input.logoHref, 800);
      const items = cleanHeaderItems(input.items);
      const sticky = cleanBoolean(input.sticky);
      const transparent = cleanBoolean(input.transparent);
      const mobileMode = input.mobileMode === "dropdown" || input.mobileMode === "slideover" ? input.mobileMode : undefined;
      const desktopMode = input.desktopMode === "inline" || input.desktopMode === "dropdown" || input.desktopMode === "slideover" ? input.desktopMode : undefined;
      const size = input.size === "sm" || input.size === "md" || input.size === "lg" ? input.size : undefined;
      const sizeScale = cleanNumber(input.sizeScale, 0.5, 2);
      const mobileTrigger = input.mobileTrigger === "hamburger" || input.mobileTrigger === "directory" ? input.mobileTrigger : undefined;
      const mobileTriggerLabel = cleanOptionalString(input.mobileTriggerLabel, 120);
      if ([logoUrl, logoAlt, logoHref, items, sticky, transparent, mobileMode, desktopMode, size, sizeScale, mobileTrigger, mobileTriggerLabel].every((value) => value === undefined)) return null;
      return {
        type,
        blockId,
        ...(logoUrl !== undefined ? { logoUrl } : null),
        ...(logoAlt !== undefined ? { logoAlt } : null),
        ...(logoHref !== undefined ? { logoHref } : null),
        ...(items !== undefined ? { items } : null),
        ...(sticky !== undefined ? { sticky } : null),
        ...(transparent !== undefined ? { transparent } : null),
        ...(mobileMode ? { mobileMode } : null),
        ...(desktopMode ? { desktopMode } : null),
        ...(size ? { size } : null),
        ...(sizeScale !== undefined ? { sizeScale } : null),
        ...(mobileTrigger ? { mobileTrigger } : null),
        ...(mobileTriggerLabel !== undefined ? { mobileTriggerLabel } : null),
      };
    }
    case "setCustomCode": {
      if (!blockId) return null;
      const html = cleanOptionalString(input.html, 50000);
      const css = cleanOptionalString(input.css, 20000);
      const heightPx = cleanNumber(input.heightPx, 120, 2400);
      if (html === undefined && css === undefined && heightPx === undefined) return null;
      return { type, blockId, ...(html !== undefined ? { html } : null), ...(css !== undefined ? { css } : null), ...(heightPx !== undefined ? { heightPx } : null) };
    }
    case "insertBlock": {
      const block = coerceBlocksJson([input.block])[0];
      const position = cleanInsertPosition(input.position);
      if (!block || !position) return null;
      return { type, block, position };
    }
    case "deleteBlock": {
      if (!blockId) return null;
      return { type, blockId };
    }
    case "moveBlock": {
      if (!blockId) return null;
      const position = cleanInsertPosition(input.position);
      if (!position) return null;
      return { type, blockId, position };
    }
    default:
      return null;
  }
}

export function coerceFunnelPageMutations(raw: unknown, maxMutations = 50): FunnelPageMutation[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FunnelPageMutation[] = [];
  for (const row of raw.slice(0, maxMutations)) {
    const mutation = cleanMutation(row);
    if (!mutation) return null;
    out.push(mutation);
  }
  return out;
}