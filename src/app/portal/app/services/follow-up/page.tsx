import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getPortalHiddenServiceHref, PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, portalBasePath } from "@/lib/portalVariant";

export default async function PortalFollowUpServicePage() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const base = portalBasePath(variant);
  const service = PORTAL_SERVICES.find((entry) => entry.slug === "follow-up");
  redirect(getPortalHiddenServiceHref(service!, variant) || `${base}/app/services/booking?tab=follow-up`);
}
