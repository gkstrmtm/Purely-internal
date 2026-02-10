import { requirePortalUser } from "@/lib/portalAuth";
import { PortalTasksClient } from "@/app/portal/app/tasks/PortalTasksClient";

export default async function PortalServiceTasksPage() {
  await requirePortalUser();

  return <PortalTasksClient />;
}
