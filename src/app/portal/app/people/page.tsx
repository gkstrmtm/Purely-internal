import { redirect } from "next/navigation";

import { requirePortalUserForService } from "@/lib/portalAuth";

export default async function PortalPeoplePage() {
  await requirePortalUserForService("people", "view");
  redirect("/portal/app/people/contacts");
}
