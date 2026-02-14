import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  await ensurePortalAiOutboundCallsSchema();

  const row = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { ownerId, id: parsed.data },
    select: {
      id: true,
      campaignId: true,
      toNumberE164: true,
      status: true,
      callSid: true,
      conversationId: true,
      recordingSid: true,
      transcriptText: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return jsonError("Not found", 404);

  return NextResponse.json({
    ok: true,
    manualCall: {
      ...row,
      createdAtIso: row.createdAt.toISOString(),
      updatedAtIso: row.updatedAt.toISOString(),
    },
  });
}
