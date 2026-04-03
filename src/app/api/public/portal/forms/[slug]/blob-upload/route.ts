import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { prisma } from "@/lib/db";
import { parseCreditFormFields } from "@/lib/creditFormSchema";

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

function defaultAllowedContentTypes(): string[] {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "image/avif",
    "application/pdf",
  ];
}

function resolveAllowedContentTypes(schemaJson: unknown, fieldName?: string | null): string[] | null {
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 200 });
  const fileFields = fields.filter((f) => f.type === "file_upload");

  if (fieldName) {
    const selected = fileFields.find((f) => f.name === fieldName);
    if (selected) {
      const list = selected.allowedContentTypes;
      // No list means "allow any".
      if (!Array.isArray(list) || list.length === 0) return null;
      const unique = Array.from(new Set(list.map((t) => String(t || "").trim()).filter(Boolean)));
      return unique.length ? unique.slice(0, 120) : null;
    }
  }

  // If any file field is configured as "allow any", don't restrict token types at all.
  if (fileFields.some((f) => !Array.isArray(f.allowedContentTypes) || f.allowedContentTypes.length === 0)) {
    return null;
  }

  const list = fileFields.flatMap((f) => (Array.isArray(f.allowedContentTypes) ? f.allowedContentTypes : []));
  const unique = Array.from(new Set(list.map((t) => String(t || "").trim()).filter(Boolean)));
  return unique.length ? unique.slice(0, 120) : defaultAllowedContentTypes();
}

function resolveMaximumSizeInBytes(schemaJson: unknown, fieldName?: string | null): number | null {
  if (!fieldName) return null;
  const fields = parseCreditFormFields(schemaJson, { defaultIfEmpty: false, maxFields: 200 });
  const selected = fields.find((f) => f.type === "file_upload" && f.name === fieldName);
  const maxSizeMb = selected && typeof selected.maxSizeMb === "number" && Number.isFinite(selected.maxSizeMb) ? selected.maxSizeMb : null;
  if (maxSizeMb === null) return null;
  const bytes = Math.floor(maxSizeMb * 1024 * 1024);
  return bytes > 0 ? bytes : null;
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  const { slug: slugRaw } = await ctx.params;
  const slug = String(slugRaw || "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const url = new URL(request.url);
  const fieldName = url.searchParams.get("field");

  const form = await prisma.creditForm
    .findUnique({ where: { slug }, select: { id: true, schemaJson: true } })
    .catch(() => null);

  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    const allowedContentTypes = resolveAllowedContentTypes(form.schemaJson, fieldName);
    const maximumSizeInBytes = resolveMaximumSizeInBytes(form.schemaJson, fieldName);

    const jsonResponse = await handleUpload({
      token: resolved.token,
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          access: "public",
          addRandomSuffix: true,
          ...(allowedContentTypes ? { allowedContentTypes } : {}),
          ...(typeof maximumSizeInBytes === "number" ? { maximumSizeInBytes } : {}),
          tokenPayload: JSON.stringify({ formId: form.id, field: fieldName || null, scope: "portal_form" }),
        };
      },
      onUploadCompleted: async () => {
        // no-op: uploaded file references are stored in the form submission payload.
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
