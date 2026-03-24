import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { formatBlogDate } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getBlogAppearance } from "@/lib/blogAppearance";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { resolveHostedFont } from "@/lib/portalHostedFonts";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";
import { HostedPortalAdBanner } from "@/components/HostedPortalAdBanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ siteSlug: string }>;
  searchParams?: Promise<{ page?: string }>;
};

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
      : await (async () => {
          const byId = await prisma.clientBlogSite.findUnique({
            where: { id: siteSlug },
            select: { name: true, ownerId: true },
          });
          if (byId) return byId;
          const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
          if (!ownerId) return null;
          return prisma.clientBlogSite.findUnique({
            where: { ownerId },
            select: { name: true, ownerId: true },
          });
        })();
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
  const ownerId = String((site as any).ownerId);

  const [hasLogoUrl, hasPrimaryHex, hasSecondaryHex, hasAccentHex, hasTextHex] = await Promise.all([
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
  ]);

  const profileSelect: Record<string, boolean> = { businessName: true };
  if (hasLogoUrl) profileSelect.logoUrl = true;
  if (hasPrimaryHex) profileSelect.brandPrimaryHex = true;
  if (hasSecondaryHex) profileSelect.brandSecondaryHex = true;
  if (hasAccentHex) profileSelect.brandAccentHex = true;
  if (hasTextHex) profileSelect.brandTextHex = true;

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId: (site as any).ownerId },
    select: profileSelect as any,
  });

  const hostedTheme = await getHostedTheme(ownerId);

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
    overrides: hostedTheme,
  });

  const posts = await prisma.clientBlogPost.findMany({
    where: { siteId: site.id, status: "PUBLISHED", archivedAt: null },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take,
    skip,
    select: { slug: true, title: true, excerpt: true, publishedAt: true, updatedAt: true },
  });

  const brandName = (profile as any)?.businessName || (site as any).name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const [hostedBrandFont, appearance] = await Promise.all([
    getHostedBrandFont(String((site as any).ownerId)),
    getBlogAppearance(String((site as any).ownerId)),
  ]);

  const titleFont = resolveHostedFont({
    rawFontKey: appearance.useBrandFont ? "brand" : appearance.titleFontKey,
    brandFontFamily: hostedBrandFont.fontFamily,
    brandGoogleImportCss: hostedBrandFont.googleCss,
  });
  const bodyFont = resolveHostedFont({
    rawFontKey: appearance.useBrandFont ? "brand" : appearance.bodyFontKey,
    brandFontFamily: hostedBrandFont.fontFamily,
    brandGoogleImportCss: hostedBrandFont.googleCss,
  });

  const fontCss = (() => {
    const imports = new Set<string>();
    if (titleFont.googleImportCss) imports.add(titleFont.googleImportCss);
    if (bodyFont.googleImportCss) imports.add(bodyFont.googleImportCss);

    const rules: string[] = [];
    if (bodyFont.fontFamily) rules.push(`.pa-blog-root{font-family:${bodyFont.fontFamily};}`);
    if (titleFont.fontFamily) rules.push(`.pa-blog-root .font-brand{font-family:${titleFont.fontFamily};}`);

    const header = Array.from(imports.values()).join("\n");
    const body = rules.join("\n");
    const merged = [header, body].filter(Boolean).join("\n");
    return merged || null;
  })();

  const themeStyle = theme.cssVars;
  const ctaBg = theme.ctaHex;

  return (
    <div
      className="pa-blog-root min-h-screen"
      style={{ ...(themeStyle as any), ...(hostedBrandFont.styleVars as any), backgroundColor: "var(--client-bg)", color: "var(--client-text)" } as any}
    >
      {fontCss ? <style>{fontCss}</style> : null}
      <header
        className="relative z-50 border-b backdrop-blur"
        style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
      >
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

      <HostedPortalAdBanner placement="HOSTED_BLOG_PAGE" siteSlug={siteHandle} ownerId={ownerId} pathOverride="/blogs" />

      <main>
        <section style={{ backgroundColor: "var(--client-primary)" }}>
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="font-brand text-4xl sm:text-5xl" style={{ color: "var(--client-on-primary)" }}>
                blogs
              </div>
              <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--client-on-primary-muted)" }}>
                The latest posts from {brandName}.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={`/${siteHandle}/blogs`}
                  className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-md"
                  style={{ backgroundColor: ctaBg, color: "var(--client-on-accent)" }}
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
                      href={`/${siteHandle}/blogs/${post.slug}`}
                      className="group rounded-3xl border p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--client-muted)" }}>
                        {formatBlogDate(post.publishedAt ?? post.updatedAt)}
                      </div>
                      <div
                        className="mt-2 font-brand text-2xl group-hover:underline"
                        style={{ color: "var(--client-link)" }}
                      >
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
                  href={page > 1 ? `/${siteHandle}/blogs?page=${page - 1}` : `/${siteHandle}/blogs`}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
                    page <= 1 ? "pointer-events-none opacity-50" : ""
                  }`}
                  style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)", color: "var(--client-text)" }}
                >
                  newer
                </Link>

                <div className="text-xs font-semibold" style={{ color: "var(--client-muted)" }}>
                  page {page}
                </div>

                <Link
                  href={`/${siteHandle}/blogs?page=${page + 1}`}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
                    posts.length < take ? "pointer-events-none opacity-50" : ""
                  }`}
                  style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)", color: "var(--client-text)" }}
                >
                  older
                </Link>
              </div>
            </div>

            <aside className="lg:pt-1">
              <div
                className="sticky top-6 rounded-3xl border p-7 shadow-sm"
                style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
              >
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
                  <div className="mt-4">
                    <Link
                      href="/"
                      className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-extrabold shadow-sm"
                      style={{ backgroundColor: ctaBg, color: "var(--client-on-accent)" }}
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

      <footer className="border-t" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm" style={{ color: "var(--client-muted)" }}>
            © {new Date().getFullYear()} {brandName}
            <span className="ml-2" style={{ color: "var(--client-muted)" }}>
              •
            </span>
            <span className="ml-2">
              Powered by{" "}
              <Link href="/" className="font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
                Purely Automation
              </Link>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              purelyautomation.com
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
