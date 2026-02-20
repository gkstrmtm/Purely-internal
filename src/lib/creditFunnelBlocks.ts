import React from "react";

import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";

export type BlockStyle = {
  textColor?: string;
  backgroundColor?: string;
  fontSizePx?: number;
  align?: "left" | "center" | "right";
  marginTopPx?: number;
  marginBottomPx?: number;
  paddingPx?: number;
  borderRadiusPx?: number;
  maxWidthPx?: number;
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
      props: { text: string; level?: 1 | 2 | 3; style?: BlockStyle };
    }
  | {
      id: string;
      type: "paragraph";
      props: { text: string; style?: BlockStyle };
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
      type: "columns";
      props: {
        leftMarkdown: string;
        rightMarkdown: string;
        leftChildren?: CreditFunnelBlock[];
        rightChildren?: CreditFunnelBlock[];
        gapPx?: number;
        stackOnMobile?: boolean;
        style?: BlockStyle;
        leftStyle?: BlockStyle;
        rightStyle?: BlockStyle;
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
    fontSizePx: clampNum(r.fontSizePx, 8, 120),
    align: coerceAlign(r.align),
    marginTopPx: clampNum(r.marginTopPx, 0, 240),
    marginBottomPx: clampNum(r.marginBottomPx, 0, 240),
    paddingPx: clampNum(r.paddingPx, 0, 240),
    borderRadiusPx: clampNum(r.borderRadiusPx, 0, 80),
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
      const levelNum = Number(props?.level);
      const level = [1, 2, 3].includes(levelNum)
        ? (levelNum as 1 | 2 | 3)
        : 2;
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { text, level, style } });
      continue;
    }

    if (type === "paragraph") {
      const text = typeof props?.text === "string" ? props.text : "";
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { text, style } });
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
      const height = clampNum(props?.height, 120, 2000) ?? 760;
      const style = coerceStyle(props?.style);
      out.push({ id, type, props: { formSlug, height, style } });
      continue;
    }

    if (type === "columns") {
      const leftMarkdown = typeof props?.leftMarkdown === "string" ? props.leftMarkdown : "";
      const rightMarkdown = typeof props?.rightMarkdown === "string" ? props.rightMarkdown : "";
      const leftChildren = coerceBlocksJsonInternal(props?.leftChildren, depth + 1).filter((b) => b.type !== "page");
      const rightChildren = coerceBlocksJsonInternal(props?.rightChildren, depth + 1).filter((b) => b.type !== "page");
      const gapPx = clampNum(props?.gapPx, 0, 120) ?? 24;
      const stackOnMobile = props?.stackOnMobile !== false;
      const style = coerceStyle(props?.style);
      const leftStyle = coerceStyle(props?.leftStyle);
      const rightStyle = coerceStyle(props?.rightStyle);
      out.push({
        id,
        type,
        props: {
          leftMarkdown,
          rightMarkdown,
          leftChildren: leftChildren.length ? leftChildren : undefined,
          rightChildren: rightChildren.length ? rightChildren : undefined,
          gapPx,
          stackOnMobile,
          style,
          leftStyle,
          rightStyle,
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
  editor,
}: {
  blocks: CreditFunnelBlock[];
  basePath: string;
  editor?: {
    enabled?: boolean;
    selectedBlockId?: string | null;
    hoveredBlockId?: string | null;
    onSelectBlockId?: (id: string) => void;
    onHoverBlockId?: (id: string | null) => void;
    onUpsertBlock?: (next: CreditFunnelBlock) => void;
    onReorder?: (dragId: string, dropId: string) => void;
  };
}): React.ReactNode {
  const first = blocks[0];
  const pageStyleBlock = first && first.type === "page" ? first : null;
  const renderBlocks = pageStyleBlock ? blocks.slice(1) : blocks;

  const isEditor = Boolean(editor?.enabled);

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
    const nextFromEl = (el: any) => (typeof el?.textContent === "string" ? el.textContent : "");
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
        const next = nextFromEl(e.currentTarget);
        if (next === currentText) return;
        if (block.type === "heading") {
          upsert({ ...block, props: { ...block.props, text: next } } as CreditFunnelBlock);
          return;
        }
        if (block.type === "paragraph") {
          upsert({ ...block, props: { ...block.props, text: next } } as CreditFunnelBlock);
          return;
        }
        if (block.type === "button") {
          upsert({ ...block, props: { ...block.props, text: next } } as CreditFunnelBlock);
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
          React.createElement(
            Tag,
            {
              className: cls,
              style: {
                ...textStyle(b.props.style),
              },
              ...editableTextProps(b, b.props.text),
            },
            b.props.text,
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
          React.createElement(
            "p",
            {
              className: cls,
              style: {
                ...textStyle(b.props.style),
              },
              ...editableTextProps(b, b.props.text),
            },
            b.props.text,
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
        const linkStyle: React.CSSProperties = {
          ...textStyle(s),
          color: s?.textColor,
          backgroundColor: s?.backgroundColor,
          borderRadius: typeof s?.borderRadiusPx === "number" ? s.borderRadiusPx : undefined,
          padding: typeof s?.paddingPx === "number" ? s.paddingPx : undefined,
        };
        return React.createElement(
          "div",
          { key: b.id, style: { ...wrapper, ...(blockWrapStyle(b.id) || {}) }, ...wrapProps(b.id) },
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
        if (!b.props.src) return null;
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
        return React.createElement("div", {
          key: b.id,
          style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), height: b.props.height ?? 24 },
          ...wrapProps(b.id),
        });
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
        if (!formSlug) return null;
        const src = `${basePath}/forms/${encodeURIComponent(formSlug)}?embed=1`;
        const height = typeof b.props.height === "number" ? b.props.height : 760;
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}), position: "relative" },
            ...wrapProps(b.id),
          },
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

      if (b.type === "columns") {
        const gapPx = typeof b.props.gapPx === "number" ? b.props.gapPx : 24;
        const stack = b.props.stackOnMobile !== false;
        const leftContent: React.ReactNode = b.props.leftChildren?.length
          ? React.createElement("div", { className: "space-y-4" }, renderBlocksInner(b.props.leftChildren))
          : renderMarkdown(b.props.leftMarkdown || "");
        const rightContent: React.ReactNode = b.props.rightChildren?.length
          ? React.createElement("div", { className: "space-y-4" }, renderBlocksInner(b.props.rightChildren))
          : renderMarkdown(b.props.rightMarkdown || "");
        return React.createElement(
          "div",
          {
            key: b.id,
            style: { ...wrapperStyle(b.props.style), ...(blockWrapStyle(b.id) || {}) },
            ...wrapProps(b.id),
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
