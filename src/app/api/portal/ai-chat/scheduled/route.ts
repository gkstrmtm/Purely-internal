import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { tryParseScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { getScheduledRecurrenceTimeZone, withScheduledRecurrenceMetadata } from "@/lib/portalAiChatScheduledRecurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
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
      createdByUserId: true,
      attachmentsJson: true,
    },
  });

  const userIds = Array.from(new Set([
    ownerId,
    ...rows.map((r: any) => String(r.createdByUserId || "").trim()).filter(Boolean),
  ])).slice(0, 300);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, timeZone: true } }).catch(() => [])
    : [];
  const timeZoneByUserId = new Map<string, string>();
  for (const user of users) {
    const timeZone = typeof user.timeZone === "string" ? String(user.timeZone).trim().slice(0, 80) : "";
    if (timeZone) timeZoneByUserId.set(String(user.id), timeZone);
  }

  await Promise.all(rows.map(async (row: any) => {
    const repeatEveryMinutes = typeof row.repeatEveryMinutes === "number" && Number.isFinite(row.repeatEveryMinutes)
      ? Math.max(0, Math.floor(row.repeatEveryMinutes))
      : 0;
    if (!repeatEveryMinutes) return;
    if (getScheduledRecurrenceTimeZone(row.attachmentsJson)) return;
    const recurrenceTimeZone =
      timeZoneByUserId.get(String(row.createdByUserId || "").trim()) ||
      timeZoneByUserId.get(ownerId) ||
      "UTC";
    const attachmentsJson = withScheduledRecurrenceMetadata({
      attachmentsJson: row.attachmentsJson ?? null,
      repeatEveryMinutes,
      recurrenceTimeZone,
    });
    if (attachmentsJson === (row.attachmentsJson ?? null)) return;
    await (prisma as any).portalAiChatMessage.update({
      where: { id: String(row.id) },
      data: { attachmentsJson },
    }).catch(() => null);
    row.attachmentsJson = attachmentsJson;
  }));

  const threadIds = Array.from(new Set(rows.map((r: any) => String(r.threadId)))).slice(0, 300);

  const threads = threadIds.length
    ? await (prisma as any).portalAiChatThread.findMany({
        where: { ownerId, id: { in: threadIds } },
        select: { id: true, title: true, contextJson: true },
      })
    : [];

  const threadMetaById = new Map<string, { title: string; contextJson: unknown }>();
  for (const t of threads) {
    threadMetaById.set(String(t.id), {
      title: String(t.title || "Chat"),
      contextJson: (t as any).contextJson ?? null,
    });
  }

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

  const summarizeRun = (run: any): { lastRunAt: string | null; lastRunOk: boolean | null; lastRunSummary: string | null } => {
    const lastRunAt = run?.at ? new Date(run.at).toISOString() : null;
    const steps = Array.isArray(run?.steps) ? run.steps : [];
    if (!steps.length) {
      return { lastRunAt, lastRunOk: null, lastRunSummary: null };
    }

    const okCount = steps.filter((s: any) => Boolean(s?.ok)).length;
    const total = steps.length;
    const titles = steps
      .map((s: any) => String(s?.title || "").trim())
      .filter(Boolean)
      .slice(0, 2);
    const titleText = titles.length ? ` · ${titles.join(" • ")}` : "";

    if (okCount === total) {
      return { lastRunAt, lastRunOk: true, lastRunSummary: `Completed${titleText}` };
    }
    if (okCount > 0) {
      return { lastRunAt, lastRunOk: false, lastRunSummary: `Partial success (${okCount}/${total})${titleText}` };
    }
    return { lastRunAt, lastRunOk: false, lastRunSummary: `Failed${titleText}` };
  };

  const findLatestRunForRow = (threadContext: unknown, rowId: string, displayText: string) => {
    const ctx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
      ? (threadContext as Record<string, unknown>)
      : null;
    const runs = Array.isArray(ctx?.runs) ? (ctx?.runs as any[]) : [];
    if (!runs.length) return { lastRunAt: null, lastRunOk: null, lastRunSummary: null };

    const normalizedDisplay = displayText.trim().toLowerCase();
    const exact = runs.filter((run) => String(run?.scheduledMessageId || "") === rowId);
    const byTitle = normalizedDisplay
      ? runs.filter((run) => String(run?.workTitle || "").trim().toLowerCase() === normalizedDisplay)
      : [];
    const matched = [...exact, ...byTitle]
      .sort((a, b) => new Date(String(b?.at || 0)).getTime() - new Date(String(a?.at || 0)).getTime())[0];

    return summarizeRun(matched);
  };

  const scheduled = rows.map((r: any) => ({
    ...(findLatestRunForRow(threadMetaById.get(String(r.threadId))?.contextJson ?? null, String(r.id), toDisplayText(r.text))),
    id: String(r.id),
    threadId: String(r.threadId),
    threadTitle: threadMetaById.get(String(r.threadId))?.title || "Chat",
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
