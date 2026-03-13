import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function resolveBlobReadWriteToken(): string | null {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_BLOB_TOKEN ||
    process.env.BLOB_RW_TOKEN ||
    process.env.BLOB_TOKEN ||
    null;
  return token && token.trim() ? token.trim() : null;
}

// This route is used by `@vercel/blob/client` to securely generate client upload
// tokens so files can be uploaded directly from the browser to Vercel Blob.
//
// Why: Vercel serverless functions have a ~4.5MB request body limit; videos will
// fail if uploaded through our own POST endpoints.
export async function POST(request: Request): Promise<NextResponse> {
  // IMPORTANT: This route is used by Funnel Builder uploads (e.g. videos) as well as the media library.
  // Do NOT gate token generation behind the "media" module entitlement, otherwise users can be blocked
  // from uploading funnel assets even when they have access to Funnel Builder.
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof (body as any)?.type !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = resolveBlobReadWriteToken();
  if (!token) {
    // If this happens in production, the Vercel project is missing Blob read/write configuration.
    return NextResponse.json(
      {
        error: "Vercel Blob is not configured on the server.",
        hint: "Set BLOB_READ_WRITE_TOKEN (recommended) or VERCEL_BLOB_READ_WRITE_TOKEN in the deployment environment.",
      },
      { status: 500 },
    );
  }

  try {
    const jsonResponse = await handleUpload({
      token,
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Keep this list broad enough for our editor + media library.
        // If you need more types later, add them here.
        return {
          access: "public",
          addRandomSuffix: true,
          allowedContentTypes: [
            // images
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/svg+xml",
            "image/avif",
            // videos
            "video/mp4",
            "video/quicktime", // .mov
            "video/webm",
            "video/ogg",
            "video/mpeg",
            "video/x-m4v",
            "video/x-msvideo", // .avi
            "video/x-ms-wmv",
            "video/3gpp",
            "video/3gpp2",
            "video/x-matroska", // .mkv
            // audio
            "audio/mpeg",
            "audio/mp4",
            "audio/x-m4a",
            "audio/ogg",
            "audio/wav",
            // docs
            "application/pdf",
            // fallback (some browsers/devices report this even for videos)
            "application/octet-stream",
          ],
          tokenPayload: JSON.stringify({ ownerId: auth.session.user.id }),
        };
      },
      onUploadCompleted: async () => {
        // We intentionally do not write to DB here.
        // The client calls `/api/portal/media/items/from-blob` immediately after
        // upload so the media library updates synchronously.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = (error as any)?.message ? String((error as any).message) : "Blob upload token failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
