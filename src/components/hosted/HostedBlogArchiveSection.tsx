import Link from "next/link";

import { formatBlogDate } from "@/lib/blog";

export function HostedBlogArchiveSection({
  brandName,
  posts,
  page,
  pageSize,
  basePath,
}: {
  brandName: string;
  posts: { slug: string; title: string; excerpt: string | null; publishedAt: Date | null; updatedAt: Date }[];
  page: number;
  pageSize: number;
  basePath: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="font-brand text-3xl" style={{ color: "var(--client-link)" }}>
            latest posts
          </div>
          <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--client-muted)" }}>
            Fresh updates and helpful ideas.
          </p>

          <div className="mt-8 grid gap-6">
            {posts.length === 0 ? (
              <div className="rounded-3xl border p-8" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-soft)" }}>
                <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
                  New posts are coming soon.
                </div>
                <div className="mt-2 text-sm" style={{ color: "var(--client-muted)" }}>
                  Check back shortly.
                </div>
              </div>
            ) : (
              posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`${basePath}/${post.slug}`}
                  className="group rounded-3xl border p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--client-muted)" }}>
                    {formatBlogDate(post.publishedAt ?? post.updatedAt)}
                  </div>
                  <div className="mt-2 font-brand text-2xl group-hover:underline" style={{ color: "var(--client-link)" }}>
                    {post.title}
                  </div>
                  <div className="mt-3 text-sm leading-relaxed" style={{ color: "var(--client-muted)" }}>
                    {post.excerpt}
                  </div>
                  <div className="mt-5 text-sm font-bold" style={{ color: "var(--client-link)" }}>
                    read more
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="mt-10 flex items-center justify-between">
            <Link
              href={page > 1 ? `${basePath}?page=${page - 1}` : basePath}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
              style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)", color: "var(--client-text)" }}
            >
              newer
            </Link>

            <div className="text-xs font-semibold" style={{ color: "var(--client-muted)" }}>
              page {page}
            </div>

            <Link
              href={`${basePath}?page=${page + 1}`}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${posts.length < pageSize ? "pointer-events-none opacity-50" : ""}`}
              style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)", color: "var(--client-text)" }}
            >
              older
            </Link>
          </div>
        </div>

        <aside className="lg:pt-1">
          <div className="sticky top-6 rounded-3xl border p-7 shadow-sm" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}>
            <div className="font-brand text-2xl" style={{ color: "var(--client-link)" }}>
              about
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--client-muted)" }}>
              {brandName} shares updates, guides, and helpful ideas here.
            </p>

            <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "var(--client-soft)" }}>
              <div className="text-sm font-bold" style={{ color: "var(--client-text)" }}>
                want a blog like this?
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--client-muted)" }}>
                This blog is hosted and managed by Purely Automation.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
