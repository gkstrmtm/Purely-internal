import { FunnelBuilderClient } from "@/app/portal/app/services/funnel-builder/FunnelBuilderClient";
import { requirePortalUser } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalServiceFunnelBuilderPage() {
  await requirePortalUser();
  return <FunnelBuilderClient />;
}
