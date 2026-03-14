import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { prisma } from "@/lib/db";
import { formatBlogDate } from "@/lib/blog";
import { hasPublicColumn } from "@/lib/dbSchema";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { getBlogAppearance } from "@/lib/blogAppearance";
import { resolveHostedFont } from "@/lib/portalHostedFonts";
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
  if (mapping.status !== "VERIFIED") return <PendingVerification />;

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

  const posts = await prisma.clientBlogPost.findMany({
    where: { siteId: site.id, status: "PUBLISHED", archivedAt: null },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take,
    skip,
    select: { slug: true, title: true, excerpt: true, publishedAt: true, updatedAt: true },
  });

  const brandName = (profile as any)?.businessName || site.name;
  const logoUrl = (profile as any)?.logoUrl || null;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const coralCta = "#fb7185";

  return (
    <div className="pa-blog-root min-h-screen bg-white" style={{ ...(themeStyle as any), ...hostedBrandFont.styleVars } as any}>
      {fontCss ? <style>{fontCss}</style> : null}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
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

          <Link
            href="https://purelyautomation.com"
            className="rounded-2xl px-4 py-2 text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: "var(--client-primary)" }}
          >
            powered by purely
          </Link>
        </div>
      </header>

      <HostedPortalAdBanner placement="HOSTED_BLOG_PAGE" />

      <main>
        <section style={{ backgroundColor: "var(--client-primary)" }}>
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="font-brand text-4xl text-white sm:text-5xl">blogs</div>
              <p className="mt-4 text-lg leading-relaxed text-white/90">The latest posts from {brandName}.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/blogs"
                  className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-extrabold shadow-md"
                  style={{ backgroundColor: coralCta, color: "#fff" }}
                >
                  browse posts
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="font-brand text-3xl" style={{ color: "var(--client-primary)" }}>
                latest posts
              </div>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">Fresh updates and helpful ideas.</p>

              <div className="mt-8 grid gap-6">
                {posts.length === 0 ? (
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-8">
                    <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
                      New posts are coming soon.
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">Check back shortly.</div>
                  </div>
                ) : (
                  posts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blogs/${post.slug}`}
                      className="group rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {formatBlogDate(post.publishedAt ?? post.updatedAt)}
                      </div>
                      <div
                        className="mt-2 font-brand text-2xl group-hover:underline"
                        style={{ color: "var(--client-primary)" }}
                      >
                        {post.title}
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-zinc-700">{post.excerpt}</div>
                      <div className="mt-5 text-sm font-bold" style={{ color: "var(--client-primary)" }}>
                        read more
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <div className="mt-10 flex items-center justify-between">
                <Link
                  href={page > 1 ? `/blogs?page=${page - 1}` : `/blogs`}
                  className={`rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 ${
                    page <= 1 ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  newer
                </Link>

                <div className="text-xs font-semibold text-zinc-500">page {page}</div>

                <Link
                  href={`/blogs?page=${page + 1}`}
                  className={`rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 ${
                    posts.length < take ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  older
                </Link>
              </div>
            </div>

            <aside className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">More</div>
              <div className="mt-4 space-y-2">
                <Link href="/newsletters" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                  newsletters
                </Link>
                <Link href="/reviews" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                  reviews
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {brandName}</div>
          <div className="flex items-center gap-4">
            <Link href="/blogs" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              blogs
            </Link>
            <a
              href="https://purelyautomation.com"
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--client-primary)" }}
            >
              purelyautomation.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
