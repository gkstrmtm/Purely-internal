import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalNewsletterPageEditorPage() {
  return (
    <PortalServiceGate slug="newsletter">
      <HostedServicePageEditorClient service="NEWSLETTER" serviceLabel="Newsletter" backHref="/services/newsletter" defaultPageKey="newsletter_home" />
    </PortalServiceGate>
  );
}