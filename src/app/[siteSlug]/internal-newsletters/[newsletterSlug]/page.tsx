import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ siteSlug: string; newsletterSlug: string }> };

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

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

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { siteId: site.id, kind: "INTERNAL", slug: newsletterSlug, status: "SENT" },
    select: { slug: true, title: true, excerpt: true, content: true, sentAt: true, updatedAt: true },
  });

  if (!newsletter) notFound();

  const brandName = (profile as any)?.businessName || (site as any).name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const blocks = parseBlogContent(newsletter.content);

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
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
            <div className="hidden rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700 sm:inline">
              internal
            </div>
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
            {formatDate(newsletter.sentAt ?? newsletter.updatedAt)}
          </div>
          <h1 className="mt-3 font-brand text-4xl leading-tight sm:text-5xl" style={{ color: "var(--client-primary)" }}>
            {newsletter.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">{newsletter.excerpt}</p>

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

          <div className="mt-10 text-xs text-zinc-500">Powered by Purely Automation.</div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {brandName}</div>
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
