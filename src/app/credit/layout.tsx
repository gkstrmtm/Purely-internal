import type { Metadata } from "next";

import { PortalTopbarClient } from "@/app/portal/PortalTopbarClient";
import { getPortalBusinessProfile } from "@/lib/portalBusinessProfile.server";
import { getPortalUser } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/brand/2.png", type: "image/png" }],
    shortcut: [{ url: "/brand/2.png", type: "image/png" }],
    apple: [{ url: "/brand/2.png", type: "image/png" }],
  },
};

export default async function CreditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPortalUser({ variant: "credit" });
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
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-brand-mist text-brand-ink">
      <PortalTopbarClient
        logoSrc="/brand/2.png"
        homeHref="/credit"
        signInHref="/credit/login"
        getStartedHref="/credit/get-started"
        businessName={businessName}
        userEmail={user?.email ?? null}
        canOpenPortalApp={canOpenPortalApp}
      />

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}