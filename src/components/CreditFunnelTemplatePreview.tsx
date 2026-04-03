"use client";

import { useMemo } from "react";

import { renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import type { CreditFunnelTemplate } from "@/lib/creditFunnelTemplates";
import { buildCreditFunnelPagesFromTemplateAndTheme } from "@/lib/creditFunnelTemplates";
import type { CreditFunnelTheme } from "@/lib/creditFunnelThemes";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function CreditFunnelTemplatePreview(props: {
  template: CreditFunnelTemplate;
  theme: CreditFunnelTheme;
  className?: string;
}) {
  const pages = useMemo(() => buildCreditFunnelPagesFromTemplateAndTheme(props.template, props.theme), [props.template, props.theme]);
  const first = pages[0];

  return (
    <div className={classNames("rounded-3xl border border-zinc-200 bg-white p-3", props.className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-zinc-900">Preview</div>
          <div className="text-xs text-zinc-600">This is a live funnel render.</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800">
          <span
            className="h-2.5 w-2.5 rounded-full border border-black/10"
            style={{ backgroundColor: props.theme.primaryButtonStyle.backgroundColor || "#2563eb" }}
            aria-hidden="true"
          />
          {props.theme.label}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-3xl border border-black/10 bg-white">
        <div className="origin-top-left scale-[0.72]" style={{ width: "138.9%" }}>
          {first
            ? renderCreditFunnelBlocks({
                blocks: first.blocksJson,
                basePath: "",
                context: {
                  funnelPathBase: "/f/preview",
                  funnelSlug: "preview",
                  funnelPageSlug: first.slug,
                  previewDevice: "desktop",
                },
              })
            : null}
        </div>
      </div>
    </div>
  );
}
