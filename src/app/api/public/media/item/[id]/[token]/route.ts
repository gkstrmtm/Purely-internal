import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeMimeType } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function parseRangeHeader(rangeHeader: string, totalLength: number): null | { start: number; end: number } {
  const raw = String(rangeHeader || "").trim();
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bytes=")) return null;

  const spec = raw.slice("bytes=".length).trim();
  const [startRaw, endRaw] = spec.split("-", 2);
  if (!startRaw && !endRaw) return null;

  // bytes=START-END
  if (startRaw) {
    const start = Number(startRaw);
    const end = endRaw ? Number(endRaw) : totalLength - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || end < 0) return null;
    if (start > end) return null;
    if (start >= totalLength) return null;
    return { start, end: Math.min(end, totalLength - 1) };
  }

  // bytes=-SUFFIX_LEN (last N bytes)
  const suffixLen = Number(endRaw);
  if (!Number.isFinite(suffixLen) || suffixLen <= 0) return null;
  const len = Math.min(suffixLen, totalLength);
  return { start: totalLength - len, end: totalLength - 1 };
}

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

  const mediaItemDelegate = (prisma as any)?.portalMediaItem;
  if (!mediaItemDelegate?.findFirst) {
    return NextResponse.json({ ok: false, error: "Media library is not available on this server." }, { status: 500 });
  }

  let row: any = null;
  try {
    row = await mediaItemDelegate.findFirst({
      where: { id: String(id), publicToken: String(token) },
      select: { bytes: true, storageUrl: true, mimeType: true, fileName: true, fileSize: true, createdAt: true },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const storageUrl = typeof row.storageUrl === "string" ? row.storageUrl.trim() : "";
  const hasBytes = row.bytes !== null && row.bytes !== undefined && (row.bytes as any).length !== undefined;

  if (!hasBytes && storageUrl) {
    // Blob URLs are already content-addressed/unique; safe to cache.
    // Use a redirect so we don't proxy large payloads through our server.
    const target = storageUrl.startsWith("http://") || storageUrl.startsWith("https://")
      ? storageUrl
      : new URL(storageUrl, req.url).toString();
    return NextResponse.redirect(target, { status: 302 });
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
  const totalLength = body.byteLength;
  headers.set("accept-ranges", "bytes");

  const rangeHeader = req.headers.get("range");
  const range = rangeHeader ? parseRangeHeader(rangeHeader, totalLength) : null;
  if (range) {
    const { start, end } = range;
    const chunk = body.slice(start, end + 1);
    headers.set("content-length", String(chunk.byteLength));
    headers.set("content-range", `bytes ${start}-${end}/${totalLength}`);
    return new Response(chunk, { status: 206, headers });
  }

  if (rangeHeader) {
    // Range header present but invalid.
    headers.set("content-range", `bytes */${totalLength}`);
    return new Response(null, { status: 416, headers });
  }

  headers.set("content-length", String(row.fileSize || totalLength));
  return new Response(body, { status: 200, headers });
}
