import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPortalUser } from "@/lib/portalAuth";
import { PortalTopbarClient } from "@/app/portal/PortalTopbarClient";
import { PortalTopbarHeightClient } from "@/app/portal/PortalTopbarHeightClient";
import { getPortalBusinessProfile } from "@/lib/portalBusinessProfile.server";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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
  const signInHref = variant === "credit" ? "/credit/login" : "/portal/login";
  const getStartedHref = variant === "credit" ? "/credit/get-started" : "/portal/get-started";

  const user = await getPortalUser();
  const canOpenPortalApp = user?.role === "CLIENT" || user?.role === "ADMIN";
  const businessName = user?.id
    ? await withTimeout(getPortalBusinessProfile({ ownerId: user.id }), 1500, { status: 200, json: { profile: { businessName: "" } } as any })
        .then((result) => {
          const raw = result.json && typeof result.json === "object" ? (result.json as any)?.profile?.businessName : "";
          return typeof raw === "string" ? raw.trim() : "";
        })
        .catch(() => "")
    : "";

  return (
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
      <PortalTopbarHeightClient />

      <div className="min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
}
