import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { resolveNewsletterHostedFont, stripLegacyNewsletterFontWrapper } from "@/lib/portalNewsletterFonts";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ siteSlug: string; newsletterSlug: string }> };

function formatDate(value: Date) {
  return value.toLocaleString();
}

export async function generateMetadata(props: PageProps) {
  const { siteSlug, newsletterSlug } = await props.params;

  try {
    const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
    const site = canUseSlugColumn
      ? await prisma.clientBlogSite.findFirst({
          where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
          select: { id: true, ownerId: true, name: true, slug: true },
        })
      : await (async () => {
          const byId = await prisma.clientBlogSite.findUnique({ where: { id: siteSlug }, select: { id: true, ownerId: true, name: true } });
          if (byId) return byId;
          const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
          if (!ownerId) return null;
          return prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, ownerId: true, name: true } });
        })();

    if (!site) return {};

    const newsletter = await prisma.clientNewsletter.findFirst({
      where: { siteId: site.id, kind: "INTERNAL", slug: newsletterSlug, status: "SENT" },
      select: { title: true, excerpt: true },
    });

    if (!newsletter) return {};

    const profile = await prisma.businessProfile.findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true } });
    const name = profile?.businessName || site.name;

    return {
      title: `${newsletter.title} | ${name} (Internal)`,
      description: newsletter.excerpt,
      robots: { index: false, follow: false },
    };
  } catch {
    return {};
  }
}

export default async function ClientInternalNewsletterPage(props: PageProps) {
  const { siteSlug, newsletterSlug } = await props.params;

  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const site = canUseSlugColumn
    ? await prisma.clientBlogSite.findFirst({
        where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
        select: { id: true, name: true, ownerId: true, slug: true },
      })
    : await (async () => {
        const byId = await prisma.clientBlogSite.findUnique({ where: { id: siteSlug }, select: { id: true, name: true, ownerId: true } });
        if (byId) return byId;
        const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
        if (!ownerId) return null;
        return prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, name: true, ownerId: true } });
      })();

  if (!site) notFound();

  const siteHandle = canUseSlugColumn ? ((site as any).slug ?? (site as any).id) : siteSlug;

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

  const hostedTheme = await getHostedTheme(String((site as any).ownerId));

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
    overrides: hostedTheme,
  });

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { siteId: site.id, kind: "INTERNAL", slug: newsletterSlug, status: "SENT" },
    select: { slug: true, title: true, excerpt: true, content: true, sentAt: true, updatedAt: true },
  });

  if (!newsletter) notFound();

  const brandName = (profile as any)?.businessName || (site as any).name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = theme.cssVars;

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: (site as any).ownerId, serviceSlug: "newsletter" } },
    select: { dataJson: true },
  });
  const hostedFont = resolveNewsletterHostedFont((setup?.dataJson as any)?.internal?.fontKey);

  const blocks = parseBlogContent(stripLegacyNewsletterFontWrapper(newsletter.content));

  return (
    <div
      className={"min-h-screen " + (hostedFont.className || "")}
      style={{ ...(themeStyle as any), ...(hostedFont.style || {}), backgroundColor: "var(--client-bg)", color: "var(--client-text)" } as any}
    >
      {hostedFont.googleImportCss ? <style>{hostedFont.googleImportCss}</style> : null}
      <header
        className="border-b backdrop-blur"
        style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href={`/${siteHandle}/internal-newsletters`} className="flex items-center gap-3">
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
            <div
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold sm:inline"
              style={{ backgroundColor: "var(--client-soft)", color: "var(--client-text)" }}
            >
              internal
            </div>
            <Link
              href="/"
              className="rounded-2xl px-4 py-2 text-sm font-bold shadow-sm"
              style={{ backgroundColor: "var(--client-primary)", color: "var(--client-on-primary)" }}
            >
              powered by purely
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--client-muted)" }}>
            {formatDate(newsletter.sentAt ?? newsletter.updatedAt)}
          </div>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl" style={{ color: "var(--client-link)" }}>
            {newsletter.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed" style={{ color: "var(--client-text)" }}>
            {newsletter.excerpt}
          </p>

          <div className="mt-10 space-y-6">
            {blocks.map((b, idx) => {
              if (b.type === "h2") {
                return (
                  <h2 key={idx} className="pt-4 text-2xl" style={{ color: "var(--client-text)" }}>
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
                  <div
                    key={idx}
                    className="overflow-hidden rounded-3xl border"
                    style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-soft)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.src} alt={b.alt || ""} className="h-auto w-full object-cover" />
                  </div>
                );
              }
              if (b.type === "ul") {
                return (
                  <ul
                    key={idx}
                    className="list-disc space-y-2 pl-6 text-sm leading-relaxed"
                    style={{ color: "var(--client-text)" }}
                  >
                    {b.items.map((item, itemIdx) => (
                      <li key={itemIdx} dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(item) }} />
                    ))}
                  </ul>
                );
              }
              return (
                <p key={idx} className="text-sm leading-relaxed" style={{ color: "var(--client-text)" }}>
                  <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
                </p>
              );
            })}
          </div>

          <div className="mt-10 text-xs" style={{ color: "var(--client-muted)" }}>
            Powered by Purely Automation.
          </div>
        </div>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm" style={{ color: "var(--client-muted)" }}>
            © {new Date().getFullYear()} {brandName}
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
