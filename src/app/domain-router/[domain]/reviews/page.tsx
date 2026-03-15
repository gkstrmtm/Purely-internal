import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { HostedPortalAdBanner } from "@/components/HostedPortalAdBanner";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { resolveHostedFont } from "@/lib/portalHostedFonts";
import { PublicReviewsClient } from "@/app/[siteSlug]/reviews/PublicReviewsClient";

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

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const name = profile?.businessName?.trim() || "Reviews";
  return { title: `${name} | Reviews` };
}

export default async function CustomDomainReviewsPage({
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

  const ownerId = mapping.ownerId;

  const [hasLogoUrl, hasPrimaryHex, hasAccentHex, hasTextHex, canUseSlugColumn] = await Promise.all([
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
    hasPublicColumn("ClientBlogSite", "slug"),
  ]);

  const profileSelect: Record<string, boolean> = { businessName: true };
  if (hasLogoUrl) profileSelect.logoUrl = true;
  if (hasPrimaryHex) profileSelect.brandPrimaryHex = true;
  if (hasAccentHex) profileSelect.brandAccentHex = true;
  if (hasTextHex) profileSelect.brandTextHex = true;

  const [profile, data, blogSite] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { ownerId }, select: profileSelect as any }),
    getReviewRequestsServiceData(ownerId),
    prisma.clientBlogSite
      .findUnique({
        where: { ownerId },
        select: (canUseSlugColumn
          ? ({ id: true, name: true, slug: true } as const)
          : ({ id: true, name: true } as const)) as any,
      })
      .catch(() => null),
  ]);

  const settings = data.settings;
  if (!settings.publicPage.enabled) return notFound();

  const brandPrimary = normalizeHex((profile as any)?.brandPrimaryHex) ?? "#1d4ed8";
  const brandAccent = normalizeHex((profile as any)?.brandAccentHex) ?? "#f472b6";
  const brandText = normalizeHex((profile as any)?.brandTextHex) ?? "#18181b";

  const businessName = (profile as any)?.businessName?.trim() || (blogSite as any)?.name || "Reviews";
  const logoUrl = (profile as any)?.logoUrl || null;
  const title = settings.publicPage.title || "Reviews";
  const description = settings.publicPage.description || "";
  const thankYouMessage = (settings.publicPage as any)?.thankYouMessage ? String((settings.publicPage as any).thankYouMessage) : "";

  const siteHandle = blogSite
    ? String((canUseSlugColumn ? (blogSite as any).slug : null) || (blogSite as any).id)
    : ownerId;

  const themeStyle = {
    ["--client-primary" as any]: brandPrimary,
    ["--client-accent" as any]: brandAccent,
    ["--client-text" as any]: brandText,
  } as CSSProperties;

  const hostedBrandFont = await getHostedBrandFont(ownerId);

  const hostedFont = resolveHostedFont({
    rawFontKey: (settings.publicPage as any)?.fontKey,
    brandFontFamily: hostedBrandFont.fontFamily,
    brandGoogleImportCss: hostedBrandFont.googleCss,
  });

  const pageFontStyle = hostedFont.fontFamily ? ({ fontFamily: hostedFont.fontFamily } as CSSProperties) : null;

  const [hasBusinessReply, hasBusinessReplyAt, hasQaTable] = await Promise.all([
    hasPublicColumn("PortalReview", "businessReply"),
    hasPublicColumn("PortalReview", "businessReplyAt"),
    hasPublicColumn("PortalReviewQuestion", "id"),
  ]);

  const reviewSelect: any = { id: true, rating: true, name: true, body: true, photoUrls: true, createdAt: true };
  if (hasBusinessReply) reviewSelect.businessReply = true;
  if (hasBusinessReplyAt) reviewSelect.businessReplyAt = true;

  const reviews = await (prisma as any).portalReview.findMany({
    where: { ownerId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: reviewSelect,
  });

  const qa = hasQaTable
    ? await (async () => {
        try {
          const rows = await (prisma as any).portalReviewQuestion.findMany({
            where: { ownerId, answer: { not: null } },
            orderBy: { answeredAt: "desc" },
            take: 30,
            select: { id: true, name: true, question: true, answer: true, answeredAt: true, createdAt: true },
          });
          return Array.isArray(rows) ? rows : [];
        } catch {
          return [];
        }
      })()
    : [];

  const destinations = (settings as any).destinations;

  const initialReviews = (reviews || []).map((r: any) => ({
    id: String(r.id),
    rating: Number(r.rating) || 0,
    name: String(r.name || ""),
    body: r.body ? String(r.body) : null,
    photoUrls: r.photoUrls,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
    ...(hasBusinessReply ? { businessReply: r.businessReply ? String(r.businessReply) : null } : {}),
    ...(hasBusinessReplyAt
      ? { businessReplyAt: r.businessReplyAt instanceof Date ? r.businessReplyAt.toISOString() : r.businessReplyAt ? String(r.businessReplyAt) : null }
      : {}),
  }));

  const initialQuestions = (qa || []).map((q: any) => ({
    id: String(q.id),
    name: String(q.name || ""),
    question: String(q.question || ""),
    answer: String(q.answer || ""),
    answeredAt: q.answeredAt instanceof Date ? q.answeredAt.toISOString() : q.answeredAt ? String(q.answeredAt) : null,
  }));

  return (
    <div
      className="min-h-screen bg-white text-zinc-900"
      style={{ ...(themeStyle as any), ...(pageFontStyle as any), ...hostedBrandFont.styleVars } as any}
    >
      {hostedFont.googleImportCss ? <style>{hostedFont.googleImportCss}</style> : null}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/reviews" className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-200 bg-white shadow-sm">
                <Image src="/brand/play_white_removed_everywhere%20(1).png" alt="" width={22} height={22} className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: "var(--client-text)" }}>
                {businessName}
              </div>
              <div className="text-xs text-zinc-500">{host}</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline"
              href="/blogs"
            >
              blogs
            </Link>
            <a href="https://purelyautomation.com" className="inline-flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-zinc-100" aria-label="Purely Automation">
              <Image src="/brand/purity-5.png" alt="" width={80} height={18} className="h-4 w-auto" />
            </a>
          </div>
        </div>
      </header>

      <HostedPortalAdBanner placement="HOSTED_REVIEWS_PAGE" domain={host} ownerId={ownerId} pathOverride="/reviews" />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-extrabold" style={{ color: "var(--client-primary)" }}>
            {title}
          </h1>
          {description ? <p className="mt-3 text-sm text-zinc-700">{description}</p> : null}

          <div className="mt-10">
            <PublicReviewsClient
              siteHandle={siteHandle}
              businessName={businessName}
              brandPrimary={brandPrimary}
              destinations={destinations}
              galleryEnabled={Boolean((settings.publicPage as any)?.galleryEnabled ?? true)}
              thankYouMessage={thankYouMessage}
              formConfig={(settings.publicPage as any)?.form}
              initialReviews={initialReviews}
              initialQuestions={initialQuestions}
            />
          </div>

          <div className="mt-10 text-xs text-zinc-500">Powered by Purely Automation.</div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">© {new Date().getFullYear()} {businessName}</div>
          <div className="flex items-center gap-4">
            <Link href="/reviews" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-primary)" }}>
              reviews
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
