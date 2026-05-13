import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getPortalHiddenServiceHref, PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export default async function PortalMissedCallTextBackServicePage() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const service = PORTAL_SERVICES.find((entry) => entry.slug === "missed-call-textback");
  redirect(getPortalHiddenServiceHref(service!, variant) || "/portal/app/services/ai-receptionist?tab=missed-call-textback");
}
