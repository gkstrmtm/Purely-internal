import { notFound } from "next/navigation";

import { resolveCustomDomain } from "@/lib/customDomainResolver";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getHostedBrandFont } from "@/lib/hostedBrandFont";
import { deriveHostedBrandTheme } from "@/lib/hostedBrandTheme";
import { getHostedTheme } from "@/lib/hostedTheme";

import ChatbotEmbedClient from "@/app/embed/chatbot/ChatbotEmbedClient";

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

export default async function CustomDomainChatbotEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { domain } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification ownerId={mapping.ownerId} />;

  const [hasPrimaryHex, hasSecondaryHex, hasAccentHex, hasTextHex] = await Promise.all([
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
  ]);

  const profileSelect: Record<string, boolean> = {};
  if (hasPrimaryHex) profileSelect.brandPrimaryHex = true;
  if (hasSecondaryHex) profileSelect.brandSecondaryHex = true;
  if (hasAccentHex) profileSelect.brandAccentHex = true;
  if (hasTextHex) profileSelect.brandTextHex = true;

  const profile =
    Object.keys(profileSelect).length > 0
      ? await prisma.businessProfile
          .findUnique({ where: { ownerId: mapping.ownerId }, select: profileSelect as any })
          .catch(() => null)
      : null;

  const hostedTheme = await getHostedTheme(mapping.ownerId);

  const theme = deriveHostedBrandTheme({
    brandPrimaryHex: (profile as any)?.brandPrimaryHex ?? null,
    brandSecondaryHex: (profile as any)?.brandSecondaryHex ?? null,
    brandAccentHex: (profile as any)?.brandAccentHex ?? null,
    brandTextHex: (profile as any)?.brandTextHex ?? null,
    overrides: hostedTheme,
  });

  const derivedPrimaryColor = theme.ctaHex;

  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const agentId = get("agentId") || "";
  const signedUrlEndpoint = get("signedUrlEndpoint") || "/api/public/elevenlabs/convai/signed-url";
  const placementX = get("placementX") || "right";
  const placementY = get("placementY") || "bottom";
  const primaryColor = get("primaryColor") || derivedPrimaryColor || "";
  const launcherStyle = get("launcherStyle") || "bubble";
  const launcherImageUrl = get("launcherImageUrl") || "";

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, background: "transparent", overflow: "hidden" }}>
        <ChatbotEmbedClient
          agentId={agentId}
          signedUrlEndpoint={signedUrlEndpoint}
          placementX={placementX}
          placementY={placementY}
          primaryColor={primaryColor || undefined}
          launcherStyle={launcherStyle}
          launcherImageUrl={launcherImageUrl || undefined}
        />
      </body>
    </html>
  );
}
