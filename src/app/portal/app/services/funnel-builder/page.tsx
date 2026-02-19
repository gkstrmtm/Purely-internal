import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { FunnelBuilderClient } from "@/app/portal/app/services/funnel-builder/FunnelBuilderClient";
import { requirePortalUser } from "@/lib/portalAuth";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalServiceFunnelBuilderPage() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  if (variant !== "credit") notFound();

  await requirePortalUser();
  return <FunnelBuilderClient />;
}
