import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { buildCustomDomainMetadata, buildCustomDomainNotFoundMetadata, resolveCustomDomainBranding } from "@/lib/customDomainMetadata";
import { prisma } from "@/lib/db";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";

import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

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
  params: Promise<{ domain: string; slug: string }>;
}): Promise<Metadata> {
  const { domain, slug } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) return {};

  const mapping = await resolveCustomDomain(host);
  if (!mapping) return buildCustomDomainNotFoundMetadata(host);
  if (mapping.status !== "VERIFIED") {
    return buildCustomDomainMetadata({
      host,
      siteName: host,
      title: "Domain pending verification",
      description: "This domain is saved, but not verified yet.",
      noIndex: true,
    });
  }

  const [profile, hostedBookingPage, branding] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { ownerId: mapping.ownerId }, select: { businessName: true, logoUrl: true } as any }).catch(() => null),
    (prisma as any).hostedPageDocument.findFirst({
      where: { ownerId: mapping.ownerId, service: "BOOKING", pageKey: "booking_main" },
      orderBy: { updatedAt: "desc" },
      select: { seoTitle: true, seoDescription: true },
    }).catch(() => null),
    resolveCustomDomainBranding(host),
  ]);

  const name = String(profile?.businessName || "").trim() || branding.siteName || "Booking";
  return buildCustomDomainMetadata({
    host,
    siteName: branding.siteName,
    title: String((hostedBookingPage as any)?.seoTitle || `${name} | Booking`).trim(),
    description: String((hostedBookingPage as any)?.seoDescription || `Book time with ${name}.`).trim(),
    imageUrl: branding.logoUrl,
    iconUrl: branding.logoUrl,
    path: `/book/${slug}`,
    keywords: [`${name} booking`, `${name} appointment`, `${name} schedule`],
  });
}

export default async function CustomDomainBookingPage({
  params,
}: {
  params: Promise<{ domain: string; slug: string }>;
}) {
  const { domain, slug } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  const bookingSlug = decodeURIComponent(String(slug || "")).trim();
  if (!host || !bookingSlug) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification ownerId={mapping.ownerId} />;

  const bookingSite = await (prisma as any).portalBookingSite
    .findUnique({ where: { slug: bookingSlug }, select: { ownerId: true } })
    .catch(() => null);

  if (!bookingSite) notFound();
  if (String(bookingSite.ownerId) !== String(mapping.ownerId)) notFound();

  const hostedBrandFont = await getHostedBrandFont(mapping.ownerId);

  return (
    <div style={{ ...(hostedBrandFont.styleVars as any), ...hostedBrandFont.globalStyle } as any}>
      {hostedBrandFont.googleCss ? <style>{hostedBrandFont.googleCss}</style> : null}
      <PublicBookingClient target={{ kind: "slug", slug: bookingSlug }} showBranding={false} />
    </div>
  );
}
