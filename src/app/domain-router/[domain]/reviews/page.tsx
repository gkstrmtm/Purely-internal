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
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";
import { PublicReviewsClient } from "@/app/[siteSlug]/reviews/PublicReviewsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  if (mapping.status !== "VERIFIED") return <PendingVerification ownerId={mapping.ownerId} />;

  const ownerId = mapping.ownerId;

  const [hasLogoUrl, hasPrimaryHex, hasSecondaryHex, hasAccentHex, hasTextHex, canUseSlugColumn] = await Promise.all([
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
    hasPublicColumn("ClientBlogSite", "slug"),
  ]);

  const profileSelect: Record<string, boolean> = { businessName: true };
  if (hasLogoUrl) profileSelect.logoUrl = true;
  if (hasPrimaryHex) profileSelect.brandPrimaryHex = true;
  if (hasSecondaryHex) profileSelect.brandSecondaryHex = true;
  if (hasAccentHex) profileSelect.brandAccentHex = true;
  if (hasTextHex) profileSelect.brandTextHex = true;

  const [profile, data, blogSite, hostedTheme] = await Promise.all([
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
    getHostedTheme(ownerId),
  ]);

  const settings = data.settings;
  if (!settings.publicPage.enabled) return notFound();

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
    overrides: hostedTheme,
  });

  const brandPrimary = theme.surfaceHex;

  const businessName = (profile as any)?.businessName?.trim() || (blogSite as any)?.name || "Reviews";
  const logoUrl = (profile as any)?.logoUrl || null;
  const title = settings.publicPage.title || "Reviews";
  const description = settings.publicPage.description || "";
  const thankYouMessage = (settings.publicPage as any)?.thankYouMessage ? String((settings.publicPage as any).thankYouMessage) : "";

  const siteHandle = blogSite
    ? String((canUseSlugColumn ? (blogSite as any).slug : null) || (blogSite as any).id)
    : ownerId;

  const themeStyle = theme.cssVars;

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
      className="min-h-screen"
      style={{
        ...(themeStyle as any),
        ...(pageFontStyle as any),
        ...(hostedBrandFont.styleVars as any),
        backgroundColor: "var(--client-bg)",
        color: "var(--client-text)",
      } as any}
    >
      {hostedFont.googleImportCss ? <style>{hostedFont.googleImportCss}</style> : null}
      <header
        className="relative z-50 border-b backdrop-blur"
        style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/reviews" className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <div
                className="grid h-10 w-10 place-items-center rounded-xl border shadow-sm"
                style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
              >
                <Image src="/brand/purelylogo.png" alt="" width={22} height={22} className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: "var(--client-text)" }}>
                {businessName}
              </div>
              <div className="text-xs" style={{ color: "var(--client-muted)" }}>
                {host}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold sm:inline"
              style={{ color: "var(--client-muted)" }}
              href="/blogs"
            >
              blogs
            </Link>
            <a
              href="https://purelyautomation.com"
              className="inline-flex items-center gap-3 rounded-xl px-3 py-2"
              style={{ color: "var(--client-muted)" }}
              aria-label="Purely Automation"
            >
              <Image src="/brand/1.png" alt="" width={80} height={18} className="h-4 w-auto" />
            </a>
          </div>
        </div>
      </header>

      <HostedPortalAdBanner placement="HOSTED_REVIEWS_PAGE" domain={host} ownerId={ownerId} pathOverride="/reviews" />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-extrabold" style={{ color: "var(--client-link)" }}>
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-sm" style={{ color: "var(--client-muted)" }}>
              {description}
            </p>
          ) : null}

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

          <div className="mt-10 text-xs" style={{ color: "var(--client-muted)" }}>
            Powered by Purely Automation.
          </div>
        </div>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm" style={{ color: "var(--client-muted)" }}>
            © {new Date().getFullYear()} {businessName}
          </div>
          <div className="flex items-center gap-4">
            <Link href="/reviews" className="text-sm font-semibold hover:underline" style={{ color: "var(--client-link)" }}>
              reviews
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
