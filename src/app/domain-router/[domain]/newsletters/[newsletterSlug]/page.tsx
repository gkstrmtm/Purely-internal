import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { resolveNewsletterHostedFont, stripLegacyNewsletterFontWrapper } from "@/lib/portalNewsletterFonts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

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

  const brandPrimary = normalizeHex((profile as any)?.brandPrimaryHex) ?? "#1d4ed8";
  const brandAccent = normalizeHex((profile as any)?.brandAccentHex) ?? "#f472b6";
  const brandText = normalizeHex((profile as any)?.brandTextHex) ?? "#18181b";

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { siteId: site.id, kind: "EXTERNAL", slug: newsletterSlug, status: "SENT" },
    select: { slug: true, title: true, excerpt: true, content: true, sentAt: true, updatedAt: true },
  });

  if (!newsletter) notFound();

  const brandName = (profile as any)?.businessName || site.name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const setup = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId: site.ownerId, serviceSlug: "newsletter" } },
      select: { dataJson: true },
    })
    .catch(() => null);
  const hostedFont = resolveNewsletterHostedFont((setup?.dataJson as any)?.external?.fontKey);

  const blocks = parseBlogContent(stripLegacyNewsletterFontWrapper(newsletter.content));

  return (
    <div
      className={"min-h-screen bg-white " + (hostedFont.className || "")}
      style={{ ...(themeStyle as any), ...(hostedFont.style || {}) } as any}
    >
      {hostedFont.googleImportCss ? <style>{hostedFont.googleImportCss}</style> : null}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
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
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
            >
              all newsletters
            </Link>
            <a
              href="https://purelyautomation.com"
              className="rounded-2xl px-4 py-2 text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: "var(--client-primary)" }}
            >
              powered by purely
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {formatDate(newsletter.sentAt ?? newsletter.updatedAt)}
          </div>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl" style={{ color: "var(--client-primary)" }}>
            {newsletter.title}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">{newsletter.excerpt}</p>

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

          <div className="mt-12 rounded-3xl p-8" style={{ backgroundColor: "rgba(29,78,216,0.06)" }}>
            <div className="text-2xl" style={{ color: "var(--client-primary)" }}>
              Want this kind of consistency?
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">This newsletter is hosted by Purely Automation.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="https://purelyautomation.com"
                className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-sm"
                style={{ backgroundColor: "var(--client-accent)", color: "var(--client-primary)" }}
              >
                learn more
              </a>
              <Link
                href="/newsletters"
                className="inline-flex items-center justify-center rounded-2xl border bg-white px-6 py-3 text-base font-bold hover:bg-zinc-50"
                style={{ borderColor: "rgba(29,78,216,0.15)", color: "var(--client-primary)" }}
              >
                back to newsletters
              </Link>
            </div>
          </div>

          <div className="mt-10 text-xs text-zinc-500">Powered by Purely Automation.</div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {brandName}</div>
          <div className="flex items-center gap-4">
            <Link href="/newsletters" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              newsletters
            </Link>
            <a href="https://purelyautomation.com" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              purelyautomation.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
