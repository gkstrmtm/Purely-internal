import { redirect } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalFollowUpServicePage() {
  await requirePortalUser();

  redirect("/portal/app/services/booking?tab=follow-up");
}
