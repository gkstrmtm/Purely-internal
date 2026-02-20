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

export function coerceBlocksJson(value: unknown): CreditFunnelBlock[] {
  if (!Array.isArray(value)) return [];
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
      const gapPx = clampNum(props?.gapPx, 0, 120) ?? 24;
      const stackOnMobile = props?.stackOnMobile !== false;
      const style = coerceStyle(props?.style);
      const leftStyle = coerceStyle(props?.leftStyle);
      const rightStyle = coerceStyle(props?.rightStyle);
      out.push({
        id,
        type,
        props: { leftMarkdown, rightMarkdown, gapPx, stackOnMobile, style, leftStyle, rightStyle },
      });
      continue;
    }

    if (type === "section") {
      const layout = props?.layout === "two" ? "two" : "one";
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

function buttonClass(variant: "primary" | "secondary") {
  if (variant === "secondary") {
    return [
      "inline-flex items-center justify-center rounded-xl",
      "border border-zinc-200 bg-white",
      "px-5 py-3 text-sm font-semibold text-zinc-900",
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
}: {
  blocks: CreditFunnelBlock[];
  basePath: string;
}): React.ReactNode {
  const first = blocks[0];
  const pageStyleBlock = first && first.type === "page" ? first : null;
  const renderBlocks = pageStyleBlock ? blocks.slice(1) : blocks;

  return React.createElement(
    "div",
    {
      className: "space-y-4",
      style: { ...wrapperStyle(pageStyleBlock?.props.style), width: "100%", minHeight: "100vh" },
    },
    renderBlocks.map((b) => {
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
            ? "text-3xl font-bold text-zinc-900"
            : b.props.level === 3
              ? "text-lg font-bold text-zinc-900"
              : "text-xl font-bold text-zinc-900";

        return React.createElement(
          "div",
          { key: b.id, style: wrapperStyle(b.props.style) },
          React.createElement(
            Tag,
            {
              className: cls,
              style: {
                ...textStyle(b.props.style),
                color: b.props.style?.textColor,
              },
            },
            b.props.text,
          ),
        );
      }

      if (b.type === "paragraph") {
        const cls = "text-base leading-relaxed text-zinc-700";
        return React.createElement(
          "div",
          { key: b.id, style: wrapperStyle(b.props.style) },
          React.createElement(
            "p",
            {
              className: cls,
              style: {
                ...textStyle(b.props.style),
                color: b.props.style?.textColor,
              },
            },
            b.props.text,
          ),
        );
      }

      if (b.type === "button") {
        return React.createElement(
          "div",
          { key: b.id, style: wrapperStyle(b.props.style) },
          React.createElement(
            "a",
            {
              href: b.props.href,
              className: buttonClass(b.props.variant ?? "primary"),
              style: b.props.style?.textColor ? { color: b.props.style.textColor } : undefined,
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
          { key: b.id, style: wrapperStyle(b.props.style) },
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
          style: { ...wrapperStyle(b.props.style), height: b.props.height ?? 24 },
        });
      }

      if (b.type === "formLink") {
        const href =
          basePath + "/forms/" + encodeURIComponent(b.props.formSlug || "");
        return React.createElement(
          "div",
          { key: b.id, style: wrapperStyle(b.props.style) },
          React.createElement(
            "a",
            { href, className: buttonClass("primary") },
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
          { key: b.id, style: wrapperStyle(b.props.style) },
          React.createElement("iframe", {
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
        return React.createElement(
          "div",
          { key: b.id, style: wrapperStyle(b.props.style) },
          React.createElement(
            "div",
            {
              className: stack ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-2",
              style: { gap: gapPx },
            },
            React.createElement(
              "div",
              { style: wrapperStyle(b.props.leftStyle) },
              renderMarkdown(b.props.leftMarkdown || ""),
            ),
            React.createElement(
              "div",
              { style: wrapperStyle(b.props.rightStyle) },
              renderMarkdown(b.props.rightMarkdown || ""),
            ),
          ),
        );
      }

      if (b.type === "section") {
        const layout = b.props.layout === "two" ? "two" : "one";
        const gapPx = typeof b.props.gapPx === "number" ? b.props.gapPx : 24;
        const stack = b.props.stackOnMobile !== false;
        if (layout === "two") {
          return React.createElement(
            "section",
            { key: b.id, style: wrapperStyle(b.props.style) },
            React.createElement(
              "div",
              {
                className: stack ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-2",
                style: { gap: gapPx },
              },
              React.createElement(
                "div",
                { style: wrapperStyle(b.props.leftStyle) },
                renderMarkdown(b.props.leftMarkdown || ""),
              ),
              React.createElement(
                "div",
                { style: wrapperStyle(b.props.rightStyle) },
                renderMarkdown(b.props.rightMarkdown || ""),
              ),
            ),
          );
        }

        return React.createElement(
          "section",
          { key: b.id, style: wrapperStyle(b.props.style) },
          renderMarkdown(b.props.markdown || ""),
        );
      }

      return null;
    }),
  );
}
