import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPortalUser } from "@/lib/portalAuth";
import { PortalHeaderCta } from "@/app/portal/PortalHeaderCta";
import { PortalHelpLink } from "@/app/portal/PortalHelpLink";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/brand/purity-5.png", type: "image/png" }],
    apple: [{ url: "/brand/purity-5.png", type: "image/png" }],
  },
};

function PortalPublicNav({ signInHref, getStartedHref }: { signInHref: string; getStartedHref: string }) {
  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-sm sm:text-base">
      <Link
        href={signInHref}
        className="rounded-xl px-3 py-2 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Sign in
      </Link>
      <Link
        href={getStartedHref}
        className="rounded-xl bg-brand-ink px-3 py-2 font-semibold text-white hover:opacity-95"
      >
        Get started
      </Link>
    </nav>
  );
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const homeHref = variant === "credit" ? "/credit" : "/portal";
  const signInHref = variant === "credit" ? "/credit/login" : "/login";
  const getStartedHref = variant === "credit" ? "/credit/get-started" : "/portal/get-started";

  const user = await getPortalUser();
  const canOpenPortalApp = user?.role === "CLIENT" || user?.role === "ADMIN";

  return (
    <div className="min-h-[100dvh] bg-brand-mist text-brand-ink">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:gap-6 sm:px-6">
          <Link href={homeHref} className="flex shrink-0 items-center gap-3">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={190}
              height={58}
              className="h-10 w-auto shrink-0 object-contain sm:h-11"
              priority
            />
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
            {user ? (
              <>
                <div className="hidden text-sm text-zinc-600 sm:block">
                  {user.email}
                </div>
                <PortalHeaderCta canOpenPortalApp={canOpenPortalApp} />
                <PortalHelpLink />
              </>
            ) : (
              <PortalPublicNav signInHref={signInHref} getStartedHref={getStartedHref} />
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
