"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  coerceBlocksJson,
  renderCreditFunnelBlocks,
  type BlockStyle,
  type CreditFunnelBlock,
} from "@/lib/creditFunnelBlocks";
import { AppConfirmModal, AppModal } from "@/components/AppModal";
import {
  PortalMediaPickerModal,
  type PortalMediaPickItem,
} from "@/components/PortalMediaPickerModal";
import { SignOutButton } from "@/components/SignOutButton";
import { useToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

type Funnel = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
};

type CreditForm = {
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

type AiAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
  previewUrl?: string;
};

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

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function normalizeHexInput(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (v.startsWith("#")) return v;
  return "#" + v;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (!isHexColor(h)) return null;
  const raw = h.slice(1);
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function parseCssColor(value: string | undefined | null): { hex: string; alpha: number } {
  const v = String(value || "").trim();
  if (!v) return { hex: "#000000", alpha: 1 };
  if (isHexColor(v)) return { hex: v, alpha: 1 };

  const rgba = v.match(/^rgba\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1|1\.0)\)\s*$/i);
  if (rgba) {
    const r = clamp(Number(rgba[1]), 0, 255);
    const g = clamp(Number(rgba[2]), 0, 255);
    const b = clamp(Number(rgba[3]), 0, 255);
    const a = clamp(Number(rgba[4]), 0, 1);
    return { hex: rgbToHex(r, g, b), alpha: a };
  }

  const rgb = v.match(/^rgb\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\)\s*$/i);
  if (rgb) {
    const r = clamp(Number(rgb[1]), 0, 255);
    const g = clamp(Number(rgb[2]), 0, 255);
    const b = clamp(Number(rgb[3]), 0, 255);
    return { hex: rgbToHex(r, g, b), alpha: 1 };
  }

  return { hex: "#000000", alpha: 1 };
}

