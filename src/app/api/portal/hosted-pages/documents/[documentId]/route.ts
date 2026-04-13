import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import {
  getDefaultHostedPagePrompt,
  getHostedPageDocument,
  portalServiceKeyForHostedPageService,
  updateHostedPageDocument,
} from "@/lib/hostedPageDocuments";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireHostedPageAccess(documentId: string, capability: "view" | "edit") {
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

  const gated = await requireClientSessionForService(portalServiceKeyForHostedPageService(row.service), capability);
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

export async function GET(_req: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId: documentIdRaw } = await ctx.params;
  const documentId = String(documentIdRaw || "").trim();
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const auth = await requireHostedPageAccess(documentId, "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : auth.status === 404 ? "Not found" : "Forbidden" },
      { status: auth.status },
    );
  }

  const document = await getHostedPageDocument(auth.session.user.id, documentId);
  if (!document) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    document,
    generatorPrompt: getDefaultHostedPagePrompt(document.service, document),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId: documentIdRaw } = await ctx.params;
  const documentId = String(documentIdRaw || "").trim();
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const auth = await requireHostedPageAccess(documentId, "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : auth.status === 404 ? "Not found" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as any;
  const document = await updateHostedPageDocument(auth.session.user.id, documentId, {
    title: body?.title,
    slug: body?.slug,
    status: body?.status,
    contentMarkdown: body?.contentMarkdown,
    editorMode: body?.editorMode,
    blocksJson: body?.blocksJson,
    customHtml: body?.customHtml,
    customChatJson: body?.customChatJson,
    themeJson: body?.themeJson,
    dataBindingsJson: body?.dataBindingsJson,
    seo: Object.prototype.hasOwnProperty.call(body ?? {}, "seo") ? body.seo : undefined,
  });
  if (!document) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    document,
    generatorPrompt: getDefaultHostedPagePrompt(document.service, document),
  });
}
