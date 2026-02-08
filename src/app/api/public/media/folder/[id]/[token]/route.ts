import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}?download=1`;
  const shareUrl = `/media/i/${row.id}/${row.publicToken}`;
  const previewUrl = String(row.mimeType || "").startsWith("image/") ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

function folderShareUrl(row: { id: string; publicToken: string }) {
  return `/api/public/media/folder/${row.id}/${row.publicToken}`;
}

function safeZipSegment(name: string) {
  return String(name || "")
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "folder";
}

function safeZipFilename(name: string) {
  const s = String(name || "file")
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/[\\/]/g, "-")
    .trim()
    .slice(0, 200);
  return s || "file";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  const { searchParams } = new URL(req.url);
  const wantsJson = searchParams.get("json") === "1";

  const folder = await (prisma as any).portalMediaFolder.findFirst({
    where: { id: String(id), publicToken: String(token) },
    select: { id: true, ownerId: true, name: true, parentId: true, tag: true, publicToken: true, createdAt: true },
  });

  if (!folder) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // If explicitly requested, return JSON listing (debug / internal).
  if (wantsJson) {
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

  // Default: download the folder as a zip.
  // Fetch all folders for the owner once, compute subtree, then fetch items.
  const allFolders = await (prisma as any).portalMediaFolder.findMany({
    where: { ownerId: folder.ownerId },
    select: { id: true, parentId: true, name: true },
    take: 5000,
  });

  const children = new Map<string, Array<{ id: string; parentId: string | null; name: string }>>();
  for (const f of allFolders) {
    const key = String(f.parentId || "");
    const arr = children.get(key) ?? [];
    arr.push({ id: f.id, parentId: f.parentId, name: f.name });
    children.set(key, arr);
  }

  const subtreeIds: string[] = [];
  const stack: Array<{ id: string; path: string }> = [{ id: folder.id, path: "" }];
  const folderPathById = new Map<string, string>();
  folderPathById.set(folder.id, "");

  while (stack.length) {
    const cur = stack.pop()!;
    subtreeIds.push(cur.id);

    const kids = children.get(cur.id) ?? [];
    for (const k of kids) {
      const seg = safeZipSegment(k.name);
      const nextPath = cur.path ? `${cur.path}/${seg}` : seg;
      folderPathById.set(k.id, nextPath);
      stack.push({ id: k.id, path: nextPath });
    }
  }

  const metas = await (prisma as any).portalMediaItem.findMany({
    where: { ownerId: folder.ownerId, folderId: { in: subtreeIds } },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, folderId: true, fileName: true, fileSize: true },
    take: 2000,
  });

  const MAX_FILES = 1000;
  const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB
  if (metas.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Too many files to zip (max ${MAX_FILES}).` }, { status: 400 });
  }

  const totalBytes = metas.reduce((sum: number, m: any) => sum + (Number(m.fileSize) || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ ok: false, error: "Folder is too large to zip." }, { status: 400 });
  }

  const zipFiles: Array<{ path: string; data: Uint8Array }> = [];
  for (const m of metas) {
    // eslint-disable-next-line no-await-in-loop
    const row = await (prisma as any).portalMediaItem.findFirst({
      where: { id: m.id, publicToken: { not: null } },
      select: { bytes: true },
    });
    if (!row?.bytes) continue;

    const folderPath = folderPathById.get(m.folderId || "") || "";
    const fileName = safeZipFilename(m.fileName);
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
    zipFiles.push({ path: filePath, data: row.bytes as unknown as Uint8Array });
  }

  const zipBytes = createZip(zipFiles, { mtime: new Date() });
  const zipName = `${safeZipSegment(folder.name)}.zip`;

  const headers = new Headers();
  headers.set("content-type", "application/zip");
  headers.set("content-disposition", `attachment; filename="${zipName}"`);
  headers.set("cache-control", "public, max-age=3600");
  headers.set("content-length", String(zipBytes.byteLength));

  // Ensure BodyInit typing works in Next build.
  return new Response(new Uint8Array(zipBytes), { status: 200, headers });
}
