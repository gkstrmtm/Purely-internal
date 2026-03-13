import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeMimeType } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function contentDispositionInline(fileName: string) {
  const safe = String(fileName || "file").replace(/[\r\n"]/g, "").slice(0, 200);
  return `inline; filename="${safe}"`;
}

function contentDispositionAttachment(fileName: string) {
  const safe = String(fileName || "file").replace(/[\r\n"]/g, "").slice(0, 200);
  return `attachment; filename="${safe}"`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  const { searchParams } = new URL(req.url);
  const shouldDownload = searchParams.get("download") === "1";

  const row = await (prisma as any).portalMediaItem.findFirst({
    where: { id: String(id), publicToken: String(token) },
    select: { bytes: true, storageUrl: true, mimeType: true, fileName: true, fileSize: true, createdAt: true },
  });

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const storageUrl = typeof row.storageUrl === "string" ? row.storageUrl.trim() : "";
  const hasBytes = row.bytes !== null && row.bytes !== undefined && (row.bytes as any).length !== undefined;

  if (!hasBytes && storageUrl) {
    // Blob URLs are already content-addressed/unique; safe to cache.
    // Use a redirect so we don't proxy large payloads through our server.
    return NextResponse.redirect(storageUrl, { status: 302 });
  }

  const headers = new Headers();
  headers.set("content-type", normalizeMimeType(row.mimeType, row.fileName));
  headers.set(
    "content-disposition",
    shouldDownload ? contentDispositionAttachment(row.fileName) : contentDispositionInline(row.fileName),
  );
  headers.set("cache-control", "public, max-age=3600");

  const bytes = row.bytes as unknown as Uint8Array;
  const body = new Uint8Array(bytes);
  headers.set("content-length", String(row.fileSize || body.byteLength));
  return new Response(body, { status: 200, headers });
}
