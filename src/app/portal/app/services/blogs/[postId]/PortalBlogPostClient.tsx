"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Post = {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  seoKeywords: string[] | null;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

function parseKeywords(text: string): string[] {
  const raw = text
    .split(/\n|,/g)
    .map((k) => k.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= 50) break;
  }
  return out;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

export function PortalBlogPostClient({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "publish" | "delete" | "archive" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const [post, setPost] = useState<Post | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [keywordsText, setKeywordsText] = useState("");

  const [imageBusy, setImageBusy] = useState(false);
  const [imageAlt, setImageAlt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const keywords = useMemo(() => parseKeywords(keywordsText), [keywordsText]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: Post; error?: string };

    if (!res.ok || !json.ok || !json.post) {
      setError(json.error ?? "Unable to load post");
      setPost(null);
      setLoading(false);
      return;
    }

    setPost(json.post);
    setTitle(json.post.title ?? "");
    setSlug(json.post.slug ?? "");
    setExcerpt(json.post.excerpt ?? "");
    setContent(json.post.content ?? "");
    setKeywordsText((json.post.seoKeywords ?? []).join("\n"));

    setLoading(false);
  }, [postId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }

    setWorking("save");
    setError(null);

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        slug,
        excerpt,
        content,
        seoKeywords: keywords.length ? keywords : undefined,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: Post; error?: string };
    setWorking(null);

    if (!res.ok || !json.ok || !json.post) {
      setError(json.error ?? "Unable to save changes");
      return;
    }

    setPost(json.post);
    setSlug(json.post.slug);
  }

  async function publish() {
    setWorking("publish");
    setError(null);

    const res = await fetch(`/api/portal/blogs/posts/${postId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: Partial<Post>; error?: string };
    setWorking(null);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to publish");
      return;
    }

    await refresh();
  }

  async function toggleArchive() {
    if (!post) return;

    setWorking("archive");
    setError(null);

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || post.title,
        slug: slug.trim() || post.slug,
        excerpt,
        content,
        seoKeywords: keywords.length ? keywords : undefined,
        archived: !post.archivedAt,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: Post; error?: string };
    setWorking(null);

    if (!res.ok || !json.ok || !json.post) {
      setError(json.error ?? "Unable to update archive state");
      return;
    }

    setPost(json.post);
  }

  async function destroy() {
    const ok = window.confirm("Delete this post permanently? This cannot be undone.");
    if (!ok) return;

    setWorking("delete");
    setError(null);

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setWorking(null);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to delete post");
      return;
    }

    window.location.href = "/portal/app/services/blogs";
  }

  function insertIntoContent(snippet: string) {
    const textarea = contentRef.current;
    if (!textarea) {
      setContent((prev) => (prev ? `${prev}\n\n${snippet}\n` : `${snippet}\n`));
      return;
    }

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;

    setContent((prev) => {
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
      const needsTrailingNewline = after.length > 0 && !after.startsWith("\n");
      const prefix = needsLeadingNewline ? "\n" : "";
      const suffix = needsTrailingNewline ? "\n" : "";
      return `${before}${prefix}${snippet}${suffix}${after}`;
    });

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading post…</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="text-sm font-semibold text-zinc-900">Post not found</div>
          <div className="mt-2 text-sm text-zinc-600">{error ?? "This post may have been deleted."}</div>
          <div className="mt-6">
            <Link
              href="/portal/app/services/blogs"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Back to blogs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canPublish = !post.archivedAt;
  const exportUrl = `/api/portal/blogs/posts/${post.id}/export`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs font-semibold text-zinc-500">
            <Link href="/portal/app/services/blogs" className="hover:underline">
              Blogs
            </Link>
            <span className="px-2">/</span>
            <span className="text-zinc-700">Edit</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">{post.title || "Untitled"}</h1>
          <div className="mt-1 text-sm text-zinc-600">
            Status: {post.status === "PUBLISHED" ? "Published" : "Draft"}
            {post.publishedAt ? ` • Published ${formatDate(post.publishedAt)}` : ""}
            {post.archivedAt ? ` • Archived ${formatDate(post.archivedAt)}` : ""}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href={exportUrl}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Export Markdown
          </a>
          <button
            type="button"
            onClick={save}
            disabled={working !== null}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {working === "save" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish || working !== null}
            className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {working === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="The headline people will click"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="my-post-slug"
              />
              <div className="mt-1 text-xs text-zinc-500">Used for filenames and URLs when you export.</div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Excerpt</label>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="A short summary for preview cards"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                ref={contentRef}
                className="mt-1 min-h-[320px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-zinc-300"
                placeholder="Write in Markdown or plain text. Export will download Markdown."
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">SEO</div>
          <div className="mt-2 text-sm text-zinc-600">Optional keywords for internal targeting.</div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-zinc-600">Keywords (one per line)</label>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              className="mt-1 min-h-[180px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="roofing\nlead generation\nlocal SEO"
            />
            <div className="mt-1 text-xs text-zinc-500">Parsed keywords: {keywords.length}</div>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="text-sm font-semibold text-zinc-900">Images</div>
            <div className="mt-2 text-sm text-zinc-600">Upload an image and insert it into your content as Markdown.</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Alt text (optional)</label>
                <input
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Team photo, product screenshot, etc."
                />
              </div>

              {imageUrl ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={imageAlt || "Uploaded image"} className="h-40 w-full object-cover" />
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50">
                  {imageBusy ? "Uploading…" : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imageBusy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImageBusy(true);
                      setError(null);
                      try {
                        const fd = new FormData();
                        fd.set("file", file);
                        const up = await fetch("/api/uploads", { method: "POST", body: fd });
                        const upBody = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
                        if (!up.ok || !upBody.url) {
                          setError(upBody.error ?? "Upload failed");
                          return;
                        }
                        setImageUrl(upBody.url);
                      } finally {
                        setImageBusy(false);
                        if (e.target) e.target.value = "";
                      }
                    }}
                  />
                </label>

                <button
                  type="button"
                  disabled={!imageUrl}
                  onClick={() => {
                    if (!imageUrl) return;
                    const alt = imageAlt.trim() || "image";
                    insertIntoContent(`![${alt}](${imageUrl})`);
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Insert into content
                </button>
              </div>

              {imageUrl ? <div className="text-xs text-zinc-500">Inserted as: ![alt]({imageUrl})</div> : null}
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="text-sm font-semibold text-zinc-900">Danger zone</div>

            <div className="mt-3 flex flex-col gap-3">
              <button
                type="button"
                onClick={toggleArchive}
                disabled={working !== null}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              >
                {working === "archive" ? "Updating…" : post.archivedAt ? "Unarchive" : "Archive"}
              </button>

              <button
                type="button"
                onClick={destroy}
                disabled={working !== null}
                className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {working === "delete" ? "Deleting…" : "Delete"}
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">Export first if you want a backup.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
