import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PatchSchema = z
  .object({
    sendAtIso: z.string().trim().min(1).max(64).nullable().optional(),
    repeatEveryMinutes: z.number().int().min(0).max(60 * 24 * 365).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { messageId } = await ctx.params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const msg = await (prisma as any).portalAiChatMessage.findFirst({
    where: { id: String(messageId), ownerId, role: "user", createdByUserId: memberId },
    select: { id: true, sentAt: true },
  });
  if (!msg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (msg.sentAt) return NextResponse.json({ ok: false, error: "Already sent" }, { status: 409 });

  const data: Record<string, unknown> = {};

  if ("sendAtIso" in parsed.data) {
    const iso = parsed.data.sendAtIso;
    if (iso === null) {
      data.sendAt = null;
    } else if (typeof iso === "string") {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) {
        return NextResponse.json({ ok: false, error: "Invalid sendAt" }, { status: 400 });
      }
      data.sendAt = d;
    }
  }

  if ("repeatEveryMinutes" in parsed.data) {
    const v = parsed.data.repeatEveryMinutes;
    if (v === null) data.repeatEveryMinutes = null;
    else if (typeof v === "number" && Number.isFinite(v)) data.repeatEveryMinutes = Math.max(0, Math.floor(v));
  }

  await (prisma as any).portalAiChatMessage.update({ where: { id: String(messageId) }, data });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { messageId } = await ctx.params;

  const msg = await (prisma as any).portalAiChatMessage.findFirst({
    where: { id: String(messageId), ownerId, role: "user", createdByUserId: memberId },
    select: { id: true, sentAt: true },
  });
  if (!msg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (msg.sentAt) return NextResponse.json({ ok: false, error: "Already sent" }, { status: 409 });

  await (prisma as any).portalAiChatMessage.delete({ where: { id: String(messageId) } });

  return NextResponse.json({ ok: true });
}
