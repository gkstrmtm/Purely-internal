import { prisma } from "@/lib/db";
import { newPublicToken, newTag, normalizeNameKey, safeFilename } from "@/lib/portalMedia";

const UPLOADS_FOLDER_NAME = "Uploads";
const UPLOADS_NAME_KEY = normalizeNameKey(UPLOADS_FOLDER_NAME);

async function newUniqueTag(ownerId: string) {
  let tag = newTag();
  for (let i = 0; i < 5; i++) {
    const exists = await (prisma as any).portalMediaItem.findFirst({ where: { ownerId, tag }, select: { id: true } });
    if (!exists) return tag;
    tag = newTag();
  }
  return tag;
}

async function newUniqueFolderTag(ownerId: string) {
  let tag = newTag();
  for (let i = 0; i < 5; i++) {
    const exists = await (prisma as any).portalMediaFolder.findFirst({ where: { ownerId, tag }, select: { id: true } });
    if (!exists) return tag;
    tag = newTag();
  }
  return tag;
}

export async function ensureUploadsFolder(ownerId: string): Promise<{ id: string } | null> {
  const existing = await (prisma as any).portalMediaFolder.findFirst({
    where: { ownerId, parentId: null, nameKey: UPLOADS_NAME_KEY },
    select: { id: true },
  });
  if (existing) return existing;

  const tag = await newUniqueFolderTag(ownerId);
  try {
    const created = await (prisma as any).portalMediaFolder.create({
      data: {
        ownerId,
        parentId: null,
        name: UPLOADS_FOLDER_NAME,
        nameKey: UPLOADS_NAME_KEY,
        tag,
        publicToken: newPublicToken(),
        color: null,
      },
      select: { id: true },
    });
    return created;
  } catch {
    // In case of a race, try once more.
    const again = await (prisma as any).portalMediaFolder.findFirst({
      where: { ownerId, parentId: null, nameKey: UPLOADS_NAME_KEY },
      select: { id: true },
    });
    return again || null;
  }
}

export async function mirrorUploadToMediaLibrary(opts: {
  ownerId: string;
  folderId?: string | null;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<null | { id: string; openUrl: string; downloadUrl: string; shareUrl: string; tag: string }> {
  const { ownerId, bytes } = opts;

  const folderId = opts.folderId ?? (await ensureUploadsFolder(ownerId))?.id ?? null;
  const fileName = safeFilename(opts.fileName || "upload.bin");
  const mimeType = String(opts.mimeType || "application/octet-stream").slice(0, 120);

  const tag = await newUniqueTag(ownerId);
  const publicToken = newPublicToken();

  const row = await (prisma as any).portalMediaItem.create({
    data: {
      ownerId,
      folderId,
      fileName,
      mimeType,
      fileSize: bytes.length,
      bytes,
      tag,
      publicToken,
    },
    select: { id: true, publicToken: true, tag: true },
  });

  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `${openUrl}?download=1`;
  const shareUrl = openUrl;

  return { id: row.id, openUrl, downloadUrl, shareUrl, tag: row.tag };
}
