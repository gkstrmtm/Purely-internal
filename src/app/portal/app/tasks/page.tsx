import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { requirePortalUser } from "@/lib/portalAuth";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, portalBasePath } from "@/lib/portalVariant";

export default async function PortalTasksPage() {
  await requirePortalUser();

  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const base = portalBasePath(variant);
  redirect(`${base}/app/services/tasks`);
}
