import { notFound } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { PortalServicePageClient } from "@/app/portal/services/[service]/PortalServicePageClient";

export default async function PortalAppServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  await requirePortalUser();

  const { service } = await params;
  const exists = PORTAL_SERVICES.some((s) => s.slug === service);
  if (!exists) notFound();

  return <PortalServicePageClient slug={service} />;
}