function formatColorWithAlpha(hex: string, alpha: number): string {
  const a = clamp(alpha, 0, 1);
  if (a >= 0.999) return hex;
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const rounded = Math.round(a * 1000) / 1000;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rounded})`;
}

function ColorPickerField({
  label,
  value,
  onChange,
  swatches,
  allowAlpha,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  swatches: string[];
  allowAlpha?: boolean;
}) {
  const parsed = parseCssColor(value);
  const currentHex = parsed.hex;
  const currentAlpha = parsed.alpha;

  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={currentHex}
          onChange={(e) => {
            const hex = e.target.value;
            const next = allowAlpha ? formatColorWithAlpha(hex, currentAlpha) : hex;
            onChange(next);
          }}
          className="h-9 w-12 shrink-0 rounded-lg border border-zinc-200 bg-white"
        />
        <input
          value={String(value || "")}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange(undefined);
              return;
            }
            const normalized = isHexColor(normalizeHexInput(raw)) ? normalizeHexInput(raw) : raw;
            if (allowAlpha) {
              const p = parseCssColor(normalized);
              onChange(formatColorWithAlpha(p.hex, p.alpha));
              return;
            }
            onChange(normalized);
          }}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="#0f172a or rgba(0,0,0,0.6)"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Clear
        </button>
      </div>

      {allowAlpha ? (
        <div className="mt-2 flex items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Opacity</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(currentAlpha * 100)}
            onChange={(e) => {
              const pct = clamp(Number(e.target.value) || 0, 0, 100);
              const next = formatColorWithAlpha(currentHex, pct / 100);
              onChange(next);
            }}
            className="flex-1"
          />
          <div className="w-12 text-right text-xs font-semibold text-zinc-700">{Math.round(currentAlpha * 100)}%</div>
        </div>
      ) : null}

      {swatches.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                const next = allowAlpha ? formatColorWithAlpha(c, currentAlpha) : c;
                onChange(next);
              }}
              className="h-8 w-8 rounded-full border border-zinc-200"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      ) : null}
    </label>
  );
}

function compactStyle(style: BlockStyle | undefined): BlockStyle | undefined {
  if (!style) return undefined;
  const next: any = { ...style };
  for (const k of Object.keys(next)) {
    if (next[k] === undefined || next[k] === null || next[k] === "") delete next[k];
  }
  return Object.keys(next).length ? (next as BlockStyle) : undefined;
}

function applyStylePatch(prev: BlockStyle | undefined, patch: Partial<BlockStyle>) {
  return compactStyle({ ...(prev || {}), ...patch });
}

type FunnelEditorDialog =
  | { type: "rename-funnel"; value: string }
  | { type: "rename-page"; value: string }
  | { type: "slug-page"; value: string }
  | { type: "create-page"; slug: string; title: string }
  | { type: "create-form"; slug: string; name: string }
  | { type: "delete-page" }
  | null;

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
    const slug = normalizeSlug(PROMPT_DISABLED("Page slug (e.g. landing)") || "");
    if (!slug) return;
    const title = (PROMPT_DISABLED("Page title (optional)") || "").trim();
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
                        const name = (PROMPT_DISABLED("Funnel name", funnel?.name || "") || "").trim();
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
                        const title = (PROMPT_DISABLED("Page title", selectedPage.title) || "").trim();
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
                        const slug = normalizeSlug(PROMPT_DISABLED("Page slug", selectedPage.slug) || "");
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
                      <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setPreviewMode("edit")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewMode === "edit" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewMode("preview")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewMode === "preview" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Preview
                          </button>
                        </div>

                        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setPreviewDevice("desktop")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewDevice === "desktop" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Desktop
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewDevice("mobile")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewDevice === "mobile" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Mobile
                          </button>
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
                    </div>

                    <div
                      className="flex-1 overflow-auto p-8"
                      onDragOver={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                        e.preventDefault();
                        const t = e.dataTransfer.getData("text/x-block-type");
                        if (t) addBlock(t as any);
                      }}
                    >
                      {!selectedPage ? (
                        <div className="text-sm text-zinc-600">Select a page to preview.</div>
                      ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                        <div
                          className={classNames(
                            "mx-auto w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white",
                            previewDevice === "mobile" ? "max-w-[420px]" : "max-w-5xl",
                          )}
                        >
                          <iframe
                            title={selectedPage.title}
                            sandbox="allow-forms allow-popups allow-scripts"
                            srcDoc={selectedPage.customHtml || ""}
                            className="h-[78vh] w-full bg-white"
                          />
                        </div>
                      ) : (
                        <div
                          className={classNames(
                            "mx-auto w-full overflow-hidden rounded-3xl border border-zinc-200",
                            previewDevice === "mobile" ? "max-w-[420px]" : "max-w-5xl",
                          )}
                        >
                          {previewMode === "preview" ? (
                            <div className="min-h-[70vh]">{renderCreditFunnelBlocks({ blocks: selectedBlocks, basePath })}</div>
                          ) : (
                            <div className="bg-white p-8">
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
  const router = useRouter();
  const toast = useToast();

  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [forms, setForms] = useState<CreditForm[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadingImageBlockId, setUploadingImageBlockId] = useState<string | null>(null);
  const [uploadingAi, setUploadingAi] = useState(false);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");

  const [dialog, setDialog] = useState<FunnelEditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const portalVariant: PortalVariant = basePath === "/credit" ? "credit" : "portal";

  const [brandSwatches, setBrandSwatches] = useState<string[]>([]);

  const colorSwatches = useMemo(() => {
    const defaults = [
      "#ffffff",
      "#000000",
      "#0f172a",
      "#111827",
      "#1d4ed8",
      "#2563eb",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#a855f7",
    ];
    const all = [...brandSwatches, ...defaults].filter((c) => isHexColor(c));
    return Array.from(new Set(all));
  }, [brandSwatches]);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<
    null | { type: "ai" } | { type: "image-block"; blockId: string }
  >(null);
  const [aiAttachments, setAiAttachments] = useState<AiAttachment[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/portal/business-profile", {
          cache: "no-store",
          headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
        });
        const json = (await res.json().catch(() => null)) as any;
        const p = json?.profile;
        const values = [p?.brandPrimaryHex, p?.brandAccentHex, p?.brandTextHex]
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter((x) => isHexColor(x));
        if (!cancelled) setBrandSwatches(values);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [portalVariant]);

  const addAiAttachment = (it: PortalMediaPickItem) => {
    const url = String(it.shareUrl || "").trim();
    if (!url) return;
    setAiAttachments((prev) => {
      if (prev.some((a) => a.id === it.id)) return prev;
      return [
        ...prev,
        {
          id: it.id,
          fileName: it.fileName,
          mimeType: it.mimeType,
          url,
          previewUrl: it.previewUrl,
        },
      ];
    });
  };

  const uploadToMediaLibrary = async (files: FileList | File[], opts?: { maxFiles?: number }) => {
    const maxFiles = Math.max(1, Math.min(20, Math.floor(opts?.maxFiles ?? 20)));
    const list = Array.from(files || []).filter(Boolean).slice(0, maxFiles);
    if (!list.length) return [] as PortalMediaPickItem[];

    const form = new FormData();
    for (const f of list) form.append("files", f);

    const res = await fetch("/api/portal/media/items", {
      method: "POST",
      headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
      body: form,
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) {
      throw new Error(typeof json?.error === "string" ? json.error : "Failed to upload media");
    }
    return Array.isArray(json.items) ? (json.items as PortalMediaPickItem[]) : [];
  };

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const openCreateForm = () => {
    setDialog({ type: "create-form", slug: "", name: "" });
    setDialogError(null);
  };

  const performCreateForm = async (args: { slug: string; name: string }) => {
    const slug = normalizeSlug(args.slug);
    const name = args.name.trim();
    if (!slug) {
      setDialogError("Slug is required.");
      return;
    }

    setBusy(true);
    setDialogError(null);
    setError(null);

    try {
      const res = await fetch("/api/portal/funnel-builder/forms", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [PORTAL_VARIANT_HEADER]: portalVariant,
        },
        body: JSON.stringify({ slug, name: name || undefined }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create form");

      const created = json.form as CreditForm | undefined;
      await load();
      closeDialog();

      toast.success("Form created");
      if (created?.id) {
        router.push(`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(created.id)}/edit`);
      }
    } catch (e) {
      const msg = (e as any)?.message ? String((e as any).message) : "Failed to create form";
      setDialogError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const formsBySlug = useMemo(() => {
    const m = new Map<string, CreditForm>();
    (forms || []).forEach((f) => m.set(f.slug, f));
    return m;
  }, [forms]);

  const selectedPage = useMemo(
    () => (pages || []).find((p) => p.id === selectedPageId) || null,
    [pages, selectedPageId],
  );

  const selectedBlocks = useMemo(() => {
    if (!selectedPage) return [];
    return coerceBlocksJson(selectedPage.blocksJson);
  }, [selectedPage]);

  const pageSettingsBlock = useMemo(() => {
    const first = selectedBlocks[0];
    return first && first.type === "page" ? first : null;
  }, [selectedBlocks]);

  const editableBlocks = useMemo(() => {
    return selectedBlocks.filter((b) => b.type !== "page");
  }, [selectedBlocks]);

  const saveableBlocks = useMemo(() => {
    return pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks;
  }, [pageSettingsBlock, editableBlocks]);

  const selectedChat = useMemo(() => {
    if (!selectedPage) return [];
    return Array.isArray(selectedPage.customChatJson)
      ? (selectedPage.customChatJson as ChatMessage[])
      : [];
  }, [selectedPage]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return editableBlocks.find((b) => b.id === selectedBlockId) || null;
  }, [editableBlocks, selectedBlockId]);

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
    const [fRes, pRes, formsRes] = await Promise.all([
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        cache: "no-store",
      }),
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        cache: "no-store",
      }),
      fetch("/api/portal/funnel-builder/forms", {
        cache: "no-store",
        headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
      }).catch(() => null as any),
    ]);
    const fJson = (await fRes.json().catch(() => null)) as any;
    const pJson = (await pRes.json().catch(() => null)) as any;
    const formsJson = formsRes ? ((await formsRes.json().catch(() => null)) as any) : null;
    if (!fRes.ok || !fJson || fJson.ok !== true)
      throw new Error(fJson?.error || "Failed to load funnel");
    if (!pRes.ok || !pJson || pJson.ok !== true)
      throw new Error(pJson?.error || "Failed to load pages");

    setFunnel(fJson.funnel as Funnel);
    const nextPages = Array.isArray(pJson.pages) ? (pJson.pages as Page[]) : [];
    setPages(nextPages);
    setSelectedPageId((prev) => prev || nextPages[0]?.id || null);

    if (formsRes && formsRes.ok && formsJson?.ok === true) {
      setForms(Array.isArray(formsJson.forms) ? (formsJson.forms as CreditForm[]) : []);
    }
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

  const createPage = () => {
    setDialogError(null);
    setDialog({ type: "create-page", slug: "", title: "" });
  };

  const performCreatePage = async ({ slug, title }: { slug: string; title: string }) => {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
      setDialogError("Slug is required.");
      return;
    }

    const trimmedTitle = title.trim();
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: normalizedSlug, title: trimmedTitle || undefined, contentMarkdown: "" }),
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
      closeDialog();
    } catch (e) {
      const message = (e as any)?.message ? String((e as any).message) : "Failed to create page";
      setError(message);
      setDialogError(message);
    } finally {
      setBusy(false);
    }
  };

  const deletePage = () => {
    if (!selectedPage) return;
    setDialogError(null);
    setDialog({ type: "delete-page" });
  };

  const performDeletePage = async () => {
    if (!selectedPage) return;
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
      await savePage({ editorMode: "BLOCKS", blocksJson: saveableBlocks });
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
    const nextEditable = editableBlocks.map((b) => (b.id === block.id ? block : b));
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable });
  };

  const ensurePageSettings = () => {
    if (pageSettingsBlock) return pageSettingsBlock;
    const id = newId();
    const next = { id, type: "page", props: { style: {} } } as any as CreditFunnelBlock;
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: [next, ...editableBlocks] });
    return next as any;
  };

  const updatePageStyle = (patch: Partial<BlockStyle>) => {
    const pg = ensurePageSettings() as any;
    const prev = (pg.props || {}).style as BlockStyle | undefined;
    const nextStyle = applyStylePatch(prev, patch);
    const nextPage = { ...pg, props: { ...pg.props, style: nextStyle } };
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: [nextPage, ...editableBlocks] });
  };

  const updateSelectedBlockStyle = (patch: Partial<BlockStyle>) => {
    if (!selectedBlock) return;
    upsertBlock({
      ...selectedBlock,
      props: {
        ...(selectedBlock as any).props,
        style: applyStylePatch(((selectedBlock as any).props as any)?.style, patch),
      } as any,
    } as any);
  };

  const updateSelectedColumnsSideStyle = (side: "leftStyle" | "rightStyle", patch: Partial<BlockStyle>) => {
    if (!selectedBlock || selectedBlock.type !== "columns") return;
    upsertBlock({
      ...selectedBlock,
      props: {
        ...selectedBlock.props,
        [side]: applyStylePatch((selectedBlock.props as any)[side], patch),
      } as any,
    });
  };

  const updateSelectedSectionSideStyle = (side: "leftStyle" | "rightStyle", patch: Partial<BlockStyle>) => {
    if (!selectedBlock || selectedBlock.type !== "section") return;
    upsertBlock({
      ...selectedBlock,
      props: {
        ...selectedBlock.props,
        [side]: applyStylePatch((selectedBlock.props as any)[side], patch),
      } as any,
    });
  };

  const addBlock = (type: CreditFunnelBlock["type"]) => {
    if (!selectedPage) return;
    const id = newId();
    const base: CreditFunnelBlock =
      type === "page"
        ? ({ id, type, props: { style: {} } } as any)
        :
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
                : type === "formEmbed"
                  ? { id, type, props: { formSlug: "", height: 760 } }
                  : type === "columns"
                    ? {
                        id,
                        type,
                        props: {
                          leftMarkdown: "## Left\n\nAdd your content…",
                          rightMarkdown: "## Right\n\nAdd your content…",
                          gapPx: 24,
                          stackOnMobile: true,
                        },
                      }
                    : type === "section"
                      ? {
                          id,
                          type,
                          props: {
                            layout: "one",
                            markdown: "## Section\n\nAdd your content…",
                            gapPx: 24,
                            stackOnMobile: true,
                          },
                        }
                    : { id, type: "spacer", props: { height: 24 } };

    const nextEditable = [...editableBlocks, base].filter((b) => b.type !== "page");
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable });
    setSelectedBlockId(id);
  };

  const addPresetSection = (preset: "hero" | "body" | "form") => {
    if (!selectedPage) return;

    const blocks: CreditFunnelBlock[] = [];
    const firstFormSlug = (forms || []).find((f) => typeof f?.slug === "string" && f.slug.trim())?.slug || "";

    if (preset === "hero") {
      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          markdown: "# Hero headline\n\nAdd your subheadline here.\n\n[Get started](#)",
          style: {
            backgroundColor: "#0f172a",
            textColor: "#ffffff",
            paddingPx: 48,
            borderRadiusPx: 24,
            align: "center",
            marginBottomPx: 24,
          },
        },
      });
      blocks.push({
        id: newId(),
        type: "button",
        props: {
          text: "Get started",
          href: firstFormSlug ? `${basePath}/forms/${encodeURIComponent(firstFormSlug)}` : `${basePath}/forms/your-form-slug`,
          variant: "primary",
          style: { marginBottomPx: 24 },
        },
      });
    }

    if (preset === "body") {
      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          markdown: "## Body section\n\nWrite your main content here…",
          style: { paddingPx: 32, marginBottomPx: 24 },
        },
      });
    }

    if (preset === "form") {
      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          markdown: "## Form section\n\nEmbed a form below.",
          style: { paddingPx: 32, backgroundColor: "#f8fafc", borderRadiusPx: 24, marginBottomPx: 16 },
        },
      });
      blocks.push({
        id: newId(),
        type: "formEmbed",
        props: {
          formSlug: firstFormSlug,
          height: 760,
          style: { paddingPx: 16, backgroundColor: "#f8fafc", borderRadiusPx: 24 },
        },
      });
    }

    if (!blocks.length) return;
    const nextEditable = [...editableBlocks, ...blocks].filter((b) => b.type !== "page");
    setSelectedPageLocal({
      editorMode: "BLOCKS",
      blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
    });
    setSelectedBlockId(blocks[0].id);
  };

  const removeBlock = (blockId: string) => {
    if (!selectedPage) return;
    const nextEditable = editableBlocks.filter((b) => b.id !== blockId);
    setSelectedPageLocal({ blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  };

  const reorderBlocks = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const fromIdx = editableBlocks.findIndex((b) => b.id === dragId);
    const toIdx = editableBlocks.findIndex((b) => b.id === dropId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...editableBlocks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setSelectedPageLocal({ blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...next] : next });
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
            attachments: aiAttachments.map((a) => ({
              url: a.url,
              fileName: a.fileName,
              mimeType: a.mimeType,
            })),
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate HTML");

      setChatInput("");
      setAiAttachments([]);
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
      <PortalMediaPickerModal
        open={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setMediaPickerTarget(null);
        }}
        variant={portalVariant}
        onPick={async (it) => {
          const target = mediaPickerTarget;
          setMediaPickerOpen(false);
          setMediaPickerTarget(null);
          if (!target) return;
          if (target.type === "ai") {
            addAiAttachment(it);
            return;
          }
          if (target.type === "image-block") {
            const block = editableBlocks.find((b) => b.id === target.blockId);
            if (!block || block.type !== "image") return;
            const nextSrc = String(it.shareUrl || it.previewUrl || "").trim();
            if (!nextSrc) return;
            upsertBlock({
              ...block,
              props: {
                ...block.props,
                src: nextSrc,
                alt: (block.props.alt || "").trim() ? block.props.alt : it.fileName,
              },
            });
          }
        }}
      />

      <AppModal
        open={dialog?.type === "create-page"}
        title="Create page"
        description="Add a new page to this funnel."
        onClose={closeDialog}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "create-page") return;
                void performCreatePage({ slug: dialog.slug, title: dialog.title });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
            <input
              autoFocus
              value={dialog?.type === "create-page" ? dialog.slug : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-page" ? { ...prev, slug: v } : prev));
              }}
              placeholder="landing"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-zinc-500">Allowed: letters, numbers, and dashes.</div>
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Title (optional)</div>
            <input
              value={dialog?.type === "create-page" ? dialog.title : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-page" ? { ...prev, title: v } : prev));
              }}
              placeholder="Landing page"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
          </label>

          {dialogError ? <div className="text-sm font-semibold text-red-700">{dialogError}</div> : null}
        </div>
      </AppModal>

      <AppModal
        open={dialog?.type === "create-form"}
        title="Create form"
        description="Create a hosted form you can link/embed in this funnel."
        onClose={closeDialog}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "create-form") return;
                void performCreateForm({ slug: dialog.slug, name: dialog.name });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
            <input
              autoFocus
              value={dialog?.type === "create-form" ? dialog.slug : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-form" ? { ...prev, slug: v } : prev));
              }}
              placeholder="new-client-intake"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-zinc-500">Allowed: letters, numbers, and dashes.</div>
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name (optional)</div>
            <input
              value={dialog?.type === "create-form" ? dialog.name : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-form" ? { ...prev, name: v } : prev));
              }}
              placeholder="New client intake"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
          </label>

          {dialogError ? <div className="text-sm font-semibold text-red-700">{dialogError}</div> : null}
        </div>
      </AppModal>

      <AppConfirmModal
        open={dialog?.type === "delete-page"}
        title="Delete page"
        message={selectedPage ? `Delete page “${selectedPage.title}”? This cannot be undone.` : "Delete this page?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={closeDialog}
        onConfirm={() => {
          closeDialog();
          void performDeletePage();
        }}
      />

      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
        <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`${basePath}/app/services/funnel-builder`}
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

            <div className="text-xs text-zinc-500">Manage funnel name/slug from the Funnels list.</div>
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
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Page</div>
                <div className="mt-3 space-y-3">
                  <ColorPickerField
                    label="Page background"
                    value={(pageSettingsBlock as any)?.props?.style?.backgroundColor}
                    onChange={(v) => updatePageStyle({ backgroundColor: v })}
                    swatches={colorSwatches}
                    allowAlpha
                  />
                  <ColorPickerField
                    label="Page text color"
                    value={(pageSettingsBlock as any)?.props?.style?.textColor}
                    onChange={(v) => updatePageStyle({ textColor: v })}
                    swatches={colorSwatches}
                    allowAlpha
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Page padding</div>
                      <input
                        type="number"
                        value={(pageSettingsBlock as any)?.props?.style?.paddingPx ?? ""}
                        onChange={(e) =>
                          updatePageStyle({
                            paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                          })
                        }
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="e.g. 32"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Max width</div>
                      <input
                        type="number"
                        value={(pageSettingsBlock as any)?.props?.style?.maxWidthPx ?? ""}
                        onChange={(e) =>
                          updatePageStyle({
                            maxWidthPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                          })
                        }
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="e.g. 1100"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Page align</div>
                    <select
                      value={(pageSettingsBlock as any)?.props?.style?.align || ""}
                      onChange={(e) => updatePageStyle({ align: (e.target.value as any) || undefined })}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Default</option>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="text-sm font-semibold text-zinc-900">Blocks</div>
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Section presets</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addPresetSection("hero")}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Hero
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addPresetSection("body")}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addPresetSection("form")}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Form
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">Quick-start templates that add a few blocks.</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    { type: "heading", label: "Heading" },
                    { type: "paragraph", label: "Text" },
                    { type: "button", label: "Button" },
                    { type: "section", label: "Section" },
                    { type: "formLink", label: "Form link" },
                    { type: "formEmbed", label: "Form embed" },
                    { type: "columns", label: "Columns" },
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
                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Form</div>
                          <select
                            value={selectedBlock.props.formSlug || ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, formSlug: e.target.value || "" },
                              })
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Select a form…</option>
                            {(forms || []).map((f) => (
                              <option key={f.id} value={f.slug}>
                                {f.name} ({f.slug})
                              </option>
                            ))}
                          </select>
                          <div className="mt-1 text-[11px] text-zinc-500">Links to the hosted credit form.</div>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={openCreateForm}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            + New form
                          </button>
                          <button
                            type="button"
                            disabled={busy || !selectedBlock.props.formSlug || !formsBySlug.get(selectedBlock.props.formSlug)}
                            onClick={() => {
                              const f = formsBySlug.get(selectedBlock.props.formSlug);
                              if (!f) return;
                              window.open(
                                `${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Edit form
                          </button>
                        </div>

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
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setMediaPickerTarget({ type: "image-block", blockId: selectedBlock.id });
                              setMediaPickerOpen(true);
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Choose from media
                          </button>
                          <label className={classNames(
                            "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                            uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                          )}>
                            {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload image"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={busy || uploadingImageBlockId === selectedBlock.id}
                              onChange={(e) => {
                                const files = e.target.files;
                                e.currentTarget.value = "";
                                if (!files || files.length === 0) return;
                                if (!selectedBlock || selectedBlock.type !== "image") return;
                                setUploadingImageBlockId(selectedBlock.id);
                                setError(null);
                                void (async () => {
                                  try {
                                    const created = await uploadToMediaLibrary(files, { maxFiles: 1 });
                                    const it = created[0];
                                    if (!it) return;
                                    const nextSrc = String((it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "").trim();
                                    if (!nextSrc) return;
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        src: nextSrc,
                                        alt: (selectedBlock.props.alt || "").trim() ? selectedBlock.props.alt : it.fileName,
                                      },
                                    });
                                    toast.success("Image uploaded and selected");
                                  } catch (err) {
                                    const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                    setError(msg);
                                    toast.error(msg);
                                  } finally {
                                    setUploadingImageBlockId(null);
                                  }
                                })();
                              }}
                            />
                          </label>
                        </div>

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

                    {selectedBlock.type === "formEmbed" ? (
                      <div className="space-y-2">
                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Form</div>
                          <select
                            value={selectedBlock.props.formSlug || ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, formSlug: e.target.value || "" },
                              })
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Select a form…</option>
                            {(forms || []).map((f) => (
                              <option key={f.id} value={f.slug}>
                                {f.name} ({f.slug})
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={openCreateForm}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            + New form
                          </button>
                          <button
                            type="button"
                            disabled={busy || !selectedBlock.props.formSlug || !formsBySlug.get(selectedBlock.props.formSlug)}
                            onClick={() => {
                              const f = formsBySlug.get(selectedBlock.props.formSlug);
                              if (!f) return;
                              window.open(
                                `${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Edit form
                          </button>
                        </div>

                        <input
                          type="number"
                          value={String(selectedBlock.props.height ?? 760)}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, height: Number(e.target.value) || 760 },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Height (px)"
                        />
                        <div className="text-xs text-zinc-500">Embeds as an iframe on the hosted page.</div>
                      </div>
                    ) : null}

                    {selectedBlock.type === "columns" ? (
                      <div className="space-y-2">
                        <textarea
                          value={selectedBlock.props.leftMarkdown}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, leftMarkdown: e.target.value },
                            })
                          }
                          className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Left column (markdown)"
                        />
                        <textarea
                          value={selectedBlock.props.rightMarkdown}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, rightMarkdown: e.target.value },
                            })
                          }
                          className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Right column (markdown)"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Gap (px)</div>
                            <input
                              type="number"
                              value={String(selectedBlock.props.gapPx ?? 24)}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, gapPx: Number(e.target.value) || 0 },
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedBlock.props.stackOnMobile !== false}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, stackOnMobile: e.target.checked },
                                })
                              }
                            />
                            Stack on mobile
                          </label>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Left column style</div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Text</div>
                              <input
                                value={selectedBlock.props.leftStyle?.textColor || ""}
                                onChange={(e) => updateSelectedColumnsSideStyle("leftStyle", { textColor: normalizeHexInput(e.target.value) || undefined })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="#0f172a"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Background</div>
                              <input
                                value={selectedBlock.props.leftStyle?.backgroundColor || ""}
                                onChange={(e) => updateSelectedColumnsSideStyle("leftStyle", { backgroundColor: normalizeHexInput(e.target.value) || undefined })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="#ffffff"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Padding</div>
                              <input
                                type="number"
                                value={selectedBlock.props.leftStyle?.paddingPx ?? ""}
                                onChange={(e) =>
                                  updateSelectedColumnsSideStyle("leftStyle", {
                                    paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                  })
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Radius</div>
                              <input
                                type="number"
                                value={selectedBlock.props.leftStyle?.borderRadiusPx ?? ""}
                                onChange={(e) =>
                                  updateSelectedColumnsSideStyle("leftStyle", {
                                    borderRadiusPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                  })
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Right column style</div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Text</div>
                              <input
                                value={selectedBlock.props.rightStyle?.textColor || ""}
                                onChange={(e) => updateSelectedColumnsSideStyle("rightStyle", { textColor: normalizeHexInput(e.target.value) || undefined })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="#0f172a"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Background</div>
                              <input
                                value={selectedBlock.props.rightStyle?.backgroundColor || ""}
                                onChange={(e) => updateSelectedColumnsSideStyle("rightStyle", { backgroundColor: normalizeHexInput(e.target.value) || undefined })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="#ffffff"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Padding</div>
                              <input
                                type="number"
                                value={selectedBlock.props.rightStyle?.paddingPx ?? ""}
                                onChange={(e) =>
                                  updateSelectedColumnsSideStyle("rightStyle", {
                                    paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                  })
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Radius</div>
                              <input
                                type="number"
                                value={selectedBlock.props.rightStyle?.borderRadiusPx ?? ""}
                                onChange={(e) =>
                                  updateSelectedColumnsSideStyle("rightStyle", {
                                    borderRadiusPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                  })
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {selectedBlock.type === "section" ? (
                      <div className="space-y-2">
                        <select
                          value={selectedBlock.props.layout === "two" ? "two" : "one"}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: {
                                ...selectedBlock.props,
                                layout: e.target.value === "two" ? "two" : "one",
                              },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="one">One column</option>
                          <option value="two">Two columns</option>
                        </select>

                        {selectedBlock.props.layout === "two" ? (
                          <>
                            <textarea
                              value={selectedBlock.props.leftMarkdown || ""}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, leftMarkdown: e.target.value },
                                })
                              }
                              className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Left column (markdown)"
                            />
                            <textarea
                              value={selectedBlock.props.rightMarkdown || ""}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, rightMarkdown: e.target.value },
                                })
                              }
                              className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Right column (markdown)"
                            />

                            <div className="grid grid-cols-2 gap-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Gap (px)</div>
                                <input
                                  type="number"
                                  value={String(selectedBlock.props.gapPx ?? 24)}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, gapPx: Number(e.target.value) || 0 },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedBlock.props.stackOnMobile !== false}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, stackOnMobile: e.target.checked },
                                    })
                                  }
                                />
                                Stack on mobile
                              </label>
                            </div>

                            <div className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Left column style</div>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Text</div>
                                  <input
                                    value={selectedBlock.props.leftStyle?.textColor || ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("leftStyle", {
                                        textColor: e.target.value.trim() ? e.target.value.trim() : undefined,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="#0f172a"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Background</div>
                                  <input
                                    value={selectedBlock.props.leftStyle?.backgroundColor || ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("leftStyle", {
                                        backgroundColor: e.target.value.trim() ? e.target.value.trim() : undefined,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="#ffffff"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Padding</div>
                                  <input
                                    type="number"
                                    value={selectedBlock.props.leftStyle?.paddingPx ?? ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("leftStyle", {
                                        paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Radius</div>
                                  <input
                                    type="number"
                                    value={selectedBlock.props.leftStyle?.borderRadiusPx ?? ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("leftStyle", {
                                        borderRadiusPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                              </div>
                            </div>

                            <div className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Right column style</div>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Text</div>
                                  <input
                                    value={selectedBlock.props.rightStyle?.textColor || ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("rightStyle", {
                                        textColor: e.target.value.trim() ? e.target.value.trim() : undefined,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="#0f172a"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Background</div>
                                  <input
                                    value={selectedBlock.props.rightStyle?.backgroundColor || ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("rightStyle", {
                                        backgroundColor: e.target.value.trim() ? e.target.value.trim() : undefined,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="#ffffff"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Padding</div>
                                  <input
                                    type="number"
                                    value={selectedBlock.props.rightStyle?.paddingPx ?? ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("rightStyle", {
                                        paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Radius</div>
                                  <input
                                    type="number"
                                    value={selectedBlock.props.rightStyle?.borderRadiusPx ?? ""}
                                    onChange={(e) =>
                                      updateSelectedSectionSideStyle("rightStyle", {
                                        borderRadiusPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                              </div>
                            </div>
                          </>
                        ) : (
                          <textarea
                            value={selectedBlock.props.markdown || ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, markdown: e.target.value },
                              })
                            }
                            className="min-h-[140px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="Section content (markdown)"
                          />
                        )}
                      </div>
                    ) : null}

                    <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Style</div>

                      <div className="mt-2 space-y-2">
                        {(
                          selectedBlock.type === "heading" ||
                          selectedBlock.type === "paragraph" ||
                          selectedBlock.type === "button" ||
                          selectedBlock.type === "formLink" ||
                          selectedBlock.type === "columns" ||
                          selectedBlock.type === "section"
                        ) ? (
                          <ColorPickerField
                            label="Text color"
                            value={selectedBlock.props.style?.textColor}
                            onChange={(v) => updateSelectedBlockStyle({ textColor: v })}
                            swatches={colorSwatches}
                            allowAlpha
                          />
                        ) : null}

                        <ColorPickerField
                          label="Background"
                          value={selectedBlock.props.style?.backgroundColor}
                          onChange={(v) => updateSelectedBlockStyle({ backgroundColor: v })}
                          swatches={colorSwatches}
                          allowAlpha
                        />

                        {(selectedBlock.type === "heading" || selectedBlock.type === "paragraph") ? (
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Font size (px)</div>
                            <input
                              type="number"
                              value={selectedBlock.props.style?.fontSizePx ?? ""}
                              onChange={(e) =>
                                updateSelectedBlockStyle({
                                  fontSizePx: e.target.value === "" ? undefined : Number(e.target.value) || undefined,
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="16"
                            />
                          </label>
                        ) : null}

                        <label className="block">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Align</div>
                          <select
                            value={selectedBlock.props.style?.align || ""}
                            onChange={(e) => updateSelectedBlockStyle({ align: (e.target.value as any) || undefined })}
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Default</option>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Margin top</div>
                            <input
                              type="number"
                              value={selectedBlock.props.style?.marginTopPx ?? ""}
                              onChange={(e) =>
                                updateSelectedBlockStyle({
                                  marginTopPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Margin bottom</div>
                            <input
                              type="number"
                              value={selectedBlock.props.style?.marginBottomPx ?? ""}
                              onChange={(e) =>
                                updateSelectedBlockStyle({
                                  marginBottomPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Padding</div>
                            <input
                              type="number"
                              value={selectedBlock.props.style?.paddingPx ?? ""}
                              onChange={(e) =>
                                updateSelectedBlockStyle({
                                  paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Radius</div>
                            <input
                              type="number"
                              value={selectedBlock.props.style?.borderRadiusPx ?? ""}
                              onChange={(e) =>
                                updateSelectedBlockStyle({
                                  borderRadiusPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        </div>

                        {(selectedBlock.type === "image" || selectedBlock.type === "button") ? (
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Max width (px)</div>
                            <input
                              type="number"
                              value={selectedBlock.props.style?.maxWidthPx ?? ""}
                              onChange={(e) =>
                                updateSelectedBlockStyle({
                                  maxWidthPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="e.g. 640"
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>

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

              <div className="mt-3 space-y-2">
                {aiAttachments.length ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Attachments</div>
                    <div className="space-y-2">
                      {aiAttachments.map((a) => {
                        const isImg = a.mimeType.startsWith("image/");
                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {isImg && a.previewUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={a.previewUrl}
                                  alt={a.fileName}
                                  className="h-10 w-10 rounded-2xl object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                                  FILE
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{a.fileName}</div>
                                <div className="mt-1 truncate text-[11px] text-zinc-500">{a.mimeType}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setAiAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMediaPickerTarget({ type: "ai" });
                      setMediaPickerOpen(true);
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Attach from media
                  </button>

                  <label
                    className={classNames(
                      "cursor-pointer rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                      uploadingAi ? "opacity-60" : "",
                    )}
                  >
                    {uploadingAi ? "Uploading…" : "Upload files"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={busy || uploadingAi}
                      onChange={(e) => {
                        const files = e.target.files;
                        e.currentTarget.value = "";
                        if (!files || files.length === 0) return;
                        setUploadingAi(true);
                        setError(null);
                        void (async () => {
                          try {
                            const created = await uploadToMediaLibrary(files, { maxFiles: 10 });
                            for (const it of created) addAiAttachment(it);
                            toast.success(`Uploaded ${created.length} file${created.length === 1 ? "" : "s"}`);
                          } catch (err) {
                            const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                            setError(msg);
                            toast.error(msg);
                          } finally {
                            setUploadingAi(false);
                          }
                        })();
                      }}
                    />
                  </label>
                </div>

                <div className="text-xs text-zinc-500">
                  Images are sent to the AI for visual context. Other file types are included as links.
                </div>
              </div>

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
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("edit")}
                    className={classNames(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold",
                      previewMode === "edit" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    className={classNames(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold",
                      previewMode === "preview" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    Preview
                  </button>
                </div>

                <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice("desktop")}
                    className={classNames(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold",
                      previewDevice === "desktop" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice("mobile")}
                    className={classNames(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold",
                      previewDevice === "mobile" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
                    )}
                  >
                    Mobile
                  </button>
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
            </div>

            <div
              className="flex-1 overflow-auto p-8"
              onDragOver={(e) => {
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                e.preventDefault();
                const t = e.dataTransfer.getData("text/x-block-type");
                if (t) addBlock(t as any);
              }}
            >
              {!selectedPage ? (
                <div className="text-sm text-zinc-600">Select a page to preview.</div>
              ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                <div
                  className={classNames(
                    "mx-auto w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white",
                    previewDevice === "mobile" ? "max-w-[420px]" : "max-w-5xl",
                  )}
                >
                  <iframe
                    title={selectedPage.title}
                    sandbox="allow-forms allow-popups allow-scripts"
                    srcDoc={selectedPage.customHtml || ""}
                    className="h-[78vh] w-full bg-white"
                  />
                </div>
              ) : (
                <div
                  className={classNames(
                    "mx-auto w-full overflow-hidden rounded-3xl border border-zinc-200",
                    previewDevice === "mobile" ? "max-w-[420px]" : "max-w-5xl",
                  )}
                >
                  {previewMode === "preview" ? (
                    <div className="min-h-[70vh]">
                      {renderCreditFunnelBlocks({
                        blocks: pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks,
                        basePath,
                      })}
                    </div>
                  ) : (
                    <div className="bg-white p-8">
                      {editableBlocks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                          Drag a block from the left, or click a block to add.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {editableBlocks.map((b) => (
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
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
