import { requirePortalUser } from "@/lib/portalAuth";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";

export default async function PortalAppProfilePage() {
  await requirePortalUser();

  return <PortalProfileClient />;
}
