import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { normalizePortalVariant, PORTAL_VARIANT_HEADER, portalBasePath } from "@/lib/portalVariant";

export default async function LegacyPortalServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";
  const base = portalBasePath(variant);
  const { service } = await params;
  redirect(`${base}/app/services/${service}`);
}
