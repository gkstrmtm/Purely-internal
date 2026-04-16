import Link from "next/link";

import { formatBlogDate, inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";

export function HostedBlogPostArticle({
  post,
  blogsHref,
  learnMoreHref,
}: {
  post: { title: string; excerpt: string | null; content: string; publishedAt: Date | null; updatedAt: Date };
  blogsHref: string;
  learnMoreHref: string;
}) {
  const blocks = parseBlogContent(post.content);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--client-muted)" }}>
        {formatBlogDate(post.publishedAt ?? post.updatedAt)}
      </div>
      <h1 className="mt-3 font-brand text-4xl leading-tight sm:text-5xl" style={{ color: "var(--client-link)" }}>
        {post.title}
      </h1>
      <p className="mt-5 text-base leading-relaxed" style={{ color: "var(--client-muted)" }}>
        {post.excerpt}
      </p>

      <div className="mt-10 space-y-6">
        {blocks.map((block, index) => {
          if (block.type === "h2") {
            return (
              <h2 key={index} className="pt-4 font-brand text-2xl" style={{ color: "var(--client-text)" }}>
                <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(block.text) }} />
              </h2>
            );
          }
          if (block.type === "h3") {
            return (
              <h3 key={index} className="pt-2 text-lg font-bold" style={{ color: "var(--client-text)" }}>
                <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(block.text) }} />
              </h3>
            );
          }
          if (block.type === "img") {
            return (
              <div key={index} className="overflow-hidden rounded-3xl border" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-soft)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.src} alt={block.alt || ""} className="h-auto w-full object-cover" />
              </div>
            );
          }
          if (block.type === "ul") {
            return (
              <ul key={index} className="list-disc space-y-2 pl-6 text-sm leading-relaxed" style={{ color: "var(--client-muted)" }}>
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(item) }} />
                ))}
              </ul>
            );
          }
          return (
            <p key={index} className="text-sm leading-relaxed" style={{ color: "var(--client-muted)" }}>
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(block.text) }} />
            </p>
          );
        })}
      </div>

      <div className="mt-12 rounded-3xl p-8" style={{ backgroundColor: "var(--client-soft)" }}>
        <div className="font-brand text-2xl" style={{ color: "var(--client-link)" }}>
          Keep reading
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--client-muted)" }}>
          Explore more articles, recent updates, and stories from the archive.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={learnMoreHref}
            className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-sm"
            style={{ backgroundColor: "var(--client-accent)", color: "var(--client-on-accent)" }}
          >
            continue reading
          </Link>
          <Link
            href={blogsHref}
            className="inline-flex items-center justify-center rounded-2xl border px-6 py-3 text-base font-bold"
            style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)", color: "var(--client-link)" }}
          >
            back to posts
          </Link>
        </div>
      </div>
    </div>
  );
}
