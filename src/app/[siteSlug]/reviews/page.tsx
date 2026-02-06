import Image from "next/image";
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

  type VerifiedBusiness = {
    ownerId: string;
    handle: string;
    name: string;
    logoUrl: string | null;
  };

  async function getOtherVerifiedBusinesses(): Promise<VerifiedBusiness[]> {
    try {
      const setups = await prisma.portalServiceSetup.findMany({
        where: { serviceSlug: "reviews", status: "COMPLETE" },
        select: { ownerId: true, dataJson: true },
        orderBy: { updatedAt: "desc" },
        take: 80,
      });

      const candidateOwnerIds: string[] = [];
      for (const s of setups) {
        if (!s.ownerId || s.ownerId === ownerId) continue;
        const rec = s.dataJson && typeof s.dataJson === "object" && !Array.isArray(s.dataJson) ? (s.dataJson as any) : null;
        const enabled = Boolean(rec?.publicPage?.enabled);
        if (!enabled) continue;
        if (!candidateOwnerIds.includes(s.ownerId)) candidateOwnerIds.push(s.ownerId);
        if (candidateOwnerIds.length >= 16) break;
      }

      if (candidateOwnerIds.length === 0) return [];

      const [canUseSlugColumnForList, hasLogoUrlList] = await Promise.all([
        hasPublicColumn("ClientBlogSite", "slug"),
        hasPublicColumn("BusinessProfile", "logoUrl"),
      ]);

      const profileSelect: Record<string, boolean> = { ownerId: true, businessName: true };
      if (hasLogoUrlList) profileSelect.logoUrl = true;

      const [profiles, blogSites, bookingSites] = await Promise.all([
        prisma.businessProfile.findMany({ where: { ownerId: { in: candidateOwnerIds } }, select: profileSelect as any }),
        prisma.clientBlogSite.findMany(
          {
            where: { ownerId: { in: candidateOwnerIds } },
            select: (canUseSlugColumnForList
              ? ({ ownerId: true, id: true, name: true, slug: true } as const)
              : ({ ownerId: true, id: true, name: true } as const)) as any,
          } as any,
        ),
        prisma.portalBookingSite.findMany({ where: { ownerId: { in: candidateOwnerIds } }, select: { ownerId: true, slug: true, title: true } }),
      ]);

      const profileByOwner = new Map<string, any>(profiles.map((p: any) => [String(p.ownerId), p]));
      const blogByOwner = new Map<string, any>(blogSites.map((s: any) => [String(s.ownerId), s]));
      const bookingByOwner = new Map<string, any>(bookingSites.map((s: any) => [String(s.ownerId), s]));

      const items: VerifiedBusiness[] = [];
      for (const oid of candidateOwnerIds) {
        const blog = blogByOwner.get(oid);
        const booking = bookingByOwner.get(oid);
        const profile = profileByOwner.get(oid);

        const handle = blog
          ? String((canUseSlugColumnForList ? blog.slug : null) || blog.id)
          : booking
            ? String(booking.slug)
            : null;

        if (!handle) continue;

        const name = String(profile?.businessName || blog?.name || booking?.title || "Business");
        const logoUrl = (profile?.logoUrl as string | undefined) || null;

        items.push({ ownerId: oid, handle, name, logoUrl });
      }

      return items.slice(0, 12);
    } catch {
      return [];
    }
  }

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

  const otherVerified = await getOtherVerifiedBusinesses();

  return (
    <div className="min-h-screen bg-white text-zinc-900" style={themeStyle}>
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href={`/${siteHandle}/reviews`} className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: "rgba(29,78,216,0.10)" }}>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "var(--client-primary)" }} />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: "var(--client-text)" }}>
                {businessName}
              </div>
              <div className="text-xs text-zinc-500">{siteHandle}</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {blogSite ? (
              <Link
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
                href={`/${siteHandle}/blogs`}
              >
                blogs
              </Link>
            ) : null}
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              <span className="relative grid h-5 w-5 place-items-center overflow-hidden rounded-full" style={{ backgroundColor: "var(--client-primary)" }}>
                <Image
                  src="/brand/play_white_removed_everywhere%20(1).png"
                  alt=""
                  width={20}
                  height={20}
                  className="h-3.5 w-3.5"
                />
              </span>
              purelyautomation.com
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section style={{ backgroundColor: "var(--client-primary)" }}>
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                Verified
              </div>

              <h1 className="mt-4 font-brand text-4xl text-white sm:text-5xl">{title}</h1>
              {description ? <p className="mt-4 text-lg leading-relaxed text-white/90">{description}</p> : null}
            </div>
          </div>
        </section>

        <section className="bg-zinc-50">
          <div className="mx-auto max-w-6xl px-6 py-14">
            {Array.isArray(settings.publicPage.photoUrls) && settings.publicPage.photoUrls.length ? (
              <div className="-mt-24 mb-10">
                <div className="flex gap-4 overflow-x-auto pb-3">
                  {settings.publicPage.photoUrls.slice(0, 12).map((u) => (
                    <div key={u} className="h-[200px] w-[320px] shrink-0 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
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

            {otherVerified.length ? (
              <div className="mt-14">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="font-brand text-2xl" style={{ color: "var(--client-text)" }}>
                      more businesses on purely
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">Browse other verified pages.</div>
                  </div>
                </div>

                <div className="mt-5 flex gap-4 overflow-x-auto pb-3">
                  {otherVerified.map((b) => (
                    <Link
                      key={b.ownerId}
                      href={`/${b.handle}/reviews`}
                      className="group w-[280px] shrink-0 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        {b.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.logoUrl} alt={b.name} className="h-11 w-11 rounded-2xl object-cover" />
                        ) : (
                          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:rgba(29,78,216,0.08)]">
                            <div className="h-3 w-3 rounded-full bg-[color:var(--color-brand-blue)]" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900 group-hover:underline">{b.name}</div>
                          <div className="truncate text-xs text-zinc-500">/{b.handle}/reviews</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-14 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="font-brand text-2xl text-[color:var(--color-brand-blue)]">want a page like this?</div>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-700">
                    Purely helps businesses collect reviews and publish a clean, verified page customers can trust.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/portal/get-started"
                    className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-6 py-3 text-base font-extrabold text-white shadow-sm hover:bg-blue-700"
                  >
                    get started
                  </Link>
                  <Link
                    href="/#demo"
                    className="inline-flex items-center justify-center rounded-2xl border border-[color:rgba(29,78,216,0.15)] bg-white px-6 py-3 text-base font-bold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
                  >
                    book a call
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {businessName}</div>
          <div className="flex items-center gap-4">
            {blogSite ? (
              <Link
                href={`/${siteHandle}/blogs`}
                className="text-sm font-semibold hover:underline"
                style={{ color: "var(--client-primary)" }}
              >
                blogs
              </Link>
            ) : null}
            <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              purelyautomation.com
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
