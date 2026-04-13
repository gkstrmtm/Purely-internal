import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { generateHostedPageHtml } from "@/lib/hostedPageGeneration";
import { getDefaultHostedPagePrompt, portalServiceKeyForHostedPageService } from "@/lib/hostedPageDocuments";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  currentHtml: z.string().optional().nullable(),
  attachments: z.unknown().optional(),
});

async function requireHostedPageEditAccess(documentId: string) {
  const auth = await requireClientSession();
  if (!auth.ok) return auth;

  const ownerId = auth.session.user.id;
  const row = await (prisma as any).hostedPageDocument.findFirst({
    where: { id: documentId, ownerId },
    select: { id: true, service: true },
  });
  if (!row) {
    return {
      ok: false as const,
      status: 404 as const,
      session: auth.session,
      row: null,
    };
  }

  const gated = await requireClientSessionForService(portalServiceKeyForHostedPageService(row.service), "edit");
  if (!gated.ok) {
    return {
      ok: false as const,
      status: gated.status,
      session: gated.session,
      row: null,
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    session: gated.session,
    row,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId: documentIdRaw } = await ctx.params;
  const documentId = String(documentIdRaw || "").trim();
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const auth = await requireHostedPageEditAccess(documentId);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : auth.status === 404 ? "Not found" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = await generateHostedPageHtml({
    ownerId: auth.session.user.id,
    documentId,
    prompt: parsed.data.prompt,
    currentHtml: parsed.data.currentHtml,
    attachments: parsed.data.attachments,
    requestOrigin: new URL(req.url).origin,
  });
  if (!result) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    ...(result.question ? { question: result.question } : { html: result.html }),
    document: result.document,
    generatorPrompt: getDefaultHostedPagePrompt(result.document.service, result.document),
  });
}
