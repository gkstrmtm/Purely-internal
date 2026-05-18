import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePortalUser();
  if (user.role !== "CLIENT" && user.role !== "ADMIN") redirect("/app");

  return (
    <PortalSidebarOverrideProvider>
      <PortalShell>{children}</PortalShell>
    </PortalSidebarOverrideProvider>
  );
}
