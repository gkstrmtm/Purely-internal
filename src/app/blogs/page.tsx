import Image from "next/image";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { buildBlogCtaText, formatBlogDate } from "@/lib/blog";

export const metadata = {
  title: "Automated Blogs | Purely Automation",
  description:
    "Purely builds systems that automate blogging so you can keep up with SEO without spending hours writing, editing, and publishing.",
};

export default async function BlogsIndexPage() {
  const cta = buildBlogCtaText();

  let posts: Array<{ slug: string; title: string; excerpt: string; publishedAt: Date }> = [];
  try {
    posts = await prisma.blogPost.findMany({
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: { slug: true, title: true, excerpt: true, publishedAt: true },
    });
  } catch {
    posts = [];
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/Untitled%20design%20(6).png"
              alt="Purely Automation"
              width={140}
              height={44}
              className="h-10 w-auto"
              priority
            />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
            >
              home
            </Link>
            <Link
              href={cta.href}
              className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              {cta.button}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="bg-[color:var(--color-brand-blue)]">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="font-brand text-4xl text-white sm:text-5xl">automated blogs</div>
              <p className="mt-4 text-lg leading-relaxed text-white/90">
                Purely creates systems that automate blogging so you don&apos;t have to spend hours writing, editing, and
                publishing to keep up with SEO.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={cta.href}
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-pink)] px-6 py-3 text-base font-extrabold text-[color:var(--color-brand-blue)] shadow-md hover:bg-pink-300"
                >
                  {cta.button}
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/25 bg-white/10 px-6 py-3 text-base font-bold text-white hover:bg-white/15"
                >
                  see the demo page
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="font-brand text-3xl text-[color:var(--color-brand-blue)]">latest posts</div>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Real examples of how automation saves time, reduces mistakes, and keeps marketing consistent.
              </p>

              <div className="mt-8 grid gap-6">
                {posts.length === 0 ? (
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-8">
                    <div className="text-lg font-semibold text-zinc-900">Posts are coming soon.</div>
                    <div className="mt-2 text-sm text-zinc-600">
                      If you&apos;re seeing this in production, the database table may still need to be deployed.
                    </div>
                    <div className="mt-5">
                      <Link
                        href={cta.href}
                        className="inline-flex items-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        {cta.button}
                      </Link>
                    </div>
                  </div>
                ) : (
                  posts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blogs/${post.slug}`}
                      className="group rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {formatBlogDate(post.publishedAt)}
                      </div>
                      <div className="mt-2 font-brand text-2xl text-[color:var(--color-brand-blue)] group-hover:underline">
                        {post.title}
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-zinc-700">{post.excerpt}</div>
                      <div className="mt-5 text-sm font-bold text-[color:var(--color-brand-blue)]">read more</div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <aside className="lg:pt-1">
              <div className="sticky top-6 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                <div className="font-brand text-2xl text-[color:var(--color-brand-blue)]">what this shows</div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                  These posts are generated by an automated blogging system, then published to this page. The goal is
                  simple: consistent, helpful SEO content without the weekly time sink.
                </p>

                <div className="mt-6 rounded-2xl bg-[color:rgba(29,78,216,0.06)] p-5">
                  <div className="text-sm font-bold text-zinc-900">ready to automate your content?</div>
                  <p className="mt-2 text-sm text-zinc-700">Book a call and we&apos;ll map the exact workflow.</p>
                  <div className="mt-4">
                    <Link
                      href={cta.href}
                      className="inline-flex items-center rounded-2xl bg-[color:var(--color-brand-pink)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-blue)] shadow-sm hover:bg-pink-300"
                    >
                      {cta.button}
                    </Link>
                  </div>
                </div>

                <div className="mt-6 text-xs text-zinc-500">
                  Tip: If you want this running weekly, set `AI_API_KEY` and `BLOG_CRON_SECRET` in Vercel.
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} Purely Automation</div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline">
              home
            </Link>
            <Link href={cta.href} className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline">
              book a call
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
