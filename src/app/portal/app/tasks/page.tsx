import { redirect } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalTasksPage() {
  await requirePortalUser();

  redirect("/portal/app/services/tasks");
}
