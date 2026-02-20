import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

import { FormResponsesClient } from "./FormResponsesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditFormResponsesPage({ params }: { params: Promise<{ formId: string }> }) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  if (variant !== "credit") notFound();

  await requirePortalUser();

  const { formId } = await params;
  const id = String(formId || "").trim();
  if (!id) notFound();

  return <FormResponsesClient basePath="/credit" formId={id} />;
}
