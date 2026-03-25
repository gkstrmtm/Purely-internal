import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { syncAiReceptionistKnowledgeBase } from "@/lib/portalAiReceptionistKnowledgeBaseSync.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as any;
  const knowledgeBaseRaw = body && typeof body === "object" && !Array.isArray(body) ? (body as any).knowledgeBase : null;

  const result = await syncAiReceptionistKnowledgeBase({
    ownerId: auth.session.user.id,
    kind: "voice",
    knowledgeBaseRaw,
  });

  return NextResponse.json(result.json, { status: result.status });
}
