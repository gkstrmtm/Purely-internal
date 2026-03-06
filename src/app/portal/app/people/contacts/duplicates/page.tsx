import { requirePortalUserForService } from "@/lib/portalAuth";

import { PortalPeopleContactDuplicatesClient } from "@/app/portal/app/people/contacts/duplicates/PortalPeopleContactDuplicatesClient";

export default async function PortalPeopleContactDuplicatesPage() {
  await requirePortalUserForService("people", "view");
  return <PortalPeopleContactDuplicatesClient />;
}
