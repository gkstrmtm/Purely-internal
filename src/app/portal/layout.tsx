import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import type { Metadata } from "next";

import { SignOutButton } from "@/components/SignOutButton";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/brand/purity-5.png", type: "image/png" }],
    apple: [{ url: "/brand/purity-5.png", type: "image/png" }],
  },
};

function PortalPublicNav() {
  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-sm sm:text-base">
      <Link
        href="/portal/login"
        className="rounded-xl px-3 py-2 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Sign in
      </Link>
      <Link
        href="/portal/get-started"
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
  const session = await getServerSession(authOptions);
  const canOpenPortalApp =
    session?.user?.role === "CLIENT" || session?.user?.role === "ADMIN";

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/portal" className="flex shrink-0 items-center gap-3">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={190}
              height={58}
              className="h-10 w-auto shrink-0 object-contain sm:h-11"
              priority
            />
          </Link>

          <div className="flex items-center gap-3">
            {session?.user ? (
              <>
                <div className="hidden text-sm text-zinc-600 sm:block">
                  {session?.user?.email}
                </div>
                {canOpenPortalApp ? (
                  <Link
                    href="/portal/app"
                    className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Open portal
                  </Link>
                ) : null}
                <SignOutButton />
              </>
            ) : (
              <PortalPublicNav />
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
