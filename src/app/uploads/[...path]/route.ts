import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeMimeType } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function contentDispositionInline(fileName: string) {
  const safe = String(fileName || "file").replace(/[\r\n"]/g, "").slice(0, 200);
  return `inline; filename="${safe}"`;
}

function parseRangeHeader(rangeHeader: string, totalLength: number): null | { start: number; end: number } {
  const raw = String(rangeHeader || "").trim();
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bytes=")) return null;

  const spec = raw.slice("bytes=".length).trim();
  const [startRaw, endRaw] = spec.split("-", 2);
  if (!startRaw && !endRaw) return null;

  if (startRaw) {
    const start = Number(startRaw);
    const end = endRaw ? Number(endRaw) : totalLength - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || end < 0) return null;
    if (start > end) return null;
    if (start >= totalLength) return null;
    return { start, end: Math.min(end, totalLength - 1) };
  }

  const suffixLen = Number(endRaw);
  if (!Number.isFinite(suffixLen) || suffixLen <= 0) return null;
  const len = Math.min(suffixLen, totalLength);
  return { start: totalLength - len, end: totalLength - 1 };
}

function parseUuidPrefixedName(basename: string): null | { originalFileName: string; uuid: string } {
  const s = String(basename || "");
  if (s.length <= 37) return null;
  if (s[36] !== "-") return null;
  const uuid = s.slice(0, 36);
  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRe.test(uuid)) return null;
  const originalFileName = s.slice(37);
  if (!originalFileName) return null;
  return { originalFileName, uuid };
}

function parseDay(day: string): null | { start: Date; end: Date } {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(day || "").trim());
  if (!m) return null;
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function findMediaByStorageUrl(storageUrl: string) {
  const delegate = (prisma as any)?.portalMediaItem;
  if (!delegate?.findFirst) return null;

  return (await delegate
    .findFirst({
      where: { storageUrl },
      select: { bytes: true, mimeType: true, fileName: true, fileSize: true, createdAt: true },
    })
    .catch(() => null)) as any;
}

async function findMediaByHeuristics(opts: { day: string | null; basename: string | null }) {
  const delegate = (prisma as any)?.portalMediaItem;
  if (!delegate?.findFirst) return null;

  const dayRange = opts.day ? parseDay(opts.day) : null;
  const parsed = opts.basename ? parseUuidPrefixedName(opts.basename) : null;
  if (!dayRange || !parsed) return null;

  return (await delegate
    .findFirst({
      where: {
        fileName: parsed.originalFileName,
        createdAt: {
          gte: dayRange.start,
          lt: dayRange.end,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: { bytes: true, mimeType: true, fileName: true, fileSize: true, createdAt: true },
    })
    .catch(() => null)) as any;
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const parts = Array.isArray(path) ? path.map((p) => String(p || "").trim()).filter(Boolean) : [];
  if (!parts.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // This route handles requests to /uploads/*.
  // We mirror uploads into the DB (media library) for reliability on serverless,
  // then serve bytes here if the static file isn't present.
  const relPath = `uploads/${parts.join("/")}`;
  const storageUrl = `/${relPath}`;

  let row = await findMediaByStorageUrl(storageUrl);

  if (!row) {
    const day = parts[0] ?? null;
    const basename = parts[parts.length - 1] ?? null;
    row = await findMediaByHeuristics({ day, basename });
  }

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasBytes = row.bytes !== null && row.bytes !== undefined && (row.bytes as any).length !== undefined;
  if (!hasBytes) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("content-type", normalizeMimeType(row.mimeType, row.fileName));
  headers.set("content-disposition", contentDispositionInline(row.fileName));
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
    headers.set("content-range", `bytes */${totalLength}`);
    return new Response(null, { status: 416, headers });
  }

  headers.set("content-length", String(row.fileSize || totalLength));
  return new Response(body, { status: 200, headers });
}
