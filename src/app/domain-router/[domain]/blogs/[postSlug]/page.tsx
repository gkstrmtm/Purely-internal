import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { formatBlogDate, inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { getBlogAppearance } from "@/lib/blogAppearance";
import { resolveHostedFont } from "@/lib/portalHostedFonts";
import { pickReadableAccentColorOnWhite, pickReadableTextColor, rgba } from "@/lib/colorUtils";
import { HostedPortalAdBanner } from "@/components/HostedPortalAdBanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

function PendingVerification() {
  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900">Domain pending verification</h1>
      <p className="mt-2 text-sm text-zinc-700">This domain is saved, but not verified yet.</p>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string; postSlug: string }>;
}): Promise<Metadata> {
  const { domain, postSlug } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) return {};

  const mapping = await resolveCustomDomain(host);
  if (!mapping || mapping.status !== "VERIFIED") return { title: host };

  const site = await prisma.clientBlogSite
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { id: true, ownerId: true, name: true } })
    .catch(() => null);
  if (!site) return { title: host };

  const post = await prisma.clientBlogPost
    .findFirst({ where: { siteId: site.id, slug: postSlug, status: "PUBLISHED", archivedAt: null }, select: { title: true, excerpt: true } })
    .catch(() => null);
  if (!post) return { title: host };

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const name = profile?.businessName || site.name;
  return { title: `${post.title} | ${name}`, description: post.excerpt };
}

export default async function CustomDomainBlogPostPage({
  params,
}: {
  params: Promise<{ domain: string; postSlug: string }>;
}) {
  const { domain, postSlug } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification />;

  const site = await prisma.clientBlogSite
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { id: true, name: true, ownerId: true } })
    .catch(() => null);
  if (!site) notFound();

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

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: site.ownerId }, select: profileSelect as any })
    .catch(() => null);

  const [hostedBrandFont, appearance] = await Promise.all([
    getHostedBrandFont(site.ownerId),
    getBlogAppearance(site.ownerId),
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

  const brandPrimary = normalizeHex((profile as any)?.brandPrimaryHex) ?? "#1d4ed8";
  const brandAccent = normalizeHex((profile as any)?.brandAccentHex) ?? "#f472b6";
  const brandText = normalizeHex((profile as any)?.brandTextHex) ?? "#18181b";

  const post = await prisma.clientBlogPost.findFirst({
    where: { siteId: site.id, slug: postSlug, status: "PUBLISHED", archivedAt: null },
    select: { slug: true, title: true, excerpt: true, content: true, publishedAt: true, updatedAt: true },
  });
  if (!post) notFound();

  const brandName = (profile as any)?.businessName || site.name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
    ["--client-on-accent" as any]: pickReadableTextColor({
      backgroundHex: brandAccent,
      preferredTextHex: brandText,
    }),
    ["--client-link" as any]: pickReadableAccentColorOnWhite({
      accentHex: brandPrimary,
      fallbackHex: pickReadableTextColor({ backgroundHex: "#ffffff", preferredTextHex: brandText, minContrast: 4.5 }),
      minContrast: 3.0,
    }),
    ["--client-soft" as any]: rgba(brandPrimary, 0.08),
    ["--client-border" as any]: rgba(brandPrimary, 0.18),
  } as CSSProperties;

  const blocks = parseBlogContent(post.content);

  return (
    <div className="pa-blog-root min-h-screen bg-white" style={{ ...(themeStyle as any), ...hostedBrandFont.styleVars } as any}>
      {fontCss ? <style>{fontCss}</style> : null}
      <header className="relative z-50 border-b border-zinc-200 bg-white/80 backdrop-blur">
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

          <div className="flex items-center gap-3">
            <Link
              href="/blogs"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
            >
              all posts
            </Link>
          </div>
        </div>
      </header>

      <HostedPortalAdBanner placement="HOSTED_BLOG_PAGE" domain={host} ownerId={mapping.ownerId} pathOverride={`/blogs/${postSlug}`} />

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {formatBlogDate(post.publishedAt ?? post.updatedAt)}
          </div>
          <h1 className="mt-3 font-brand text-4xl leading-tight sm:text-5xl" style={{ color: "var(--client-link)" }}>
            {post.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">{post.excerpt}</p>

          <div className="mt-10 space-y-6">
            {blocks.map((b, idx) => {
              if (b.type === "h2") {
                return (
                  <h2 key={idx} className="pt-4 font-brand text-2xl" style={{ color: "var(--client-text)" }}>
                    <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
                  </h2>
                );
              }
              if (b.type === "h3") {
                return (
                  <h3 key={idx} className="pt-2 text-lg font-bold" style={{ color: "var(--client-text)" }}>
                    <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
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
                      <li key={itemIdx} dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(item) }} />
                    ))}
                  </ul>
                );
              }
              return (
                <p key={idx} className="text-sm leading-relaxed text-zinc-700">
                  <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
                </p>
              );
            })}
          </div>

          <div className="mt-12 rounded-3xl p-8" style={{ backgroundColor: "var(--client-soft)" }}>
            <div className="font-brand text-2xl" style={{ color: "var(--client-link)" }}>
              Want this kind of consistency?
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">This blog is hosted by Purely Automation.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="https://purelyautomation.com"
                className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-sm"
                style={{ backgroundColor: "var(--client-accent)", color: "var(--client-on-accent)" }}
              >
                learn more
              </a>
              <Link
                href="/blogs"
                className="inline-flex items-center justify-center rounded-2xl border bg-white px-6 py-3 text-base font-bold hover:bg-zinc-50"
                style={{ borderColor: "var(--client-border)", color: "var(--client-link)" }}
              >
                back to posts
              </Link>
            </div>
          </div>

        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} {brandName}
            <span className="ml-2 text-zinc-400">•</span>
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
            <a href="https://purelyautomation.com" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              purelyautomation.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
