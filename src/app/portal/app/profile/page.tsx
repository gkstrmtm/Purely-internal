import { requirePortalUserForService } from "@/lib/portalAuth";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";

export default async function PortalAppProfilePage() {
  await requirePortalUserForService("profile", "view");

  return <PortalProfileClient />;
}
