import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePortalUser();
  if (user.role !== "CLIENT" && user.role !== "ADMIN") redirect("/app");

  return <PortalShell>{children}</PortalShell>;
}
