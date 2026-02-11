import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { safeFilename } from "@/lib/portalMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

const bodySchema = z
  .object({
    url: z.string().url(),
    fileName: z.string().max(240).optional().nullable(),
    folderId: z.string().min(1).optional().nullable(),
  })
  .strict();

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop() || "";
  const decoded = (() => {
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  })();
  return decoded || "image";
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const u = new URL(parsed.data.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  }

  const resp = await fetch(u.toString(), {
    headers: { "user-agent": "purelyautomation/portal-media-import" },
  }).catch(() => null);

  if (!resp || !resp.ok) {
    return NextResponse.json({ ok: false, error: "Failed to download" }, { status: 502 });
  }

  const contentType = String(resp.headers.get("content-type") || "application/octet-stream").slice(0, 120);
  const arrayBuffer = await resp.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (bytes.length > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))}MB)` },
      { status: 400 },
    );
  }

  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Only images are supported" }, { status: 400 });
  }

  const fileNameRaw = (parsed.data.fileName || "").trim() || fileNameFromUrl(u);
  const item = await mirrorUploadToMediaLibrary({
    ownerId,
    folderId: parsed.data.folderId ?? null,
    fileName: safeFilename(fileNameRaw),
    mimeType: contentType,
    bytes,
  });

  if (!item) {
    return NextResponse.json({ ok: false, error: "Import failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item });
}
