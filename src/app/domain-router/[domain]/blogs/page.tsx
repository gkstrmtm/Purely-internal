import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { formatBlogDate } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { getBlogAppearance } from "@/lib/blogAppearance";
import { resolveHostedFont } from "@/lib/portalHostedFonts";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";
import { HostedPortalAdBanner } from "@/components/HostedPortalAdBanner";
import { renderHostedCustomHtmlTemplate } from "@/lib/hostedPageRuntime";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { HostedBlogArchiveSection } from "@/components/hosted/HostedBlogArchiveSection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BLOGS_ARCHIVE_TOKEN = "{{BLOGS_ARCHIVE}}";

async function PendingVerification({ ownerId }: { ownerId: string }) {
  const [hostedBrandFont, hostedTheme] = await Promise.all([
    getHostedBrandFont(ownerId).catch(() => null),
    getHostedTheme(ownerId).catch(() => null),
  ]);

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: null,
    brandSecondaryHex: null,
    brandAccentHex: null,
    brandTextHex: null,
    overrides: hostedTheme,
  });

  return (
    <div
      className="min-h-screen"
      style={{
        ...(theme.cssVars as any),
        ...((hostedBrandFont as any)?.styleVars ?? {}),
        backgroundColor: "var(--client-bg)",
        color: "var(--client-text)",
      }}
    >
      {(hostedBrandFont as any)?.googleCss ? <style>{(hostedBrandFont as any).googleCss}</style> : null}
      <main className="mx-auto w-full max-w-2xl p-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--client-text)" }}>
          Domain pending verification
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--client-muted)" }}>
          This domain is saved, but not verified yet.
        </p>
      </main>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) return {};

  const mapping = await resolveCustomDomain(host);
  if (!mapping) return { title: host };
  if (mapping.status !== "VERIFIED") return { title: "Domain pending verification" };

  const site = await prisma.clientBlogSite
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { name: true, ownerId: true } })
    .catch(() => null);
  if (!site) return { title: host };

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const name = profile?.businessName || site.name;
  return { title: `${name} | Blogs`, description: `Latest blog posts from ${name}.` };
}

export default async function CustomDomainBlogsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams?: Promise<{ page?: string }>;
}) {
  const { domain } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification ownerId={mapping.ownerId} />;

  const spUnknown: unknown = (await searchParams?.catch(() => ({}))) ?? {};
  const sp = spUnknown && typeof spUnknown === "object" ? (spUnknown as Record<string, unknown>) : {};
  const pageRaw = typeof sp.page === "string" ? sp.page : "1";
  const page = Math.max(1, Number.parseInt(pageRaw || "1", 10) || 1);
  const take = 50;
  const skip = (page - 1) * take;

  const site = await prisma.clientBlogSite
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { id: true, name: true, ownerId: true } })
    .catch(() => null);
  if (!site) notFound();

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

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: site.ownerId }, select: profileSelect as any })
    .catch(() => null);

  const [hostedBrandFont, appearance, hostedTheme] = await Promise.all([
    getHostedBrandFont(site.ownerId),
    getBlogAppearance(site.ownerId),
    getHostedTheme(site.ownerId),
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

  const hostedBlogsIndex = await (prisma as any).hostedPageDocument.findFirst({
    where: { ownerId: site.ownerId, service: "BLOGS", pageKey: "blogs_index" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, editorMode: true, blocksJson: true, customHtml: true },
  });

  const brandName = (profile as any)?.businessName || site.name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = theme.cssVars;
  const ctaBg = theme.ctaHex;
  const hostedBlocks = coerceBlocksJson(hostedBlogsIndex?.blocksJson);
  const hasHostedBlocks = Boolean(hostedBlogsIndex?.editorMode === "BLOCKS" && hostedBlocks.length);
  const hasHostedCustomHtml = Boolean(
    hostedBlogsIndex?.editorMode === "CUSTOM_HTML" && typeof hostedBlogsIndex?.customHtml === "string" && hostedBlogsIndex.customHtml.trim(),
  );

  const blogArchiveSection = <HostedBlogArchiveSection brandName={brandName} posts={posts} page={page} pageSize={take} basePath="/blogs" />;

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
          <Link href="/blogs" className="flex items-center gap-3">
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

      <HostedPortalAdBanner placement="HOSTED_BLOG_PAGE" domain={host} ownerId={mapping.ownerId} pathOverride="/blogs" />

      <main>
        {hasHostedCustomHtml ? (
          renderHostedCustomHtmlTemplate({
            html: hostedBlogsIndex.customHtml,
            textTokens: {
              BUSINESS_NAME: brandName,
              PAGE_TITLE: "Blogs",
              PAGE_DESCRIPTION: `The latest posts from ${brandName}.`,
              SITE_HANDLE: host,
            },
            runtimeTokens: { [BLOGS_ARCHIVE_TOKEN]: blogArchiveSection },
            fallback: blogArchiveSection,
          })
        ) : hasHostedBlocks ? (
          <>
            <div className="mx-auto max-w-6xl px-6 py-10">{renderCreditFunnelBlocks({ blocks: hostedBlocks, basePath: "" })}</div>
            {blogArchiveSection}
          </>
        ) : (
          <>
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
                      href="/blogs"
                      className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-md"
                      style={{ backgroundColor: ctaBg, color: "var(--client-on-accent)" }}
                    >
                      browse posts
                    </Link>
                  </div>
                </div>
              </div>
            </section>
            {blogArchiveSection}
          </>
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
              <a
                href="https://purelyautomation.com"
                className="font-semibold hover:underline"
                style={{ color: "var(--client-link)" }}
              >
                Purely Automation
              </a>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/blogs" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              blogs
            </Link>
            <a
              href="https://purelyautomation.com"
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--client-link)" }}
            >
              purelyautomation.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
