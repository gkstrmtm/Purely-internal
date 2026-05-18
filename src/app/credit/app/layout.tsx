import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export default async function CreditAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCreditClientSession();
  if (!session.ok) redirect("/credit/login");

  return (
    <PortalSidebarOverrideProvider>
      <PortalShell>{children}</PortalShell>
    </PortalSidebarOverrideProvider>
  );
}