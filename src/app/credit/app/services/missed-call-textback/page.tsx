import { redirect } from "next/navigation";

import { getPortalHiddenServiceHref, PORTAL_SERVICES } from "@/app/portal/services/catalog";

export const dynamic = "force-dynamic";

export default function CreditMissedCallTextBackServicePage() {
  const service = PORTAL_SERVICES.find((entry) => entry.slug === "missed-call-textback");
  redirect(getPortalHiddenServiceHref(service!, "credit") || "/credit/app/services/ai-receptionist?tab=missed-call-textback");
}