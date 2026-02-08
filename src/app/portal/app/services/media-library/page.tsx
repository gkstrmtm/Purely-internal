import { requirePortalUser } from "@/lib/portalAuth";
import { PortalMediaLibraryClient } from "@/app/portal/app/services/media-library/PortalMediaLibraryClient";

export default async function PortalMediaLibraryServicePage() {
  await requirePortalUser();

  return <PortalMediaLibraryClient />;
}
