import { requirePortalUserForService } from "@/lib/portalAuth";
import { PortalPeopleUsersClient } from "@/app/portal/app/people/users/PortalPeopleUsersClient";

export default async function PortalPeopleUsersPage() {
  await requirePortalUserForService("people", "view");

  return <PortalPeopleUsersClient />;
}
