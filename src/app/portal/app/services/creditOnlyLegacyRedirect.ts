import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export async function redirectCreditOnlyService(canonicalPath: string) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  if (variant !== "credit") notFound();

  const session = await requireCreditClientSession();
  if (!session.ok) {
    redirect(`/credit/login?from=${encodeURIComponent(canonicalPath)}`);
  }

  redirect(canonicalPath);
}