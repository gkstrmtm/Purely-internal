import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";

import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  params: Promise<{ domain: string; slug: string }>;
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

  const name = profile?.businessName?.trim() || "Booking";
  return { title: `${name} | Booking` };
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
  if (mapping.status !== "VERIFIED") return <PendingVerification />;

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
