import { requirePortalUser } from "@/lib/portalAuth";
import { PortalBlogsClient } from "@/app/portal/app/services/blogs/PortalBlogsClient";

export default async function PortalBlogsServicePage() {
  await requirePortalUser();

  return <PortalBlogsClient />;
}
