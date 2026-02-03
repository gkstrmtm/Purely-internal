import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { buildBlogCtaText, formatBlogDate, parseBlogContent } from "@/lib/blog";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: PageProps) {
  const { slug } = await props.params;

  try {
    const post = await prisma.blogPost.findUnique({
      where: { slug },
      select: { title: true, excerpt: true },
    });

    if (!post) return {};

    return {
      title: `${post.title} | Purely Automation`,
      description: post.excerpt,
    };
  } catch {
    return {};
  }
}

export default async function BlogPostPage(props: PageProps) {
  const { slug } = await props.params;
  const cta = buildBlogCtaText();

  let post:
    | {
        slug: string;
        title: string;
        excerpt: string;
        content: string;
        publishedAt: Date;
      }
    | null = null;

  try {
    post = await prisma.blogPost.findUnique({
      where: { slug },
      select: { slug: true, title: true, excerpt: true, content: true, publishedAt: true },
    });
  } catch {
    post = null;
  }

  if (!post) notFound();

  const blocks = parseBlogContent(post.content);

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
              href="/blogs"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
            >
              all posts
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

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {formatBlogDate(post.publishedAt)}
          </div>
          <h1 className="mt-3 font-brand text-4xl leading-tight text-[color:var(--color-brand-blue)] sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">{post.excerpt}</p>

          <div className="mt-10 space-y-6">
            {blocks.map((b, idx) => {
              if (b.type === "h2") {
                return (
                  <h2 key={idx} className="pt-4 font-brand text-2xl text-zinc-900">
                    {b.text}
                  </h2>
                );
              }
              if (b.type === "h3") {
                return (
                  <h3 key={idx} className="pt-2 text-lg font-bold text-zinc-900">
                    {b.text}
                  </h3>
                );
              }
              if (b.type === "ul") {
                return (
                  <ul key={idx} className="list-disc space-y-2 pl-6 text-sm leading-relaxed text-zinc-700">
                    {b.items.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={idx} className="text-sm leading-relaxed text-zinc-700">
                  {b.text}
                </p>
              );
            })}
          </div>

          <div className="mt-14 rounded-3xl bg-[color:rgba(29,78,216,0.06)] p-8">
            <div className="font-brand text-2xl text-[color:var(--color-brand-blue)]">{cta.title}</div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">{cta.body}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={cta.href}
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-pink)] px-6 py-3 text-base font-extrabold text-[color:var(--color-brand-blue)] shadow-sm hover:bg-pink-300"
              >
                {cta.button}
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-[color:rgba(29,78,216,0.15)] bg-white px-6 py-3 text-base font-bold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
              >
                back to home
              </Link>
            </div>
          </div>

          <div className="mt-10 text-xs text-zinc-500">
            Disclaimer: This post is published by an automated blogging workflow. If you want the exact workflow for
            your business, book a call.
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} Purely Automation</div>
          <div className="flex items-center gap-4">
            <Link href="/blogs" className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline">
              blogs
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
