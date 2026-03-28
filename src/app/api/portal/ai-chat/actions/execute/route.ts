import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import {
  PortalAgentActionKeySchema,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { executePortalAgentActionForThread } from "@/lib/portalAgentActionExecutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    threadId: z.string().trim().min(1).max(120),
    action: PortalAgentActionKeySchema,
    args: z.object({}).catchall(z.unknown()).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const threadId = parsed.data.threadId;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const action = parsed.data.action;
  const argsRaw = parsed.data.args ?? {};

  const exec = await executePortalAgentActionForThread({
    ownerId,
    threadId,
    action: action as PortalAgentActionKey,
    args: argsRaw,
  });

  if (!exec.ok && exec.status === 400) {
    return NextResponse.json({ ok: false, error: exec.error || "Invalid action args" }, { status: 400 });
  }

  const cua = (exec as any)?.clientUiAction ?? null;
  return NextResponse.json({
    ...(exec as any),
    clientUiActions: Array.isArray((exec as any)?.clientUiActions)
      ? (exec as any).clientUiActions
      : cua
        ? [cua]
        : [],
  });
}
