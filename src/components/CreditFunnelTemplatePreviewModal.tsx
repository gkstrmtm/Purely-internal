"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!props.open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/55 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => props.onClose()}
    >
      <div
        className="w-full max-w-6xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-hidden rounded-3xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
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
            aria-label="Close preview"
            title="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-white text-lg font-semibold text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-blue)/20"
          >
            ×
          </button>
        </div>

        <div className="h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem-49px)] overflow-auto bg-zinc-100">
          <div
            className={classNames("mx-auto w-full")}
            style={{ background: "transparent" }}
            onClickCapture={(e) => {
              const target = e.target as HTMLElement | null;
              const a = target?.closest?.("a");
              if (a) {
                const href = a.getAttribute("href") || "";
                if (!href.startsWith("#")) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }
            }}
          >
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
    </div>,
    document.body,
  );
}
