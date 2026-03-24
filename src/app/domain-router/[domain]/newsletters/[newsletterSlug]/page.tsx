import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { resolveNewsletterHostedFont, stripLegacyNewsletterFontWrapper } from "@/lib/portalNewsletterFonts";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: Date) {
  return value.toLocaleString();
}

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
  params: Promise<{ domain: string; newsletterSlug: string }>;
}): Promise<Metadata> {
  const { domain, newsletterSlug } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) return {};

  const mapping = await resolveCustomDomain(host);
  if (!mapping || mapping.status !== "VERIFIED") return { title: host };

  const site = await prisma.clientBlogSite
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { id: true, ownerId: true, name: true } })
    .catch(() => null);
  if (!site) return { title: host };

  const newsletter = await prisma.clientNewsletter
    .findFirst({ where: { siteId: site.id, kind: "EXTERNAL", slug: newsletterSlug, status: "SENT" }, select: { title: true, excerpt: true } })
    .catch(() => null);
  if (!newsletter) return { title: host };

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const name = profile?.businessName || site.name;
  return { title: `${newsletter.title} | ${name}`, description: newsletter.excerpt };
}

export default async function CustomDomainNewsletterPage({
  params,
}: {
  params: Promise<{ domain: string; newsletterSlug: string }>;
}) {
  const { domain, newsletterSlug } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification ownerId={mapping.ownerId} />;

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

  const hostedTheme = await getHostedTheme(site.ownerId);

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
    overrides: hostedTheme,
  });

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { siteId: site.id, kind: "EXTERNAL", slug: newsletterSlug, status: "SENT" },
    select: { slug: true, title: true, excerpt: true, content: true, sentAt: true, updatedAt: true },
  });

  if (!newsletter) notFound();

  const brandName = (profile as any)?.businessName || site.name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = theme.cssVars;

  const setup = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId: site.ownerId, serviceSlug: "newsletter" } },
      select: { dataJson: true },
    })
    .catch(() => null);
  const hostedFont = resolveNewsletterHostedFont((setup?.dataJson as any)?.external?.fontKey);
  const hostedBrandFont = await getHostedBrandFont(site.ownerId);

  const blocks = parseBlogContent(stripLegacyNewsletterFontWrapper(newsletter.content));

  return (
    <div
      className={"min-h-screen " + (hostedFont.className || "")}
      style={{ ...(themeStyle as any), ...hostedBrandFont.styleVars, ...(hostedFont.style || {}), backgroundColor: "var(--client-bg)", color: "var(--client-text)" } as any}
    >
      {hostedBrandFont.googleCss ? <style>{hostedBrandFont.googleCss}</style> : null}
      {hostedFont.googleImportCss ? <style>{hostedFont.googleImportCss}</style> : null}
      <header
        className="border-b backdrop-blur"
        style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/newsletters" className="flex items-center gap-3">
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
              href="/newsletters"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold transition hover:brightness-[0.98] sm:inline"
              style={{ color: "var(--client-text)", backgroundColor: "var(--client-soft)" }}
            >
              all newsletters
            </Link>
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

          <div className="mt-12 rounded-3xl p-8" style={{ backgroundColor: "var(--client-soft)" }}>
            <div className="text-2xl" style={{ color: "var(--client-link)" }}>
              Want this kind of consistency?
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--client-text)" }}>
              This newsletter is hosted by Purely Automation.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="https://purelyautomation.com"
                className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-sm"
                style={{ backgroundColor: "var(--client-accent)", color: "var(--client-on-accent)" }}
              >
                learn more
              </a>
              <Link
                href="/newsletters"
                className="inline-flex items-center justify-center rounded-2xl border px-6 py-3 text-base font-bold transition hover:brightness-[0.99]"
                style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)", color: "var(--client-link)" }}
              >
                back to newsletters
              </Link>
            </div>
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
            <Link href="/newsletters" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              newsletters
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
