import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalTasksClient } from "@/app/portal/app/tasks/PortalTasksClient";

export default async function PortalServiceTasksPage() {
  return (
    <PortalServiceGate slug="tasks">
      <PortalTasksClient />
    </PortalServiceGate>
  );
}
