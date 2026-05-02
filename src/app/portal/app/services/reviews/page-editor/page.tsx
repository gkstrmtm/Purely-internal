import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalReviewsPageEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ pageKey?: string }>;
}) {
  const resolved = (((await searchParams?.catch(() => ({}))) ?? {}) as { pageKey?: string });
  const pageKey = typeof resolved.pageKey === "string" ? resolved.pageKey.trim() : "";

  return (
    <PortalServiceGate slug="reviews">
      <HostedServicePageEditorClient service="REVIEWS" serviceLabel="Reviews" backHref="/services/reviews" defaultPageKey={pageKey || "reviews_home"} />
    </PortalServiceGate>
  );
}
