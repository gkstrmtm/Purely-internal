import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string }) {
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const shareUrl = `/media/i/${row.id}/${row.publicToken}`;
  const previewUrl = String(row.mimeType || "").startsWith("image/") ? downloadUrl : undefined;
  return { downloadUrl, shareUrl, previewUrl };
}

function folderShareUrl(row: { id: string; publicToken: string }) {
  return `/media/f/${row.id}/${row.publicToken}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;

  const folder = await (prisma as any).portalMediaFolder.findFirst({
    where: { id: String(id), publicToken: String(token) },
    select: { id: true, ownerId: true, name: true, parentId: true, tag: true, publicToken: true, createdAt: true },
  });

  if (!folder) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const [folders, items] = await Promise.all([
    (prisma as any).portalMediaFolder.findMany({
      where: { ownerId: folder.ownerId, parentId: folder.id },
      orderBy: [{ nameKey: "asc" }],
      select: { id: true, name: true, parentId: true, tag: true, publicToken: true, createdAt: true },
    }),
    (prisma as any).portalMediaItem.findMany({
      where: { ownerId: folder.ownerId, folderId: folder.id },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, folderId: true, fileName: true, mimeType: true, fileSize: true, tag: true, publicToken: true, createdAt: true },
      take: 500,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    folder: {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      tag: folder.tag,
      createdAt: folder.createdAt.toISOString(),
      shareUrl: folderShareUrl(folder),
    },
    folders: folders.map((f: any) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      tag: f.tag,
      createdAt: f.createdAt.toISOString(),
      shareUrl: folderShareUrl(f),
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
