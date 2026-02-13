import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalMediaLibraryClient } from "@/app/portal/app/services/media-library/PortalMediaLibraryClient";

export default async function PortalMediaLibraryServicePage() {
  return (
    <PortalServiceGate slug="media-library">
      <PortalMediaLibraryClient />
    </PortalServiceGate>
  );
}
