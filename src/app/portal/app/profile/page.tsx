import { redirect } from "next/navigation";
import { requirePortalUserForService } from "@/lib/portalAuth";

export default async function PortalAppProfilePage() {
  await requirePortalUserForService("profile", "view");

  redirect("/portal/app/settings?tab=profile");
}
