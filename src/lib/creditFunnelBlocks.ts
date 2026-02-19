import React from "react";

export type CreditFunnelBlock =
  | {
      id: string;
      type: "heading";
      props: { text: string; level?: 1 | 2 | 3 };
    }
  | {
      id: string;
      type: "paragraph";
      props: { text: string };
    }
  | {
      id: string;
      type: "button";
      props: {
        text: string;
        href: string;
        variant?: "primary" | "secondary";
      };
    }
  | {
      id: string;
      type: "image";
      props: { src: string; alt?: string };
    }
  | {
      id: string;
      type: "spacer";
      props: { height?: number };
    }
  | {
      id: string;
      type: "formLink";
      props: { formSlug: string; text?: string };
    };

export function coerceBlocksJson(value: unknown): CreditFunnelBlock[] {
  if (!Array.isArray(value)) return [];
  const out: CreditFunnelBlock[] = [];

  for (const raw of value) {
    const r = raw as any;
    const id = typeof r?.id === "string" ? r.id.trim() : "";
    const type = typeof r?.type === "string" ? r.type : "";
    const props = r?.props ?? {};
    if (!id) continue;

    if (type === "heading") {
      const text = typeof props?.text === "string" ? props.text : "";
      const levelNum = Number(props?.level);
      const level = [1, 2, 3].includes(levelNum)
        ? (levelNum as 1 | 2 | 3)
        : 2;
      out.push({ id, type, props: { text, level } });
      continue;
    }

    if (type === "paragraph") {
      const text = typeof props?.text === "string" ? props.text : "";
      out.push({ id, type, props: { text } });
      continue;
    }

    if (type === "button") {
      const text =
        typeof props?.text === "string" ? props.text : "Click";
      const href =
        typeof props?.href === "string" ? props.href : "#";
      const variant =
        props?.variant === "secondary" ? "secondary" : "primary";
      out.push({ id, type, props: { text, href, variant } });
      continue;
    }

    if (type === "image") {
      const src = typeof props?.src === "string" ? props.src : "";
      const alt = typeof props?.alt === "string" ? props.alt : "";
      out.push({ id, type, props: { src, alt } });
      continue;
    }

    if (type === "spacer") {
      const heightNum = Number(props?.height);
      const height = Number.isFinite(heightNum)
        ? Math.max(0, heightNum)
        : 24;
      out.push({ id, type, props: { height } });
      continue;
    }

    if (type === "formLink") {
      const formSlug =
        typeof props?.formSlug === "string" ? props.formSlug : "";
      const text =
        typeof props?.text === "string" ? props.text : "Open form";
      out.push({ id, type, props: { formSlug, text } });
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

export function renderCreditFunnelBlocks({
  blocks,
  basePath,
}: {
  blocks: CreditFunnelBlock[];
  basePath: string;
}): React.ReactNode {
  return React.createElement(
    "div",
    { className: "space-y-4" },
    blocks.map((b) => {
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
          Tag,
          { key: b.id, className: cls },
          b.props.text,
        );
      }

      if (b.type === "paragraph") {
        const cls = "text-base leading-relaxed text-zinc-700";
        return React.createElement(
          "p",
          { key: b.id, className: cls },
          b.props.text,
        );
      }

      if (b.type === "button") {
        return React.createElement(
          "a",
          {
            key: b.id,
            href: b.props.href,
            className: buttonClass(b.props.variant ?? "primary"),
          },
          b.props.text,
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
          { key: b.id, className: cls },
          React.createElement("img", {
            src: b.props.src,
            alt: b.props.alt || "",
            className: "h-auto w-full",
          }),
        );
      }

      if (b.type === "spacer") {
        return React.createElement("div", {
          key: b.id,
          style: { height: b.props.height ?? 24 },
        });
      }

      if (b.type === "formLink") {
        const href =
          basePath + "/forms/" + encodeURIComponent(b.props.formSlug || "");
        return React.createElement(
          "a",
          { key: b.id, href, className: buttonClass("primary") },
          b.props.text || "Open form",
        );
      }

      return null;
    }),
  );
}
