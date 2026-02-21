import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";

import { normalizePortalVariant, PORTAL_VARIANT_HEADER, portalBasePath } from "@/lib/portalVariant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DisputesAliasPage() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  if (variant !== "credit") notFound();

  const base = portalBasePath(variant);
  redirect(`${base}/app/services/dispute-letters`);
}
