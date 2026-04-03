"use client";

import { useMemo } from "react";

import { renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import type { CreditFunnelTemplate } from "@/lib/creditFunnelTemplates";
import { buildCreditFunnelPagesFromTemplateAndTheme } from "@/lib/creditFunnelTemplates";
import type { CreditFunnelTheme } from "@/lib/creditFunnelThemes";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function CreditFunnelTemplatePreviewModal(props: {
  open: boolean;
  onClose: () => void;
  template: CreditFunnelTemplate;
  theme: CreditFunnelTheme;
}) {
  const pages = useMemo(() => buildCreditFunnelPagesFromTemplateAndTheme(props.template, props.theme), [props.template, props.theme]);
  const first = pages[0];

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-6xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
          <div>
            <div className="text-sm font-bold text-zinc-900">Funnel preview</div>
            <div className="text-xs text-zinc-600">
              {props.template.label} - {props.theme.label}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem-49px)] overflow-auto bg-zinc-100">
          <div className={classNames("mx-auto w-full")} style={{ background: "transparent" }}>
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
    </div>
  );
}
