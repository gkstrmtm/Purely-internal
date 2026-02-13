import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import PortalReviewsClient from "./setup/PortalReviewsClient";

export default async function PortalReviewsServicePage() {
  return (
    <PortalServiceGate slug="reviews">
      <PortalReviewsClient />
    </PortalServiceGate>
  );
}
