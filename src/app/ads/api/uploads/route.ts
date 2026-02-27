import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";

import { requireAdsUser } from "@/lib/adsAuth";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";

function safeFilename(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

export async function POST(req: Request) {
  const user = await requireAdsUser();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Best-effort: keep the media library in sync with any uploads.
  const MAX_MIRROR_BYTES = 25 * 1024 * 1024; // 25MB
  let mirrored: any = null;
  if (buffer.length <= MAX_MIRROR_BYTES) {
    try {
      mirrored = await mirrorUploadToMediaLibrary({
        ownerId: user.id,
        fileName: file.name || "upload.bin",
        mimeType: file.type || "application/octet-stream",
        bytes: buffer,
      });
    } catch {
      // ignore
    }
  }

  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const original = safeFilename(file.name || "upload.bin");
  const id = crypto.randomUUID();
  const relDir = path.posix.join("uploads", day);
  const relPath = path.posix.join(relDir, `${id}-${original}`);

  const absDir = path.join(process.cwd(), "public", relDir);
  const absPath = path.join(process.cwd(), "public", relPath);
  await mkdir(absDir, { recursive: true });
  await writeFile(absPath, buffer);

  return NextResponse.json({
    url: `/${relPath}`,
    fileName: original,
    mimeType: file.type || "application/octet-stream",
    fileSize: buffer.length,
    storagePath: relPath,
    mediaItem: mirrored,
  });
}
