import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalInboxClient } from "@/app/portal/app/services/inbox/PortalInboxClient";

export default async function PortalInboxServicePage({
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PortalServiceGate slug="inbox">
      <PortalInboxClient initialChannel="email" />
    </PortalServiceGate>
  );
}
