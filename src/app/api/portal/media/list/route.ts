import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}?download=1`;
  // For files, "share" should be the raw file URL (easy to embed on websites).
  const shareUrl = openUrl;
  const previewUrl = String(row.mimeType || "").startsWith("image/") ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

function folderUrls(row: { id: string; publicToken: string }) {
  // For folders, share a hosted browsing page; keep zip download as a separate URL.
  const shareUrl = `/media/f/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/folder/${row.id}/${row.publicToken}`;
  return { shareUrl, downloadUrl };
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");

  const folder = folderId
    ? await (prisma as any).portalMediaFolder.findFirst({
        where: { id: folderId, ownerId },
        select: { id: true, name: true, parentId: true, tag: true, publicToken: true, color: true, createdAt: true },
      })
    : null;

  if (folderId && !folder) {
    return NextResponse.json({ ok: false, error: "Folder not found" }, { status: 404 });
  }

  // Breadcrumbs (root → current)
  const breadcrumbs: Array<{ id: string; name: string; parentId: string | null; tag: string; publicToken: string; createdAt: Date }> = [];
  if (folder) {
    let cur: any = folder;
    // include current folder
    breadcrumbs.unshift(cur);

    while (cur?.parentId) {
      // eslint-disable-next-line no-await-in-loop
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

  return NextResponse.json({
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
      ...mediaItemUrls(it),
    })),
  });
}
