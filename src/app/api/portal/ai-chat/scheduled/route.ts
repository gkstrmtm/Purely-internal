import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { tryParseScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = auth.session.user.memberId || ownerId;

  const rows = await (prisma as any).portalAiChatMessage.findMany({
    where: {
      ownerId,
      role: "user",
      sentAt: null,
      sendAt: { not: null },
      createdByUserId: memberId,
    },
    orderBy: { sendAt: "asc" },
    take: 200,
    select: {
      id: true,
      threadId: true,
      text: true,
      sendAt: true,
      repeatEveryMinutes: true,
      createdAt: true,
    },
  });

  const threadIds = Array.from(new Set(rows.map((r: any) => String(r.threadId)))).slice(0, 300);

  const threads = threadIds.length
    ? await (prisma as any).portalAiChatThread.findMany({
        where: { ownerId, id: { in: threadIds } },
        select: { id: true, title: true },
      })
    : [];

  const titleByThreadId = new Map<string, string>();
  for (const t of threads) titleByThreadId.set(String(t.id), String(t.title || "Chat"));

  const toDisplayText = (textRaw: unknown): string => {
    const raw = String(textRaw || "").trim();
    const env = tryParseScheduledActionEnvelope(raw);
    if (!env) return raw;

    const workTitle = typeof env.workTitle === "string" ? env.workTitle.trim() : "";
    if (workTitle) return workTitle;

    const titles = (Array.isArray(env.steps) ? env.steps : [])
      .map((s) => (typeof (s as any)?.title === "string" ? String((s as any).title).trim() : ""))
      .filter(Boolean)
      .slice(0, 3);
    if (titles.length) return titles.join(" • ");

    const keys = (Array.isArray(env.steps) ? env.steps : [])
      .map((s) => (typeof (s as any)?.key === "string" ? String((s as any).key).trim() : ""))
      .filter(Boolean)
      .slice(0, 2);
    return keys.length ? `Scheduled: ${keys.join(" • ")}` : "Scheduled task";
  };

  const scheduled = rows.map((r: any) => ({
    id: String(r.id),
    threadId: String(r.threadId),
    threadTitle: titleByThreadId.get(String(r.threadId)) || "Chat",
    displayText: toDisplayText(r.text),
    sendAt: r.sendAt ? new Date(r.sendAt).toISOString() : null,
    repeatEveryMinutes:
      typeof r.repeatEveryMinutes === "number" && Number.isFinite(r.repeatEveryMinutes)
        ? Math.max(0, Math.floor(r.repeatEveryMinutes))
        : 0,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }));

  return NextResponse.json({ ok: true, scheduled });
}
