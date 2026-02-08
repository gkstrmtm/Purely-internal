import { redirect } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppointmentRemindersServicePage() {
  await requirePortalUser();

  redirect("/portal/app/services/booking");
}
