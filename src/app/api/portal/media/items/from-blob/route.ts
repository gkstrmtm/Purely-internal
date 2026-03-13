import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { isLikelyImageMimeType, newPublicToken, newTag, normalizeMimeType, safeFilename } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const postSchema = z.object({
  url: z.string().url(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  folderId: z.string().optional().nullable(),
});

function isAllowedBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Public Vercel Blob URLs end with this domain.
    return host === "blob.vercel-storage.com" || host.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string; fileName: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `${openUrl}?download=1`;
  const shareUrl = openUrl;
  const previewUrl = isLikelyImageMimeType(row.mimeType, row.fileName) ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const url = String(parsed.data.url || "").trim();
  if (!isAllowedBlobUrl(url)) {
    return NextResponse.json({ ok: false, error: "Invalid blob URL" }, { status: 400 });
  }

  const fileName = safeFilename(parsed.data.fileName || "upload.bin");
  const mimeType = normalizeMimeType(parsed.data.mimeType, fileName);
  const fileSize = Number.isFinite(parsed.data.fileSize) ? parsed.data.fileSize : 0;

  // Prevent accidental gigantic rows/entries.
  const MAX_BYTES = 250 * 1024 * 1024;
  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `File too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))}MB)` }, { status: 400 });
  }

  const folderIdRaw = parsed.data.folderId;
  const folderId = typeof folderIdRaw === "string" && folderIdRaw.trim() ? folderIdRaw.trim() : null;

  if (folderId) {
    const folder = await (prisma as any).portalMediaFolder.findFirst({ where: { id: folderId, ownerId }, select: { id: true } });
    if (!folder) return NextResponse.json({ ok: false, error: "Folder not found" }, { status: 404 });
  }

  // Generate a tag that is unique per owner.
  let tag = newTag();
  for (let i = 0; i < 5; i++) {
    const exists = await (prisma as any).portalMediaItem.findFirst({ where: { ownerId, tag }, select: { id: true } });
    if (!exists) break;
    tag = newTag();
  }

  const row = await (prisma as any).portalMediaItem.create({
    data: {
      ownerId,
      folderId,
      fileName,
      mimeType,
      fileSize,
      storageUrl: url,
      bytes: null,
      tag,
      publicToken: newPublicToken(),
    },
    select: { id: true, folderId: true, fileName: true, mimeType: true, fileSize: true, tag: true, publicToken: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    item: {
      id: row.id,
      folderId: row.folderId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      tag: row.tag,
      createdAt: row.createdAt.toISOString(),
      ...mediaItemUrls(row),
    },
  });
}
