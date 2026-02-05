import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { formatBlogDate } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ siteSlug: string }>;
  searchParams?: Promise<{ page?: string }>;
};

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

export async function generateMetadata(props: PageProps) {
  const { siteSlug } = await props.params;

  try {
    const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
    const site = canUseSlugColumn
      ? await prisma.clientBlogSite.findFirst(
          {
            where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
            select: { name: true, ownerId: true },
          } as any,
        )
      : await prisma.clientBlogSite.findUnique({
          where: { id: siteSlug },
          select: { name: true, ownerId: true },
        });
    if (!site) return {};

    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId: site.ownerId },
      select: { businessName: true },
    });

    const name = profile?.businessName || site.name;

    return {
      title: `${name} | Blogs`,
      description: `Latest blog posts from ${name}.`,
    };
  } catch {
    return {};
  }
}

export default async function ClientBlogsIndexPage(props: PageProps) {
  const { siteSlug } = await props.params;

  const spUnknown: unknown = (await props.searchParams?.catch(() => ({}))) ?? {};
  const sp = spUnknown && typeof spUnknown === "object" ? (spUnknown as Record<string, unknown>) : {};
  const pageRaw = typeof sp.page === "string" ? sp.page : "1";
  const page = Math.max(1, Number.parseInt(pageRaw || "1", 10) || 1);
  const take = 50;
  const skip = (page - 1) * take;

  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const site = canUseSlugColumn
    ? await prisma.clientBlogSite.findFirst(
        {
          where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
          select: { id: true, name: true, ownerId: true, slug: true },
        } as any,
      )
    : await prisma.clientBlogSite.findUnique({
        where: { id: siteSlug },
        select: { id: true, name: true, ownerId: true },
      });

  if (!site) notFound();

  const siteHandle = (site as any).slug ?? (site as any).id;

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

  const posts = await prisma.clientBlogPost.findMany({
    where: { siteId: site.id, status: "PUBLISHED", archivedAt: null },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take,
    skip,
    select: { slug: true, title: true, excerpt: true, publishedAt: true, updatedAt: true },
  });

  const brandName = (profile as any)?.businessName || (site as any).name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const coralCta = "#fb7185";

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
        </div>
      </header>

      <main>
        <section style={{ backgroundColor: "var(--client-primary)" }}>
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="font-brand text-4xl text-white sm:text-5xl">blogs</div>
              <p className="mt-4 text-lg leading-relaxed text-white/90">
                The latest posts from {brandName}.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={`/${siteHandle}/blogs`}
                  className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-md"
                  style={{ backgroundColor: coralCta, color: "#fff" }}
                >
                  browse posts
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="font-brand text-3xl" style={{ color: "var(--client-primary)" }}>
                latest posts
              </div>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">Fresh updates and helpful ideas.</p>

              <div className="mt-8 grid gap-6">
                {posts.length === 0 ? (
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-8">
                    <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
                      New posts are coming soon.
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">Check back shortly.</div>
                  </div>
                ) : (
                  posts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/${siteHandle}/blogs/${post.slug}`}
                      className="group rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {formatBlogDate(post.publishedAt ?? post.updatedAt)}
                      </div>
                      <div
                        className="mt-2 font-brand text-2xl group-hover:underline"
                        style={{ color: "var(--client-primary)" }}
                      >
                        {post.title}
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-zinc-700">{post.excerpt}</div>
                      <div className="mt-5 text-sm font-bold" style={{ color: "var(--client-primary)" }}>
                        read more
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <div className="mt-10 flex items-center justify-between">
                <Link
                  href={page > 1 ? `/${siteHandle}/blogs?page=${page - 1}` : `/${siteHandle}/blogs`}
                  className={`rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 ${
                    page <= 1 ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  newer
                </Link>

                <div className="text-xs font-semibold text-zinc-500">page {page}</div>

                <Link
                  href={`/${siteHandle}/blogs?page=${page + 1}`}
                  className={`rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 ${
                    posts.length < take ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  older
                </Link>
              </div>
            </div>

            <aside className="lg:pt-1">
              <div className="sticky top-6 rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                <div className="font-brand text-2xl" style={{ color: "var(--client-primary)" }}>
                  about
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                  {brandName} shares updates, guides, and helpful ideas here.
                </p>

                <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "rgba(29,78,216,0.06)" }}>
                  <div className="text-sm font-bold" style={{ color: "var(--client-text)" }}>
                    want a blog like this?
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">This blog is hosted and managed by Purely Automation.</p>
                  <div className="mt-4">
                    <Link
                      href="/"
                      className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-extrabold shadow-sm"
                      style={{ backgroundColor: coralCta, color: "#fff" }}
                    >
                      learn more
                    </Link>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} {brandName}
            <span className="ml-2 text-zinc-400">•</span>
            <span className="ml-2">
              Powered by{" "}
              <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
                Purely Automation
              </Link>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              purelyautomation.com
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
