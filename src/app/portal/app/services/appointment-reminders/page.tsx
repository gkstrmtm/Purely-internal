import { redirect } from "next/navigation";
import { headers } from "next/headers";

import type { ReactElement } from "react";

import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, portalBasePath } from "@/lib/portalVariant";

export default async function PortalAppointmentRemindersServicePage() {
  return (
    <PortalServiceGate slug="booking">
      <AppointmentRemindersRedirect />
    </PortalServiceGate>
  );
}

async function AppointmentRemindersRedirect(): Promise<ReactElement | null> {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const base = portalBasePath(variant);
  redirect(`${base}/app/services/booking`);
}
