import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { FunnelEditorClient } from "./FunnelEditorClient";
import { requirePortalUser } from "@/lib/portalAuth";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditFunnelEditorPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) ?? "portal";
  if (variant !== "credit") notFound();

  await requirePortalUser();

  const { funnelId } = await params;
  const id = String(funnelId || "").trim();
  if (!id) notFound();

  return <FunnelEditorClient basePath="/credit" funnelId={id} />;
}
