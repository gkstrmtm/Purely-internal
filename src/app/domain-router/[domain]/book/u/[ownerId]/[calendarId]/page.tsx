import { notFound } from "next/navigation";
import type { Metadata } from "next";

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
  params: Promise<{ domain: string; ownerId: string; calendarId: string }>;
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

export default async function CustomDomainBookingCalendarPage({
  params,
}: {
  params: Promise<{ domain: string; ownerId: string; calendarId: string }>;
}) {
  const { domain, ownerId, calendarId } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  const ownerIdSafe = decodeURIComponent(String(ownerId || "")).trim();
  const calendarIdSafe = decodeURIComponent(String(calendarId || "")).trim();
  if (!host || !ownerIdSafe || !calendarIdSafe) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification ownerId={mapping.ownerId} />;

  // Prevent cross-tenant access on custom domains.
  if (String(mapping.ownerId) !== String(ownerIdSafe)) notFound();

  const hostedBrandFont = await getHostedBrandFont(mapping.ownerId);

  return (
    <div style={{ ...(hostedBrandFont.styleVars as any), ...hostedBrandFont.globalStyle } as any}>
      {hostedBrandFont.googleCss ? <style>{hostedBrandFont.googleCss}</style> : null}
      <PublicBookingClient
        target={{ kind: "calendar", ownerId: ownerIdSafe, calendarId: calendarIdSafe }}
        showBranding={false}
      />
    </div>
  );
}
