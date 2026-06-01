import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { isLikelyImageMimeType } from "@/lib/portalMedia";
import { getPortalMediaGrowthProfiles } from "@/lib/portalMediaGrowth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MEDIA_LIST_TTL_MS = 5 * 1000;

type MediaListPayload = {
  ok: true;
  folder: {
    id: string;
    name: string;
    parentId: string | null;
    tag: string;
    createdAt: string;
    shareUrl: string;
    downloadUrl: string;
    color: string | null;
  } | null;
  breadcrumbs: Array<{
    id: string;
    name: string;
    parentId: string | null;
    tag: string;
    createdAt: string;
    shareUrl: string;
    downloadUrl: string;
    color: string | null;
  }>;
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
    tag: string;
    createdAt: string;
    shareUrl: string;
    downloadUrl: string;
    color: string | null;
  }>;
  items: Array<{
    id: string;
    folderId: string | null;
    fileName: string;
    mimeType: string;
    fileSize: number;
    tag: string;
    createdAt: string;
    growthProfile: unknown;
    openUrl: string;
    downloadUrl: string;
    shareUrl: string;
    previewUrl?: string;
  }>;
};

const mediaListCache = new Map<string, { value: MediaListPayload; expiresAt: number }>();
const mediaListInFlight = new Map<string, Promise<MediaListPayload>>();

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string; fileName: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}?download=1`;
  // For files, "share" should be the raw file URL (easy to embed on websites).
  const shareUrl = openUrl;
  const previewUrl = isLikelyImageMimeType(row.mimeType, row.fileName) ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

function folderUrls(row: { id: string; publicToken: string }) {
  // For folders, share a hosted browsing page; keep zip download as a separate URL.
  const shareUrl = `/media/f/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/folder/${row.id}/${row.publicToken}`;
  return { shareUrl, downloadUrl };
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");
  const allowCache = req.headers.get("x-pa-media-list-cache") === "allow";
  const cacheKey = `${ownerId}:${folderId || "__root__"}`;
  if (allowCache) {
    const cached = mediaListCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.value);
    }
  }

  if (allowCache) {
    const inFlight = mediaListInFlight.get(cacheKey);
    if (inFlight) {
      return NextResponse.json(await inFlight);
    }
  }

  const request = (async (): Promise<MediaListPayload> => {
    const folder = folderId
      ? await (prisma as any).portalMediaFolder.findFirst({
          where: { id: folderId, ownerId },
          select: { id: true, name: true, parentId: true, tag: true, publicToken: true, color: true, createdAt: true },
        })
      : null;

    if (folderId && !folder) {
      throw new Error("Folder not found");
    }

    // Breadcrumbs (root -> current)
    const breadcrumbs: Array<{ id: string; name: string; parentId: string | null; tag: string; publicToken: string; createdAt: Date }> = [];
    if (folder) {
      let cur: any = folder;
      breadcrumbs.unshift(cur);

      while (cur?.parentId) {
        const parent = await (prisma as any).portalMediaFolder.findFirst({
          where: { id: cur.parentId, ownerId },
          select: { id: true, name: true, parentId: true, tag: true, publicToken: true, color: true, createdAt: true },
        });
        if (!parent) break;
        breadcrumbs.unshift(parent);
        cur = parent;
      }
    }

    const [folders, items] = await Promise.all([
      (prisma as any).portalMediaFolder.findMany({
        where: { ownerId, parentId: folderId },
        orderBy: [{ nameKey: "asc" }],
        select: { id: true, name: true, parentId: true, tag: true, publicToken: true, color: true, createdAt: true },
      }),
      (prisma as any).portalMediaItem.findMany({
        where: { ownerId, folderId: folderId },
        orderBy: [{ createdAt: "desc" }],
        select: { id: true, folderId: true, fileName: true, mimeType: true, fileSize: true, tag: true, publicToken: true, createdAt: true },
        take: 500,
      }),
    ]);

    const growthProfiles = await getPortalMediaGrowthProfiles(
      ownerId,
      items.map((it: any) => String(it.id)),
    ).catch(() => new Map());

    return {
      ok: true,
      folder: folder
        ? {
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
            tag: folder.tag,
            createdAt: folder.createdAt.toISOString(),
            ...folderUrls(folder),
            color: folder.color ?? null,
          }
        : null,
      breadcrumbs: breadcrumbs.map((b) => ({
        id: b.id,
        name: b.name,
        parentId: b.parentId,
        tag: b.tag,
        createdAt: b.createdAt.toISOString(),
        ...folderUrls(b),
        color: (b as any).color ?? null,
      })),
      folders: folders.map((f: any) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        tag: f.tag,
        createdAt: f.createdAt.toISOString(),
        ...folderUrls(f),
        color: f.color ?? null,
      })),
      items: items.map((it: any) => ({
        id: it.id,
        folderId: it.folderId,
        fileName: it.fileName,
        mimeType: it.mimeType,
        fileSize: it.fileSize,
        tag: it.tag,
        createdAt: it.createdAt.toISOString(),
        growthProfile: growthProfiles.get(String(it.id)) ?? null,
        ...mediaItemUrls(it),
      })),
    };
  })();

  if (allowCache) {
    mediaListInFlight.set(cacheKey, request);
  }
  try {
    const payload = await request;
    if (allowCache) {
      mediaListCache.set(cacheKey, {
        value: payload,
        expiresAt: Date.now() + MEDIA_LIST_TTL_MS,
      });
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "Folder not found") {
      return NextResponse.json({ ok: false, error: "Folder not found" }, { status: 404 });
    }
    throw error;
  } finally {
    if (allowCache && mediaListInFlight.get(cacheKey) === request) {
      mediaListInFlight.delete(cacheKey);
    }
  }
}
