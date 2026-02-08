import { redirect } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalReviewsServicePage() {
  await requirePortalUser();

  redirect("/portal/app/services/reviews/setup");
}
