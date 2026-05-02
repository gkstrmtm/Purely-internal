import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalLeadScrapingClient } from "@/app/portal/app/services/lead-scraping/PortalLeadScrapingClient";

export default async function PortalLeadScrapingSettingsPage() {
  return (
    <PortalServiceGate slug="lead-scraping">
      <PortalLeadScrapingClient initialB2bSubTab="settings" />
    </PortalServiceGate>
  );
}
