import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPortalUser } from "@/lib/portalAuth";
import { PortalTopbarClient } from "@/app/portal/PortalTopbarClient";
import { PortalThemeClient } from "@/app/portal/PortalThemeClient";
import { getPortalBusinessProfile } from "@/lib/portalBusinessProfile.server";
import { getPortalThemeMode } from "@/lib/portalTheme.server";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    shortcut: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    apple: [{ url: "/brand/purelylogo.png", type: "image/png" }],
  },
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const logoSrc = variant === "credit" ? "/brand/2.png" : "/brand/1.png";
  const homeHref = variant === "credit" ? "/credit" : "/portal";
  const signInHref = variant === "credit" ? "/credit/login" : "/login";
  const getStartedHref = variant === "credit" ? "/credit/get-started" : "/portal/get-started";

  const user = await getPortalUser();
  const themePreferenceUserId = user?.memberId ?? user?.id ?? null;
  const themeMode = await getPortalThemeMode(themePreferenceUserId);
  const canOpenPortalApp = user?.role === "CLIENT" || user?.role === "ADMIN";
  const businessName = user?.id
    ? await getPortalBusinessProfile({ ownerId: user.id })
        .then((result) => {
          const raw = result.json && typeof result.json === "object" ? (result.json as any)?.profile?.businessName : "";
          return typeof raw === "string" ? raw.trim() : "";
        })
        .catch(() => "")
    : "";

  return (
    <PortalThemeClient preferredMode={themeMode}>
      <div className="flex min-h-dvh flex-col overflow-x-hidden bg-brand-mist text-brand-ink">
        <PortalTopbarClient
          logoSrc={logoSrc}
          homeHref={homeHref}
          signInHref={signInHref}
          getStartedHref={getStartedHref}
          businessName={businessName}
          userEmail={user?.email ?? null}
          canOpenPortalApp={canOpenPortalApp}
        />

        <div className="min-h-0 flex-1">
          {children}
        </div>
      </div>
    </PortalThemeClient>
  );
}
