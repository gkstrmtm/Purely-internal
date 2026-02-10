import { requirePortalUser } from "@/lib/portalAuth";
import { PortalPeopleContactsClient } from "@/app/portal/app/people/contacts/PortalPeopleContactsClient";

export default async function PortalPeopleContactsPage() {
  await requirePortalUser();

  return <PortalPeopleContactsClient />;
}
