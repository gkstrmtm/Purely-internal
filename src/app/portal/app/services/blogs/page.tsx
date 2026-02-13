import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalBlogsClient } from "@/app/portal/app/services/blogs/PortalBlogsClient";

export default async function PortalBlogsServicePage() {
  return (
    <PortalServiceGate slug="blogs">
      <PortalBlogsClient />
    </PortalServiceGate>
  );
}
