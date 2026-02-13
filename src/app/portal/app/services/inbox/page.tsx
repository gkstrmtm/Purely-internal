import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalInboxClient } from "@/app/portal/app/services/inbox/PortalInboxClient";

export default async function PortalInboxServicePage() {
  return (
    <PortalServiceGate slug="inbox">
      <PortalInboxClient />
    </PortalServiceGate>
  );
}
