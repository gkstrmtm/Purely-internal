"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  coerceBlocksJson,
  renderCreditFunnelBlocks,
  type CreditFunnelBlock,
} from "@/lib/creditFunnelBlocks";
import { SignOutButton } from "@/components/SignOutButton";

type Funnel = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
};

type Page = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  contentMarkdown: string;
  editorMode: "MARKDOWN" | "BLOCKS" | "CUSTOM_HTML";
  blocksJson: unknown;
  customHtml: string;
  customChatJson: unknown;
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string; at?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeSlug(raw: string) {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
  return cleaned;
}

/* DISABLED: broken intermediate refactor (kept temporarily for reference)
export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPage = useMemo(
    () => (pages || []).find((p) => p.id === selectedPageId) || null,
    [pages, selectedPageId],
  );

  const load = async () => {
    setError(null);
    const [fRes, pRes] = await Promise.all([
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, { cache: "no-store" }),
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, { cache: "no-store" }),
    ]);
    const fJson = (await fRes.json().catch(() => null)) as any;
    const pJson = (await pRes.json().catch(() => null)) as any;
    if (!fRes.ok || !fJson || fJson.ok !== true) throw new Error(fJson?.error || "Failed to load funnel");
    if (!pRes.ok || !pJson || pJson.ok !== true) throw new Error(pJson?.error || "Failed to load pages");
    setFunnel(fJson.funnel as Funnel);
    const nextPages = Array.isArray(pJson.pages) ? (pJson.pages as Page[]) : [];
    setPages(nextPages);
    setSelectedPageId((prev) => prev || nextPages[0]?.id || null);
  };

  useEffect(() => {
    let cancelled = false;

    if (funnel !== null && pages !== null) return;

    void load().catch((e) => {
      if (cancelled) return;
      setError(e?.message ? String(e.message) : "Failed to load");
    });

    return () => {
      cancelled = true;
    };
    // Intentionally omit `load` from deps to avoid re-creating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId, funnel, pages]);

  const createPage = async () => {
    const slug = normalizeSlug(prompt("Page slug (e.g. landing)") || "");
    if (!slug) return;
    const title = (prompt("Page title (optional)") || "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, title: title || undefined, contentMarkdown: "" }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create page");
      const createdId = (json.page?.id ? String(json.page.id) : "").trim();
      if (createdId) {
        await fetch(
          `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(createdId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ editorMode: "BLOCKS", blocksJson: [] }),
          },
        ).catch(() => null);
      }
      await load();
      setSelectedPageId(createdId || json.page?.id || null);
      setSelectedBlockId(null);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to create page");
    } finally {
      setBusy(false);
    }
  };

  const savePage = async (
    patch: Partial<
      Pick<
        Page,
        "title" | "slug" | "sortOrder" | "contentMarkdown" | "editorMode" | "blocksJson" | "customHtml" | "customChatJson"
      >
    >,
  ) => {
    if (!selectedPage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
      await load();
      setSelectedPageId(json.page?.id || selectedPage.id);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const newId = () => {
    try {
      const maybeCrypto = globalThis.crypto as Crypto | undefined;

          const setEditorMode = async (mode: "BLOCKS" | "CUSTOM_HTML") => {
            if (!selectedPage) return;
            if (selectedPage.editorMode === mode) return;
            setSelectedPageLocal({ editorMode: mode });
            await savePage({ editorMode: mode });
          };

          const saveCurrentPage = async () => {
            if (!selectedPage) return;
            if (selectedPage.editorMode === "BLOCKS") {
              await savePage({ editorMode: "BLOCKS", blocksJson: selectedBlocks });
              return;
            }
            if (selectedPage.editorMode === "CUSTOM_HTML") {
              await savePage({ editorMode: "CUSTOM_HTML", customHtml: selectedPage.customHtml || "", customChatJson: selectedChat });
              return;
            }
            await setEditorMode("BLOCKS");
          };

          return (
            <div className="flex min-h-screen flex-col">
              <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
                <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/portal/app/services/funnel-builder"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      ← Back
                    </Link>

                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Funnel</div>
                      <div className="truncate text-sm font-semibold text-brand-ink">{funnel?.name || "…"}</div>
                      <div className="truncate text-xs text-zinc-500">{funnel?.slug ? `Hosted: ${basePath}/f/${funnel.slug}` : ""}</div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const name = (prompt("Funnel name", funnel?.name || "") || "").trim();
                        if (name) saveFunnelMeta({ name });
                      }}
                      className={classNames(
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Rename funnel
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedPageId || ""}
                      onChange={(e) => {
                        const nextId = e.target.value || null;
                        setSelectedPageId(nextId);
                        setSelectedBlockId(null);
                      }}
                      className="min-w-[220px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      disabled={busy || !pages || pages.length === 0}
                    >
                      {(pages || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => {
                        if (!selectedPage) return;
                        const title = (prompt("Page title", selectedPage.title) || "").trim();
                        if (title) savePage({ title });
                      }}
                      className={classNames(
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Rename page
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => {
                        if (!selectedPage) return;
                        const slug = normalizeSlug(prompt("Page slug", selectedPage.slug) || "");
                        if (slug) savePage({ slug });
                      }}
                      className={classNames(
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Slug
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={createPage}
                      className={classNames(
                        "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                        busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
                      )}
                    >
                      + Page
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => void setEditorMode("BLOCKS")}
                      className={classNames(
                        "rounded-xl border px-3 py-2 text-sm font-semibold",
                        selectedPage?.editorMode === "BLOCKS"
                          ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-blue-800"
                          : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                      )}
                    >
                      Blocks
                    </button>
                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => void setEditorMode("CUSTOM_HTML")}
                      className={classNames(
                        "rounded-xl border px-3 py-2 text-sm font-semibold",
                        selectedPage?.editorMode === "CUSTOM_HTML"
                          ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-blue-800"
                          : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                      )}
                    >
                      Custom code
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => void saveCurrentPage()}
                      className={classNames(
                        "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                        busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                      )}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={deletePage}
                      className={classNames(
                        "rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Delete
                    </button>

                    <SignOutButton />
                  </div>
                </div>
              </header>

              {error ? <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

              <div className="flex flex-1 overflow-hidden">
                <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-4">
                  {!selectedPage ? (
                    <div className="text-sm text-zinc-600">Select a page to edit.</div>
                  ) : selectedPage.editorMode === "MARKDOWN" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Legacy mode</div>
                      <div className="mt-2 font-semibold">This page is in Markdown mode.</div>
                      <div className="mt-2 text-amber-800">Markdown editing is disabled in this editor. Pick a supported mode to continue.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setEditorMode("BLOCKS")}
                          className={classNames(
                            "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                            busy ? "opacity-60" : "",
                          )}
                        >
                          Switch to Blocks
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setEditorMode("CUSTOM_HTML")}
                          className={classNames(
                            "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                            busy ? "opacity-60" : "",
                          )}
                        >
                          Switch to Custom code
                        </button>
                      </div>
                    </div>
                  ) : selectedPage.editorMode === "BLOCKS" ? (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Blocks</div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(
                          [
                            { type: "heading", label: "Heading" },
                            { type: "paragraph", label: "Text" },
                            { type: "button", label: "Button" },
                            { type: "formLink", label: "Form link" },
                            { type: "image", label: "Image" },
                            { type: "spacer", label: "Spacer" },
                          ] as const
                        ).map((b) => (
                          <button
                            key={b.type}
                            type="button"
                            disabled={busy}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/x-block-type", b.type);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => addBlock(b.type)}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            title="Drag into canvas or click to add"
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-sm font-semibold text-zinc-900">Selected</div>
                        {!selectedBlock ? (
                          <div className="mt-2 text-sm text-zinc-600">Click a block in the preview.</div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{selectedBlock.type}</div>

                            {selectedBlock.type === "heading" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.text}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, text: e.target.value },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Heading text"
                                />
                                <select
                                  value={String(selectedBlock.props.level ?? 2)}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, level: Number(e.target.value) as any },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="1">H1</option>
                                  <option value="2">H2</option>
                                  <option value="3">H3</option>
                                </select>
                              </div>
                            ) : null}

                            {selectedBlock.type === "paragraph" ? (
                              <textarea
                                value={selectedBlock.props.text}
                                onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, text: e.target.value } })}
                                className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="Paragraph text"
                              />
                            ) : null}

                            {selectedBlock.type === "button" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.text}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, text: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Button text"
                                />
                                <input
                                  value={selectedBlock.props.href}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, href: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder={`${basePath}/forms/your-form-slug`}
                                />
                                <select
                                  value={selectedBlock.props.variant ?? "primary"}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, variant: e.target.value as any } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                </select>
                              </div>
                            ) : null}

                            {selectedBlock.type === "formLink" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.formSlug}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, formSlug: normalizeSlug(e.target.value) },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="form-slug"
                                />
                                <input
                                  value={selectedBlock.props.text ?? ""}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, text: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="CTA text"
                                />
                              </div>
                            ) : null}

                            {selectedBlock.type === "image" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.src}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, src: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="https://..."
                                />
                                <input
                                  value={selectedBlock.props.alt ?? ""}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, alt: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Alt text"
                                />
                              </div>
                            ) : null}

                            {selectedBlock.type === "spacer" ? (
                              <input
                                type="number"
                                value={String(selectedBlock.props.height ?? 24)}
                                onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, height: Number(e.target.value) } })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="Height"
                              />
                            ) : null}

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeBlock(selectedBlock.id)}
                              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                            >
                              Remove block
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 text-xs text-zinc-500">Tip: drag blocks into the preview to add; drag blocks in preview to reorder.</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Custom code (AI)</div>
                      <div className="mt-3 max-h-[40vh] space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                        {selectedChat.length === 0 ? (
                          <div className="text-sm text-zinc-600">Ask for a layout and CTAs. Then follow up with edits like “change the font”.</div>
                        ) : (
                          selectedChat.map((m, idx) => (
                            <div
                              key={idx}
                              className={classNames(
                                "rounded-xl px-3 py-2 text-sm",
                                m.role === "user" ? "bg-blue-50 text-zinc-900" : "bg-zinc-50 text-zinc-800",
                              )}
                            >
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                              <div className="mt-1 whitespace-pre-wrap break-words">{m.content}</div>
                            </div>
                          ))
                        )}
                      </div>

                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="mt-3 min-h-[110px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Describe what to build or change…"
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !chatInput.trim()}
                          onClick={runAi}
                          className={classNames(
                            "flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                            busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
                          )}
                        >
                          {busy ? "Working…" : "Ask AI"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSelectedPageLocal({ customChatJson: [] });
                            savePage({ customChatJson: [] });
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="mt-4 border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                        <textarea
                          value={selectedPage.customHtml || ""}
                          onChange={(e) => setSelectedPageLocal({ customHtml: e.target.value })}
                          className="mt-2 min-h-[240px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                          placeholder="<!doctype html>…"
                        />
                        <div className="mt-2 text-xs text-zinc-500">Use Save in the top bar to persist changes.</div>
                      </div>
                    </div>
                  )}
                </aside>

                <main className="flex-1 overflow-hidden bg-zinc-100 p-4">
                  <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{selectedPage?.title || "Preview"}</div>
                        {selectedPage ? <div className="truncate text-xs text-zinc-500">/{selectedPage.slug}</div> : null}
                      </div>
                      {funnel?.slug ? (
                        <a
                          href={`${basePath}/f/${encodeURIComponent(funnel.slug)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        >
                          Open hosted
                        </a>
                      ) : null}
                    </div>

                    <div
                      className="flex-1 overflow-auto p-8"
                      onDragOver={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                        e.preventDefault();
                        const t = e.dataTransfer.getData("text/x-block-type");
                        if (t) addBlock(t as any);
                      }}
                    >
                      {!selectedPage ? (
                        <div className="text-sm text-zinc-600">Select a page to preview.</div>
                      ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                        <div className="h-[78vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <iframe
                            title={selectedPage.title}
                            sandbox="allow-forms allow-popups allow-scripts"
                            srcDoc={selectedPage.customHtml || ""}
                            className="h-full w-full bg-white"
                          />
                        </div>
                      ) : (
                        <div className="mx-auto w-full max-w-4xl rounded-3xl border border-zinc-200 bg-white p-8">
                          {selectedBlocks.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                              Drag a block from the left, or click a block to add.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {selectedBlocks.map((b) => (
                                <div
                                  key={b.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/x-block-id", b.id);
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const dragId = e.dataTransfer.getData("text/x-block-id");
                                    if (dragId) reorderBlocks(dragId, b.id);
                                  }}
                                  onClick={() => setSelectedBlockId(b.id)}
                                  className={classNames(
                                    "cursor-pointer rounded-2xl border p-4",
                                    selectedBlockId === b.id
                                      ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                                      : "border-zinc-200 bg-white hover:bg-zinc-50",
                                  )}
                                >
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{b.type}</div>
                                  <div className="mt-3">{renderCreditFunnelBlocks({ blocks: [b], basePath })}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </main>
              </div>
            </div>
                              )}
                            >
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                              <div className="mt-1 whitespace-pre-wrap break-words">{m.content}</div>
                            </div>
                          ))
                        )}
                      </div>

                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="mt-3 min-h-[110px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Describe what to build or change…"
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !chatInput.trim()}
                          onClick={runAi}
                          className={classNames(
                            "flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                            busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
                          )}
                        >
                          {busy ? "Working…" : "Ask AI"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSelectedPageLocal({ customChatJson: [] });
                            savePage({ customChatJson: [] });
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="mt-4 border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                        <textarea
                          value={selectedPage.customHtml || ""}
                          onChange={(e) => setSelectedPageLocal({ customHtml: e.target.value })}
                          className="mt-2 min-h-[240px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                          placeholder="<!doctype html>…"
                        />
                        <div className="mt-2 text-xs text-zinc-500">Use Save in the top bar to persist changes.</div>
                      </div>
                    </div>
                  )}
                </aside>

                <main className="flex-1 overflow-hidden bg-zinc-100 p-4">
                  <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{selectedPage?.title || "Preview"}</div>
                        {selectedPage ? <div className="truncate text-xs text-zinc-500">/{selectedPage.slug}</div> : null}
                      </div>
                      {funnel?.slug ? (
                        <a
                          href={`${basePath}/f/${encodeURIComponent(funnel.slug)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        >
                          Open hosted
                        </a>
                      ) : null}
                    </div>

                    <div
                      className="flex-1 overflow-auto p-8"
                      onDragOver={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                        e.preventDefault();
                        const t = e.dataTransfer.getData("text/x-block-type");
                        if (t) addBlock(t as any);
                      }}
                    >
                      {!selectedPage ? (
                        <div className="text-sm text-zinc-600">Select a page to preview.</div>
                      ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                        <div className="h-[78vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <iframe
                            title={selectedPage.title}
                            sandbox="allow-forms allow-popups allow-scripts"
                            srcDoc={selectedPage.customHtml || ""}
                            className="h-full w-full bg-white"
                          />
                        </div>
                      ) : (
                        <div className="mx-auto w-full max-w-4xl rounded-3xl border border-zinc-200 bg-white p-8">
                          {selectedBlocks.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                              Drag a block from the left, or click a block to add.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {selectedBlocks.map((b) => (
                                <div
                                  key={b.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/x-block-id", b.id);
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const dragId = e.dataTransfer.getData("text/x-block-id");
                                    if (dragId) reorderBlocks(dragId, b.id);
                                  }}
                                  onClick={() => setSelectedBlockId(b.id)}
                                  className={classNames(
                                    "cursor-pointer rounded-2xl border p-4",
                                    selectedBlockId === b.id
                                      ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                                      : "border-zinc-200 bg-white hover:bg-zinc-50",
                                  )}
                                >
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{b.type}</div>
                                  <div className="mt-3">{renderCreditFunnelBlocks({ blocks: [b], basePath })}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </main>
              </div>
            </div>
    </div>
  );
}

*/

