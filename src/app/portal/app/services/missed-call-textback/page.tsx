import { redirect } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalMissedCallTextBackServicePage() {
  await requirePortalUser();

  redirect("/portal/app/services/ai-receptionist?tab=missed-call-textback");
}
