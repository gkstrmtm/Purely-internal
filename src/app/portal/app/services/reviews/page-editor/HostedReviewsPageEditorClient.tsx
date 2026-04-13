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
        throw new Error(data?.error || "Failed to load reviews page document");
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
      setGeneratorPrompt(typeof data.generatorPrompt === "string" ? data.generatorPrompt : "");
    } catch (error) {
      toast.error(`Could not load reviews page\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  const parsedBlocks = useMemo(() => {
    try {
      return coerceBlocksJson(JSON.parse(blocksText));
    } catch {
      return null;
    }
  }, [blocksText]);

  const saveDocument = useCallback(async () => {
    if (!document) return;
    let nextBlocks: CreditFunnelBlock[] | undefined;
    if (editorMode === "BLOCKS") {
      if (!parsedBlocks) {
        toast.error("Blocks JSON is invalid\nFix the JSON before saving.");
        return;
      }
      nextBlocks = parsedBlocks;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(document.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slug.trim() || null,
          status,
          editorMode,
          customHtml,
          ...(nextBlocks ? { blocksJson: nextBlocks } : null),
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; document?: HostedPageDocument; error?: string } | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || "Failed to save reviews page");
      }
      setDocument(data.document);
      setTitle(data.document.title || "");
      setSlug(data.document.slug || "");
      setStatus(data.document.status);
      setEditorMode(data.document.editorMode);
      setCustomHtml(data.document.customHtml || "");
      setBlocksText(prettyJson(data.document.blocksJson));
      toast.success("Reviews page saved");
    } catch (error) {
      toast.error(`Save failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
  }, [customHtml, document, editorMode, parsedBlocks, slug, status, title, toast]);

  const exportBlocksToHtml = useCallback(async () => {
    if (!document) return;
    if (!parsedBlocks) {
      toast.error("Blocks JSON is invalid\nFix the JSON before exporting HTML.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(document.id)}/export-custom-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocksJson: parsedBlocks, setEditorMode: "CUSTOM_HTML" }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; html?: string; document?: HostedPageDocument; error?: string } | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || "Failed to export custom HTML");
      }
      setDocument(data.document);
      setEditorMode(data.document.editorMode);
      setCustomHtml(data.html || data.document.customHtml || "");
      setBlocksText(prettyJson(data.document.blocksJson));
      toast.success("Custom HTML refreshed");
    } catch (error) {
      toast.error(`Export failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
  }, [document, parsedBlocks, title, toast]);

  const generateHtml = useCallback(async () => {
    if (!document) return;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast.error("Add a prompt first\nDescribe the reviews page you want Pura to generate.");
      return;
    }

    setGeneratorBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(document.id)}/generate-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, currentHtml: customHtml }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; document?: HostedPageDocument; html?: string; question?: string; error?: string; generatorPrompt?: string }
        | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || "Failed to generate hosted page HTML");
      }
      setDocument(data.document);
      setEditorMode(data.document.editorMode);
      setCustomHtml(data.html || data.document.customHtml || "");
      setBlocksText(prettyJson(data.document.blocksJson));
      if (typeof data.generatorPrompt === "string") setGeneratorPrompt(data.generatorPrompt);
      if (data.question) {
        toast.info(`Pura needs one detail\n${data.question}`);
      } else {
        toast.success("Hosted HTML generated");
      }
    } catch (error) {
      toast.error(`Generation failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setGeneratorBusy(false);
    }
  }, [customHtml, document, prompt, toast]);

  if (loading) {
    return <div className="px-6 py-10 text-sm text-zinc-600">Loading reviews page editor…</div>;
  }

  if (!document) {
    return <div className="px-6 py-10 text-sm text-red-600">Could not load the reviews hosted page document.</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <a href={`${appBase}/services/reviews`} className="text-sm font-semibold text-(--color-brand-blue) hover:underline">
              ← Back to Reviews
            </a>
            <div className="text-2xl font-semibold text-zinc-950">Reviews page editor</div>
            <p className="max-w-3xl text-sm text-zinc-600">
              Edit the hosted reviews page document, generate fresh custom HTML with Pura, or keep the layout in block mode and export a synced HTML snapshot.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportBlocksToHtml()}
              disabled={busy || editorMode !== "BLOCKS"}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export blocks → HTML
            </button>
            <button
              type="button"
              onClick={() => void saveDocument()}
              disabled={busy || generatorBusy}
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Title</div>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-(--color-brand-blue)"
                    placeholder="Reviews page"
                  />
                </label>

                <label className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Slug override</div>
                  <input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-(--color-brand-blue)"
                    placeholder="Optional"
                  />
                </label>

                <label className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Status</div>
                  <PortalListboxDropdown
                    value={status}
                    options={[
                      { value: "DRAFT", label: "Draft" },
                      { value: "PUBLISHED", label: "Published" },
                    ]}
                    onChange={(value) => setStatus(String(value) as HostedPageDocument["status"])}
                  />
                </label>

                <label className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Editor mode</div>
                  <PortalListboxDropdown
                    value={editorMode}
                    options={[
                      { value: "BLOCKS", label: "Blocks" },
                      { value: "CUSTOM_HTML", label: "Custom HTML" },
                      { value: "MARKDOWN", label: "Markdown" },
                    ]}
                    onChange={(value) => setEditorMode(String(value) as HostedPageDocument["editorMode"])}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-zinc-950">Pura hosted-page generator</div>
                  <p className="mt-1 text-sm text-zinc-600">Ask for a new reviews page layout, more trust proof, sharper copy, different sections, or a full redesign.</p>
                </div>
              </div>
              {generatorPrompt ? (
                <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-xs leading-6 text-sky-900">
                  {generatorPrompt}
                </div>
              ) : null}
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
