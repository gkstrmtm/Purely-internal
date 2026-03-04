import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalNewsletterClient } from "@/app/portal/app/services/newsletter/PortalNewsletterClient";

export default async function PortalServiceNewsletterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const audienceRaw =
    typeof resolvedSearchParams?.audience === "string"
      ? resolvedSearchParams?.audience
      : Array.isArray(resolvedSearchParams?.audience)
        ? resolvedSearchParams?.audience[0]
        : "external";
  const audience = String(audienceRaw || "external").toLowerCase() === "internal" ? "internal" : "external";

  return (
    <PortalServiceGate slug="newsletter">
      <PortalNewsletterClient initialAudience={audience} />
    </PortalServiceGate>
  );
}
