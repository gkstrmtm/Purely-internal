"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { coerceBlocksJson, renderCreditFunnelBlocks, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";

type HostedEditorService = "BOOKING" | "NEWSLETTER" | "REVIEWS" | "BLOGS";

type HostedPageDocument = {
  id: string;
  service: HostedEditorService;
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

function serviceQueryValue(service: HostedEditorService) {
  return service.toLowerCase();
}

export function HostedServicePageEditorClient({
  service,
  serviceLabel,
  backHref,
  defaultPageKey,
}: {
  service: HostedEditorService;
  serviceLabel: string;
  backHref: string;
  defaultPageKey?: string;
}) {
  const pathname = usePathname();
  const toast = useToast();
  const appBase = String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generatorBusy, setGeneratorBusy] = useState(false);
  const [generatorPrompt, setGeneratorPrompt] = useState("");
  const [documents, setDocuments] = useState<HostedPageDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<HostedPageDocument["status"]>("DRAFT");
  const [editorMode, setEditorMode] = useState<HostedPageDocument["editorMode"]>("BLOCKS");
  const [customHtml, setCustomHtml] = useState("");
  const [blocksText, setBlocksText] = useState("[]");
  const [prompt, setPrompt] = useState("");

  const selectedDocument = useMemo(
    () => documents.find((entry) => entry.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  const syncFromDocument = useCallback((doc: HostedPageDocument | null) => {
    if (!doc) return;
    setTitle(doc.title || "");
    setSlug(doc.slug || "");
    setStatus(doc.status);
    setEditorMode(doc.editorMode);
    setCustomHtml(doc.customHtml || "");
    setBlocksText(prettyJson(doc.blocksJson));
  }, []);

  const replaceDocument = useCallback((nextDoc: HostedPageDocument, htmlOverride?: string) => {
    setDocuments((current) => current.map((entry) => (entry.id === nextDoc.id ? nextDoc : entry)));
    setSelectedDocumentId(nextDoc.id);
    syncFromDocument({ ...nextDoc, customHtml: htmlOverride ?? nextDoc.customHtml });
  }, [syncFromDocument]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents?service=${serviceQueryValue(service)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as HostedListResponse | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.documents)) {
        throw new Error(data?.error || `Failed to load ${serviceLabel.toLowerCase()} hosted page documents`);
      }

      const nextDocuments = data.documents;
      const preferred =
        (defaultPageKey ? nextDocuments.find((entry) => entry.pageKey === defaultPageKey) : null) ??
        nextDocuments[0] ??
        null;

      setDocuments(nextDocuments);
      if (!preferred) throw new Error(`No ${serviceLabel.toLowerCase()} hosted page document found`);
      setSelectedDocumentId(preferred.id);
      syncFromDocument(preferred);
      setGeneratorPrompt(typeof data.generatorPrompt === "string" ? data.generatorPrompt : "");
    } catch (error) {
      toast.error(`Could not load ${serviceLabel.toLowerCase()} page editor\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setLoading(false);
    }
  }, [defaultPageKey, service, serviceLabel, syncFromDocument, toast]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const parsedBlocks = useMemo(() => {
    try {
      return coerceBlocksJson(JSON.parse(blocksText));
    } catch {
      return null;
    }
  }, [blocksText]);

  const saveDocument = useCallback(async () => {
    if (!selectedDocument) return;
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
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocument.id)}`, {
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
        throw new Error(data?.error || `Failed to save ${serviceLabel.toLowerCase()} page`);
      }
      replaceDocument(data.document);
      toast.success(`${serviceLabel} page saved`);
    } catch (error) {
      toast.error(`Save failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
  }, [customHtml, editorMode, parsedBlocks, replaceDocument, selectedDocument, serviceLabel, slug, status, title, toast]);

  const exportBlocksToHtml = useCallback(async () => {
    if (!selectedDocument) return;
    if (!parsedBlocks) {
      toast.error("Blocks JSON is invalid\nFix the JSON before exporting HTML.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocument.id)}/export-custom-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocksJson: parsedBlocks, setEditorMode: "CUSTOM_HTML" }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; html?: string; document?: HostedPageDocument; error?: string } | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || "Failed to export custom HTML");
      }
      replaceDocument(data.document, data.html || data.document.customHtml || "");
      toast.success("Custom HTML refreshed");
    } catch (error) {
      toast.error(`Export failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
  }, [parsedBlocks, replaceDocument, selectedDocument, title, toast]);

  const generateHtml = useCallback(async () => {
    if (!selectedDocument) return;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast.error(`Add a prompt first\nDescribe the ${serviceLabel.toLowerCase()} page you want Pura to generate.`);
      return;
    }

    setGeneratorBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocument.id)}/generate-html`, {
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
      replaceDocument(data.document, data.html || data.document.customHtml || "");
      if (typeof data.generatorPrompt === "string") setGeneratorPrompt(data.generatorPrompt);
      if (data.question) toast.info(`Pura needs one detail\n${data.question}`);
      else toast.success("Hosted HTML generated");
    } catch (error) {
      toast.error(`Generation failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setGeneratorBusy(false);
    }
  }, [customHtml, prompt, replaceDocument, selectedDocument, serviceLabel, toast]);

  if (loading) {
    return <div className="px-6 py-10 text-sm text-zinc-600">Loading {serviceLabel.toLowerCase()} page editor…</div>;
  }

  if (!selectedDocument) {
    return <div className="px-6 py-10 text-sm text-red-600">Could not load the {serviceLabel.toLowerCase()} hosted page document.</div>;
  }

  const documentOptions = documents.map((doc) => ({
    value: doc.id,
    label: doc.pageKey === doc.title ? doc.pageKey : `${doc.title} · ${doc.pageKey}`,
  }));

  return (
    <div className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <a href={`${appBase}${backHref}`} className="text-sm font-semibold text-(--color-brand-blue) hover:underline">
              ← Back to {serviceLabel}
            </a>
            <div className="text-2xl font-semibold text-zinc-950">{serviceLabel} page editor</div>
            <p className="max-w-3xl text-sm text-zinc-600">
              Edit hosted {serviceLabel.toLowerCase()} page documents, generate fresh custom HTML with Pura, or keep the layout in block mode and export a synced HTML snapshot.
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
                <label className="space-y-2 md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Document</div>
                  <PortalListboxDropdown
                    value={selectedDocumentId}
                    onChange={(value) => {
                      const nextId = String(value || "");
                      setSelectedDocumentId(nextId);
                      syncFromDocument(documents.find((entry) => entry.id === nextId) ?? null);
                    }}
                    options={documentOptions}
                    placeholder="Choose a hosted page"
                    buttonClassName="flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </label>

                <label className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Title</div>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-(--color-brand-blue)"
                    placeholder={`${serviceLabel} page`}
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
                    onChange={(value) => setStatus(String(value || "DRAFT") as HostedPageDocument["status"])}
                    options={[
                      { value: "DRAFT", label: "Draft" },
                      { value: "PUBLISHED", label: "Published" },
                    ]}
                    placeholder="Select status"
                    buttonClassName="flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </label>

                <label className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Editor mode</div>
                  <PortalListboxDropdown
                    value={editorMode}
                    onChange={(value) => setEditorMode(String(value || "BLOCKS") as HostedPageDocument["editorMode"])}
                    options={[
                      { value: "BLOCKS", label: "Blocks" },
                      { value: "CUSTOM_HTML", label: "Custom HTML" },
                      { value: "MARKDOWN", label: "Markdown" },
                    ]}
                    placeholder="Select mode"
                    buttonClassName="flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Content</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {editorMode === "CUSTOM_HTML"
                      ? "Custom HTML is rendered live when this document is active."
                      : editorMode === "BLOCKS"
                        ? "Blocks JSON stays editable and can be exported to fresh HTML."
                        : "Markdown mode is stored but the current hosted runtime primarily uses blocks or custom HTML."}
                  </div>
                </div>
                <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  {selectedDocument.pageKey}
                </div>
              </div>

              {editorMode === "CUSTOM_HTML" ? (
                <textarea
                  value={customHtml}
                  onChange={(event) => setCustomHtml(event.target.value)}
                  className="mt-4 min-h-120 w-full rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-sky-400"
                  spellCheck={false}
                />
              ) : (
                <textarea
                  value={blocksText}
                  onChange={(event) => setBlocksText(event.target.value)}
                  className="mt-4 min-h-120 w-full rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-100 outline-none transition focus:border-sky-400"
                  spellCheck={false}
                />
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">Generate with Pura</div>
              <div className="mt-1 text-sm text-zinc-600">
                Ask for a full redesign, a tighter hero, stronger calls to action, or a page structure tuned for this hosted experience.
              </div>

              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={`Describe the ${serviceLabel.toLowerCase()} page you want…`}
                className="mt-4 min-h-45 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-(--color-brand-blue)"
              />

              {generatorPrompt ? (
                <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-950">
                  <div className="font-semibold uppercase tracking-wide text-sky-800">Generator guidance</div>
                  <div className="mt-2 whitespace-pre-wrap">{generatorPrompt}</div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void generateHtml()}
                disabled={generatorBusy || busy}
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatorBusy ? "Generating…" : "Generate hosted HTML"}
              </button>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">Preview</div>
              <div className="mt-1 text-sm text-zinc-600">Client-side preview of the current editor state.</div>

              <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-[#f8fafc]">
                {editorMode === "CUSTOM_HTML" ? (
                  <iframe
                    title={`${serviceLabel} page preview`}
                    className="h-180 w-full bg-white"
                    sandbox="allow-same-origin"
                    srcDoc={customHtml || "<div style='padding:24px;font-family:Inter,system-ui,sans-serif;color:#64748b'>No custom HTML yet.</div>"}
                  />
                ) : parsedBlocks ? (
                  <div className="max-h-180 overflow-auto bg-white p-6">
                    {renderCreditFunnelBlocks({
                      blocks: parsedBlocks,
                      basePath: "",
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-sm text-red-600">Blocks JSON is invalid.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
