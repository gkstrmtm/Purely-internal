import { redirect } from "next/navigation";
import { requirePortalUserForService } from "@/lib/portalAuth";

export default async function PortalAppBillingPage() {
  await requirePortalUserForService("billing", "view");

  redirect("/portal/app/settings?tab=billing");
}
