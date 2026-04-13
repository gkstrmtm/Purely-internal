import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalBlogsPageEditorPage() {
  return (
    <PortalServiceGate slug="blogs">
      <HostedServicePageEditorClient service="BLOGS" serviceLabel="Blogs" backHref="/services/blogs" defaultPageKey="blogs_index" />
    </PortalServiceGate>
  );
}