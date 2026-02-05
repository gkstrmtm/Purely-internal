import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { authOptions } from "@/lib/auth";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/portal/login?from=/portal/app");
  }

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return <PortalShell>{children}</PortalShell>;
}
