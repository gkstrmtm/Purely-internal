import { requirePortalUser } from "@/lib/portalAuth";
import { PortalNewsletterClient } from "@/app/portal/app/services/newsletter/PortalNewsletterClient";

export default async function PortalServiceNewsletterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePortalUser();

  const audienceRaw =
    typeof searchParams?.audience === "string"
      ? searchParams?.audience
      : Array.isArray(searchParams?.audience)
        ? searchParams?.audience[0]
        : "external";
  const audience = String(audienceRaw || "external").toLowerCase() === "internal" ? "internal" : "external";

  return <PortalNewsletterClient initialAudience={audience} />;
}
