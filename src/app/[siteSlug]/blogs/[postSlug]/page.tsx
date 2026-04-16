import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getBlogAppearance } from "@/lib/blogAppearance";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { resolveHostedFont } from "@/lib/portalHostedFonts";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";
import { HostedPortalAdBanner } from "@/components/HostedPortalAdBanner";
import { renderHostedCustomHtmlTemplate } from "@/lib/hostedPageRuntime";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { HostedBlogPostArticle } from "@/components/hosted/HostedBlogPostArticle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BLOG_POST_BODY_TOKEN = "{{BLOG_POST_BODY}}";

type PageProps = { params: Promise<{ siteSlug: string; postSlug: string }> };

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

  const post = await prisma.clientBlogPost.findFirst({
    where: { siteId: site.id, slug: postSlug, status: "PUBLISHED", archivedAt: null },
    select: { slug: true, title: true, excerpt: true, content: true, publishedAt: true, updatedAt: true },
  });

  if (!post) notFound();

  const hostedBlogPostTemplate = await (prisma as any).hostedPageDocument.findFirst({
    where: { ownerId, service: "BLOGS", pageKey: "blogs_post_template" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, editorMode: true, blocksJson: true, customHtml: true },
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
  const hostedBlocks = coerceBlocksJson(hostedBlogPostTemplate?.blocksJson);
  const hasHostedBlocks = Boolean(hostedBlogPostTemplate?.editorMode === "BLOCKS" && hostedBlocks.length);
  const hasHostedPostBodyBlock = hostedBlocks.some((block) => block.type === "hostedBlogPostBody");
  const hasHostedCustomHtml = Boolean(
    hostedBlogPostTemplate?.editorMode === "CUSTOM_HTML" && typeof hostedBlogPostTemplate?.customHtml === "string" && hostedBlogPostTemplate.customHtml.trim(),
  );

  const postArticle = <HostedBlogPostArticle post={post} blogsHref={`/${siteHandle}/blogs`} learnMoreHref="/" />;

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

          <div className="flex items-center gap-3">
            <Link
              href={`/${siteHandle}/blogs`}
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold sm:inline"
              style={{ color: "var(--client-muted)" }}
            >
              all posts
            </Link>
          </div>
        </div>
      </header>

      <HostedPortalAdBanner
        placement="HOSTED_BLOG_PAGE"
        siteSlug={siteHandle}
        ownerId={ownerId}
        pathOverride={`/blogs/${postSlug}`}
      />

      <main className="mx-auto max-w-6xl px-6 py-14">
        {hasHostedCustomHtml ? (
          renderHostedCustomHtmlTemplate({
            html: hostedBlogPostTemplate.customHtml,
            textTokens: {
              BUSINESS_NAME: brandName,
              PAGE_TITLE: post.title,
              PAGE_DESCRIPTION: post.excerpt ?? `Read ${post.title} from ${brandName}.`,
              SITE_HANDLE: String(siteHandle),
            },
            runtimeTokens: { [BLOG_POST_BODY_TOKEN]: postArticle },
            fallback: postArticle,
          })
        ) : hasHostedBlocks ? (
          <>
            <div className="px-6 pb-10">{renderCreditFunnelBlocks({ blocks: hostedBlocks, basePath: "", context: { hostedRuntimeBlocks: { blogPostBody: postArticle } } })}</div>
            {!hasHostedPostBodyBlock ? postArticle : null}
          </>
        ) : (
          postArticle
        )}
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
            <Link href={`/${siteHandle}/blogs`} className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              blogs
            </Link>
            <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              purelyautomation.com
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
