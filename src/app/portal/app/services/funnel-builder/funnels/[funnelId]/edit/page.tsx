import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { FunnelEditorClient } from "./FunnelEditorClient";
import { prisma } from "@/lib/db";
import { normalizeFunnelThreadMessages } from "@/lib/funnelThreads";
import { normalizeDraftHtmlList, dbHasCreditFunnelPageDraftHtmlColumn, withDraftHtmlSelect } from "@/lib/funnelPageDbCompat";
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
  const basePath = variant === "credit" ? "/credit" : "/portal";

  const user = await requirePortalUser();

  const { funnelId } = await params;
  const id = String(funnelId || "").trim();
  if (!id) notFound();

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
  const [funnel, pages] = await Promise.all([
    prisma.creditFunnel.findFirst({
      where: { id, ownerId: user.id },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.creditFunnelPage.findMany({
      where: { funnelId: id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: withDraftHtmlSelect({
        id: true,
        funnelId: true,
        title: true,
        slug: true,
        sortOrder: true,
        contentMarkdown: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        createdAt: true,
        updatedAt: true,
      }, hasDraftHtml),
    }),
  ]);

  if (!funnel) notFound();

  const initialPages = normalizeDraftHtmlList(pages).map((page) => ({
    ...page,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    customChatJson: normalizeFunnelThreadMessages(page.customChatJson),
    seo: null,
    brief: null,
    trackingSettings: null,
    executionSummary: null,
  }));
  const initialFunnel = {
    ...funnel,
    createdAt: funnel.createdAt.toISOString(),
    updatedAt: funnel.updatedAt.toISOString(),
    assignedDomain: null,
    bookingCalendarId: null,
    bookingDefaults: null,
    seo: null,
    brief: null,
    offers: [],
    trackingSettings: null,
  };
  const initialSelectedPageId = initialPages[0]?.id ?? null;

  return (
    <>
      <style>{`.pa-portal-topbar{display:none !important;}`}</style>
      <FunnelEditorClient
        basePath={basePath}
        funnelId={id}
        initialFunnel={initialFunnel}
        initialPages={initialPages}
        initialSelectedPageId={initialSelectedPageId}
      />
    </>
  );
}
