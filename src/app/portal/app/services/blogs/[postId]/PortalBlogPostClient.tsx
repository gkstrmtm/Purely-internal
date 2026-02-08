"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RichTextMarkdownEditor } from "@/components/RichTextMarkdownEditor";

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

type ConfirmKind = "publishUnsaved" | "generateOverwrite" | "delete" | "leave";

function confirmTitle(kind: ConfirmKind) {
  switch (kind) {
    case "publishUnsaved":
      return "You have unsaved changes";
    case "generateOverwrite":
      return "Generate with AI will overwrite your editor fields";
    case "delete":
      return "Delete this post permanently?";
    case "leave":
      return "Leave without saving?";
    default:
      return "Confirm";
  }
}

function confirmBody(kind: ConfirmKind) {
  switch (kind) {
    case "publishUnsaved":
      return "Choose whether to publish the last saved version, or save first.";
    case "generateOverwrite":
      return "This will overwrite title, excerpt, content, and keywords.";
    case "delete":
      return "This cannot be undone.";
    case "leave":
      return "Your changes will be lost.";
    default:
      return "";
  }
}

function uiSlugify(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

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

function formatLastSaved(updatedAt: string | null | undefined) {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  if (!Number.isFinite(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 60) return diffMin <= 1 ? "just now" : `${diffMin} minutes ago`;
  return d.toLocaleString();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateTimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function extractMarkdownImages(md: string): Array<{ alt: string; src: string; raw: string }> {
  const out: Array<{ alt: string; src: string; raw: string }> = [];
  const text = String(md || "");
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const m of text.matchAll(re)) {
    const raw = String(m[0] || "");
    const alt = String(m[1] || "").trim();
    const src = String(m[2] || "").trim();
    if (!src) continue;
    out.push({ alt, src, raw });
  }
  return out;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeImageFromMarkdown(md: string, src: string) {
  const s = String(src || "").trim();
  if (!s) return md;
  const re = new RegExp(`(^|\\n)\\s*!\\[[^\\]]*\\]\\(\\s*${escapeRegExp(s)}\\s*\\)\\s*(?=\\n|$)`, "g");
  return String(md || "").replace(re, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function replaceImageInMarkdown(md: string, oldSrc: string, nextSrc: string, nextAlt?: string) {
  const a = String(oldSrc || "").trim();
  const b = String(nextSrc || "").trim();
  if (!a || !b) return md;
  const re = new RegExp(`!\\[([^\\]]*)\\]\\(\\s*${escapeRegExp(a)}\\s*\\)`, "g");
  return String(md || "").replace(re, (_m, alt) => `![${(nextAlt ?? String(alt || "")).trim()}](${b})`);
}

function validateMarkdownForPublish(md: string): string | null {
  const text = String(md || "");
  const lines = text.split("\n");
  if (lines.some((l) => l.trim() === "!")) {
    return "It looks like there’s a stray '!' where an image used to be. Please remove it before publishing.";
  }

  const imageStarts = Array.from(text.matchAll(/!\[/g)).length;
  const imageFull = Array.from(text.matchAll(/!\[[^\]]*\]\([^)]+\)/g)).length;
  if (imageStarts > imageFull) {
    return "One of your images looks incomplete (broken Markdown). Remove it or fix it before publishing.";
  }

  if (/!\[\s*\]\([^)]+\)/.test(text)) {
    return "Please add alt text for your image(s) before publishing.";
  }

  return null;
}

export function PortalBlogPostClient({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "publish" | "delete" | "archive" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCta, setBillingCta] = useState<string | null>(null);

  const generateAbortRef = useRef<AbortController | null>(null);

  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const [post, setPost] = useState<Post | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [keywordsText, setKeywordsText] = useState("");

  const [publishedAtText, setPublishedAtText] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiIncludeCoverImage, setAiIncludeCoverImage] = useState(true);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);

  const [imageBusy, setImageBusy] = useState(false);
  const [imageAlt, setImageAlt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);

  useEffect(() => {
    if (!confirmKind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmKind(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmKind]);

  const imagesInContent = useMemo(() => {
    const all = extractMarkdownImages(content);
    const bySrc = new Map<string, { alt: string; src: string; raw: string }>();
    for (const img of all) {
      if (!bySrc.has(img.src)) bySrc.set(img.src, img);
    }
    return Array.from(bySrc.values());
  }, [content]);

  const keywords = useMemo(() => parseKeywords(keywordsText), [keywordsText]);

  const isDirty = useMemo(() => {
    if (!post) return false;
    const dateChanged = publishedAtText !== toDateTimeLocalValue(post.publishedAt);
    const baseChanged =
      title !== (post.title ?? "") ||
      slug !== (post.slug ?? "") ||
      excerpt !== (post.excerpt ?? "") ||
      content !== (post.content ?? "");

    const prevKw = Array.isArray(post.seoKeywords) ? post.seoKeywords : [];
    const prevText = prevKw.join("\n");
    const kwChanged = keywordsText !== prevText;
    return baseChanged || kwChanged || dateChanged;
  }, [content, excerpt, keywordsText, post, publishedAtText, slug, title]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBillingCta(null);

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: Post; error?: string };

    if (!res.ok || !json.ok || !json.post) {
      setError(json.error ?? "Unable to load post");
      setPost(null);
      setLoading(false);
      return;
    }

    const loaded = json.post;
    setPost(loaded);
    setTitle(loaded.title ?? "");
    setSlug(loaded.slug ?? "");
    setExcerpt(loaded.excerpt ?? "");
    setContent(loaded.content ?? "");
    setKeywordsText((loaded.seoKeywords ?? []).join("\n"));
    setPublishedAtText(toDateTimeLocalValue(loaded.publishedAt));

    setAiPrompt((prev) => (prev.trim() ? prev : loaded.title ?? ""));

    setLoading(false);
  }, [postId]);

  function coverImageUrlFor(titleText: string) {
    const t = (titleText || "").trim() || "Blog post";
    return `/api/blogs/cover?title=${encodeURIComponent(t)}`;
  }

  function ensureCoverAtTop(markdown: string, coverUrl: string, alt: string) {
    const md = String(markdown || "");
    const normalized = md.replace(/^\uFEFF/, "");
    const firstNonEmpty = normalized
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);

    if (firstNonEmpty && firstNonEmpty.includes(coverUrl)) {
      return md;
    }

    const snippet = `![${alt || "cover"}](${coverUrl})`;
    const stripped = normalized.replace(/^\s+/, "");
    return stripped ? `${snippet}\n\n${stripped}` : `${snippet}\n`;
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveInternal(): Promise<Post | null> {
    if (!title.trim()) {
      setError("Title is required");
      return null;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return null;
    }

    setWorking("save");
    setError(null);

    const publishedAtBase = toDateTimeLocalValue(post?.publishedAt ?? null);
    const dateChanged = publishedAtText !== publishedAtBase;
    let publishedAtIso: string | null | undefined = undefined;
    if (dateChanged) {
      if (!publishedAtText.trim()) publishedAtIso = null;
      else {
        const d = new Date(publishedAtText);
        if (!Number.isFinite(d.getTime())) {
          setWorking(null);
          setError("Invalid published date");
          return null;
        }
        publishedAtIso = d.toISOString();
      }
    }

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        slug,
        excerpt,
        content,
        seoKeywords: keywords.length ? keywords : undefined,
        ...(typeof publishedAtIso !== "undefined" ? { publishedAt: publishedAtIso } : {}),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: Post; error?: string };
    setWorking(null);

    if (!res.ok || !json.ok || !json.post) {
      setError(json.error ?? "Unable to save changes");
      return null;
    }

    setPost(json.post);
    setTitle(json.post.title ?? "");
    setSlug(json.post.slug ?? "");
    setExcerpt(json.post.excerpt ?? "");
    setContent(json.post.content ?? "");
    setKeywordsText((json.post.seoKeywords ?? []).join("\n"));
    setPublishedAtText(toDateTimeLocalValue(json.post.publishedAt));
    return json.post;
  }

  async function save() {
    await saveInternal();
  }

  async function publishInternal(opts?: { bypassUnsavedConfirm?: boolean }) {
    if (!post) return;

    const mdError = validateMarkdownForPublish(content);
    if (mdError) {
      setError(mdError);
      return;
    }

    if (!opts?.bypassUnsavedConfirm && isDirty) {
      setConfirmKind("publishUnsaved");
      return;
    }

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

  async function publish() {
    await publishInternal();
  }

  async function generateWithAi(opts?: { forceOverwrite?: boolean }) {
    if (!post) return;

    if (working !== null) return;

    if (!opts?.forceOverwrite && (isDirty || title.trim() || excerpt.trim() || content.trim())) {
      setConfirmKind("generateOverwrite");
      return;
    }

    const promptText = aiPrompt.trim();

    setWorking("generate");
    setError(null);
    setBillingCta(null);

    const abort = new AbortController();
    generateAbortRef.current = abort;

    let res: Response;
    try {
      res = await fetch(`/api/portal/blogs/posts/${postId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: promptText || undefined, topic: promptText || undefined }),
        signal: abort.signal,
      });
    } catch (e) {
      setWorking(null);
      generateAbortRef.current = null;
      if ((e as any)?.name === "AbortError") {
        return;
      }
      setError("Unable to generate post");
      return;
    }

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draft?: { title: string; excerpt: string; content: string; seoKeywords?: string[]; coverImageAlt?: string };
      estimatedCredits?: number;
      creditsRemaining?: number;
      billingPath?: string;
      code?: string;
      error?: string;
    };

    setWorking(null);
    generateAbortRef.current = null;

    if (!res.ok || !json.ok || !json.draft) {
      if (res.status === 402 && json.code === "INSUFFICIENT_CREDITS") {
        const path = json.billingPath || "/portal/app/billing";
        setBillingCta(path);

        // If the user enabled auto top-up, send them straight to the top-up flow.
        try {
          const c = await fetch("/api/portal/credits", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
          const auto = Boolean(c && typeof c === "object" && (c as any).autoTopUp);
          if (auto) {
            const top = await fetch("/api/portal/credits/topup", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ packages: 1 }),
            }).then((r) => (r.ok ? r.json() : null));
            if (top && typeof top === "object" && typeof (top as any).url === "string") {
              window.location.href = String((top as any).url);
              return;
            }
            window.location.href = path;
            return;
          }
        } catch {
          // ignore
        }

        setError(json.error ?? "Not enough credits");
        return;
      }

      setError(json.error ?? "Unable to generate post");
      return;
    }

    const nextTitle = json.draft.title ?? "";
    const nextExcerpt = json.draft.excerpt ?? "";
    const nextContent = json.draft.content ?? "";
    const nextKeywords = Array.isArray(json.draft.seoKeywords) ? json.draft.seoKeywords : [];

    if (typeof json.creditsRemaining === "number" && Number.isFinite(json.creditsRemaining)) {
      setCreditsRemaining(json.creditsRemaining);
    }

    const oldSuggested = uiSlugify(title);
    const currentSlug = slug.trim();
    const shouldReplaceSlug = !currentSlug || (oldSuggested && currentSlug === oldSuggested);
    const nextSuggested = uiSlugify(nextTitle);

    setTitle(nextTitle);
    setExcerpt(nextExcerpt);
    let nextMd = nextContent;

    if (aiIncludeCoverImage && nextTitle.trim()) {
      const url = coverImageUrlFor(nextTitle);
      const alt = (json.draft.coverImageAlt || nextTitle).trim();
      nextMd = ensureCoverAtTop(nextMd, url, alt);
      setImageAlt(alt);
      setImageUrl(url);
    }

    setContent(nextMd);
    setKeywordsText(nextKeywords.join("\n"));
    if (shouldReplaceSlug && nextSuggested) setSlug(nextSuggested);
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
    setConfirmKind("delete");
    return;
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
  const saveDisabled = working !== null || !isDirty;
  const publishDisabled =
    working !== null ||
    !canPublish ||
    (post.status === "PUBLISHED" && !isDirty);
  const publishLabel =
    post.status === "PUBLISHED" ? (isDirty ? "Update" : "Published") : "Publish";

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
            {post.updatedAt ? ` • Last saved ${formatLastSaved(post.updatedAt)}` : ""}
            {isDirty ? " • Unsaved changes" : ""}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => {
              if (isDirty) {
                setConfirmKind("leave");
                return;
              }
              window.location.href = "/portal/app/services/blogs";
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Cancel
          </button>
          <a
            href={exportUrl}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Export Markdown
          </a>
          <button
            type="button"
            onClick={(_e) => {
              void generateWithAi();
            }}
            disabled={working !== null}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
          >
            {working === "generate" ? "Generating…" : "Generate with AI"}
          </button>
          {working === "generate" ? (
            <button
              type="button"
              onClick={() => {
                generateAbortRef.current?.abort();
                generateAbortRef.current = null;
                setWorking(null);
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saveDisabled}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {working === "save" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={publishDisabled}
            className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {working === "publish" ? "Publishing…" : publishLabel}
          </button>
        </div>
      </div>

      {confirmKind ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-8"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setConfirmKind(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-zinc-900">{confirmTitle(confirmKind)}</div>
            <div className="mt-2 text-sm text-zinc-600">{confirmBody(confirmKind)}</div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {confirmKind === "publishUnsaved" ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    onClick={async () => {
                      setConfirmKind(null);
                      // Discard unsaved edits, then publish the server-saved version.
                      await refresh();
                      await publishInternal({ bypassUnsavedConfirm: true });
                    }}
                  >
                    Publish last saved
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                    onClick={async () => {
                      setConfirmKind(null);
                      const saved = await saveInternal();
                      if (!saved) return;
                      await publishInternal({ bypassUnsavedConfirm: true });
                    }}
                  >
                    Save & publish
                  </button>
                </>
              ) : null}

              {confirmKind === "generateOverwrite" ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  onClick={() => {
                    setConfirmKind(null);
                    void generateWithAi({ forceOverwrite: true });
                  }}
                >
                  Generate now
                </button>
              ) : null}

              {confirmKind === "delete" ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  onClick={async () => {
                    setConfirmKind(null);
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
                  }}
                >
                  Delete
                </button>
              ) : null}

              {confirmKind === "leave" ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  onClick={() => {
                    setConfirmKind(null);
                    window.location.href = "/portal/app/services/blogs";
                  }}
                >
                  Leave without saving
                </button>
              ) : null}

              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                onClick={() => setConfirmKind(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {billingCta ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Not enough credits. <a className="font-semibold underline" href={billingCta}>Top off your credits here</a>.
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">AI prompt</div>
              <div className="mt-1 text-sm text-zinc-600">Describe what you want. We’ll generate the full post and SEO keywords.</div>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="mt-3 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="Example: Write a helpful post for homeowners about how to choose the right HVAC filter, with a friendly professional tone."
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={aiIncludeCoverImage}
                    onChange={(e) => setAiIncludeCoverImage(e.target.checked)}
                  />
                  Add a cover image (generated SVG)
                </label>
                {creditsRemaining !== null ? (
                  <div className="text-xs font-semibold text-zinc-600">Credits remaining: {creditsRemaining}</div>
                ) : null}
              </div>
            </div>

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
              <div className="mt-1">
                <RichTextMarkdownEditor
                  markdown={content}
                  onChange={setContent}
                  placeholder="Write your post…"
                  disabled={working !== null}
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Saved as Markdown (Export uses the exact saved Markdown).
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Post settings</div>
          <div className="mt-2 text-sm text-zinc-600">Control publish date, SEO, and images.</div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-zinc-600">Published date (editable)</label>
            <input
              type="datetime-local"
              value={publishedAtText}
              onChange={(e) => setPublishedAtText(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <div>Leave blank for drafts or to clear the date.</div>
              <button
                type="button"
                className="font-semibold text-brand-ink hover:underline"
                onClick={() => setPublishedAtText("")}
              >
                Clear
              </button>
            </div>
          </div>

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

              <div>
                <label className="text-xs font-semibold text-zinc-600">Image URL (optional)</label>
                <input
                  value={imageUrl ?? ""}
                  onChange={(e) => setImageUrl(e.target.value.trim() ? e.target.value : null)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="https://…"
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

                <button
                  type="button"
                  disabled={!imageUrl || imagesInContent.length === 0}
                  onClick={() => {
                    if (!imageUrl) return;
                    const first = imagesInContent[0];
                    if (!first) return;
                    const alt = imageAlt.trim() || first.alt || "image";
                    setContent((prev) => replaceImageInMarkdown(prev, first.src, imageUrl, alt));
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                >
                  Replace first image
                </button>

                <button
                  type="button"
                  disabled={working !== null}
                  onClick={() => {
                    const t = title.trim() || post.title || "Blog post";
                    const url = `/api/blogs/cover?title=${encodeURIComponent(t)}&v=${encodeURIComponent(String(Date.now()))}`;
                    const alt = (imageAlt.trim() || t).trim();
                    setImageUrl(url);
                    setImageAlt(alt);
                    setContent((prev) => {
                      // Replace an existing cover image, or ensure at top.
                      const cleared = prev.replace(/^\s*!\[[^\]]*\]\(\s*\/api\/blogs\/cover\?[^\)]*\)\s*\n\n?/m, "");
                      return ensureCoverAtTop(cleared, url, alt);
                    });
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                >
                  Regenerate cover image
                </button>
              </div>

              {imageUrl ? <div className="text-xs text-zinc-500 break-all">Inserted as: ![alt]({imageUrl})</div> : null}

              {imagesInContent.length ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-700">Images in this post</div>
                  <div className="mt-3 space-y-3">
                    {imagesInContent.map((img) => (
                      <div key={img.src} className="rounded-2xl border border-zinc-200 bg-white p-3">
                        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.src} alt={img.alt || "Post image"} className="h-28 w-full object-cover" />
                        </div>
                        <div className="mt-2 text-xs text-zinc-600">
                          <div className="font-semibold text-zinc-800">Alt:</div>
                          <div className="break-words">{img.alt || "(none)"}</div>
                        </div>
                        <div className="mt-2 text-xs text-zinc-600">
                          <div className="font-semibold text-zinc-800">URL:</div>
                          <div className="break-all">{img.src}</div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                            onClick={() => setContent((prev) => removeImageFromMarkdown(prev, img.src))}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            disabled={!imageUrl}
                            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                            onClick={() => {
                              if (!imageUrl) return;
                              const alt = imageAlt.trim() || img.alt || "image";
                              setContent((prev) => replaceImageInMarkdown(prev, img.src, imageUrl, alt));
                            }}
                          >
                            Replace with current URL
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
