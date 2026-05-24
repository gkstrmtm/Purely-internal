import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import {
  getPortalMediaGrowthContext,
  getPortalMediaGrowthProfile,
  MEDIA_DISTRIBUTION_PROVIDER_KEYS,
  MEDIA_GROWTH_STATES,
  MEDIA_PROVIDER_CONNECTION_STATES,
  MEDIA_PROVIDER_PUBLISH_STATES,
  upsertPortalMediaGrowthProfile,
} from "@/lib/portalMediaGrowth";
import { isLikelyImageMimeType } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z.object({
  fileName: z.string().min(1).max(200).optional(),
  folderId: z.string().min(1).optional().nullable(),
  growthProfile: z.object({
    workflowState: z.enum(MEDIA_GROWTH_STATES).optional().nullable(),
    assetPurpose: z.string().max(160).optional().nullable(),
    relatedOffer: z.string().max(160).optional().nullable(),
    targetPlatform: z.string().max(80).optional().nullable(),
    campaignLabel: z.string().max(160).optional().nullable(),
    captionDraft: z.string().max(12000).optional().nullable(),
    ctaLabel: z.string().max(120).optional().nullable(),
    ctaHref: z.string().max(2000).optional().nullable(),
    notes: z.string().max(12000).optional().nullable(),
    bookingLinkUrl: z.string().max(2000).optional().nullable(),
    funnelId: z.string().max(80).optional().nullable(),
    funnelName: z.string().max(200).optional().nullable(),
    funnelSlug: z.string().max(160).optional().nullable(),
    funnelPageId: z.string().max(80).optional().nullable(),
    funnelPageTitle: z.string().max(200).optional().nullable(),
    funnelPageSlug: z.string().max(160).optional().nullable(),
    plannedForIso: z.string().max(80).optional().nullable(),
    approvedAtIso: z.string().max(80).optional().nullable(),
    postedAtIso: z.string().max(80).optional().nullable(),
    postedUrl: z.string().max(2000).optional().nullable(),
    distributionProvider: z.enum(MEDIA_DISTRIBUTION_PROVIDER_KEYS).optional().nullable(),
    providerConnectionState: z.enum(MEDIA_PROVIDER_CONNECTION_STATES).optional().nullable(),
    providerPublishState: z.enum(MEDIA_PROVIDER_PUBLISH_STATES).optional().nullable(),
    providerAccountLabel: z.string().max(200).optional().nullable(),
    queueOrder: z.number().int().min(1).max(999).optional().nullable(),
    dailyPostCap: z.number().int().min(1).max(20).optional().nullable(),
    providerPostId: z.string().max(200).optional().nullable(),
    providerLastError: z.string().max(4000).optional().nullable(),
    providerLastAttemptAtIso: z.string().max(80).optional().nullable(),
    providerPublishedAtIso: z.string().max(80).optional().nullable(),
    metricsImpressions: z.number().int().min(0).max(2000000000).optional().nullable(),
    metricsReach: z.number().int().min(0).max(2000000000).optional().nullable(),
    metricsEngagementCount: z.number().int().min(0).max(2000000000).optional().nullable(),
    metricsClickCount: z.number().int().min(0).max(2000000000).optional().nullable(),
    metricsSyncedAtIso: z.string().max(80).optional().nullable(),
  }).optional(),
});

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string; fileName: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}?download=1`;
  const shareUrl = openUrl;
  const previewUrl = isLikelyImageMimeType(row.mimeType, row.fileName) ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

function sanitizeName(raw: string) {
  return String(raw || "")
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const existing = await (prisma as any).portalMediaItem.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      folderId: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      tag: true,
      publicToken: true,
      createdAt: true,
    },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const [growthProfile, context] = await Promise.all([
    getPortalMediaGrowthProfile(ownerId, String(existing.id)),
    getPortalMediaGrowthContext(ownerId),
  ]);

  return NextResponse.json({
    ok: true,
    item: {
      id: existing.id,
      folderId: existing.folderId,
      fileName: existing.fileName,
      mimeType: existing.mimeType,
      fileSize: existing.fileSize,
      tag: existing.tag,
      createdAt: existing.createdAt.toISOString(),
      growthProfile,
      ...mediaItemUrls(existing),
    },
    context,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const existing = await (prisma as any).portalMediaItem.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const nextFolderId = parsed.data.folderId === undefined ? undefined : parsed.data.folderId ? String(parsed.data.folderId) : null;
  if (nextFolderId) {
    const folder = await (prisma as any).portalMediaFolder.findFirst({ where: { id: nextFolderId, ownerId }, select: { id: true } });
    if (!folder) return NextResponse.json({ ok: false, error: "Folder not found" }, { status: 404 });
  }

  const nextFileName = parsed.data.fileName === undefined ? undefined : sanitizeName(parsed.data.fileName);
  if (parsed.data.fileName !== undefined && !nextFileName) {
    return NextResponse.json({ ok: false, error: "Invalid file name" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (nextFileName !== undefined) data.fileName = nextFileName;
  if (nextFolderId !== undefined) data.folderId = nextFolderId;
  if (Object.keys(data).length) {
    await (prisma as any).portalMediaItem.update({ where: { id }, data });
  }

  const growthProfile = parsed.data.growthProfile
    ? await upsertPortalMediaGrowthProfile(ownerId, String(id), parsed.data.growthProfile)
    : await getPortalMediaGrowthProfile(ownerId, String(id));

  return NextResponse.json({ ok: true, growthProfile });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const existing = await (prisma as any).portalMediaItem.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await (prisma as any).portalMediaItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
