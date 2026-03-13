import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const TOKEN_ENV_CANDIDATES = [
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL_BLOB_READ_WRITE_TOKEN",
  "VERCEL_BLOB_TOKEN",
  "BLOB_RW_TOKEN",
  "BLOB_TOKEN",
] as const;

function getTokenDiagnostics() {
  const present: Record<string, boolean> = {};
  for (const key of TOKEN_ENV_CANDIDATES) {
    present[key] = Boolean((process.env as any)?.[key] && String((process.env as any)[key]).trim());
  }

  return {
    present,
    vercel: {
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
    nodeEnv: process.env.NODE_ENV ?? null,
  };
}

function resolveBlobReadWriteToken(): { token: string; source: (typeof TOKEN_ENV_CANDIDATES)[number] } | null {
  for (const key of TOKEN_ENV_CANDIDATES) {
    const raw = (process.env as any)?.[key];
    if (!raw) continue;
    const token = String(raw).trim();
    if (token) return { token, source: key };
  }
  return null;
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

  const resolved = resolveBlobReadWriteToken();
  if (!resolved) {
    // The client SDK surfaces any non-2xx from this endpoint as “Failed to retrieve the client token”.
    // Return a clear error so it’s obvious what’s missing.
    return NextResponse.json(
      {
        error: "Video uploads require an external storage provider (Vercel Blob) for large files.",
        hint: "Enable Vercel Blob for this deployment (sets BLOB_READ_WRITE_TOKEN / VERCEL_BLOB_READ_WRITE_TOKEN).",
        diagnostics: getTokenDiagnostics(),
      },
      { status: 400 },
    );
  }

  try {
    const jsonResponse = await handleUpload({
      token: resolved.token,
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
    return NextResponse.json(
      {
        error: message,
        hint:
          "If the token is set but uploads still fail, the token may be invalid/expired or set on a different Vercel project/environment.",
        tokenSource: resolved.source,
        diagnostics: getTokenDiagnostics(),
      },
      { status: 400 },
    );
  }
}
