import { redirect } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalModulesPage() {
  await requirePortalUser();

  redirect("/portal/app/services");
}
