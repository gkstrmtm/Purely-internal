import { getServerSession } from "next-auth";
import type { Metadata } from "next";

import { AppShell } from "./AppShell";
import { authOptions } from "@/lib/auth";
import { isPlatformAdminGranted } from "@/lib/platformAdminGrants";

export const metadata: Metadata = {
	title: "Purely Employee",
  icons: {
    icon: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    shortcut: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    apple: [{ url: "/brand/purelylogo.png", type: "image/png" }],
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions).catch(() => null);
  const platformAdminGranted = session?.user?.id
    ? await isPlatformAdminGranted(session.user.id).catch(() => false)
    : false;

  return (
    <AppShell
      role={session?.user?.role}
      email={session?.user?.email ?? undefined}
      platformAdminGranted={platformAdminGranted}
    >
      {children}
    </AppShell>
  );
}
