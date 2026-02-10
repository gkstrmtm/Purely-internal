import { requirePortalUserForService } from "@/lib/portalAuth";
import { PortalPeopleContactsClient } from "@/app/portal/app/people/contacts/PortalPeopleContactsClient";

export default async function PortalPeopleContactsPage() {
  await requirePortalUserForService("people", "view");

  return <PortalPeopleContactsClient />;
}
