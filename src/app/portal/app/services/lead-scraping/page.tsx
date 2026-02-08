import { requirePortalUser } from "@/lib/portalAuth";
import { PortalLeadScrapingClient } from "@/app/portal/app/services/lead-scraping/PortalLeadScrapingClient";

export default async function PortalLeadScrapingServicePage() {
  await requirePortalUser();

  return <PortalLeadScrapingClient />;
}
