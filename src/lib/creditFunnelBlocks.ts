import React from "react";

import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";

export type BlockStyle = {
  textColor?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  fontSizePx?: number;
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
      props: { src: string; alt?: string; style?: BlockStyle };
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
    fontSizePx: clampNum(r.fontSizePx, 8, 120),
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
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { src, alt, style } });
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
  };
  editor?: {
    enabled?: boolean;
    selectedBlockId?: string | null;
    hoveredBlockId?: string | null;
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

  const isEditor = Boolean(editor?.enabled);

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
        className: "absolute right-2 top-2 z-10 flex flex-col gap-1",
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
    if (!selected && !hovered) return undefined;
    const color = selected ? "var(--color-brand-blue)" : "rgba(15, 23, 42, 0.25)";
    return {
      boxShadow: `0 0 0 ${selected ? 2 : 1}px ${color}`,
      borderRadius: 12,
    };
  };

  const wrapProps = (id: string): Record<string, any> => {
    if (!isEditor) return {};
    return {
      "data-block-id": id,
      className: "relative",
      onClick: (e: any) => {
        e.preventDefault?.();
        e.stopPropagation?.();
        editor?.onSelectBlockId?.(id);
      },
      onMouseEnter: () => editor?.onHoverBlockId?.(id),
      onMouseLeave: () => editor?.onHoverBlockId?.(null),
      draggable: Boolean(editor?.onReorder),
      onDragStart: (e: any) => {
        if (!editor?.onReorder) return;
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
      },
    };
  };

  const renderBlocksInner: (inner: CreditFunnelBlock[]) => React.ReactNode[] = (inner) =>
    inner.map((b) => {
      if (b.type === "page") return null;

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
        const cls = [
          "overflow-hidden rounded-2xl",
          "border border-zinc-200 bg-zinc-50",
        ].join(" ");
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
            { className: cls },
            React.createElement("img", {
              src: b.props.src,
              alt: b.props.alt || "",
              className: "h-auto w-full",
            }),
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
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          React.createElement(
            "a",
            {
              href,
              className: buttonClass("primary"),
              onClick: isEditor
                ? (e: any) => {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    editor?.onSelectBlockId?.(b.id);
                  }
                : undefined,
            },
            b.props.text || "Open form",
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
                  style: { height },
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
                style: { height },
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
                  style: { height },
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
                style: { height },
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
        const layout = b.props.layout === "two" ? "two" : "one";
        const gapPx = typeof b.props.gapPx === "number" ? b.props.gapPx : 24;
        const stack = b.props.stackOnMobile !== false;
        if (layout === "two") {
          const leftContent: React.ReactNode = b.props.leftChildren?.length
            ? React.createElement(
                "div",
                { className: "space-y-4" },
                renderBlocksInner(b.props.leftChildren),
              )
            : renderMarkdown(b.props.leftMarkdown || "");
          const rightContent: React.ReactNode = b.props.rightChildren?.length
            ? React.createElement(
                "div",
                { className: "space-y-4" },
                renderBlocksInner(b.props.rightChildren),
              )
            : renderMarkdown(b.props.rightMarkdown || "");
          return React.createElement(
            "section",
            {
              key: b.id,
              style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
              ...wrapProps(b.id),
            },
            renderMoveControls(b.id),
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
          );
        }

        return React.createElement(
          "section",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
          },
          renderMoveControls(b.id),
          b.props.children?.length
            ? React.createElement(
                "div",
                { className: "space-y-4" },
                renderBlocksInner(b.props.children),
              )
            : renderMarkdown(b.props.markdown || ""),
        );
      }

      return null;
    });

  return React.createElement(
    "div",
    {
      className: "space-y-4",
      style: { ...wrapperStyle(pageStyleBlock?.props.style), width: "100%", minHeight: "100vh" },
    },
    renderBlocksInner(renderBlocks),
  );
}
