import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { ToastProvider } from "@/components/ToastProvider";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePortalUser({ variant: "portal" });
  if (user.role !== "CLIENT" && user.role !== "ADMIN") redirect("/app");

  return (
    <ToastProvider>
      <PortalSidebarOverrideProvider>
        <PortalShell>{children}</PortalShell>
      </PortalSidebarOverrideProvider>
    </ToastProvider>
  );
}
