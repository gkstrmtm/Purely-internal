import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalReviewsPageEditorPage() {
  return (
    <PortalServiceGate slug="reviews">
      <HostedServicePageEditorClient service="REVIEWS" serviceLabel="Reviews" backHref="/services/reviews" defaultPageKey="reviews_home" />
    </PortalServiceGate>
  );
}
