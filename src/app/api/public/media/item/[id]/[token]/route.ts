import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function contentDispositionInline(fileName: string) {
  const safe = String(fileName || "file").replace(/[\r\n"]/g, "").slice(0, 200);
  return `inline; filename="${safe}"`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;

  const row = await (prisma as any).portalMediaItem.findFirst({
    where: { id: String(id), publicToken: String(token) },
    select: { bytes: true, mimeType: true, fileName: true, fileSize: true, createdAt: true },
  });

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const headers = new Headers();
  headers.set("content-type", String(row.mimeType || "application/octet-stream"));
  headers.set("content-length", String(row.fileSize || (row.bytes?.length ?? 0)));
  headers.set("content-disposition", contentDispositionInline(row.fileName));
  headers.set("cache-control", "public, max-age=3600");

  const bytes = row.bytes as unknown as Uint8Array;
  // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy BodyInit typing.
  const body = new Uint8Array(bytes);
  headers.set("content-length", String(body.byteLength));
  return new Response(body, { status: 200, headers });
}
