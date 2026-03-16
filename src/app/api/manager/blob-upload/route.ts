import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { requireManagerSession } from "@/lib/apiAuth";

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

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof (body as any)?.type !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const resolved = resolveBlobReadWriteToken();
  if (!resolved) {
    return NextResponse.json(
      {
        error: "Uploads require an external storage provider (Vercel Blob).",
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
        return {
          access: "public",
          addRandomSuffix: true,
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/svg+xml",
            "image/avif",
            "application/octet-stream",
          ],
          tokenPayload: JSON.stringify({ uploadedById: auth.session.user.id }),
        };
      },
      onUploadCompleted: async () => {
        // No DB write; the admin UI will persist the blob URL into tutorial settings.
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
