import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalLeadScrapingClient } from "@/app/portal/app/services/lead-scraping/PortalLeadScrapingClient";

export default async function PortalLeadScrapingServicePage() {
  return (
    <PortalServiceGate slug="lead-scraping">
      <PortalLeadScrapingClient />
    </PortalServiceGate>
  );
}
