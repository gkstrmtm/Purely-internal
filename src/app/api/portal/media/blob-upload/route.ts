import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Keep this list broad enough for our editor + media library.
        // If you need more types later, add them here.
        return {
          access: "public",
          addRandomSuffix: true,
          allowedContentTypes: [
            // Wildcards are supported by Vercel Blob (e.g. "video/*").
            // Keep this broad so uploads don't break on browser/device MIME quirks.
            "image/*",
            "video/*",
            "audio/*",
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
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
