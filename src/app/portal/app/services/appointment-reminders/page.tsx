import { redirect } from "next/navigation";

import type { ReactElement } from "react";

import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";

export default async function PortalAppointmentRemindersServicePage() {
  return (
    <PortalServiceGate slug="booking">
      <AppointmentRemindersRedirect />
    </PortalServiceGate>
  );
}

function AppointmentRemindersRedirect(): ReactElement | null {
  redirect("/portal/app/services/booking");
  return null;
}
