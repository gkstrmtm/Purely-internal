import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { setThreadChoiceOverride } from "@/lib/portalAiChatChoices";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ChoicePostSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
});

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = ChoicePostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const kind = parsed.data.kind;
  const value = parsed.data.value;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Use shared helper to validate and persist the override
  const setRes = await setThreadChoiceOverride({ ownerId, threadId, kind, value });
  if (!setRes.ok) return NextResponse.json({ ok: false, error: setRes.error }, { status: 400 });
  return NextResponse.json({ ok: true, choiceOverrides: setRes.choiceOverrides });
}
