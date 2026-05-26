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
        readyToUseAssets: number | bigint | null;
        unscheduledReadyAssets: number | bigint | null;
        needsCaptionAssets: number | bigint | null;
        notesNeededAssets: number | bigint | null;
        needsApprovalAssets: number | bigint | null;
        missingCtaAssets: number | bigint | null;
        manuallyPostedAssets: number | bigint | null;
        providerQueuedAssets: number | bigint | null;
        providerPendingAssets: number | bigint | null;
        providerPublishedAssets: number | bigint | null;
        providerBlockedAssets: number | bigint | null;
        providerFailedAssets: number | bigint | null;
        youtubePreparedAssets: number | bigint | null;
      }>>(
        `
SELECT
  COALESCE(SUM(CASE WHEN ((growth."plannedForAt" IS NOT NULL) OR COALESCE(growth."workflowState", '') = 'planned')
    AND growth."postedAt" IS NULL
    AND COALESCE(growth."workflowState", '') <> 'posted_manually'
    AND COALESCE(growth."providerPublishState", '') NOT IN ('queued', 'pending', 'published', 'failed', 'blocked', 'unavailable')
    THEN 1 ELSE 0 END), 0) AS "plannedPosts",
  COALESCE(SUM(CASE WHEN growth."workflowState" = 'approved' THEN 1 ELSE 0 END), 0) AS "approvedPosts",
  COALESCE(SUM(CASE WHEN growth."workflowState" = 'ready_to_use' THEN 1 ELSE 0 END), 0) AS "readyToUseAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."workflowState", '') IN ('approved', 'ready_to_use') AND growth."plannedForAt" IS NULL AND growth."postedAt" IS NULL THEN 1 ELSE 0 END), 0) AS "unscheduledReadyAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."workflowState", '') IN ('needs_review', 'needs_caption') THEN 1 ELSE 0 END), 0) AS "needsCaptionAssets",
  COALESCE(SUM(CASE WHEN (COALESCE(growth."targetPlatform", '') = 'youtube_video' OR COALESCE(growth."distributionProvider", '') = 'future_youtube') AND COALESCE(BTRIM(growth."notes"), '') = '' THEN 1 ELSE 0 END), 0) AS "notesNeededAssets",
  COALESCE(SUM(CASE WHEN growth."workflowState" = 'needs_approval' THEN 1 ELSE 0 END), 0) AS "needsApprovalAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."ctaHref", '') = '' THEN 1 ELSE 0 END), 0) AS "missingCtaAssets",
  COALESCE(SUM(CASE WHEN (growth."workflowState" = 'posted_manually' OR growth."postedAt" IS NOT NULL) AND COALESCE(growth."providerPublishState", '') <> 'published' THEN 1 ELSE 0 END), 0) AS "manuallyPostedAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."providerPublishState", '') = 'queued' THEN 1 ELSE 0 END), 0) AS "providerQueuedAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."providerPublishState", '') = 'pending' THEN 1 ELSE 0 END), 0) AS "providerPendingAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."providerPublishState", '') = 'published' OR growth."providerPublishedAt" IS NOT NULL OR COALESCE(growth."providerPostId", '') <> '' THEN 1 ELSE 0 END), 0) AS "providerPublishedAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."providerPublishState", '') IN ('blocked', 'unavailable') OR COALESCE(growth."workflowState", '') = 'provider_blocked' OR COALESCE(growth."providerConnectionState", '') IN ('coming_soon', 'not_connected', 'connection_required', 'needs_permissions', 'permission_missing', 'reconnect_required', 'direct_publish_unsupported', 'disabled') THEN 1 ELSE 0 END), 0) AS "providerBlockedAssets",
  COALESCE(SUM(CASE WHEN COALESCE(growth."providerPublishState", '') = 'failed' OR COALESCE(growth."workflowState", '') = 'provider_failed' THEN 1 ELSE 0 END), 0) AS "providerFailedAssets",
  COALESCE(SUM(CASE WHEN media."mimeType" LIKE 'video/%' AND (COALESCE(growth."targetPlatform", '') = 'youtube_video' OR COALESCE(growth."distributionProvider", '') = 'future_youtube') THEN 1 ELSE 0 END), 0) AS "youtubePreparedAssets"
FROM "PortalMediaGrowthProfile" growth
LEFT JOIN "PortalMediaItem" media ON media."id" = growth."mediaItemId"
WHERE growth."ownerId" = $1;
        `,
        ownerId,
      ).catch(() => []),
    ]);

    const continuity = continuityRows[0] || {
      plannedPosts: 0,
      approvedPosts: 0,
      readyToUseAssets: 0,
      unscheduledReadyAssets: 0,
      needsCaptionAssets: 0,
      notesNeededAssets: 0,
      needsApprovalAssets: 0,
      missingCtaAssets: 0,
      manuallyPostedAssets: 0,
      providerQueuedAssets: 0,
      providerPendingAssets: 0,
      providerPublishedAssets: 0,
      providerBlockedAssets: 0,
      providerFailedAssets: 0,
      youtubePreparedAssets: 0,
    };

    const toNumber = (value: number | bigint | null | undefined) => Number(value || 0);

    return NextResponse.json({
      ok: true,
      itemsCount,
      foldersCount,
      distributionContinuity: {
        plannedPosts: toNumber(continuity.plannedPosts),
        approvedPosts: toNumber(continuity.approvedPosts),
        readyToUseAssets: toNumber(continuity.readyToUseAssets),
        unscheduledReadyAssets: toNumber(continuity.unscheduledReadyAssets),
        needsCaptionAssets: toNumber(continuity.needsCaptionAssets),
        notesNeededAssets: toNumber(continuity.notesNeededAssets),
        needsApprovalAssets: toNumber(continuity.needsApprovalAssets),
        missingCtaAssets: toNumber(continuity.missingCtaAssets),
        manuallyPostedAssets: toNumber(continuity.manuallyPostedAssets),
        providerQueuedAssets: toNumber(continuity.providerQueuedAssets),
        providerPendingAssets: toNumber(continuity.providerPendingAssets),
        providerPublishedAssets: toNumber(continuity.providerPublishedAssets),
        providerBlockedAssets: toNumber(continuity.providerBlockedAssets),
        providerFailedAssets: toNumber(continuity.providerFailedAssets),
        youtubePreparedAssets: toNumber(continuity.youtubePreparedAssets),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load media stats" });
  }
}
