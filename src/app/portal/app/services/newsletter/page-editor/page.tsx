import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalNewsletterPageEditorPage() {
  return <HostedServicePageEditorClient service="NEWSLETTER" serviceLabel="Newsletter" backHref="/services/newsletter" defaultPageKey="newsletter_home" />;
}