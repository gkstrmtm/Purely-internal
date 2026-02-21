import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";

import DisputeLettersClient from "@/app/credit/app/disputes/DisputeLettersClient";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditDisputeLettersServicePage() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  if (variant !== "credit") notFound();

  const session = await requireCreditClientSession();
  if (!session.ok) {
    redirect(`/credit/login?from=${encodeURIComponent("/credit/app/services/dispute-letters")}`);
  }

  return <DisputeLettersClient />;
}
