import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import type { Metadata } from "next";

import { AppTopNav } from "@/components/AppTopNav";
import { SignOutButton } from "@/components/SignOutButton";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/brand/purity-5.png", type: "image/png" }],
    apple: [{ url: "/brand/purity-5.png", type: "image/png" }],
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link href="/app" className="flex shrink-0 items-center gap-3">
              <Image
                src="/brand/purity-5.png"
                alt="Purely Automation"
                width={190}
                height={58}
                className="h-10 w-auto shrink-0 object-contain sm:h-11"
                priority
              />
            </Link>

            <div className="min-w-0 flex-1">
              <AppTopNav role={session?.user?.role} />
            </div>
          </div>

          <div className="flex flex-none items-center gap-3">
            <div className="hidden text-sm text-zinc-600 sm:block">
              {session?.user?.email}
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
