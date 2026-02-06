import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";

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
  const site = canUseSlugColumn
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

  const [profile, data] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { ownerId: (site as any).ownerId },
      select: profileSelect as any,
    }),
    getReviewRequestsServiceData((site as any).ownerId),
  ]);

  const settings = data.settings;
  if (!settings.publicPage.enabled) return notFound();

  const brandPrimary = normalizeHex((profile as any)?.brandPrimaryHex) ?? "#1d4ed8";
  const brandAccent = normalizeHex((profile as any)?.brandAccentHex) ?? "#f472b6";
  const brandText = normalizeHex((profile as any)?.brandTextHex) ?? "#18181b";

  const businessName = (profile as any)?.businessName?.trim() || (site as any).name || "Reviews";
  const logoUrl = (profile as any)?.logoUrl || null;
  const title = settings.publicPage.title || "Reviews";
  const description = settings.publicPage.description || "";

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-white" style={themeStyle}>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: "var(--client-primary)" }} />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{businessName}</div>
              <div className="text-xs text-neutral-500">{siteHandle}</div>
            </div>
          </div>

          <Link className="text-sm underline" href={`/${siteHandle}/blogs`}>
            Blogs
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{title}</h1>
            {settings.publicPage.verifiedBadge ? (
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--client-accent)" }} />
                Verified by Purely
              </div>
            ) : null}
          </div>
          {description ? <p className="max-w-2xl text-sm text-neutral-600">{description}</p> : null}
        </div>

        {settings.publicPage.heroPhotoUrl ? (
          <div className="mt-6 overflow-hidden rounded-2xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.publicPage.heroPhotoUrl} alt="" className="h-[220px] w-full object-cover" />
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border bg-neutral-50 p-6">
          <div className="text-lg font-semibold">Leave a review</div>
          <div className="mt-1 text-sm text-neutral-600">Choose a link below.</div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {settings.destinations.length === 0 ? (
              <div className="text-sm text-neutral-600">No review links configured.</div>
            ) : (
              settings.destinations.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border bg-white px-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.label}</div>
                    <div className="truncate text-xs text-neutral-500">{d.url}</div>
                  </div>
                  <div className="text-sm" style={{ color: "var(--client-primary)" }}>
                    Open
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        <div className="mt-10 text-xs text-neutral-500">© {new Date().getFullYear()} {businessName}</div>
      </main>
    </div>
  );
}