export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPage = useMemo(
    () => (pages || []).find((p) => p.id === selectedPageId) || null,
    [pages, selectedPageId],
  );

  const selectedBlocks = useMemo(() => {
    if (!selectedPage) return [];
    return coerceBlocksJson(selectedPage.blocksJson);
  }, [selectedPage]);

  const selectedChat = useMemo(() => {
    if (!selectedPage) return [];
    return Array.isArray(selectedPage.customChatJson)
      ? (selectedPage.customChatJson as ChatMessage[])
      : [];
  }, [selectedPage]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return selectedBlocks.find((b) => b.id === selectedBlockId) || null;
  }, [selectedBlocks, selectedBlockId]);

  const newId = () => {
    try {
      const maybeCrypto = globalThis.crypto as Crypto | undefined;
      const id = typeof maybeCrypto?.randomUUID === "function" ? maybeCrypto.randomUUID() : "";
      if (typeof id === "string" && id) return id;
    } catch {
      // ignore
    }
    return `b_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  };

  const setSelectedPageLocal = (patch: Partial<Page>) => {
    if (!selectedPage) return;
    setPages((prev) =>
      (prev || []).map((p) => (p.id === selectedPage.id ? ({ ...p, ...patch } as Page) : p)),
    );
  };

  const load = async () => {
    setError(null);
    const [fRes, pRes] = await Promise.all([
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        cache: "no-store",
      }),
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        cache: "no-store",
      }),
    ]);
    const fJson = (await fRes.json().catch(() => null)) as any;
    const pJson = (await pRes.json().catch(() => null)) as any;
    if (!fRes.ok || !fJson || fJson.ok !== true)
      throw new Error(fJson?.error || "Failed to load funnel");
    if (!pRes.ok || !pJson || pJson.ok !== true)
      throw new Error(pJson?.error || "Failed to load pages");

    setFunnel(fJson.funnel as Funnel);
    const nextPages = Array.isArray(pJson.pages) ? (pJson.pages as Page[]) : [];
    setPages(nextPages);
    setSelectedPageId((prev) => prev || nextPages[0]?.id || null);
  };

  useEffect(() => {
    let cancelled = false;
    if (funnel !== null && pages !== null) return;

    void load().catch((e) => {
      if (cancelled) return;
      setError(e?.message ? String(e.message) : "Failed to load");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId, funnel, pages]);

  const saveFunnelMeta = async (patch: Partial<Pick<Funnel, "name" | "slug" | "status">>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
      setFunnel(json.funnel as Funnel);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const savePage = async (
    patch: Partial<
      Pick<
        Page,
        | "title"
        | "slug"
        | "sortOrder"
        | "contentMarkdown"
        | "editorMode"
        | "blocksJson"
        | "customHtml"
        | "customChatJson"
      >
    >,
  ) => {
    if (!selectedPage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
      await load();
      setSelectedPageId(json.page?.id || selectedPage.id);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const createPage = async () => {
    const slug = normalizeSlug(prompt("Page slug (e.g. landing)") || "");
    if (!slug) return;
    const title = (prompt("Page title (optional)") || "").trim();

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, title: title || undefined, contentMarkdown: "" }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create page");

      const createdId = (json.page?.id ? String(json.page.id) : "").trim();
      if (createdId) {
        await fetch(
          `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(createdId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ editorMode: "BLOCKS", blocksJson: [] }),
          },
        ).catch(() => null);
      }

      await load();
      setSelectedPageId(createdId || null);
      setSelectedBlockId(null);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to create page");
    } finally {
      setBusy(false);
    }
  };

  const deletePage = async () => {
    if (!selectedPage) return;
    if (!confirm(`Delete page “${selectedPage.title}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to delete");
      await load();
      setSelectedBlockId(null);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const setEditorMode = async (mode: "BLOCKS" | "CUSTOM_HTML") => {
    if (!selectedPage) return;
    if (selectedPage.editorMode === mode) return;
    setSelectedPageLocal({ editorMode: mode });
    await savePage({ editorMode: mode });
  };

  const saveCurrentPage = async () => {
    if (!selectedPage) return;
    if (selectedPage.editorMode === "BLOCKS") {
      await savePage({ editorMode: "BLOCKS", blocksJson: selectedBlocks });
      return;
    }
    if (selectedPage.editorMode === "CUSTOM_HTML") {
      await savePage({
        editorMode: "CUSTOM_HTML",
        customHtml: selectedPage.customHtml || "",
        customChatJson: selectedChat,
      });
      return;
    }
    await setEditorMode("BLOCKS");
  };

  const upsertBlock = (block: CreditFunnelBlock) => {
    if (!selectedPage) return;
    const next = selectedBlocks.map((b) => (b.id === block.id ? block : b));
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: next });
  };

  const addBlock = (type: CreditFunnelBlock["type"]) => {
    if (!selectedPage) return;
    const id = newId();
    const base: CreditFunnelBlock =
      type === "heading"
        ? { id, type, props: { text: "Headline", level: 2 } }
        : type === "paragraph"
          ? { id, type, props: { text: "Write something compelling here." } }
          : type === "button"
            ? {
                id,
                type,
                props: {
                  text: "Get started",
                  href: `${basePath}/forms/your-form-slug`,
                  variant: "primary",
                },
              }
            : type === "image"
              ? { id, type, props: { src: "", alt: "" } }
              : type === "formLink"
                ? { id, type, props: { formSlug: "", text: "Open form" } }
                : { id, type: "spacer", props: { height: 24 } };

    const next = [...selectedBlocks, base];
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: next });
    setSelectedBlockId(id);
  };

  const removeBlock = (blockId: string) => {
    if (!selectedPage) return;
    const next = selectedBlocks.filter((b) => b.id !== blockId);
    setSelectedPageLocal({ blocksJson: next });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  };

  const reorderBlocks = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const fromIdx = selectedBlocks.findIndex((b) => b.id === dragId);
    const toIdx = selectedBlocks.findIndex((b) => b.id === dropId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...selectedBlocks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setSelectedPageLocal({ blocksJson: next });
  };

  const runAi = async () => {
    if (!selectedPage) return;
    const promptText = chatInput.trim();
    if (!promptText) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/generate-html`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            currentHtml: selectedPage.customHtml || "",
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate HTML");

      setChatInput("");
      const page = json.page as Partial<Page> | undefined;
      if (page?.id) {
        setPages((prev) => (prev || []).map((p) => (p.id === page.id ? ({ ...p, ...page } as Page) : p)));
        setSelectedPageId(String(page.id));
      } else {
        await load();
      }
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to generate HTML");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
        <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/portal/app/services/funnel-builder"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              ← Back
            </Link>

            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Funnel</div>
              <div className="truncate text-sm font-semibold text-brand-ink">{funnel?.name || "…"}</div>
              <div className="truncate text-xs text-zinc-500">
                {funnel?.slug ? `Hosted: ${basePath}/f/${funnel.slug}` : ""}
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const name = (prompt("Funnel name", funnel?.name || "") || "").trim();
                if (name) void saveFunnelMeta({ name });
              }}
              className={classNames(
                "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                busy ? "opacity-60" : "",
              )}
            >
              Rename funnel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedPageId || ""}
              onChange={(e) => {
                const nextId = e.target.value || null;
                setSelectedPageId(nextId);
                setSelectedBlockId(null);
              }}
              className="min-w-[220px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              disabled={busy || !pages || pages.length === 0}
            >
              {(pages || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => {
                if (!selectedPage) return;
                const title = (prompt("Page title", selectedPage.title) || "").trim();
                if (title) void savePage({ title });
              }}
              className={classNames(
                "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                busy ? "opacity-60" : "",
              )}
            >
              Rename page
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => {
                if (!selectedPage) return;
                const slug = normalizeSlug(prompt("Page slug", selectedPage.slug) || "");
                if (slug) void savePage({ slug });
              }}
              className={classNames(
                "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                busy ? "opacity-60" : "",
              )}
            >
              Slug
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void createPage()}
              className={classNames(
                "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
              )}
            >
              + Page
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => void setEditorMode("BLOCKS")}
              className={classNames(
                "rounded-xl border px-3 py-2 text-sm font-semibold",
                selectedPage?.editorMode === "BLOCKS"
                  ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-blue-800"
                  : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
              )}
            >
              Blocks
            </button>
            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => void setEditorMode("CUSTOM_HTML")}
              className={classNames(
                "rounded-xl border px-3 py-2 text-sm font-semibold",
                selectedPage?.editorMode === "CUSTOM_HTML"
                  ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-blue-800"
                  : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
              )}
            >
              Custom code
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => void saveCurrentPage()}
              className={classNames(
                "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
              )}
            >
              {busy ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => void deletePage()}
              className={classNames(
                "rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50",
                busy ? "opacity-60" : "",
              )}
            >
              Delete
            </button>

            <SignOutButton />
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-4">
          {!selectedPage ? (
            <div className="text-sm text-zinc-600">Select a page to edit.</div>
          ) : selectedPage.editorMode === "MARKDOWN" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Legacy mode</div>
              <div className="mt-2 font-semibold">This page is in Markdown mode.</div>
              <div className="mt-2 text-amber-800">
                Markdown editing is disabled in this editor. Pick a supported mode to continue.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEditorMode("BLOCKS")}
                  className={classNames(
                    "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                    busy ? "opacity-60" : "",
                  )}
                >
                  Switch to Blocks
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEditorMode("CUSTOM_HTML")}
                  className={classNames(
                    "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                    busy ? "opacity-60" : "",
                  )}
                >
                  Switch to Custom code
                </button>
              </div>
            </div>
          ) : selectedPage.editorMode === "BLOCKS" ? (
            <div>
              <div className="text-sm font-semibold text-zinc-900">Blocks</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    { type: "heading", label: "Heading" },
                    { type: "paragraph", label: "Text" },
                    { type: "button", label: "Button" },
                    { type: "formLink", label: "Form link" },
                    { type: "image", label: "Image" },
                    { type: "spacer", label: "Spacer" },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    disabled={busy}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-block-type", b.type);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addBlock(b.type)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    title="Drag into preview or click to add"
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Selected</div>
                {!selectedBlock ? (
                  <div className="mt-2 text-sm text-zinc-600">Click a block in the preview.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {selectedBlock.type}
                    </div>

                    {selectedBlock.type === "heading" ? (
                      <div className="space-y-2">
                        <input
                          value={selectedBlock.props.text}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Heading text"
                        />
                        <select
                          value={String(selectedBlock.props.level ?? 2)}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, level: Number(e.target.value) as any },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="1">H1</option>
                          <option value="2">H2</option>
                          <option value="3">H3</option>
                        </select>
                      </div>
                    ) : null}

                    {selectedBlock.type === "paragraph" ? (
                      <textarea
                        value={selectedBlock.props.text}
                        onChange={(e) =>
                          upsertBlock({
                            ...selectedBlock,
                            props: { ...selectedBlock.props, text: e.target.value },
                          })
                        }
                        className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Paragraph text"
                      />
                    ) : null}

                    {selectedBlock.type === "button" ? (
                      <div className="space-y-2">
                        <input
                          value={selectedBlock.props.text}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Button text"
                        />
                        <input
                          value={selectedBlock.props.href}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, href: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder={`${basePath}/forms/your-form-slug`}
                        />
                        <select
                          value={selectedBlock.props.variant ?? "primary"}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, variant: e.target.value as any },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                        </select>
                      </div>
                    ) : null}

                    {selectedBlock.type === "formLink" ? (
                      <div className="space-y-2">
                        <input
                          value={selectedBlock.props.formSlug}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, formSlug: normalizeSlug(e.target.value) },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="form-slug"
                        />
                        <input
                          value={selectedBlock.props.text ?? ""}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="CTA text"
                        />
                      </div>
                    ) : null}

                    {selectedBlock.type === "image" ? (
                      <div className="space-y-2">
                        <input
                          value={selectedBlock.props.src}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, src: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="https://..."
                        />
                        <input
                          value={selectedBlock.props.alt ?? ""}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, alt: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Alt text"
                        />
                      </div>
                    ) : null}

                    {selectedBlock.type === "spacer" ? (
                      <input
                        type="number"
                        value={String(selectedBlock.props.height ?? 24)}
                        onChange={(e) =>
                          upsertBlock({
                            ...selectedBlock,
                            props: { ...selectedBlock.props, height: Number(e.target.value) },
                          })
                        }
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    ) : null}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeBlock(selectedBlock.id)}
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remove block
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4 text-xs text-zinc-500">Tip: drag blocks in the preview to reorder.</div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-zinc-900">Custom code (AI)</div>
              <div className="mt-3 max-h-[40vh] space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                {selectedChat.length === 0 ? (
                  <div className="text-sm text-zinc-600">
                    Ask for a layout and CTAs. Then follow up with edits like “change the font”.
                  </div>
                ) : (
                  selectedChat.map((m, idx) => (
                    <div
                      key={idx}
                      className={classNames(
                        "rounded-xl px-3 py-2 text-sm",
                        m.role === "user" ? "bg-blue-50 text-zinc-900" : "bg-zinc-50 text-zinc-800",
                      )}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                      <div className="mt-1 whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  ))
                )}
              </div>

              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="mt-3 min-h-[110px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Describe what to build or change…"
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !chatInput.trim()}
                  onClick={() => void runAi()}
                  className={classNames(
                    "flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                    busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
                  )}
                >
                  {busy ? "Working…" : "Ask AI"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelectedPageLocal({ customChatJson: [] });
                    void savePage({ customChatJson: [] });
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>

              <div className="mt-4 border-t border-zinc-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                <textarea
                  value={selectedPage.customHtml || ""}
                  onChange={(e) => setSelectedPageLocal({ customHtml: e.target.value })}
                  className="mt-2 min-h-[240px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                  placeholder="<!doctype html>…"
                />
                <div className="mt-2 text-xs text-zinc-500">Use Save in the top bar to persist changes.</div>
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-hidden bg-zinc-100 p-4">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-900">{selectedPage?.title || "Preview"}</div>
                {selectedPage ? <div className="truncate text-xs text-zinc-500">/{selectedPage.slug}</div> : null}
              </div>
              {funnel?.slug ? (
                <a
                  href={`${basePath}/f/${encodeURIComponent(funnel.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Open hosted
                </a>
              ) : null}
            </div>

            <div
              className="flex-1 overflow-auto p-8"
              onDragOver={(e) => {
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                e.preventDefault();
                const t = e.dataTransfer.getData("text/x-block-type");
                if (t) addBlock(t as any);
              }}
            >
              {!selectedPage ? (
                <div className="text-sm text-zinc-600">Select a page to preview.</div>
              ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                <div className="h-[78vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <iframe
                    title={selectedPage.title}
                    sandbox="allow-forms allow-popups allow-scripts"
                    srcDoc={selectedPage.customHtml || ""}
                    className="h-full w-full bg-white"
                  />
                </div>
              ) : (
                <div className="mx-auto w-full max-w-4xl rounded-3xl border border-zinc-200 bg-white p-8">
                  {selectedBlocks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                      Drag a block from the left, or click a block to add.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedBlocks.map((b) => (
                        <div
                          key={b.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/x-block-id", b.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const dragId = e.dataTransfer.getData("text/x-block-id");
                            if (dragId) reorderBlocks(dragId, b.id);
                          }}
                          onClick={() => setSelectedBlockId(b.id)}
                          className={classNames(
                            "cursor-pointer rounded-2xl border p-4",
                            selectedBlockId === b.id
                              ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                              : "border-zinc-200 bg-white hover:bg-zinc-50",
                          )}
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{b.type}</div>
                          <div className="mt-3">{renderCreditFunnelBlocks({ blocks: [b], basePath })}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
