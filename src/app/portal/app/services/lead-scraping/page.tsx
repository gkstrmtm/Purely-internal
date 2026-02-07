import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalLeadScrapingClient } from "@/app/portal/app/services/lead-scraping/PortalLeadScrapingClient";

export default async function PortalLeadScrapingServicePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login?from=/portal/app/services/lead-scraping");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return <PortalLeadScrapingClient />;
}
