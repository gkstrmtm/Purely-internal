"use client";

import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default function HostedReviewsPageEditorClient() {
  return (
    <HostedServicePageEditorClient
      service="REVIEWS"
      serviceLabel="Reviews"
      backHref="/services/reviews"
      defaultPageKey="reviews_home"
    />
  );
}

/*

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { coerceBlocksJson, renderCreditFunnelBlocks, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";

type HostedPageDocument = {
  id: string;
  service: "BOOKING" | "NEWSLETTER" | "REVIEWS" | "BLOGS";
  pageKey: string;
  title: string;
  slug: string | null;
  status: "DRAFT" | "PUBLISHED";
  contentMarkdown: string;
  editorMode: "MARKDOWN" | "BLOCKS" | "CUSTOM_HTML";
  blocksJson: CreditFunnelBlock[];
  customHtml: string;
  customChatJson: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  themeJson: unknown;
  dataBindingsJson: unknown;
  updatedAt: string;
};

type HostedListResponse = {
  ok: boolean;
  documents?: HostedPageDocument[];
  generatorPrompt?: string;
  error?: string;
};

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? [], null, 2);
  } catch {
    return "[]";
  }
}

export default function HostedReviewsPageEditorClient() {
  const pathname = usePathname();
  const toast = useToast();
  const basePath = String(pathname || "").startsWith("/credit") ? "/credit" : "";
  const appBase = String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generatorBusy, setGeneratorBusy] = useState(false);
  const [generatorPrompt, setGeneratorPrompt] = useState("");
  const [document, setDocument] = useState<HostedPageDocument | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<HostedPageDocument["status"]>("DRAFT");
  const [editorMode, setEditorMode] = useState<HostedPageDocument["editorMode"]>("BLOCKS");
  const [customHtml, setCustomHtml] = useState("");
  const [blocksText, setBlocksText] = useState("[]");
  const [prompt, setPrompt] = useState("");

  const loadDocument = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents?service=reviews`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as HostedListResponse | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.documents)) {
        throw new Error(data?.error || "The reviews page did not load. Try again here or keep working in the editor.");
      }

      const nextDoc = data.documents.find((entry) => entry.pageKey === "reviews_home") ?? data.documents[0] ?? null;
      if (!nextDoc) throw new Error("No reviews hosted page document found");

      setDocument(nextDoc);
      setTitle(nextDoc.title || "");
      setSlug(nextDoc.slug || "");
      setStatus(nextDoc.status);
      setEditorMode(nextDoc.editorMode);
      setCustomHtml(nextDoc.customHtml || "");
      setBlocksText(prettyJson(nextDoc.blocksJson));
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="mt-4 min-h-32 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-(--color-brand-blue)"
                placeholder="Example: redesign this reviews page with a premium hero, a trust strip, stronger CTA buttons, and a warmer testimonial section."
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void generateHtml()}
                  disabled={generatorBusy || busy}
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatorBusy ? "Generating…" : "Generate hosted HTML"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-lg font-semibold text-zinc-950">Block JSON</div>
              <p className="mt-1 text-sm text-zinc-600">Use this for layout-driven edits, then export to refresh the hosted HTML snapshot.</p>
              <textarea
                value={blocksText}
                onChange={(event) => setBlocksText(event.target.value)}
                className="mt-4 min-h-90 w-full rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-100 outline-none transition focus:border-(--color-brand-blue)"
                spellCheck={false}
              />
              {editorMode === "BLOCKS" && !parsedBlocks ? <div className="mt-3 text-sm font-medium text-red-600">Blocks JSON is invalid.</div> : null}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-lg font-semibold text-zinc-950">Custom HTML</div>
              <p className="mt-1 text-sm text-zinc-600">This is the specialized hosted-page layer that Pura generates for reviews pages.</p>
              <textarea
                value={customHtml}
                onChange={(event) => setCustomHtml(event.target.value)}
                className="mt-4 min-h-90 w-full rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-100 outline-none transition focus:border-(--color-brand-blue)"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-zinc-950">Preview</div>
                  <p className="mt-1 text-sm text-zinc-600">Preview the active editor mode before you wire it into the live reviews runtime.</p>
                </div>
                <a
                  href={`${appBase}/services/reviews`}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Back to setup
                </a>
              </div>

              <div className="mt-4 overflow-hidden rounded-[28px] border border-zinc-200 bg-[#fafbff]">
                {editorMode === "BLOCKS" && parsedBlocks ? (
                  <div className="max-h-[80vh] overflow-auto px-4 py-6">{renderCreditFunnelBlocks({ blocks: parsedBlocks, basePath })}</div>
                ) : editorMode === "CUSTOM_HTML" ? (
                  <iframe title="Hosted reviews HTML preview" className="h-[80vh] w-full bg-white" srcDoc={customHtml || "<html><body></body></html>"} />
                ) : (
                  <div className="px-6 py-10 text-sm text-zinc-600">Markdown mode is stored, but the reviews-first preview currently focuses on blocks and custom HTML.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

*/
