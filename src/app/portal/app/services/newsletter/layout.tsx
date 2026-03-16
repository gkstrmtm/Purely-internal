import { redirect } from "next/navigation";

import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalNewsletterClient } from "@/app/portal/app/services/newsletter/PortalNewsletterClient";
import { requestPortalAppBasePath } from "@/lib/portalVariant.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalNewsletterLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ audience?: string }>;
}) {
  // Keep the client shell mounted across /newsletter/external <-> /newsletter/internal.
  // The leaf page only validates/redirects.
  const resolved = await params;
  const raw = String(resolved?.audience || "external").toLowerCase();

  if (raw !== "external" && raw !== "internal") {
    const base = await requestPortalAppBasePath();
    redirect(`${base}/services/newsletter/external`);
  }

  return (
    <PortalServiceGate slug="newsletter">
      <PortalNewsletterClient initialAudience={raw} />
      {children}
    </PortalServiceGate>
  );
}
