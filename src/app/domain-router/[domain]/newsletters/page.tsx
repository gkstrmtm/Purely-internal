import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { resolveNewsletterHostedFont } from "@/lib/portalNewsletterFonts";

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
  return { title: `${name} | Newsletters`, description: `Latest newsletters from ${name}.` };
}

export default async function CustomDomainNewslettersIndexPage({
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

  const newsletters = await prisma.clientNewsletter.findMany({
    where: { siteId: site.id, kind: "EXTERNAL", status: "SENT" },
    orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: { slug: true, title: true, excerpt: true, sentAt: true, updatedAt: true },
  });

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

          <a
            href="https://purelyautomation.com"
            className="rounded-2xl px-4 py-2 text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: "var(--client-primary)" }}
          >
            powered by purely
          </a>
        </div>
      </header>

      <main>
        <section style={{ backgroundColor: "var(--client-primary)" }}>
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="text-4xl text-white sm:text-5xl">newsletters</div>
              <p className="mt-4 text-lg leading-relaxed text-white/90">Latest updates from {brandName}.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="mx-auto max-w-3xl">
            {newsletters.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-8">
                <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
                  No newsletters yet.
                </div>
                <div className="mt-2 text-sm text-zinc-600">Check back shortly.</div>
              </div>
            ) : (
              <div className="space-y-4">
                {newsletters.map((n) => (
                  <Link
                    key={n.slug}
                    href={`/newsletters/${n.slug}`}
                    className="block rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {formatDate(n.sentAt ?? n.updatedAt)}
                    </div>
                    <div className="mt-2 text-2xl" style={{ color: "var(--client-primary)" }}>
                      {n.title}
                    </div>
                    <div className="mt-3 text-sm leading-relaxed text-zinc-700">{n.excerpt}</div>
                    <div className="mt-5 text-sm font-bold" style={{ color: "var(--client-primary)" }}>
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
