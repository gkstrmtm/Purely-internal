import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import PortalReviewsClient from "./PortalReviewsClient";

export default async function PortalReviewsSetupPage() {
  return (
    <PortalServiceGate slug="reviews">
      <PortalReviewsClient />
    </PortalServiceGate>
  );
}
