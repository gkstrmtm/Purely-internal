import { requirePortalUser } from "@/lib/portalAuth";
import { PortalInboxClient } from "@/app/portal/app/services/inbox/PortalInboxClient";

export default async function PortalInboxServicePage() {
  await requirePortalUser();

  return <PortalInboxClient />;
}
