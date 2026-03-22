import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { resolveNewsletterHostedFont } from "@/lib/portalNewsletterFonts";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: Date) {
  return value.toLocaleString();
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
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) return {};

  const mapping = await resolveCustomDomain(host);
  if (!mapping) return { title: host };
  if (mapping.status !== "VERIFIED") {
    return { title: "Domain pending verification", robots: { index: false, follow: false } };
  }

  const site = await prisma.clientBlogSite
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { name: true, ownerId: true } })
    .catch(() => null);
  if (!site) return { title: host, robots: { index: false, follow: false } };

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const name = profile?.businessName || site.name;
  return {
    title: `${name} | Internal newsletters`,
    description: `Internal newsletters for ${name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function CustomDomainInternalNewslettersIndexPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification />;

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

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
  });

  const brandName = (profile as any)?.businessName || site.name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = theme.cssVars;

  const setup = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId: site.ownerId, serviceSlug: "newsletter" } },
      select: { dataJson: true },
    })
    .catch(() => null);
  const hostedFont = resolveNewsletterHostedFont((setup?.dataJson as any)?.internal?.fontKey);
  const hostedBrandFont = await getHostedBrandFont(site.ownerId);

  const newsletters = await prisma.clientNewsletter.findMany({
    where: { siteId: site.id, kind: "INTERNAL", status: "SENT" },
    orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: { slug: true, title: true, excerpt: true, sentAt: true, updatedAt: true },
  });

  return (
    <div
      className={"min-h-screen bg-white " + (hostedFont.className || "")}
      style={{ ...(themeStyle as any), ...hostedBrandFont.styleVars, ...(hostedFont.style || {}) } as any}
    >
      {hostedBrandFont.googleCss ? <style>{hostedBrandFont.googleCss}</style> : null}
      {hostedFont.googleImportCss ? <style>{hostedFont.googleImportCss}</style> : null}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/internal-newsletters" className="flex items-center gap-3">
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
            <a
              href="https://purelyautomation.com"
              className="rounded-2xl px-4 py-2 text-sm font-bold shadow-sm"
              style={{ backgroundColor: "var(--client-primary)", color: "var(--client-on-primary)" }}
            >
              powered by purely
            </a>
          </div>
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
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-8">
                <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
                  No internal newsletters yet.
                </div>
                <div className="mt-2 text-sm text-zinc-600">Check back shortly.</div>
              </div>
            ) : (
              <div className="space-y-4">
                {newsletters.map((n) => (
                  <Link
                    key={n.slug}
                    href={`/internal-newsletters/${n.slug}`}
                    className="block rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {formatDate(n.sentAt ?? n.updatedAt)}
                    </div>
                    <div className="mt-2 text-2xl" style={{ color: "var(--client-link)" }}>
                      {n.title}
                    </div>
                    <div className="mt-3 text-sm leading-relaxed text-zinc-700">{n.excerpt}</div>
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

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {brandName}</div>
          <div className="flex items-center gap-4">
            <Link
              href="/internal-newsletters"
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--client-link)" }}
            >
              internal newsletters
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
