import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalTasksClient } from "@/app/portal/app/tasks/PortalTasksClient";
import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalTasksPage() {
  await requirePortalUser();

  return (
    <PortalServiceGate slug="tasks">
      <PortalTasksClient />
    </PortalServiceGate>
  );
}
