import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { formatBlogDate, parseBlogContent } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ siteSlug: string; postSlug: string }> };

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

export async function generateMetadata(props: PageProps) {
  const { siteSlug, postSlug } = await props.params;

  try {
    const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
    const site = canUseSlugColumn
      ? await prisma.clientBlogSite.findFirst({
          where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
          select: { id: true, ownerId: true, name: true, slug: true },
        })
      : await (async () => {
          const byId = await prisma.clientBlogSite.findUnique({
            where: { id: siteSlug },
            select: { id: true, ownerId: true, name: true },
          });
          if (byId) return byId;
          const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
          if (!ownerId) return null;
          return prisma.clientBlogSite.findUnique({
            where: { ownerId },
            select: { id: true, ownerId: true, name: true },
          });
        })();

    if (!site) return {};

    const post = await prisma.clientBlogPost.findFirst({
      where: { siteId: site.id, slug: postSlug, status: "PUBLISHED", archivedAt: null },
      select: { title: true, excerpt: true },
    });

    if (!post) return {};

    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId: site.ownerId },
      select: { businessName: true },
    });

    const name = profile?.businessName || site.name;

    return {
      title: `${post.title} | ${name}`,
      description: post.excerpt,
    };
  } catch {
    return {};
  }
}

export default async function ClientBlogPostPage(props: PageProps) {
  const { siteSlug, postSlug } = await props.params;

  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const site = canUseSlugColumn
    ? await prisma.clientBlogSite.findFirst({
        where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
        select: { id: true, name: true, ownerId: true, slug: true },
      })
    : await (async () => {
        const byId = await prisma.clientBlogSite.findUnique({
          where: { id: siteSlug },
          select: { id: true, name: true, ownerId: true },
        });
        if (byId) return byId;
        const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
        if (!ownerId) return null;
        return prisma.clientBlogSite.findUnique({
          where: { ownerId },
          select: { id: true, name: true, ownerId: true },
        });
      })();

  if (!site) notFound();

  const siteHandle = canUseSlugColumn ? ((site as any).slug ?? (site as any).id) : siteSlug;

  const [hasLogoUrl, hasPrimaryHex, hasAccentHex, hasTextHex] = await Promise.all([
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
  ]);

  const profileSelect: Record<string, boolean> = { businessName: true };
  if (hasLogoUrl) profileSelect.logoUrl = true;
  if (hasPrimaryHex) profileSelect.brandPrimaryHex = true;
  if (hasAccentHex) profileSelect.brandAccentHex = true;
  if (hasTextHex) profileSelect.brandTextHex = true;

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId: (site as any).ownerId },
    select: profileSelect as any,
  });

  const brandPrimary = normalizeHex((profile as any)?.brandPrimaryHex) ?? "#1d4ed8";
  const brandAccent = normalizeHex((profile as any)?.brandAccentHex) ?? "#f472b6";
  const brandText = normalizeHex((profile as any)?.brandTextHex) ?? "#18181b";

  const post = await prisma.clientBlogPost.findFirst({
    where: { siteId: site.id, slug: postSlug, status: "PUBLISHED", archivedAt: null },
    select: { slug: true, title: true, excerpt: true, content: true, publishedAt: true, updatedAt: true },
  });

  if (!post) notFound();

  const brandName = (profile as any)?.businessName || (site as any).name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const blocks = parseBlogContent(post.content);

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href={`/${siteHandle}/blogs`} className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={brandName} className="h-10 w-auto" />
            ) : (
              <div className="text-lg font-bold" style={{ color: "var(--client-text)" }}>
                {brandName}
              </div>
            )}
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href={`/${siteHandle}/blogs`}
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
            >
              all posts
            </Link>
            <Link
              href="/"
              className="rounded-2xl px-4 py-2 text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: "var(--client-primary)" }}
            >
              powered by purely
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {formatBlogDate(post.publishedAt ?? post.updatedAt)}
          </div>
          <h1 className="mt-3 font-brand text-4xl leading-tight sm:text-5xl" style={{ color: "var(--client-primary)" }}>
            {post.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">{post.excerpt}</p>

          <div className="mt-10 space-y-6">
            {blocks.map((b, idx) => {
              if (b.type === "h2") {
                return (
                  <h2 key={idx} className="pt-4 font-brand text-2xl" style={{ color: "var(--client-text)" }}>
                    {b.text}
                  </h2>
                );
              }
              if (b.type === "h3") {
                return (
                  <h3 key={idx} className="pt-2 text-lg font-bold" style={{ color: "var(--client-text)" }}>
                    {b.text}
                  </h3>
                );
              }
              if (b.type === "img") {
                return (
                  <div key={idx} className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.src} alt={b.alt || ""} className="h-auto w-full object-cover" />
                  </div>
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

          <div className="mt-12 rounded-3xl p-8" style={{ backgroundColor: "rgba(29,78,216,0.06)" }}>
            <div className="font-brand text-2xl" style={{ color: "var(--client-primary)" }}>
              Want this kind of consistency?
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">This blog is hosted by Purely Automation.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-sm"
                style={{ backgroundColor: "var(--client-accent)", color: "var(--client-primary)" }}
              >
                learn more
              </Link>
              <Link
                href={`/${siteHandle}/blogs`}
                className="inline-flex items-center justify-center rounded-2xl border bg-white px-6 py-3 text-base font-bold hover:bg-zinc-50"
                style={{ borderColor: "rgba(29,78,216,0.15)", color: "var(--client-primary)" }}
              >
                back to posts
              </Link>
            </div>
          </div>

          <div className="mt-10 text-xs text-zinc-500">
            Powered by Purely Automation.
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {brandName}</div>
          <div className="flex items-center gap-4">
            <Link href={`/${siteHandle}/blogs`} className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              blogs
            </Link>
            <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              purelyautomation.com
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
