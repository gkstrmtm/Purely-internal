import { redirect } from "next/navigation";

import { PortalServicesClient } from "@/app/portal/app/services/PortalServicesClient";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";

export default async function CreditServicesPage() {
  const session = await requireCreditClientSession();
  if (!session.ok) redirect("/credit/login");

  const ownerId = session.session.user.id;
  const memberId = session.session.user.memberId || ownerId;

  if (memberId !== ownerId) {
    redirect("/credit/app/services/credit-reports");
  }

  return <PortalServicesClient />;
}