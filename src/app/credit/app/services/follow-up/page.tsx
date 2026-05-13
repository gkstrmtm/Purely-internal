import { redirect } from "next/navigation";

import { getPortalHiddenServiceHref, PORTAL_SERVICES } from "@/app/portal/services/catalog";

export const dynamic = "force-dynamic";

export default function CreditFollowUpServicePage() {
  const service = PORTAL_SERVICES.find((entry) => entry.slug === "follow-up");
  redirect(getPortalHiddenServiceHref(service!, "credit") || "/credit/app/services/booking?tab=follow-up");
}