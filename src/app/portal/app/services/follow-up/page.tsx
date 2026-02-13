import { redirect } from "next/navigation";

import type { ReactElement } from "react";

import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";

export default async function PortalFollowUpServicePage() {
  return (
    <PortalServiceGate slug="booking">
      <FollowUpRedirect />
    </PortalServiceGate>
  );
}

function FollowUpRedirect(): ReactElement | null {
  redirect("/portal/app/services/booking?tab=follow-up");
  return null;
}
