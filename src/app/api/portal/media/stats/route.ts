import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { ensurePortalMediaGrowthSchema } from "@/lib/portalMediaGrowthSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;

  try {
    await ensurePortalMediaGrowthSchema().catch(() => null);

    const [itemsCount, foldersCount, continuityRows] = await Promise.all([
      (prisma as any).portalMediaItem.count({ where: { ownerId } }),
      (prisma as any).portalMediaFolder.count({ where: { ownerId } }),
      prisma.$queryRawUnsafe<Array<{
        plannedPosts: number | bigint | null;
        approvedPosts: number | bigint | null;
        manuallyPostedAssets: number | bigint | null;
        providerReadyAssets: number | bigint | null;
        providerBlockedAssets: number | bigint | null;
        providerFailedAssets: number | bigint | null;
      }>>(
        `
SELECT
  COALESCE(SUM(CASE WHEN "workflowState" = 'planned' THEN 1 ELSE 0 END), 0) AS "plannedPosts",
  COALESCE(SUM(CASE WHEN "workflowState" = 'approved' THEN 1 ELSE 0 END), 0) AS "approvedPosts",
  COALESCE(SUM(CASE WHEN "workflowState" = 'posted_manually' OR "postedAt" IS NOT NULL THEN 1 ELSE 0 END), 0) AS "manuallyPostedAssets",
  COALESCE(SUM(CASE WHEN COALESCE("providerConnectionState", '') = 'connected' OR COALESCE("providerPublishState", '') IN ('queued', 'published', 'ready') THEN 1 ELSE 0 END), 0) AS "providerReadyAssets",
  COALESCE(SUM(CASE WHEN COALESCE("workflowState", '') = 'provider_blocked' OR COALESCE("providerConnectionState", '') IN ('not_connected', 'connection_required', 'needs_permissions', 'permission_missing', 'reconnect_required', 'direct_publish_unsupported') THEN 1 ELSE 0 END), 0) AS "providerBlockedAssets",
  COALESCE(SUM(CASE WHEN COALESCE("workflowState", '') = 'provider_failed' OR COALESCE("providerPublishState", '') = 'failed' OR COALESCE("providerLastError", '') <> '' THEN 1 ELSE 0 END), 0) AS "providerFailedAssets"
FROM "PortalMediaGrowthProfile"
WHERE "ownerId" = $1;
        `,
        ownerId,
      ).catch(() => []),
    ]);

    const continuity = continuityRows[0] || {
      plannedPosts: 0,
      approvedPosts: 0,
      manuallyPostedAssets: 0,
      providerReadyAssets: 0,
      providerBlockedAssets: 0,
      providerFailedAssets: 0,
    };

    const toNumber = (value: number | bigint | null | undefined) => Number(value || 0);

    return NextResponse.json({
      ok: true,
      itemsCount,
      foldersCount,
      distributionContinuity: {
        plannedPosts: toNumber(continuity.plannedPosts),
        approvedPosts: toNumber(continuity.approvedPosts),
        manuallyPostedAssets: toNumber(continuity.manuallyPostedAssets),
        providerReadyAssets: toNumber(continuity.providerReadyAssets),
        providerBlockedAssets: toNumber(continuity.providerBlockedAssets),
        providerFailedAssets: toNumber(continuity.providerFailedAssets),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load media stats" });
  }
}
