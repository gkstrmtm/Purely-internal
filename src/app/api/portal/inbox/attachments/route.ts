import { NextResponse } from "next/server";
import crypto from "crypto";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeFilename(name: string) {
  return String(name || "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per file

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();

  const ownerId = auth.session.user.id;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Invalid form" }, { status: 400 });

  const fileValues = form.getAll("files");
  const files = fileValues.filter((v): v is File => v instanceof File);

  if (!files.length) return NextResponse.json({ ok: false, error: "Missing files" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Too many files (max ${MAX_FILES})` }, { status: 400 });
  }

  const attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    url: string;
  }> = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `"${file.name}" is too large (max 10MB)` },
        { status: 400 },
      );
    }

    const fileName = safeFilename(file.name || "upload.bin");
    const mimeType = String(file.type || "application/octet-stream").slice(0, 120);
    const publicToken = crypto.randomUUID().replace(/-/g, "");

    const row = await (prisma as any).portalInboxAttachment.create({
      data: {
        ownerId,
        messageId: null,
        fileName,
        mimeType,
        fileSize: buffer.length,
        bytes: buffer,
        publicToken,
      },
      select: { id: true, fileName: true, mimeType: true, fileSize: true, publicToken: true },
    });

    // Best-effort: mirror into Media Library.
    try {
      await mirrorUploadToMediaLibrary({ ownerId, fileName, mimeType, bytes: buffer });
    } catch {
      // ignore
    }

    attachments.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      url: `/api/public/inbox/attachment/${row.id}/${row.publicToken}`,
    });
  }

  return NextResponse.json({ ok: true, attachments });
}
