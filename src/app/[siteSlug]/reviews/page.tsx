import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";
import { PublicReviewsClient } from "./PublicReviewsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return null;
  return v;
}

export default async function PublicReviewsPage({ params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;

  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const blogSite = canUseSlugColumn
    ? await prisma.clientBlogSite.findFirst(
        {
          where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
          select: { id: true, name: true, ownerId: true, slug: true },
        } as any,
      )
    : await (async () => {
        const byId = await prisma.clientBlogSite.findUnique({
          where: { id: siteSlug },
          select: { id: true, name: true, ownerId: true },
        });
        if (byId) return byId;
        const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
        if (!ownerId) return null;
        return prisma.clientBlogSite.findUnique({
          where: { ownerId },
          select: { id: true, name: true, ownerId: true },
        });
      })();

  const bookingSite = !blogSite
    ? await prisma.portalBookingSite.findUnique({ where: { slug: siteSlug }, select: { ownerId: true, slug: true, title: true } })
    : null;

  const ownerId = blogSite ? String((blogSite as any).ownerId) : bookingSite ? String(bookingSite.ownerId) : null;
  if (!ownerId) notFound();

  const siteHandle = blogSite
    ? (canUseSlugColumn ? String((blogSite as any).slug ?? (blogSite as any).id) : siteSlug)
    : String(bookingSite?.slug || siteSlug);

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

  const [profile, data] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { ownerId },
      select: profileSelect as any,
    }),
    getReviewRequestsServiceData(ownerId),
  ]);

  const settings = data.settings;
  if (!settings.publicPage.enabled) return notFound();

  const brandPrimary = normalizeHex((profile as any)?.brandPrimaryHex) ?? "#1d4ed8";
  const brandAccent = normalizeHex((profile as any)?.brandAccentHex) ?? "#f472b6";
  const brandText = normalizeHex((profile as any)?.brandTextHex) ?? "#18181b";

  const businessName = (profile as any)?.businessName?.trim() || (blogSite as any)?.name || bookingSite?.title || "Reviews";
  const logoUrl = (profile as any)?.logoUrl || null;
  const title = settings.publicPage.title || "Reviews";
  const description = settings.publicPage.description || "";

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const reviews = await prisma.portalReview.findMany({
    where: { ownerId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, rating: true, name: true, body: true, photoUrls: true, createdAt: true },
  });

  return (
    <div className="min-h-screen bg-zinc-50" style={themeStyle}>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: "var(--client-primary)" }} />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">{businessName}</div>
              <div className="text-xs text-neutral-500">{siteHandle}</div>
            </div>
          </div>

          {blogSite ? (
            <Link className="text-sm underline" href={`/${siteHandle}/blogs`}>
              Blogs
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-zinc-900">{title}</h1>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-900">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--client-accent)" }} />
              Verified by Purely
            </div>
          </div>
          {description ? <p className="max-w-2xl text-sm text-zinc-600">{description}</p> : null}
        </div>

        {Array.isArray(settings.publicPage.photoUrls) && settings.publicPage.photoUrls.length ? (
          <div className="mt-6">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {settings.publicPage.photoUrls.slice(0, 12).map((u) => (
                <div key={u} className="h-[180px] w-[280px] shrink-0 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <PublicReviewsClient
          siteHandle={siteHandle}
          brandPrimary={brandPrimary}
          destinations={settings.destinations}
          initialReviews={reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            name: r.name,
            body: r.body,
            photoUrls: r.photoUrls,
            createdAt: r.createdAt.toISOString(),
          }))}
        />

        <div className="mt-10 text-xs text-zinc-500">© {new Date().getFullYear()} {businessName}</div>
      </main>
    </div>
  );
}
