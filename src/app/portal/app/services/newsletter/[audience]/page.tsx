import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalNewsletterClient } from "@/app/portal/app/services/newsletter/PortalNewsletterClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalServiceNewsletterAudiencePage({
  params,
}: {
  params: Promise<{ audience?: string }>;
}) {
  const resolved = await params;
  const raw = String(resolved?.audience || "external").toLowerCase();

  if (raw !== "external" && raw !== "internal") {
    redirect("/portal/app/services/newsletter/external");
  }

  return (
    <PortalServiceGate slug="newsletter">
      <PortalNewsletterClient initialAudience={raw} />
    </PortalServiceGate>
  );
}
