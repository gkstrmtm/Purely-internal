import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalAppointmentRemindersClient } from "@/app/portal/app/services/appointment-reminders/PortalAppointmentRemindersClient";

export default async function PortalAppointmentRemindersServicePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login?from=/portal/app/services/appointment-reminders");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return <PortalAppointmentRemindersClient />;
}
