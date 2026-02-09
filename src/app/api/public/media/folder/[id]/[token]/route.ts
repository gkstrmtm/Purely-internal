import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { newPublicToken } from "@/lib/portalMedia";
import { createZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function looksLikeNullToken(token: string) {
  const t = String(token || "").trim().toLowerCase();
  return !t || t === "null" || t === "undefined";
}

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}?download=1`;
  const shareUrl = openUrl;
  const previewUrl = String(row.mimeType || "").startsWith("image/") ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

function folderUrls(row: { id: string; publicToken: string }) {
  const shareUrl = `/media/f/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/folder/${row.id}/${row.publicToken}`;
  return { shareUrl, downloadUrl };
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

  let tokenToUse = String(token);

  // Backward-compat: older links may have used a literal 'null' token when the DB row had no token yet.
  // If that happens, mint and persist a token so future links are stable.
  if (looksLikeNullToken(tokenToUse)) {
    const byId = await (prisma as any).portalMediaFolder.findFirst({
      where: { id: String(id) },
      select: { id: true, ownerId: true, name: true, parentId: true, tag: true, publicToken: true, createdAt: true },
    });

    if (!byId) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const existing = typeof byId.publicToken === "string" ? byId.publicToken.trim() : "";
    if (!existing) {
      const nextToken = newPublicToken();
      try {
        await (prisma as any).portalMediaFolder.update({
          where: { id: byId.id },
          data: { publicToken: nextToken },
          select: { id: true },
        });
      } catch {
        // ignore
      }
      (byId as any).publicToken = nextToken;
    }

    // Serve as if the correct token was used.
    const effectiveToken = (byId.publicToken as string).trim();
    tokenToUse = effectiveToken;
    const folder = { ...byId, publicToken: effectiveToken };

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
          ...folderUrls(folder),
        },
        folders: folders.map((f: any) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          tag: f.tag,
          createdAt: f.createdAt.toISOString(),
          ...folderUrls(f),
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

    // For zip downloads, fall through and use tokenToUse for the normal handler logic.
  }

  const folder = await (prisma as any).portalMediaFolder.findFirst({
    where: { id: String(id), publicToken: String(tokenToUse) },
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
        ...folderUrls(folder),
      },
      folders: folders.map((f: any) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        tag: f.tag,
        createdAt: f.createdAt.toISOString(),
        ...folderUrls(f),
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

  const items = await (prisma as any).portalMediaItem.findMany({
    where: { ownerId: folder.ownerId, folderId: { in: subtreeIds } },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, folderId: true, fileName: true, fileSize: true, bytes: true },
    take: 2000,
  });

  const MAX_FILES = 1000;
  const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB
  if (items.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Too many files to zip (max ${MAX_FILES}).` }, { status: 400 });
  }

  const totalBytes = items.reduce((sum: number, m: any) => sum + (Number(m.fileSize) || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ ok: false, error: "Folder is too large to zip." }, { status: 400 });
  }

  const zipFiles: Array<{ path: string; data: Uint8Array }> = [];
  for (const it of items) {
    if (!it?.bytes) continue;

    const data = it.bytes as unknown as Uint8Array;
    const folderPath = folderPathById.get(it.folderId || "") || "";
    const fileName = safeZipFilename(it.fileName);
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
    zipFiles.push({ path: filePath, data });
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
