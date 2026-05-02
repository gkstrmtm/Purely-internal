import { requirePortalUserForService } from "@/lib/portalAuth";

import { PortalPeopleHubClient } from "@/app/portal/app/people/PortalPeopleHubClient";

export default async function PortalPeoplePage() {
  await requirePortalUserForService("people", "view");
  return <PortalPeopleHubClient />;
}
