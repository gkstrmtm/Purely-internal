import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";
import { newPublicToken, newTag, safeFilename } from "@/lib/portalMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024; // 25MB per file

function mediaItemUrls(row: { id: string; publicToken: string; mimeType: string }) {
  const openUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}?download=1`;
  const shareUrl = openUrl;
  const previewUrl = String(row.mimeType || "").startsWith("image/") ? openUrl : undefined;
  return { openUrl, downloadUrl, shareUrl, previewUrl };
}

export async function POST(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Invalid form" }, { status: 400 });

  const files = form.getAll("files").filter((f) => f instanceof File) as File[];
  if (!files.length) return NextResponse.json({ ok: false, error: "No files" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ ok: false, error: `Too many files (max ${MAX_FILES})` }, { status: 400 });

  const created: any[] = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `"${file.name}" is too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))}MB)` },
        { status: 400 },
      );
    }

    let tag = newTag();
    for (let i = 0; i < 5; i++) {
      const exists = await (prisma as any).portalMediaItem.findFirst({ where: { ownerId, tag }, select: { id: true } });
      if (!exists) break;
      tag = newTag();
    }

    const row = await (prisma as any).portalMediaItem.create({
      data: {
        ownerId,
        folderId: null,
        fileName: safeFilename(file.name || "upload.bin"),
        mimeType: String(file.type || "application/octet-stream").slice(0, 120),
        fileSize: buffer.length,
        bytes: buffer,
        tag,
        publicToken: newPublicToken(),
      },
      select: { id: true, fileName: true, mimeType: true, fileSize: true, tag: true, publicToken: true, createdAt: true },
    });

    created.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      tag: row.tag,
      createdAt: row.createdAt?.toISOString?.() ?? null,
      ...mediaItemUrls(row),
    });
  }

  return NextResponse.json({ ok: true, items: created });
}
