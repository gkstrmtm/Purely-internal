import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isInlineMime(mime: string) {
  const m = String(mime || "").toLowerCase();
  return (
    m.startsWith("image/") ||
    m.startsWith("video/") ||
    m.startsWith("audio/") ||
    m === "application/pdf"
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  await ensurePortalInboxSchema();

  const { id, token } = await params;

  const row = await (prisma as any).portalInboxAttachment.findFirst({
    where: { id: String(id), publicToken: String(token) },
    select: { bytes: true, fileName: true, mimeType: true, fileSize: true },
  });

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const mimeType = String(row.mimeType || "application/octet-stream");
  const fileName = String(row.fileName || "attachment");
  const disposition = isInlineMime(mimeType) ? "inline" : "attachment";

  const body = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": mimeType,
      "content-length": String(row.fileSize ?? body.byteLength ?? 0),
      "content-disposition": `${disposition}; filename="${fileName.replace(/\"/g, "")}"`,
      // Tokenized URL, safe to cache.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
