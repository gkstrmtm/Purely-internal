import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalNewsletterClient } from "@/app/portal/app/services/newsletter/PortalNewsletterClient";

export default async function PortalServiceNewsletterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const audienceRaw =
    typeof searchParams?.audience === "string"
      ? searchParams?.audience
      : Array.isArray(searchParams?.audience)
        ? searchParams?.audience[0]
        : "external";
  const audience = String(audienceRaw || "external").toLowerCase() === "internal" ? "internal" : "external";

  return (
    <PortalServiceGate slug="newsletter">
      <PortalNewsletterClient initialAudience={audience} />
    </PortalServiceGate>
  );
}
