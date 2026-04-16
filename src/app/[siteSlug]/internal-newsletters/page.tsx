import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { resolveNewsletterHostedFont } from "@/lib/portalNewsletterFonts";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ siteSlug: string }>;
};

function formatDate(value: Date) {
  return value.toLocaleString();
}

export async function generateMetadata(props: PageProps) {
  const { siteSlug } = await props.params;

  try {
    const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
    const site = canUseSlugColumn
      ? await prisma.clientBlogSite.findFirst({
          where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
          select: { ownerId: true, name: true },
        })
      : await (async () => {
          const byId = await prisma.clientBlogSite.findUnique({ where: { id: siteSlug }, select: { ownerId: true, name: true } });
          if (byId) return byId;
          const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
          if (!ownerId) return null;
          return prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { ownerId: true, name: true } });
        })();

    if (!site) return {};

    const profile = await prisma.businessProfile.findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true } });
    const name = profile?.businessName || site.name;

    return {
      title: `${name} | Internal newsletters`,
      description: `Internal newsletters for ${name}.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return {};
  }
}

export default async function ClientInternalNewslettersIndexPage(props: PageProps) {
  const { siteSlug } = await props.params;

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

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId: (site as any).ownerId }, select: profileSelect as any });

  const hostedTheme = await getHostedTheme(String((site as any).ownerId));

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
    overrides: hostedTheme,
  });

  const brandName = (profile as any)?.businessName || (site as any).name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = theme.cssVars;

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: (site as any).ownerId, serviceSlug: "newsletter" } },
    select: { dataJson: true },
  });
  const hostedFont = resolveNewsletterHostedFont((setup?.dataJson as any)?.internal?.fontKey);

  const newsletters = await prisma.clientNewsletter.findMany({
    where: { siteId: site.id, kind: "INTERNAL", status: "SENT" },
    orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: { slug: true, title: true, excerpt: true, sentAt: true, updatedAt: true },
  });

  return (
    <div
      className={"min-h-screen " + (hostedFont.className || "")}
      style={{ ...(themeStyle as any), ...(hostedFont.style || {}), backgroundColor: "var(--client-bg)" } as any}
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

          <Link
            href="/"
            className="rounded-2xl px-4 py-2 text-sm font-bold shadow-sm"
            style={{ backgroundColor: "var(--client-primary)", color: "var(--client-on-primary)" }}
          >
            powered by purely
          </Link>
        </div>
      </header>

      <main>
        <section style={{ backgroundColor: "var(--client-primary)" }}>
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="text-4xl sm:text-5xl" style={{ color: "var(--client-on-primary)" }}>
                internal newsletters
              </div>
              <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--client-on-primary-muted)" }}>
                Team-only updates from {brandName}.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="mx-auto max-w-3xl">
            {newsletters.length === 0 ? (
              <div
                className="rounded-3xl border p-8"
                style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
              >
                <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
                  No internal newsletters yet.
                </div>
                <div className="mt-2 text-sm" style={{ color: "var(--client-muted)" }}>
                  Check back shortly.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {newsletters.map((n) => (
                  <Link
                    key={n.slug}
                    href={`/${siteHandle}/internal-newsletters/${n.slug}`}
                    className="block rounded-3xl border p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
                  >
                    <div
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--client-muted)" }}
                    >
                      {formatDate(n.sentAt ?? n.updatedAt)}
                    </div>
                    <div className="mt-2 text-2xl" style={{ color: "var(--client-link)" }}>
                      {n.title}
                    </div>
                    <div className="mt-3 text-sm leading-relaxed" style={{ color: "var(--client-text)" }}>
                      {n.excerpt}
                    </div>
                    <div className="mt-5 text-sm font-bold" style={{ color: "var(--client-link)" }}>
                      read
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm" style={{ color: "var(--client-muted)" }}>
            © {new Date().getFullYear()} {brandName}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={`/${siteHandle}/internal-newsletters`}
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--client-link)" }}
            >
              internal newsletters
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
