"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
  createdAt: string;
  updatedAt: string;
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

export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

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

  // initial load (simple lazy approach)
  if (funnel === null || pages === null) {
    // eslint-disable-next-line no-void
    void load().catch((e) => setError(e?.message ? String(e.message) : "Failed to load"));
  }

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
      await load();
      setSelectedPageId(json.page?.id || null);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to create page");
    } finally {
      setBusy(false);
    }
  };

  const savePage = async (patch: Partial<Pick<Page, "title" | "slug" | "sortOrder" | "contentMarkdown">>) => {
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
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Funnel editor</div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">{funnel?.name || "…"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
            <div>
              Hosted: <span className="font-semibold">{basePath}/f/{funnel?.slug || "…"}</span>
            </div>
            <Link
              href={`${basePath}/f/${encodeURIComponent(funnel?.slug || "")}`}
              target="_blank"
              className="font-semibold text-[color:var(--color-brand-blue)] hover:underline"
            >
              Preview
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const name = (prompt("Funnel name", funnel?.name || "") || "").trim();
              if (name) saveFunnelMeta({ name });
            }}
            className={classNames(
              "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
              busy ? "opacity-60" : "",
            )}
          >
            Rename
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const slug = normalizeSlug(prompt("Funnel slug", funnel?.slug || "") || "");
              if (slug) saveFunnelMeta({ slug });
            }}
            className={classNames(
              "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
              busy ? "opacity-60" : "",
            )}
          >
            Change slug
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={createPage}
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
              busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
            )}
          >
            + Add page
          </button>
        </div>
      </div>

      {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-brand-ink">Pages</div>
          <div className="mt-3 space-y-2">
            {(pages || []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPageId(p.id)}
                className={classNames(
                  "w-full rounded-2xl border px-3 py-2 text-left",
                  selectedPageId === p.id
                    ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50",
                )}
              >
                <div className="text-sm font-semibold text-zinc-900">{p.title}</div>
                <div className="mt-0.5 text-xs text-zinc-600">/{p.slug}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          {!selectedPage ? (
            <div className="text-sm text-zinc-600">Select a page to edit.</div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Editing page</div>
                  <div className="mt-1 text-lg font-bold text-brand-ink">{selectedPage.title}</div>
                  <div className="mt-1 text-sm text-zinc-600">/{selectedPage.slug}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const title = (prompt("Page title", selectedPage.title) || "").trim();
                      if (title) savePage({ title });
                    }}
                    className={classNames(
                      "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
                      busy ? "opacity-60" : "",
                    )}
                  >
                    Title
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const slug = normalizeSlug(prompt("Page slug", selectedPage.slug) || "");
                      if (slug) savePage({ slug });
                    }}
                    className={classNames(
                      "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
                      busy ? "opacity-60" : "",
                    )}
                  >
                    Slug
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={deletePage}
                    className={classNames(
                      "rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50",
                      busy ? "opacity-60" : "",
                    )}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Content (Markdown)</div>
                <textarea
                  value={selectedPage.contentMarkdown || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPages((prev) =>
                      (prev || []).map((p) => (p.id === selectedPage.id ? { ...p, contentMarkdown: v } : p)),
                    );
                  }}
                  className="mt-2 min-h-[420px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900"
                />

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-zinc-500">
                    Tip: use headings like <span className="font-mono">## Section</span> and bullets like <span className="font-mono">- item</span>.
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => savePage({ contentMarkdown: selectedPage.contentMarkdown || "" })}
                    className={classNames(
                      "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                      busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                    )}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
