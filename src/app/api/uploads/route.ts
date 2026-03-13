import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";

import { authOptions } from "@/lib/auth";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 250 * 1024 * 1024; // 250MB

function safeFilename(name: string) {
  return (name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200) || "upload.bin";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerIdRaw = session?.user?.id;
  if (typeof ownerIdRaw !== "string" || !ownerIdRaw.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownerId = ownerIdRaw;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const uploadFile: File = file;

  if (typeof uploadFile.size === "number" && uploadFile.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `"${uploadFile.name || "file"}" is too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))}MB)` },
      { status: 400 },
    );
  }

  const arrayBuffer = await uploadFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Best-effort: keep the media library in sync with any uploads.
  // Cap mirrored bytes to avoid exploding the DB if this endpoint is used for large assets.
  const MAX_MIRROR_BYTES = 25 * 1024 * 1024; // 25MB
  async function tryMirror() {
    if (buffer.length > MAX_MIRROR_BYTES) return null;
    try {
      return await mirrorUploadToMediaLibrary({
        ownerId,
        fileName: uploadFile.name || "upload.bin",
        mimeType: uploadFile.type || "application/octet-stream",
        bytes: buffer,
      });
    } catch {
      return null;
    }
  }

  const mirrored: any = await tryMirror();

  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  const original = safeFilename(uploadFile.name || "upload.bin");
  const id = crypto.randomUUID();
  const relDir = path.posix.join("uploads", day);
  const relPath = path.posix.join(relDir, `${id}-${original}`);

  // Write into public/ so Next can serve it at /uploads/...
  // NOTE: On serverless platforms (e.g., Vercel) this filesystem is often read-only.
  // If the write fails, fall back to returning the DB-backed media item URL (when possible).
  try {
    const absDir = path.join(process.cwd(), "public", relDir);
    const absPath = path.join(process.cwd(), "public", relPath);
    await mkdir(absDir, { recursive: true });
    await writeFile(absPath, buffer);
  } catch {
    const fallback = mirrored ?? (await tryMirror());
    if (fallback?.shareUrl) {
      return NextResponse.json({
        url: String(fallback.shareUrl),
        fileName: original,
        mimeType: file.type || "application/octet-stream",
        fileSize: buffer.length,
        storagePath: null,
        mediaItem: fallback,
        note: "Stored in media library.",
      });
    }

    return NextResponse.json(
      {
        error:
          "Upload storage is not available on this server. Configure external storage for large uploads or use the media library.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: `/${relPath}`,
    fileName: original,
    mimeType: uploadFile.type || "application/octet-stream",
    fileSize: buffer.length,
    storagePath: relPath,
    mediaItem: mirrored,
  });
}
