import { requirePortalUser } from "@/lib/portalAuth";
import PortalReviewsClient from "./PortalReviewsClient";

export default async function PortalReviewsSetupPage() {
  await requirePortalUser();

  return <PortalReviewsClient />;
}
